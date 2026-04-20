package main

import (
	"context"
	"database/sql"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

// UpstreamPool owns the live set of fish TTS upstream APIs and their worker
// queues. Static APIs (from env FISH_API_BASES) are always kept; dynamic APIs
// (from cluster_nodes) are added/removed as nodes register and expire.
type UpstreamPool struct {
	mu sync.RWMutex

	apis     []string
	queues   map[string]chan ttsJob
	cancels  map[string]context.CancelFunc
	isStatic map[string]bool

	refs       *referenceIndex
	client     *http.Client
	parentCtx  context.Context
	queueSize  int
}

func NewUpstreamPool(ctx context.Context, staticAPIs []string, queueSize int, client *http.Client) *UpstreamPool {
	p := &UpstreamPool{
		queues:    make(map[string]chan ttsJob),
		cancels:   make(map[string]context.CancelFunc),
		isStatic:  make(map[string]bool),
		refs:      newReferenceIndex(nil),
		client:    client,
		parentCtx: ctx,
		queueSize: queueSize,
	}
	for _, api := range dedupeNonEmpty(staticAPIs) {
		p.isStatic[api] = true
		p.addLocked(api)
	}
	return p
}

func (p *UpstreamPool) Snapshot() []string {
	p.mu.RLock()
	defer p.mu.RUnlock()
	out := make([]string, len(p.apis))
	copy(out, p.apis)
	return out
}

func (p *UpstreamPool) Refs() *referenceIndex { return p.refs }

func (p *UpstreamPool) QueueFor(api string) (chan ttsJob, bool) {
	p.mu.RLock()
	defer p.mu.RUnlock()
	q, ok := p.queues[api]
	return q, ok
}

// ChooseForTTS picks the best API under a single lock so queue existence and
// load-balance decision stay consistent. Returns (api, queue, ok).
func (p *UpstreamPool) ChooseForTTS(req TTSRequest, rr *uint64) (string, chan ttsJob, bool) {
	p.mu.RLock()
	defer p.mu.RUnlock()
	candidates := p.apis
	if strings.TrimSpace(req.ReferenceID) != "" {
		if matched := p.refs.apisForReference(req.ReferenceID); len(matched) > 0 {
			candidates = filterIn(p.apis, matched)
			if len(candidates) == 0 {
				candidates = p.apis
			}
		}
	}
	if len(candidates) == 0 {
		return "", nil, false
	}
	chosen := candidates[0]
	minLen := len(p.queues[chosen])
	for _, api := range candidates[1:] {
		q := p.queues[api]
		if q == nil {
			continue
		}
		if qlen := len(q); qlen < minLen {
			chosen = api
			minLen = qlen
		}
	}
	_ = atomic.AddUint64(rr, 1) // keep rr advancing for fallback paths
	q := p.queues[chosen]
	return chosen, q, q != nil
}

// PickForSegment returns the API for a given segment index, using reference
// affinity when the request pins a reference_id.
func (p *UpstreamPool) PickForSegment(segIndex int, req TTSRequest) (string, chan ttsJob, bool) {
	p.mu.RLock()
	defer p.mu.RUnlock()
	candidates := p.apis
	if strings.TrimSpace(req.ReferenceID) != "" {
		if matched := p.refs.apisForReference(req.ReferenceID); len(matched) > 0 {
			inters := filterIn(p.apis, matched)
			if len(inters) > 0 {
				candidates = inters
			}
		}
	}
	if len(candidates) == 0 {
		return "", nil, false
	}
	chosen := candidates[segIndex%len(candidates)]
	q := p.queues[chosen]
	return chosen, q, q != nil
}

// Reconcile merges dynamicAPIs with the static set and adjusts workers.
// New APIs get a queue + worker goroutine and a background references fetch.
// Removed dynamic APIs have their queue closed (workers drain and exit).
func (p *UpstreamPool) Reconcile(dynamicAPIs []string) (added, removed []string) {
	p.mu.Lock()
	defer p.mu.Unlock()

	desired := make(map[string]bool, len(p.isStatic)+len(dynamicAPIs))
	for api := range p.isStatic {
		desired[api] = true
	}
	for _, api := range dedupeNonEmpty(dynamicAPIs) {
		desired[api] = true
	}

	for api := range desired {
		if _, ok := p.queues[api]; !ok {
			p.addLocked(api)
			added = append(added, api)
		}
	}
	for api := range p.queues {
		if !desired[api] {
			p.removeLocked(api)
			removed = append(removed, api)
		}
	}
	if len(added) > 0 || len(removed) > 0 {
		p.rebuildAPIsLocked()
	}
	return added, removed
}

func (p *UpstreamPool) addLocked(api string) {
	queue := make(chan ttsJob, p.queueSize)
	ctx, cancel := context.WithCancel(p.parentCtx)
	p.queues[api] = queue
	p.cancels[api] = cancel
	p.rebuildAPIsLocked()
	go runTTSWorker(ctx, api, queue, p.client, p)
	if p.client != nil {
		go p.fetchReferencesAsync(api)
	}
}

func (p *UpstreamPool) removeLocked(api string) {
	if cancel, ok := p.cancels[api]; ok {
		cancel()
		delete(p.cancels, api)
	}
	if q, ok := p.queues[api]; ok {
		close(q)
		delete(p.queues, api)
	}
	if p.refs != nil {
		p.refs.removeAPI(api)
	}
}

func (p *UpstreamPool) rebuildAPIsLocked() {
	apis := make([]string, 0, len(p.queues))
	for api := range p.queues {
		apis = append(apis, api)
	}
	sort.Strings(apis)
	p.apis = apis
}

func (p *UpstreamPool) fetchReferencesAsync(api string) {
	upstreamURL := fmt.Sprintf("%s/v1/references/list?format=json", api)
	resp, err := p.client.Get(upstreamURL)
	if err != nil {
		fmt.Printf("[pool] refs fetch failed api=%s err=%v\n", api, err)
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		fmt.Printf("[pool] refs fetch bad status api=%s status=%d\n", api, resp.StatusCode)
		return
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		fmt.Printf("[pool] refs read failed api=%s err=%v\n", api, err)
		return
	}
	refIDs, err := parseReferenceIDsFromBody(body)
	if err != nil {
		fmt.Printf("[pool] refs parse failed api=%s err=%v\n", api, err)
		return
	}
	p.refs.setAPIReferences(api, refIDs)
	fmt.Printf("[pool] loaded %d references from %s\n", len(refIDs), api)
}

// StartReconciler polls cluster_nodes every interval and merges live nodes
// into the pool. Static env APIs remain even if DB is empty.
func (p *UpstreamPool) StartReconciler(db *sql.DB, interval time.Duration) {
	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for {
			p.reconcileOnce(db)
			select {
			case <-p.parentCtx.Done():
				return
			case <-ticker.C:
			}
		}
	}()
}

