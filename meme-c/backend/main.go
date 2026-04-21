package main

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"os/exec"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

type AppConfig struct {
	ListenAddr   string
	FishAPIs     []string
	TimeoutSec   int
	MaxNewTokens int
	QueueSize    int
	DBDsn        string
}

type TTSRequest struct {
	Text         string  `json:"text"`
	ReferenceID  string  `json:"reference_id,omitempty"`
	Format       string  `json:"format,omitempty"`
	Mode         string  `json:"mode,omitempty"`
	Speed        float64 `json:"speed,omitempty"`
	MaxNewTokens int     `json:"max_new_tokens,omitempty"`
}

// multiSegmentStreamRequest 断句后多 GPU 轮流合成，NDJSON 流式返回每段 MP3。
type multiSegmentStreamRequest struct {
	Text         string  `json:"text"`
	ReferenceID  string  `json:"reference_id,omitempty"`
	Mode         string  `json:"mode,omitempty"`
	Speed        float64 `json:"speed,omitempty"`
	MaxNewTokens int     `json:"max_new_tokens,omitempty"`
}

type ttsJob struct {
	payload  []byte
	wantsM4A bool
	resultCh chan ttsResult
	meta     InFlightInfo
}

type ttsResult struct {
	statusCode int
	body       []byte
	fishAPI    string
	err        error
}

type referenceIndex struct {
	mu      sync.RWMutex
	apiRefs map[string]map[string]struct{}
}

func newReferenceIndex(apis []string) *referenceIndex {
	idx := &referenceIndex{
		apiRefs: make(map[string]map[string]struct{}, len(apis)),
	}
	for _, api := range apis {
		idx.apiRefs[api] = make(map[string]struct{})
	}
	return idx
}

func (ri *referenceIndex) setAPIReferences(api string, refs []string) {
	ri.mu.Lock()
	defer ri.mu.Unlock()
	refSet := make(map[string]struct{}, len(refs))
	for _, ref := range refs {
		ref = strings.TrimSpace(ref)
		if ref != "" {
			refSet[ref] = struct{}{}
		}
	}
	ri.apiRefs[api] = refSet
}

func (ri *referenceIndex) addReferenceToAPI(api, refID string) {
	refID = strings.TrimSpace(refID)
	if refID == "" {
		return
	}
	ri.mu.Lock()
	defer ri.mu.Unlock()
	if _, ok := ri.apiRefs[api]; !ok {
		ri.apiRefs[api] = make(map[string]struct{})
	}
	ri.apiRefs[api][refID] = struct{}{}
}

func (ri *referenceIndex) removeAPI(api string) {
	ri.mu.Lock()
	defer ri.mu.Unlock()
	delete(ri.apiRefs, api)
}

func (ri *referenceIndex) apisForReference(refID string) []string {
	refID = strings.TrimSpace(refID)
	if refID == "" {
		return nil
	}
	ri.mu.RLock()
	defer ri.mu.RUnlock()
	apis := make([]string, 0, len(ri.apiRefs))
	for api, refs := range ri.apiRefs {
		if _, ok := refs[refID]; ok {
			apis = append(apis, api)
		}
	}
	return apis
}

const fishErrLogPath = "/root/meme/logs/fish-s2-pro.err.log"

// segmentTextLocalChunks 按标点优先、每段不超过 maxRunes 字切分（无外部 API）。
func segmentTextLocalChunks(text string, maxRunes int) []string {
	if maxRunes <= 0 {
		maxRunes = 130
	}
	runes := []rune(strings.TrimSpace(text))
	if len(runes) == 0 {
		return nil
	}
	if len(runes) <= maxRunes {
		return []string{strings.TrimSpace(text)}
	}
	var chunks []string
	start := 0
	for start < len(runes) {
		end := start + maxRunes
		if end >= len(runes) {
			end = len(runes)
		} else {
		search:
			for i := end; i > start+maxRunes/2; i-- {
				switch runes[i-1] {
				case '。', '！', '？', '；', '，', ',', '.', '!', '?', ';', '、':
					end = i
					break search
				}
			}
		}
		chunk := strings.TrimSpace(string(runes[start:end]))
		if chunk != "" {
			chunks = append(chunks, chunk)
		}
		start = end
	}
	return chunks
}

// segmentTextArrayLocal 长文本先按 2000 字块再细分，供多路 TTS。
func segmentTextArrayLocal(text string) ([]string, error) {
	text = strings.TrimSpace(text)
	if text == "" {
		return nil, fmt.Errorf("empty text")
	}
	const maxRunes = 2000
	runes := []rune(text)
	if len(runes) <= maxRunes {
		return segmentTextLocalChunks(text, 130), nil
	}
	var all []string
	for start := 0; start < len(runes); start += maxRunes {
		end := start + maxRunes
		if end > len(runes) {
			end = len(runes)
		}
		part := strings.TrimSpace(string(runes[start:end]))
		if part == "" {
			continue
		}
		sub := segmentTextLocalChunks(part, 130)
		all = append(all, sub...)
	}
	if len(all) == 0 {
		return []string{text}, nil
	}
	return all, nil
}

