package main

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// ─── Response / Request Types ────────────────────────────────────────────────

type WorkshopJobResp struct {
	ID           int64   `json:"id"`
	Title        string  `json:"title"`
	TextPreview  string  `json:"text_preview"`
	ReferenceID  string  `json:"reference_id"`
	Mode         string  `json:"mode"`
	Speed        float64 `json:"speed"`
	Status       string  `json:"status"`
	ErrorMsg     string  `json:"error_msg,omitempty"`
	HasAudio     bool    `json:"has_audio"`
	SegmentCount int     `json:"segment_count"`
	SegmentsDone int     `json:"segments_done"`
	Favorite     bool    `json:"favorite"`
	Disliked     bool    `json:"disliked"`
	CreatedAt    string  `json:"created_at"`
}

type createWorkshopJobReq struct {
	Title       string  `json:"title"`
	TextContent string  `json:"text_content"`
	ReferenceID string  `json:"reference_id"`
	Mode        string  `json:"mode"`
	Speed       float64 `json:"speed"`
}

type patchWorkshopJobReq struct {
	Favorite *bool `json:"favorite"`
	Disliked *bool `json:"disliked"`
}

// ─── Worker ──────────────────────────────────────────────────────────────────

type workshopWorker struct {
	db        *sql.DB
	cfg       AppConfig
	refs      *referenceIndex
	ttsQueues map[string]chan ttsJob
	jobCh     chan int64
	sem       chan struct{} // limits concurrent jobs
	once      sync.Once
}

var globalWorkshopWorker *workshopWorker

func hasFishPauseTag(s string) bool {
	return strings.Contains(s, "[break]") || strings.Contains(s, "[long-break]") || strings.Contains(s, "[breath]")
}

func injectBreakTagsForSleep(s string) string {
	s = strings.TrimSpace(s)
	if s == "" || hasFishPauseTag(s) {
		return s
	}
	replacer := strings.NewReplacer(
		"，", "，[break]",
		",", ",[break]",
		"。", "。[long-break]",
		"！", "！[long-break]",
		"？", "？[long-break]",
		"；", "；[long-break]",
		"：", "：[long-break]",
		".", ".[long-break]",
		"!", "![long-break]",
		"?", "?[long-break]",
		";", ";[long-break]",
		":", ":[long-break]",
	)
	out := strings.TrimSpace(replacer.Replace(s))
	if out == "" {
		return s
	}
	if !hasFishPauseTag(out) {
		out += "[break]"
	}
	return out
}

func initWorkshopWorker(ctx context.Context, db *sql.DB, cfg AppConfig, refs *referenceIndex, ttsQueues map[string]chan ttsJob) {
	globalWorkshopWorker = &workshopWorker{
		db:        db,
		cfg:       cfg,
		refs:      refs,
		ttsQueues: ttsQueues,
		jobCh:     make(chan int64, 128),
		sem:       make(chan struct{}, 3),
	}
	globalWorkshopWorker.start(ctx)
}

func (w *workshopWorker) start(ctx context.Context) {
	w.once.Do(func() {
		// Reset jobs that were stuck processing when the server last stopped.
		_, _ = w.db.ExecContext(ctx, `UPDATE workshop_jobs SET status='pending', updated_at=NOW() WHERE status='processing'`)

		// Dispatcher: pull job IDs from channel, acquire semaphore, run goroutine.
		go func() {
			for {
				select {
				case jobID := <-w.jobCh:
					w.sem <- struct{}{}
					go func(id int64) {
						defer func() { <-w.sem }()
						w.processJob(ctx, id)
					}(jobID)
				case <-ctx.Done():
					return
				}
			}
		}()

		// Poller: every 15s pick up any pending jobs that missed channel notification.
		go func() {
			ticker := time.NewTicker(15 * time.Second)
			defer ticker.Stop()
			for {
				select {
				case <-ticker.C:
					rows, err := w.db.QueryContext(ctx, `SELECT id FROM workshop_jobs WHERE status='pending' ORDER BY created_at ASC LIMIT 10`)
					if err != nil {
						continue
					}
					for rows.Next() {
						var id int64
						if rows.Scan(&id) == nil {
							select {
							case w.jobCh <- id:
							default:
							}
						}
					}
					_ = rows.Close()
				case <-ctx.Done():
					return
				}
			}
		}()
	})
}