func (p *UpstreamPool) reconcileOnce(db *sql.DB) {
	nodes, err := listClusterNodes(db, true, 60*time.Second)
	if err != nil {
		fmt.Printf("[pool] reconcile list nodes err=%v\n", err)
		return
	}
	var dynamic []string
	for _, n := range nodes {
		dynamic = append(dynamic, n.FishAPIBases()...)
	}
	added, removed := p.Reconcile(dynamic)
	if len(added) > 0 {
		fmt.Printf("[pool] added upstreams: %s\n", strings.Join(added, ","))
	}
	if len(removed) > 0 {
		fmt.Printf("[pool] removed upstreams: %s\n", strings.Join(removed, ","))
	}
}

func dedupeNonEmpty(in []string) []string {
	seen := make(map[string]bool, len(in))
	out := make([]string, 0, len(in))
	for _, s := range in {
		s = strings.TrimSpace(s)
		if s == "" || seen[s] {
			continue
		}
		seen[s] = true
		out = append(out, s)
	}
	return out
}

func filterIn(superset, allowed []string) []string {
	allow := make(map[string]bool, len(allowed))
	for _, a := range allowed {
		allow[a] = true
	}
	out := make([]string, 0, len(superset))
	for _, s := range superset {
		if allow[s] {
			out = append(out, s)
		}
	}
	return out
}