// segmentTextArrayWithLocalBreath 本地分段后在标点后插入 Fish 气口标签（[break] / [long-break]）。
func segmentTextArrayWithLocalBreath(text string) ([]string, error) {
	segs, err := segmentTextArrayLocal(text)
	if err != nil {
		return nil, err
	}
	for i := range segs {
		segs[i] = injectBreakTagsForSleep(segs[i])
	}
	return segs, nil
}

func appendLineToFile(path, line string) {
	f, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return
	}
	defer f.Close()
	_, _ = f.WriteString(line + "\n")
}

func formatTextForLog(s string) string {
	replacer := strings.NewReplacer(
		"，", "，\n",
		"。", "。\n",
		",", ",\n",
		".", ".\n",
	)
	out := replacer.Replace(s)
	lines := strings.Split(out, "\n")
	var cleaned []string
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line != "" {
			cleaned = append(cleaned, line)
		}
	}
	return strings.Join(cleaned, "\n")
}

func addBreathByMode(text string, mode string) (string, error) {
	mode = strings.ToLower(strings.TrimSpace(mode))
	if mode == "" || mode == "normal" {
		return text, nil
	}
	if mode != "sleep" {
		return text, nil
	}
	return injectBreakTagsForSleep(text), nil
}

func wavToMp3Bytes(wav []byte) ([]byte, error) {
	cmd := exec.Command(
		"ffmpeg",
		"-hide_banner",
		"-loglevel", "error",
		"-i", "pipe:0",
		"-f", "mp3",
		"-b:a", "128k",
		"pipe:1",
	)
	cmd.Stdin = bytes.NewReader(wav)
	var out bytes.Buffer
	var errBuf bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &errBuf
	if err := cmd.Run(); err != nil {
		return nil, fmt.Errorf("wavToMp3: %w: %s", err, errBuf.String())
	}
	return out.Bytes(), nil
}

func filterNonEmptySegments(segs []string) []string {
	return cleanSegments(segs)
}

// fishTagOnly 匹配仅由 Fish-Speech 停顿标签和空白构成的字符串，无实际可朗读内容。
var fishTagOnly = func() func(string) bool {
	replacer := strings.NewReplacer(
		"[break]", "",
		"[long-break]", "",
		"[breath]", "",
	)
	return func(s string) bool {
		return strings.TrimSpace(replacer.Replace(s)) == ""
	}
}()

// cleanSegments 对分片做清洗：
//  1. 丢弃空段和纯标签段（将标签内容追加到下一有效段）
//  2. 将实际内容 < 10 字的极短段合并到上一段（避免产生不足 1 秒的音频碎片）
//  3. 删除相邻完全相同的段
func cleanSegments(segs []string) []string {
	if len(segs) == 0 {
		return segs
	}

	// Pass 1：合并纯标签段与超短段
	merged := make([]string, 0, len(segs))
	carry := "" // 待拼接的标签或超短内容
	for _, s := range segs {
		s = strings.TrimSpace(s)
		if s == "" {
			continue
		}
		if fishTagOnly(s) {
			// 纯标签：携带到下一段前缀
			carry += s + " "
			continue
		}
		// 计算实际可朗读字符数（去除 Fish 标签后）
		plain := strings.NewReplacer("[break]", "", "[long-break]", "", "[breath]", "").Replace(s)
		plain = strings.TrimSpace(plain)
		if len([]rune(plain)) < 10 {
			// 极短段：与前一段合并（若有）；否则携带到下一段
			if len(merged) > 0 {
				merged[len(merged)-1] = strings.TrimSpace(merged[len(merged)-1] + " " + carry + s)
				carry = ""
			} else {
				carry += s + " "
			}
			continue
		}
		merged = append(merged, strings.TrimSpace(carry+s))
		carry = ""
	}
	// 剩余 carry 追加到最后一段
	if carry != "" {
		if len(merged) > 0 {
			merged[len(merged)-1] = strings.TrimSpace(merged[len(merged)-1] + " " + carry)
		} else {
			t := strings.TrimSpace(carry)
			if t != "" {
				merged = append(merged, t)
			}
		}
	}

	// Pass 2：去除相邻完全相同的段
	out := make([]string, 0, len(merged))
	for i, s := range merged {
		if i > 0 && s == merged[i-1] {
			fmt.Printf("[clean-segments] WARNING: duplicate segment removed at index %d: %.60s\n", i, s)
			continue
		}
		out = append(out, s)
	}
	return out
}

func convertWavToM4A(wavBytes []byte) ([]byte, error) {
	cmd := exec.Command(
		"ffmpeg",
		"-hide_banner",
		"-loglevel", "error",
		"-i", "pipe:0",
		"-c:a", "aac",
		"-b:a", "128k",
		"-movflags", "frag_keyframe+empty_moov",
		"-f", "mp4",
		"pipe:1",
	)
	cmd.Stdin = bytes.NewReader(wavBytes)
	var out bytes.Buffer
	var errBuf bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &errBuf
	if err := cmd.Run(); err != nil {
		return nil, fmt.Errorf("ffmpeg convert failed: %v, detail: %s", err, errBuf.String())
	}
	return out.Bytes(), nil
}