func (w *workshopWorker) enqueue(jobID int64) {
	select {
	case w.jobCh <- jobID:
	default:
		// channel full; poller will pick it up
	}
}

func (w *workshopWorker) processJob(ctx context.Context, jobID int64) {
	tAll := time.Now()
	// Atomically claim the job (only if still pending).
	res, err := w.db.ExecContext(ctx, `UPDATE workshop_jobs SET status='processing', updated_at=NOW() WHERE id=$1 AND status='pending'`, jobID)
	if err != nil {
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return
	}

	var userID int64
	var text, referenceID, mode string
	var speed float64
	if err := w.db.QueryRowContext(ctx, `SELECT user_id, text_content, reference_id, mode, speed FROM workshop_jobs WHERE id=$1`, jobID).
		Scan(&userID, &text, &referenceID, &mode, &speed); err != nil {
		w.failJob(jobID, "db read: "+err.Error())
		return
	}
	if speed <= 0 {
		speed = 1.0
	}
	rec := &GenerationRecord{
		ID:          newGenerationID(),
		CreatedAt:   time.Now().UTC().Format(time.RFC3339Nano),
		Kind:        "workshop_multi_segment",
		ReferenceID: strings.TrimSpace(referenceID),
		Mode:        strings.TrimSpace(mode),
		Speed:       speed,
		TextPreview: previewText(text, 160),
		Success:     false,
	}
	if rec.Mode == "" {
		rec.Mode = "normal"
	}
	defer func() {
		rec.TotalMs = time.Since(tAll).Milliseconds()
		appendGeneration(*rec)
	}()

	// Segment text via DeepSeek.
	isSleep := strings.ToLower(strings.TrimSpace(mode)) == "sleep"
	var segments []string
	if isSleep {
		segs, segErr := segmentAndBreatheWithDeepSeek(text)
		if segErr != nil {
			fmt.Printf("[workshop] job %d sleep-segment fallback: %v\n", jobID, segErr)
			segs = []string{text}
		}
		segments = filterNonEmptySegments(segs)
		for i := range segments {
			segments[i] = injectBreakTagsForSleep(segments[i])
		}
	} else {
		segs, segErr := segmentTextArrayWithDeepSeek(text)
		if segErr != nil {
			fmt.Printf("[workshop] job %d normal-segment fallback: %v\n", jobID, segErr)
			segs = []string{text}
		}
		segments = filterNonEmptySegments(segs)
	}
	if len(segments) == 0 {
		segments = []string{text}
	}
	const maxSegs = 48
	if len(segments) > maxSegs {
		tail := strings.Join(segments[maxSegs-1:], "")
		segments = append(append([]string{}, segments[:maxSegs-1]...), tail)
	}
	rec.SegmentCount = len(segments)
	rec.FinalInputText = strings.Join(segments, "\n")

	_, _ = w.db.ExecContext(ctx, `UPDATE workshop_jobs SET segment_count=$1, updated_at=NOW() WHERE id=$2`, len(segments), jobID)

	ttsBase := TTSRequest{
		ReferenceID:  strings.TrimSpace(referenceID),
		Mode:         "normal",
		Speed:        1.0,
		MaxNewTokens: w.cfg.MaxNewTokens,
		Format:       "wav",
	}

	type segResult struct {
		idx int
		mp3 []byte
		err error
	}
	resultCh := make(chan segResult, len(segments))

	// Launch all segments in parallel.
	for i, seg := range segments {
		go func(idx int, segText string) {
			segReq := ttsBase
			segReq.Text = segText
			payload, marshalErr := json.Marshal(segReq)
			if marshalErr != nil {
				resultCh <- segResult{idx: idx, err: marshalErr}
				return
			}
			api := pickAPIForSegment(idx, segReq, w.cfg.FishAPIs, w.refs)
			q, ok := w.ttsQueues[api]
			if !ok {
				resultCh <- segResult{idx: idx, err: fmt.Errorf("no queue for api %s", api)}
				return
			}
			ttsRes, jErr := submitTTSJob(ctx, q, payload, false)
			if jErr != nil {
				resultCh <- segResult{idx: idx, err: jErr}
				return
			}
			if ttsRes.err != nil {
				resultCh <- segResult{idx: idx, err: ttsRes.err}
				return
			}
			if ttsRes.statusCode >= 400 {
				resultCh <- segResult{idx: idx, err: fmt.Errorf("upstream status %d", ttsRes.statusCode)}
				return
			}
			wav := ttsRes.body
			if speed != 1.0 {
				if adj, aerr := adjustWavSpeed(wav, speed); aerr == nil {
					wav = adj
				}
			}
			mp3, merr := wavToMp3Bytes(wav)
			if merr != nil {
				resultCh <- segResult{idx: idx, err: merr}
				return
			}
			resultCh <- segResult{idx: idx, mp3: mp3}
		}(i, seg)
	}

	// Collect results in any order.
	mp3Segs := make([][]byte, len(segments))
	done := 0
	for range segments {
		sr := <-resultCh
		if sr.err != nil {
			rec.Error = fmt.Sprintf("segment %d: %s", sr.idx, sr.err)
			w.failJob(jobID, fmt.Sprintf("segment %d: %s", sr.idx, sr.err))
			return
		}
		mp3Segs[sr.idx] = sr.mp3
		done++
		_, _ = w.db.ExecContext(ctx, `UPDATE workshop_jobs SET segments_done=$1, updated_at=NOW() WHERE id=$2`, done, jobID)
	}

	// Concatenate all MP3 segments.
	var fullMP3 []byte
	if len(mp3Segs) == 1 {
		fullMP3 = mp3Segs[0]
	} else {
		fullMP3, err = concatMP3Segs(mp3Segs)
		if err != nil {
			rec.Error = "concat: " + err.Error()
			w.failJob(jobID, "concat: "+err.Error())
			return
		}
	}

	// Save to disk.
	audioDir := filepath.Join(adminDataDir(), "workshop", fmt.Sprintf("%d", userID))
	if mkErr := os.MkdirAll(audioDir, 0755); mkErr != nil {
		rec.Error = "mkdir: " + mkErr.Error()
		w.failJob(jobID, "mkdir: "+mkErr.Error())
		return
	}
	audioPath := filepath.Join(audioDir, fmt.Sprintf("%d.mp3", jobID))
	if wErr := os.WriteFile(audioPath, fullMP3, 0644); wErr != nil {
		rec.Error = "write file: " + wErr.Error()
		w.failJob(jobID, "write file: "+wErr.Error())
		return
	}

	_, _ = w.db.ExecContext(ctx, `UPDATE workshop_jobs SET status='done', audio_path=$1, segments_done=segment_count, updated_at=NOW() WHERE id=$2`, audioPath, jobID)
	rec.Success = true
	fmt.Printf("[workshop] job %d done segments=%d bytes=%d\n", jobID, len(segments), len(fullMP3))
}

