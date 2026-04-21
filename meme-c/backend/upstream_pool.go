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

// InFlightInfo describes a TTS job currently being processed by an upstream
// worker. Exposed to the admin UI via /api/admin/gpus.
type InFlightInfo struct {
	JobID       string    `json:"job_id"`
	TaskID      string    `json:"task_id"`
	TaskKind    string    `json:"task_kind"`
	SegIndex    int       `json:"seg_index"`
	SegTotal    int       `json:"seg_total"`
	TextPreview string    `json:"text_preview"`
	EnqueuedAt  time.Time `json:"enqueued_at"`
	StartedAt   time.Time `json:"started_at"`
}

// UpstreamStat is a snapshot of one upstream's scheduling state.
type UpstreamStat struct {
	API           string         `json:"upstream"`
	QueueLen      int            `json:"queue_len"`
	QueueCap      int            `json:"queue_cap"`
	IsStatic      bool           `json:"is_static"`
	Healthy       bool           `json:"healthy"`
	LastCheckAt   time.Time      `json:"last_check_at,omitempty"`
	LastError     string         `json:"last_error,omitempty"`
	Concurrency   int            `json:"concurrency"`
	InFlightCount int            `json:"in_flight_count"`
	InFlight      *InFlightInfo  `json:"in_flight,omitempty"` // 首槽快照，兼容旧前端
	InFlights     []InFlightInfo `json:"in_flights,omitempty"`
	FailStreak    int            `json:"fail_streak"`
	LastSuccessAt time.Time      `json:"last_success_at,omitempty"`
}

type upstreamHealth struct {
	ok          bool
	lastCheck   time.Time
	lastErr     string
	failStreak  int       // 连续失败次数，>= healthFailDropThreshold 才踢出调度
	lastSuccess time.Time // 最近一次成功的时间，方便判断"刚恢复"
}

// 连续失败多少次才真正从调度候选里剔除。偶发 1~2 次失败不影响派单，
// 避免探活瞬时抖动（GPU 正忙、Tailscale RTT 尖刺）把健康卡误拉黑。
const healthFailDropThreshold = 3

// UpstreamPool owns the live set of fish TTS upstream APIs and their worker
// queues. Static APIs (from env FISH_API_BASES) are always kept; dynamic APIs
// (from cluster_nodes) are added/removed as nodes register and expire.
type UpstreamPool struct {
	mu sync.RWMutex

	apis     []string
	queues   map[string]chan ttsJob
	cancels  map[string]context.CancelFunc
	isStatic map[string]bool

	inFlightMu sync.RWMutex
	inFlight   map[string]map[int]InFlightInfo

	healthMu sync.RWMutex
	health   map[string]upstreamHealth

	refs              *referenceIndex
	client            *http.Client
	parentCtx         context.Context
	queueSize         int
	perGPUConcurrency int
	rr                uint64 // 空闲打平用的轮询计数器
	articleRR         uint64 // 多段文章起始偏移，避免所有文章挤到同一批卡
}

func NewUpstreamPool(ctx context.Context, staticAPIs []string, queueSize, perGPUConcurrency int, client *http.Client) *UpstreamPool {
	if perGPUConcurrency < 1 {
		perGPUConcurrency = 1
	}
	p := &UpstreamPool{
		queues:            make(map[string]chan ttsJob),
		cancels:           make(map[string]context.CancelFunc),
		isStatic:          make(map[string]bool),
		inFlight:          make(map[string]map[int]InFlightInfo),
		health:            make(map[string]upstreamHealth),
		refs:              newReferenceIndex(nil),
		client:            client,
		parentCtx:         ctx,
		queueSize:         queueSize,
		perGPUConcurrency: perGPUConcurrency,
	}
	for _, api := range dedupeNonEmpty(staticAPIs) {
		p.isStatic[api] = true
		p.addLocked(api)
	}
	return p
}

// PerGPUConcurrency 暴露给外部统计用。
func (p *UpstreamPool) PerGPUConcurrency() int { return p.perGPUConcurrency }