func adjustWavSpeed(wavBytes []byte, speed float64) ([]byte, error) {
	if speed <= 0 {
		speed = 1.0
	}
	// ffmpeg atempo supports [0.5, 2.0]
	if speed < 0.5 {
		speed = 0.5
	}
	if speed > 2.0 {
		speed = 2.0
	}
	cmd := exec.Command(
		"ffmpeg",
		"-hide_banner",
		"-loglevel", "error",
		"-i", "pipe:0",
		"-filter:a", fmt.Sprintf("atempo=%.3f", speed),
		"-f", "wav",
		"pipe:1",
	)
	cmd.Stdin = bytes.NewReader(wavBytes)
	var out bytes.Buffer
	var errBuf bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &errBuf
	if err := cmd.Run(); err != nil {
		return nil, fmt.Errorf("ffmpeg speed adjust failed: %v, detail: %s", err, errBuf.String())
	}
	return out.Bytes(), nil
}

func doJSONPost(client *http.Client, url string, payload []byte) (*http.Response, []byte, error) {
	httpReq, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(payload))
	if err != nil {
		return nil, nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := client.Do(httpReq)
	if err != nil {
		return nil, nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return resp, nil, err
	}
	return resp, body, nil
}

func envOrDefault(key, fallback string) string {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	return v
}

func envIntOrDefault(key string, fallback int) int {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return fallback
	}
	return n
}

func parseFishAPIs() []string {
	if raw := strings.TrimSpace(os.Getenv("FISH_API_BASES")); raw != "" {
		parts := strings.Split(raw, ",")
		apis := make([]string, 0, len(parts))
		for _, part := range parts {
			v := strings.TrimSpace(part)
			if v != "" {
				apis = append(apis, v)
			}
		}
		if len(apis) > 0 {
			return apis
		}
	}
	return []string{envOrDefault("FISH_API_BASE", "http://127.0.0.1:8080")}
}

func runTTSWorker(ctx context.Context, fishAPI string, queue chan ttsJob, client *http.Client, pool *UpstreamPool) {
	for {
		select {
		case <-ctx.Done():
			return
		case job, ok := <-queue:
			if !ok {
				return
			}
			pool.BeginJob(fishAPI, job.meta)
			selectedAPI := fishAPI
			upstreamURL := fmt.Sprintf("%s/v1/tts", fishAPI)
			resp, body, err := doJSONPost(client, upstreamURL, job.payload)
			if err == nil && resp.StatusCode >= 500 {
				// Fish 服务刚重启/热身时偶发 500，这里短暂重试一次提升稳定性。
				time.Sleep(1200 * time.Millisecond)
				resp2, body2, err2 := doJSONPost(client, upstreamURL, job.payload)
				if err2 == nil {
					resp, body, err = resp2, body2, nil
				}
			}
			// 本卡仍失败时，切换到其他 GPU 实例兜底重试。
			// 若请求携带 reference_id，仅允许在同样持有该 reference 的实例重试，
			// 避免"出声成功但音色跑偏"。
			if err != nil || (err == nil && resp.StatusCode >= 500) {
				allowedBackups := pool.Snapshot()
				var parsedReq TTSRequest
				if uErr := json.Unmarshal(job.payload, &parsedReq); uErr == nil {
					refID := strings.TrimSpace(parsedReq.ReferenceID)
					if refID != "" {
						if matched := pool.Refs().apisForReference(refID); len(matched) > 0 {
							allowedBackups = matched
						} else {
							// 未知 reference 归属时，不跨卡兜底，保持失败可见，避免音色错配。
							allowedBackups = []string{fishAPI}
						}
					}
				}
				for _, backupAPI := range allowedBackups {
					if backupAPI == fishAPI {
						continue
					}
					backupURL := fmt.Sprintf("%s/v1/tts", backupAPI)
					resp2, body2, err2 := doJSONPost(client, backupURL, job.payload)
					if err2 == nil && resp2.StatusCode < 500 {
						selectedAPI = backupAPI
						resp, body, err = resp2, body2, nil
						break
					}
				}
			}

			result := ttsResult{
				fishAPI: selectedAPI,
				err:     err,
			}
			if err == nil {
				result.statusCode = resp.StatusCode
				result.body = body
			}
			select {
			case job.resultCh <- result:
			default:
				// 请求方已取消，丢弃结果避免 worker 阻塞。
			}
			pool.EndJob(fishAPI)
		}
	}
}