func (w *workshopWorker) failJob(jobID int64, msg string) {
	fmt.Printf("[workshop] job %d failed: %s\n", jobID, msg)
	_, _ = w.db.Exec(`UPDATE workshop_jobs SET status='failed', error_msg=$1, updated_at=NOW() WHERE id=$2`, msg, jobID)
}

// concatMP3Segs concatenates multiple MP3 byte slices into one using ffmpeg concat demuxer.
func concatMP3Segs(segs [][]byte) ([]byte, error) {
	tmpDir, err := os.MkdirTemp("", "workshop_concat_*")
	if err != nil {
		return nil, err
	}
	defer os.RemoveAll(tmpDir)

	var listSB strings.Builder
	for i, seg := range segs {
		segPath := filepath.Join(tmpDir, fmt.Sprintf("seg_%03d.mp3", i))
		if err := os.WriteFile(segPath, seg, 0644); err != nil {
			return nil, err
		}
		listSB.WriteString(fmt.Sprintf("file '%s'\n", segPath))
	}
	listPath := filepath.Join(tmpDir, "list.txt")
	if err := os.WriteFile(listPath, []byte(listSB.String()), 0644); err != nil {
		return nil, err
	}
	outPath := filepath.Join(tmpDir, "output.mp3")
	var errBuf bytes.Buffer
	cmd := exec.Command("ffmpeg",
		"-hide_banner", "-loglevel", "error",
		"-f", "concat", "-safe", "0",
		"-i", listPath, "-c", "copy", outPath,
	)
	cmd.Stderr = &errBuf
	if err := cmd.Run(); err != nil {
		return nil, fmt.Errorf("ffmpeg concat: %w: %s", err, errBuf.String())
	}
	return os.ReadFile(outPath)
}