// NextArticleOffset 为一整篇多段文章分配一个起始偏移量，供后续 PickForSegment 使用：
// caller 传入 (segIndex + offset) 作为 segIndex，就能让不同文章在 GPU 环上错开起点，
// 避免「每篇文章的段 0 都打到同一张卡」导致的后段 GPU 长期空闲问题。
// 返回值是非负 int，方便直接做模运算，不需要调用方再做溢出保护。
func (p *UpstreamPool) NextArticleOffset() int {
	v := atomic.AddUint64(&p.articleRR, 1)
	return int(v & 0x7fffffff)
}

func (p *UpstreamPool) Snapshot() []string {
	p.mu.RLock()
	defer p.mu.RUnlock()
	out := make([]string, len(p.apis))
	copy(out, p.apis)
	return out
}

func (p *UpstreamPool) Refs() *referenceIndex { return p.refs }

// BeginJob 记录某个 GPU 上某个 worker 槽开始执行的任务。slot 是 worker 在本 GPU 上的序号，
// 和 perGPUConcurrency 一一对应，这样同一张卡多个并发任务不会互相覆盖。
func (p *UpstreamPool) BeginJob(api string, slot int, info InFlightInfo) {
	info.StartedAt = time.Now()
	p.inFlightMu.Lock()
	slots, ok := p.inFlight[api]
	if !ok {
		slots = make(map[int]InFlightInfo, p.perGPUConcurrency)
		p.inFlight[api] = slots
	}
	slots[slot] = info
	p.inFlightMu.Unlock()
}

func (p *UpstreamPool) EndJob(api string, slot int) {
	p.inFlightMu.Lock()
	if slots, ok := p.inFlight[api]; ok {
		delete(slots, slot)
		if len(slots) == 0 {
			delete(p.inFlight, api)
		}
	}
	p.inFlightMu.Unlock()
}

// inFlightCountLocked 需要调用者持有 inFlightMu 读锁。
func (p *UpstreamPool) inFlightCount(api string) int {
	p.inFlightMu.RLock()
	defer p.inFlightMu.RUnlock()
	return len(p.inFlight[api])
}

// Stats returns a consistent snapshot of every upstream: queue depth, cap,
// whether it's static, and the jobs currently being processed (if any).
func (p *UpstreamPool) Stats() []UpstreamStat {
	p.mu.RLock()
	apis := make([]string, len(p.apis))
	copy(apis, p.apis)
	stats := make([]UpstreamStat, 0, len(apis))
	for _, api := range apis {
		q := p.queues[api]
		s := UpstreamStat{
			API:         api,
			IsStatic:    p.isStatic[api],
			QueueCap:    p.queueSize,
			Concurrency: p.perGPUConcurrency,
		}
		if q != nil {
			s.QueueLen = len(q)
		}
		stats = append(stats, s)
	}
	p.mu.RUnlock()

	p.inFlightMu.RLock()
	for i := range stats {
		slots, ok := p.inFlight[stats[i].API]
		if !ok || len(slots) == 0 {
			continue
		}
		// 按 slot 序号稳定输出，避免 UI 抖动。
		keys := make([]int, 0, len(slots))
		for k := range slots {
			keys = append(keys, k)
		}
		sort.Ints(keys)
		list := make([]InFlightInfo, 0, len(keys))
		for _, k := range keys {
			list = append(list, slots[k])
		}
		stats[i].InFlightCount = len(list)
		stats[i].InFlights = list
		first := list[0]
		stats[i].InFlight = &first
	}
	p.inFlightMu.RUnlock()

	p.healthMu.RLock()
	for i := range stats {
		if h, ok := p.health[stats[i].API]; ok {
			stats[i].Healthy = h.ok
			stats[i].LastCheckAt = h.lastCheck
			stats[i].LastError = h.lastErr
			stats[i].FailStreak = h.failStreak
			stats[i].LastSuccessAt = h.lastSuccess
		}
	}
	p.healthMu.RUnlock()
	return stats
}

// StartHealthChecker probes each upstream periodically so the admin dashboard
// can distinguish reachable GPUs from env-listed-but-offline ones.
func (p *UpstreamPool) StartHealthChecker(interval, timeout time.Duration) {
	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for {
			p.runHealthRound(timeout)
			select {
			case <-p.parentCtx.Done():
				return
			case <-ticker.C:
			}
		}
	}()
}