func parseReferenceIDsFromBody(body []byte) ([]string, error) {
	var parsed struct {
		ReferenceIDs []string `json:"reference_ids"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		return nil, err
	}
	return parsed.ReferenceIDs, nil
}

func submitTTSJob(ctx context.Context, q chan ttsJob, payload []byte, wantsM4A bool, meta InFlightInfo) (ttsResult, error) {
	if meta.EnqueuedAt.IsZero() {
		meta.EnqueuedAt = time.Now()
	}
	job := ttsJob{
		payload:  payload,
		wantsM4A: wantsM4A,
		resultCh: make(chan ttsResult, 1),
		meta:     meta,
	}
	select {
	case q <- job:
	case <-ctx.Done():
		return ttsResult{}, fmt.Errorf("request canceled before enqueue")
	}
	select {
	case result := <-job.resultCh:
		return result, nil
	case <-ctx.Done():
		return ttsResult{}, fmt.Errorf("request canceled while waiting in queue")
	}
}

func streamFromUpstream(c *gin.Context, client *http.Client, upstreamURL string, payload []byte) {
	httpReq, err := http.NewRequestWithContext(c.Request.Context(), http.MethodPost, upstreamURL, bytes.NewReader(payload))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create upstream request", "detail": err.Error()})
		return
	}
	httpReq.Header.Set("Content-Type", "application/json")
	resp, err := client.Do(httpReq)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "upstream unavailable", "detail": err.Error()})
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		c.Data(resp.StatusCode, "application/json", body)
		return
	}

	ffmpeg := exec.Command(
		"ffmpeg",
		"-hide_banner",
		"-loglevel", "error",
		"-f", "s16le",
		"-ar", "44100",
		"-ac", "1",
		"-i", "pipe:0",
		"-f", "mp3",
		"-b:a", "128k",
		"pipe:1",
	)
	ffmpeg.Stdin = resp.Body
	ffmpegOut, err := ffmpeg.StdoutPipe()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to init stream transcoder", "detail": err.Error()})
		return
	}
	if err := ffmpeg.Start(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to start stream transcoder", "detail": err.Error()})
		return
	}

	c.Status(resp.StatusCode)
	c.Header("Content-Type", "audio/mpeg")
	c.Header("Transfer-Encoding", "chunked")
	c.Header("Cache-Control", "no-cache")
	c.Header("X-Accel-Buffering", "no")

	flusher, _ := c.Writer.(http.Flusher)
	buf := make([]byte, 32*1024)
	for {
		n, readErr := ffmpegOut.Read(buf)
		if n > 0 {
			if _, writeErr := c.Writer.Write(buf[:n]); writeErr != nil {
				return
			}
			if flusher != nil {
				flusher.Flush()
			}
		}
		if readErr != nil {
			if readErr == io.EOF {
				_ = ffmpeg.Wait()
				return
			}
			_ = ffmpeg.Wait()
			return
		}
	}
}

func main() {
	cfg := AppConfig{
		ListenAddr:   envOrDefault("MEMEC_BACKEND_LISTEN", "127.0.0.1:8090"),
		FishAPIs:     parseFishAPIs(),
		TimeoutSec:   envIntOrDefault("HTTP_TIMEOUT_SEC", 300),
		MaxNewTokens: envIntOrDefault("DEFAULT_MAX_NEW_TOKENS", 1024),
		QueueSize:    envIntOrDefault("TTS_QUEUE_SIZE", 64),
		DBDsn: envOrDefault(
			"MEMEC_POSTGRES_DSN",
			"postgres://memec:memec@127.0.0.1:5432/memec?sslmode=disable",
		),
	}
	var fishAPIRR uint64

	client := &http.Client{
		Timeout: time.Duration(cfg.TimeoutSec) * time.Second,
	}
	workerCtx, workerCancel := context.WithCancel(context.Background())
	defer workerCancel()
	pool := NewUpstreamPool(workerCtx, cfg.FishAPIs, cfg.QueueSize, client)
	refs := pool.Refs()

	loadGenerationsFromDisk()

	r := gin.Default()
	authRequired := authRequiredMiddleware()

	db, err := sql.Open("postgres", cfg.DBDsn)
	if err != nil {
		panic(err)
	}
	if err := runMigrations(db); err != nil {
		panic(err)
	}
	registerAuthRoutes(r, db)
	registerClusterRoutes(r, db)
	registerAdminRoutes(r, db, pool)
	pool.StartReconciler(db, 10*time.Second)
	pool.StartHealthChecker(10*time.Second, 2*time.Second)
	initWorkshopWorker(workerCtx, db, cfg, pool)
	registerWorkshopRoutes(r, db)
	registerVoiceRoutes(r, db, cfg, pool)

	r.GET("/api/health", func(c *gin.Context) {
		apis := pool.Snapshot()
		totalQueueLen := 0
		for _, api := range apis {
			if q, ok := pool.QueueFor(api); ok {
				totalQueueLen += len(q)
			}
		}
		c.JSON(http.StatusOK, gin.H{
			"status":         "ok",
			"backend":        "meme-c",
			"fish_api_bases": apis,
			"tts_queue_len":  totalQueueLen,
			"tts_queue_cap":  cfg.QueueSize * len(apis),
		})
	})

	r.POST("/api/tts", authRequired, func(c *gin.Context) {
		var req TTSRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request", "detail": err.Error()})
			return
		}
		if req.Text == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "text is required"})
			return
		}
		optimizedText, optErr := addBreathByMode(req.Text, req.Mode)
		if optErr != nil {
			fmt.Printf("[tts] addBreathByMode fallback=origin reason=%v\n", optErr)
			optimizedText = req.Text
		}
		if strings.ToLower(strings.TrimSpace(req.Mode)) == "sleep" {
			logLine := fmt.Sprintf("[tts] mode=%s optimized_text=\n%s", req.Mode, formatTextForLog(optimizedText))
			fmt.Println(logLine)
			appendLineToFile(fishErrLogPath, time.Now().Format("2006-01-02 15:04:05")+" "+logLine)
		}
		req.Text = optimizedText

		if req.Format == "" {
			req.Format = "wav"
		}
		if req.Speed == 0 {
			req.Speed = 1.0
		}
		if req.MaxNewTokens <= 0 {
			req.MaxNewTokens = cfg.MaxNewTokens
		}
		req.Format = strings.ToLower(req.Format)
		wantsM4A := req.Format == "m4a" || req.Format == "mp4"
		if wantsM4A {
			// Fish 服务侧不稳定支持 m4a/mp4，统一用 wav 拉取后在本地转码。
			req.Format = "wav"
		}

		payload, err := json.Marshal(req)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to encode request"})
			return
		}
		if refID := strings.TrimSpace(req.ReferenceID); refID != "" {
			if matched := refs.apisForReference(refID); len(matched) == 0 {
				c.JSON(http.StatusBadRequest, gin.H{
					"error":  "unknown reference_id",
					"detail": "reference_id not synced to any fish upstream",
				})
				return
			}
		}

		_, targetQueue, ok := pool.ChooseForTTS(req, &fishAPIRR)
		if !ok {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "no upstream available"})
			return
		}
		result, jobErr := submitTTSJob(c.Request.Context(), targetQueue, payload, wantsM4A, InFlightInfo{
			JobID:       newGenerationID(),
			TaskID:      newGenerationID(),
			TaskKind:    "tts",
			SegIndex:    0,
			SegTotal:    1,
			TextPreview: previewText(req.Text, 80),
		})
		if jobErr != nil {
			c.JSON(http.StatusRequestTimeout, gin.H{"error": jobErr.Error()})
			return
		}

		if result.err != nil {
			c.JSON(http.StatusBadGateway, gin.H{"error": "upstream unavailable", "detail": result.err.Error()})
			return
		}
		if result.statusCode >= 400 {
			c.Data(result.statusCode, "application/json", result.body)
			return
		}

		processedWav := result.body
		if req.Speed != 1.0 {
			adjusted, err := adjustWavSpeed(result.body, req.Speed)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to adjust speed", "detail": err.Error()})
				return
			}
			processedWav = adjusted
		}

		outBytes := processedWav
		outExt := req.Format
		outContentType := "audio/wav"

		if wantsM4A {
			converted, err := convertWavToM4A(processedWav)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to convert wav to m4a", "detail": err.Error()})
				return
			}
			outBytes = converted
			outExt = "m4a"
			outContentType = "audio/mp4"
		}

		fmt.Printf(
			"[tts-route] upstream=%s reference_id=%q status=%d bytes=%d\n",
			result.fishAPI, req.ReferenceID, result.statusCode, len(outBytes),
		)
		c.Header("X-Fish-Upstream", result.fishAPI)
		c.Header("Content-Disposition", "attachment; filename=tts."+outExt)
		c.Data(result.statusCode, outContentType, outBytes)
	})

	r.GET("/api/tts/stream", authRequired, func(c *gin.Context) {
		text := strings.TrimSpace(c.Query("text"))
		if text == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "text is required"})
			return
		}
		mode := c.DefaultQuery("mode", "normal")
		referenceID := strings.TrimSpace(c.Query("reference_id"))
		speed := c.DefaultQuery("speed", "1.0")
		latency := c.DefaultQuery("latency", "balanced")
		chunkLength := envIntOrDefault("STREAM_CHUNK_LENGTH", 100)
		if v := strings.TrimSpace(c.Query("chunk_length")); v != "" {
			if parsed, err := strconv.Atoi(v); err == nil && parsed >= 100 && parsed <= 1000 {
				chunkLength = parsed
			}
		}
		if speed != "1" && speed != "1.0" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "streaming only supports speed=1.0"})
			return
		}
		if latency != "normal" && latency != "balanced" {
			latency = "balanced"
		}

		optimizedText, optErr := addBreathByMode(text, mode)
		if optErr != nil {
			optimizedText = text
		}

		req := TTSRequest{
			Text:        optimizedText,
			ReferenceID: referenceID,
			Format:      "wav",
			Mode:        mode,
			Speed:       1.0,
		}
		if refID := strings.TrimSpace(req.ReferenceID); refID != "" {
			if matched := refs.apisForReference(refID); len(matched) == 0 {
				c.JSON(http.StatusBadRequest, gin.H{
					"error":  "unknown reference_id",
					"detail": "reference_id not synced to any fish upstream",
				})
				return
			}
		}
		targetAPI, _, chooseOK := pool.ChooseForTTS(req, &fishAPIRR)
		if !chooseOK {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "no upstream available"})
			return
		}
		upstreamURL := fmt.Sprintf("%s/v1/tts", targetAPI)
		payloadMap := map[string]any{
			"text":         req.Text,
			"format":       "wav",
			"streaming":    true,
			"latency":      latency,
			"chunk_length": chunkLength,
		}
		if req.ReferenceID != "" {
			payloadMap["reference_id"] = req.ReferenceID
		}
		payload, err := json.Marshal(payloadMap)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to encode request"})
			return
		}

		c.Header("X-Fish-Upstream", targetAPI)
		fmt.Printf(
			"[tts-stream-route] upstream=%s reference_id=%q latency=%s chunk_length=%d\n",
			targetAPI, req.ReferenceID, latency, chunkLength,
		)
		streamFromUpstream(c, client, upstreamURL, payload)
	})

	// POST /api/tts/multi-segment-stream
	// 本地分段并插入 Fish 气口标签后，按段 index 轮流绑定 GPU 合成；响应为 NDJSON。
	r.POST("/api/tts/multi-segment-stream", authRequired, func(c *gin.Context) {
		var req multiSegmentStreamRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid json", "detail": err.Error()})
			return
		}
		if strings.TrimSpace(req.Text) == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "text is required"})
			return
		}
		speed := req.Speed
		if speed == 0 {
			speed = 1.0
		}
		mtok := req.MaxNewTokens
		if mtok <= 0 {
			mtok = cfg.MaxNewTokens
		}

		tAll := time.Now()
		rec := &GenerationRecord{
			ID:          newGenerationID(),
			CreatedAt:   time.Now().UTC().Format(time.RFC3339Nano),
			Kind:        "multi_segment",
			ReferenceID: strings.TrimSpace(req.ReferenceID),
			Mode:        strings.TrimSpace(req.Mode),
			Speed:       speed,
			TextPreview: previewText(req.Text, 160),
		}
		if rec.Mode == "" {
			rec.Mode = "normal"
		}
		defer func() {
			rec.TotalMs = time.Since(tAll).Milliseconds()
			appendGeneration(*rec)
		}()

		ttsBase := TTSRequest{
			ReferenceID:  strings.TrimSpace(req.ReferenceID),
			Mode:         "normal",
			Speed:        1.0,
			MaxNewTokens: mtok,
			Format:       "wav",
		}
		if refID := strings.TrimSpace(ttsBase.ReferenceID); refID != "" {
			if matched := refs.apisForReference(refID); len(matched) == 0 {
				c.JSON(http.StatusBadRequest, gin.H{
					"error":  "unknown reference_id",
					"detail": "reference_id not synced to any fish upstream",
				})
				return
			}
		}
		reqCtx := c.Request.Context()

		tPrep := time.Now()
		segs, segErr := segmentTextArrayWithLocalBreath(req.Text)
		if segErr != nil {
			fmt.Printf("[segment-local] fallback=single reason=%v\n", segErr)
			segs = []string{req.Text}
		}
		segs = filterNonEmptySegments(segs)
		if len(segs) == 0 {
			segs = []string{req.Text}
		}
		segments := segs
		rec.DeepSeekMs = time.Since(tPrep).Milliseconds()
		rec.OptimizeMs = rec.DeepSeekMs

		var firstPrefetchCh chan ttsResult
		var firstSegTTSMs int64
		firstPrefetchCh = make(chan ttsResult, 1)
		tPref := time.Now()
		seg0Text := segments[0]
		go func() {
			prefReq := ttsBase
			prefReq.Text = seg0Text
			payload, err := json.Marshal(prefReq)
			if err != nil {
				firstPrefetchCh <- ttsResult{err: err}
				return
			}
			_, q, ok := pool.PickForSegment(0, prefReq)
			if !ok {
				firstPrefetchCh <- ttsResult{err: fmt.Errorf("no upstream for prefetch")}
				return
			}
			res, jErr := submitTTSJob(reqCtx, q, payload, false, InFlightInfo{
				JobID:       newGenerationID(),
				TaskID:      rec.ID,
				TaskKind:    "multi_segment",
				SegIndex:    0,
				SegTotal:    len(segments),
				TextPreview: previewText(seg0Text, 80),
			})
			firstSegTTSMs = time.Since(tPref).Milliseconds()
			if jErr != nil {
				firstPrefetchCh <- ttsResult{err: jErr}
				return
			}
			firstPrefetchCh <- res
		}()

		const maxSegs = 48
		if len(segments) > maxSegs {
			rest := strings.Join(segments[maxSegs-1:], "")
			segments = append(append([]string{}, segments[:maxSegs-1]...), rest)
		}
		rec.SegmentCount = len(segments)
		rec.FinalInputText = strings.Join(segments, "\n")

		upstreamPlan := make([]string, len(segments))
		for i := range segments {
			api, _, ok := pool.PickForSegment(i, ttsBase)
			if !ok {
				c.JSON(http.StatusServiceUnavailable, gin.H{"error": "no upstream available"})
				return
			}
			upstreamPlan[i] = api
		}

		c.Header("Content-Type", "application/x-ndjson; charset=utf-8")
		c.Header("Cache-Control", "no-cache")
		c.Header("X-Accel-Buffering", "no")

		writeNDJSONLine := func(obj any) error {
			b, err := json.Marshal(obj)
			if err != nil {
				return err
			}
			if _, err := c.Writer.Write(b); err != nil {
				return err
			}
			if _, err := c.Writer.Write([]byte("\n")); err != nil {
				return err
			}
			if f, ok := c.Writer.(http.Flusher); ok {
				f.Flush()
			}
			return nil
		}

		c.Status(http.StatusOK)
		if err := writeNDJSONLine(map[string]any{
			"type":          "meta",
			"count":         len(segments),
			"segments":      segments,
			"upstream_plan": upstreamPlan,
			"speed":         speed,
		}); err != nil {
			rec.Success = false
			rec.Error = "write meta: " + err.Error()
			return
		}
		rec.FirstMetaMs = time.Since(tAll).Milliseconds()

		// 打印全部分片供断句质量审查
		fmt.Printf("[segments] mode=%s count=%d prep=%dms\n", rec.Mode, len(segments), rec.DeepSeekMs)
		for si, seg := range segments {
			fmt.Printf("  [%02d/%02d] len=%d %s\n", si+1, len(segments), len([]rune(seg)), previewText(seg, 80))
		}

		n := len(segments)
		ready := make([]chan ttsResult, n)
		ttsMs := make([]int64, n)
		encMs := make([]int64, n)
		// segment 0 已由预热 goroutine 处理，直接复用其 channel
		ready[0] = firstPrefetchCh
		for i := 1; i < n; i++ {
			ready[i] = make(chan ttsResult, 1)
		}

		// 启动 segment 1..n-1 的 TTS goroutine（segment 0 已在预热中）
		for i := 1; i < n; i++ {
			go func(i int, segText string) {
				tSeg := time.Now()
				segReq := ttsBase
				segReq.Text = segText
				payload, err := json.Marshal(segReq)
				if err != nil {
					select {
					case ready[i] <- ttsResult{err: err}:
					default:
					}
					return
				}
				_, q, ok := pool.PickForSegment(i, segReq)
				if !ok {
					select {
					case ready[i] <- ttsResult{err: fmt.Errorf("no upstream available")}:
					default:
					}
					return
				}
				res, jErr := submitTTSJob(reqCtx, q, payload, false, InFlightInfo{
					JobID:       newGenerationID(),
					TaskID:      rec.ID,
					TaskKind:    "multi_segment",
					SegIndex:    i,
					SegTotal:    n,
					TextPreview: previewText(segText, 80),
				})
				if jErr != nil {
					select {
					case ready[i] <- ttsResult{err: jErr}:
					default:
					}
					return
				}
				ttsMs[i] = time.Since(tSeg).Milliseconds()
				select {
				case ready[i] <- res:
				default:
				}
			}(i, segments[i])
		}

		for i := 0; i < n; i++ {
			var res ttsResult
			select {
			case <-reqCtx.Done():
				rec.Success = false
				rec.Error = "client disconnected"
				_ = writeNDJSONLine(map[string]any{"type": "error", "index": i, "message": "client disconnected"})
				return
			case res = <-ready[i]:
			}
			// segment 0 的 TTS 耗时由预热 goroutine 记录
			if i == 0 {
				ttsMs[0] = firstSegTTSMs
			}
			if res.err != nil {
				rec.Success = false
				rec.Error = res.err.Error()
				_ = writeNDJSONLine(map[string]any{"type": "error", "index": i, "message": res.err.Error()})
				return
			}
			if res.statusCode >= 400 {
				rec.Success = false
				rec.Error = fmt.Sprintf("upstream status %d", res.statusCode)
				_ = writeNDJSONLine(map[string]any{"type": "error", "index": i, "message": fmt.Sprintf("upstream status %d", res.statusCode), "body": string(res.body)})
				return
			}
			tEnc := time.Now()
			wav := res.body
			if speed != 1.0 {
				adj, aerr := adjustWavSpeed(wav, speed)
				if aerr != nil {
					rec.Success = false
					rec.Error = aerr.Error()
					_ = writeNDJSONLine(map[string]any{"type": "error", "index": i, "message": aerr.Error()})
					return
				}
				wav = adj
			}
			mp3, merr := wavToMp3Bytes(wav)
			if merr != nil {
				rec.Success = false
				rec.Error = merr.Error()
				_ = writeNDJSONLine(map[string]any{"type": "error", "index": i, "message": merr.Error()})
				return
			}
			encMs[i] = time.Since(tEnc).Milliseconds()
			if rec.FirstAudioMs == 0 {
				rec.FirstAudioMs = time.Since(tAll).Milliseconds()
			}
			if err := writeNDJSONLine(map[string]any{
				"type":     "chunk",
				"index":    i,
				"total":    n,
				"upstream": res.fishAPI,
				"mp3_b64":  base64.StdEncoding.EncodeToString(mp3),
			}); err != nil {
				rec.Success = false
				rec.Error = "write chunk: " + err.Error()
				return
			}
			segPreview := previewText(segments[i], 50)
			fmt.Printf("[tts-multi-segment] i=%d/%d upstream=%s mp3_bytes=%d text=%.50s\n", i+1, n, res.fishAPI, len(mp3), segPreview)
		}
		rec.TtsPerSegmentMs = ttsMs
		rec.EncodePerSegmentMs = encMs
		rec.Success = true
		_ = writeNDJSONLine(map[string]any{"type": "done"})
	})

	r.GET("/api/references/list", authRequired, func(c *gin.Context) {
		union := make(map[string]struct{})
		successCount := 0
		var lastErr error
		for _, fishAPI := range pool.Snapshot() {
			upstreamURL := fmt.Sprintf("%s/v1/references/list?format=json", fishAPI)
			resp, err := client.Get(upstreamURL)
			if err != nil {
				lastErr = err
				continue
			}
			body, err := io.ReadAll(resp.Body)
			resp.Body.Close()
			if err != nil {
				lastErr = err
				continue
			}
			if resp.StatusCode >= 400 {
				lastErr = fmt.Errorf("upstream %s returned %d", fishAPI, resp.StatusCode)
				continue
			}
			refIDs, err := parseReferenceIDsFromBody(body)
			if err != nil {
				lastErr = err
				continue
			}
			refs.setAPIReferences(fishAPI, refIDs)
			for _, id := range refIDs {
				id = strings.TrimSpace(id)
				if id != "" {
					union[id] = struct{}{}
				}
			}
			successCount++
		}
		if successCount == 0 {
			detail := "all upstreams unavailable"
			if lastErr != nil {
				detail = lastErr.Error()
			}
			c.JSON(http.StatusBadGateway, gin.H{"error": "upstream unavailable", "detail": detail})
			return
		}
		allIDs := make([]string, 0, len(union))
		for id := range union {
			allIDs = append(allIDs, id)
		}
		sort.Strings(allIDs)
		c.JSON(http.StatusOK, gin.H{"reference_ids": allIDs})
	})

	r.POST("/api/references/add", authRequired, func(c *gin.Context) {
		refID := c.PostForm("id")
		refText := c.PostForm("text")
		if refID == "" || refText == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "id and text are required"})
			return
		}

		fileHeader, err := c.FormFile("audio")
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "audio file is required"})
			return
		}
		file, err := fileHeader.Open()
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "failed to open audio file"})
			return
		}
		defer file.Close()

		var form bytes.Buffer
		writer := multipart.NewWriter(&form)
		if err := writer.WriteField("id", refID); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to write id"})
			return
		}
		if err := writer.WriteField("text", refText); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to write text"})
			return
		}
		part, err := writer.CreateFormFile("audio", fileHeader.Filename)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create audio part"})
			return
		}
		if _, err := io.Copy(part, file); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to copy audio data"})
			return
		}
		if err := writer.Close(); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to finalize form"})
			return
		}

		formBytes := form.Bytes()
		var firstSuccessBody []byte
		successCount := 0
		var lastErr error
		var lastStatus int
		var lastBody []byte

		snapshot := pool.Snapshot()
		for _, fishAPI := range snapshot {
			upstreamURL := fmt.Sprintf("%s/v1/references/add?format=json", fishAPI)
			httpReq, err := http.NewRequest(http.MethodPost, upstreamURL, bytes.NewReader(formBytes))
			if err != nil {
				lastErr = err
				continue
			}
			httpReq.Header.Set("Content-Type", writer.FormDataContentType())
			resp, err := client.Do(httpReq)
			if err != nil {
				lastErr = err
				continue
			}
			body, err := io.ReadAll(resp.Body)
			resp.Body.Close()
			if err != nil {
				lastErr = err
				continue
			}
			lastStatus = resp.StatusCode
			lastBody = body
			if resp.StatusCode < 400 {
				successCount++
				refs.addReferenceToAPI(fishAPI, refID)
				if firstSuccessBody == nil {
					firstSuccessBody = body
				}
			}
		}

		if successCount == 0 {
			if lastErr != nil {
				c.JSON(http.StatusBadGateway, gin.H{"error": "all upstreams unavailable", "detail": lastErr.Error()})
				return
			}
			c.Data(lastStatus, "application/json", lastBody)
			return
		}
		c.Header("X-References-Synced", fmt.Sprintf("%d/%d", successCount, len(snapshot)))
		c.Data(http.StatusOK, "application/json", firstSuccessBody)
	})

	if err := r.Run(cfg.ListenAddr); err != nil {
		panic(err)
	}
}