// ─── API Routes ───────────────────────────────────────────────────────────────

func registerWorkshopRoutes(r *gin.Engine, db *sql.DB) {
	authReq := authRequiredMiddleware()

	// POST /api/workshop/jobs — create a single job
	r.POST("/api/workshop/jobs", authReq, func(c *gin.Context) {
		var req createWorkshopJobReq
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
			return
		}
		req.TextContent = strings.TrimSpace(req.TextContent)
		if req.TextContent == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "text_content is required"})
			return
		}
		if req.Mode == "" {
			req.Mode = "normal"
		}
		if req.Speed <= 0 {
			req.Speed = 1.0
		}
		if req.Title == "" {
			req.Title = previewText(req.TextContent, 30)
		}
		userID := getUID(getUserClaims(c))

		var jobID int64
		if err := db.QueryRowContext(c.Request.Context(), `
			INSERT INTO workshop_jobs (user_id, title, text_content, reference_id, mode, speed)
			VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
			userID, req.Title, req.TextContent, req.ReferenceID, req.Mode, req.Speed,
		).Scan(&jobID); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "db error", "detail": err.Error()})
			return
		}
		globalWorkshopWorker.enqueue(jobID)
		c.JSON(http.StatusOK, gin.H{"ok": true, "job_id": jobID})
	})

	// GET /api/workshop/jobs — list jobs for authenticated user
	r.GET("/api/workshop/jobs", authReq, func(c *gin.Context) {
		userID := getUID(getUserClaims(c))
		includeDisliked := c.DefaultQuery("include_disliked", "false") == "true"

		q := `SELECT id, title, text_content, reference_id, mode, speed, status,
			         COALESCE(error_msg,''), audio_path, segment_count, segments_done,
			         favorite, disliked, created_at
			  FROM workshop_jobs WHERE user_id=$1`
		if !includeDisliked {
			q += ` AND disliked=false`
		}
		q += ` ORDER BY created_at DESC LIMIT 200`

		rows, err := db.QueryContext(c.Request.Context(), q, userID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "db error"})
			return
		}
		defer rows.Close()

		var jobs []WorkshopJobResp
		for rows.Next() {
			var (
				id                         int64
				title, textContent         string
				refID, mode                string
				speed                      float64
				status, errorMsg           string
				audioPath                  sql.NullString
				segCnt, segDone            int
				fav, dis                   bool
				createdAt                  time.Time
			)
			if err := rows.Scan(&id, &title, &textContent, &refID, &mode, &speed, &status,
				&errorMsg, &audioPath, &segCnt, &segDone, &fav, &dis, &createdAt); err != nil {
				continue
			}
			jobs = append(jobs, WorkshopJobResp{
				ID:           id,
				Title:        title,
				TextPreview:  previewText(textContent, 80),
				ReferenceID:  refID,
				Mode:         mode,
				Speed:        speed,
				Status:       status,
				ErrorMsg:     errorMsg,
				HasAudio:     audioPath.Valid && audioPath.String != "",
				SegmentCount: segCnt,
				SegmentsDone: segDone,
				Favorite:     fav,
				Disliked:     dis,
				CreatedAt:    createdAt.Format(time.RFC3339),
			})
		}
		if jobs == nil {
			jobs = []WorkshopJobResp{}
		}
		c.JSON(http.StatusOK, gin.H{"ok": true, "jobs": jobs})
	})

	// GET /api/workshop/audio/:job_id — serve the generated MP3 file
	r.GET("/api/workshop/audio/:job_id", authReq, func(c *gin.Context) {
		userID := getUID(getUserClaims(c))
		jobIDStr := c.Param("job_id")

		var ownerID int64
		var audioPath sql.NullString
		err := db.QueryRowContext(c.Request.Context(), `SELECT user_id, audio_path FROM workshop_jobs WHERE id=$1`, jobIDStr).
			Scan(&ownerID, &audioPath)
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
			return
		}
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "db error"})
			return
		}
		if ownerID != userID {
			c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
			return
		}
		if !audioPath.Valid || audioPath.String == "" {
			c.JSON(http.StatusNotFound, gin.H{"error": "audio not ready"})
			return
		}
		c.Header("Cache-Control", "private, max-age=86400")
		c.File(audioPath.String)
	})

	// PATCH /api/workshop/jobs/:job_id — update favorite / disliked
	r.PATCH("/api/workshop/jobs/:job_id", authReq, func(c *gin.Context) {
		userID := getUID(getUserClaims(c))
		jobIDStr := c.Param("job_id")

		var req patchWorkshopJobReq
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
			return
		}
		var ownerID int64
		switch err := db.QueryRowContext(c.Request.Context(), `SELECT user_id FROM workshop_jobs WHERE id=$1`, jobIDStr).Scan(&ownerID); err {
		case sql.ErrNoRows:
			c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
			return
		case nil:
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": "db error"})
			return
		}
		if ownerID != userID {
			c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
			return
		}
		if req.Favorite != nil {
			_, _ = db.ExecContext(c.Request.Context(), `UPDATE workshop_jobs SET favorite=$1, updated_at=NOW() WHERE id=$2`, *req.Favorite, jobIDStr)
		}
		if req.Disliked != nil {
			_, _ = db.ExecContext(c.Request.Context(), `UPDATE workshop_jobs SET disliked=$1, updated_at=NOW() WHERE id=$2`, *req.Disliked, jobIDStr)
		}
		c.JSON(http.StatusOK, gin.H{"ok": true})
	})

	// DELETE /api/workshop/jobs/:job_id — delete job and its audio file
	r.DELETE("/api/workshop/jobs/:job_id", authReq, func(c *gin.Context) {
		userID := getUID(getUserClaims(c))
		jobIDStr := c.Param("job_id")

		var ownerID int64
		var audioPath sql.NullString
		switch err := db.QueryRowContext(c.Request.Context(), `SELECT user_id, audio_path FROM workshop_jobs WHERE id=$1`, jobIDStr).
			Scan(&ownerID, &audioPath); err {
		case sql.ErrNoRows:
			c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
			return
		case nil:
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": "db error"})
			return
		}
		if ownerID != userID {
			c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
			return
		}
		_, _ = db.ExecContext(c.Request.Context(), `DELETE FROM workshop_jobs WHERE id=$1`, jobIDStr)
		if audioPath.Valid && audioPath.String != "" {
			_ = os.Remove(audioPath.String)
		}
		c.JSON(http.StatusOK, gin.H{"ok": true})
	})
}