func (p *UpstreamPool) runHealthRound(timeout time.Duration) {
	apis := p.Snapshot()
	if len(apis) == 0 {
		return
	}
	probeClient := &http.Client{Timeout: timeout}
	var wg sync.WaitGroup
	wg.Add(len(apis))
	for _, api := range apis {
		go func(api string) {
			defer wg.Done()
			ok, errMsg := probeUpstream(probeClient, api)
			now := time.Now()
			p.healthMu.Lock()
			prev := p.health[api]
			cur := upstreamHealth{ok: ok, lastCheck: now, lastErr: errMsg, lastSuccess: prev.lastSuccess}
			if ok {
				cur.failStreak = 0
				cur.lastSuccess = now
			} else {
				cur.failStreak = prev.failStreak + 1
			}
			p.health[api] = cur
			p.healthMu.Unlock()
		}(api)
	}
	wg.Wait()

	p.healthMu.Lock()
	for api := range p.health {
		found := false
		for _, a := range apis {
			if a == api {
				found = true
				break
			}
		}
		if !found {
			delete(p.health, api)
		}
	}
	p.healthMu.Unlock()
}

// probeUpstream 用 fish-speech 自带的轻量 /v1/health 判断存活，比 /v1/references/list
// 便宜得多（不需要序列化所有音色），减少 GPU 忙碌时的误报。
// 老版本 fish-speech 没有 /v1/health 会返回 404，这里仍算健康——只要能回响应就说明进程活着。
func probeUpstream(client *http.Client, api string) (bool, string) {
	url := strings.TrimRight(api, "/") + "/v1/health"
	resp, err := client.Get(url)
	if err != nil {
		return false, err.Error()
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 500 {
		return false, fmt.Sprintf("http %d", resp.StatusCode)
	}
	return true, ""
}

func (p *UpstreamPool) QueueFor(api string) (chan ttsJob, bool) {
	p.mu.RLock()
	defer p.mu.RUnlock()
	q, ok := p.queues[api]
	return q, ok
}

// filterHealthy drops upstreams that have been probed and found unreachable.
// Upstreams with no probe yet (bootstrap) are kept so first-round traffic still flows.
// 只有在连续失败 >= healthFailDropThreshold 次时才踢出调度，单次抖动（例如 GPU
// 正忙、Tailscale RTT 尖刺）不影响派单，避免误杀。
// Lock order: always acquire p.mu before p.healthMu to match Stats().
func (p *UpstreamPool) filterHealthy(apis []string) []string {
	p.healthMu.RLock()
	defer p.healthMu.RUnlock()
	out := make([]string, 0, len(apis))
	for _, api := range apis {
		h, ok := p.health[api]
		if ok && !h.lastCheck.IsZero() && !h.ok && h.failStreak >= healthFailDropThreshold {
			continue
		}
		out = append(out, api)
	}
	return out
}

// ChooseForTTS picks the best API under a single lock so queue existence and
// load-balance decision stay consistent. 打分 = 队列中等待数 + 当前在跑数量，
// 并列时用轮询计数器打破平局，避免空闲时永远挤到字母序最靠前的那张卡。
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
	if healthy := p.filterHealthy(candidates); len(healthy) > 0 {
		candidates = healthy
	}
	if len(candidates) == 0 {
		return "", nil, false
	}

	type scored struct {
		api   string
		score int
	}
	best := make([]scored, 0, 4)
	minScore := -1
	for _, api := range candidates {
		q := p.queues[api]
		if q == nil {
			continue
		}
		score := len(q) + p.inFlightCount(api)
		if minScore < 0 || score < minScore {
			minScore = score
			best = best[:0]
			best = append(best, scored{api, score})
		} else if score == minScore {
			best = append(best, scored{api, score})
		}
	}
	if len(best) == 0 {
		return "", nil, false
	}
	// 对 rr 始终 +1，使打平时调度真正轮转。
	idx := atomic.AddUint64(rr, 1)
	chosen := best[int(idx%uint64(len(best)))].api
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
	if healthy := p.filterHealthy(candidates); len(healthy) > 0 {
		candidates = healthy
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
	// 每张 GPU 起 perGPUConcurrency 个 worker，共享同一条队列；fish-speech 单卡
	// 若支持并发推理，吞吐可随 worker 数线性上涨。
	for slot := 0; slot < p.perGPUConcurrency; slot++ {
		go runTTSWorker(ctx, api, slot, queue, p.client, p)
	}
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
