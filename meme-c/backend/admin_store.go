package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

// GenerationRecord 一次多段语音合成的指标（管理后台展示）。
type GenerationRecord struct {
	ID                 string   `json:"id"`
	CreatedAt          string   `json:"created_at"` // RFC3339
	Kind               string   `json:"kind"`       // multi_segment
	ReferenceID        string   `json:"reference_id,omitempty"`
	Mode               string   `json:"mode"`
	Speed              float64  `json:"speed"`
	TextPreview        string   `json:"text_preview"`
	FinalInputText     string   `json:"final_input_text,omitempty"` // 送进 GPU 前的最终文本（含标签）
	SegmentCount       int      `json:"segment_count"`
	FirstMetaMs        int64    `json:"first_meta_ms"`         // 首行 meta 写出耗时
	FirstAudioMs       int64    `json:"first_audio_ms"`        // 首段可播 MP3 chunk 写出耗时
	OptimizeMs         int64    `json:"optimize_ms"`           // 分段与气口准备耗时（本地）
	DeepSeekMs         int64    `json:"deepseek_segment_ms"`   // 同上细分；字段名保留兼容前端
	TtsPerSegmentMs    []int64  `json:"tts_per_segment_ms"`    // 各片 Fish /v1/tts
	EncodePerSegmentMs []int64  `json:"encode_per_segment_ms"` // 各片 ffmpeg（变速+wav→mp3）
	TotalMs            int64    `json:"total_ms"`
	Success            bool     `json:"success"`
	Error              string   `json:"error,omitempty"`
}

// TrainingProgress 外部训练脚本写入 JSON 文件，管理后台轮询展示。
type TrainingProgress struct {
	State       string  `json:"state"` // idle | running | completed | failed
	Message     string  `json:"message,omitempty"`
	Epoch       int     `json:"epoch,omitempty"`
	TotalEpochs int     `json:"total_epochs,omitempty"`
	Step        int     `json:"step,omitempty"`
	TotalSteps  int     `json:"total_steps,omitempty"`
	Percent     float64 `json:"percent,omitempty"`
	UpdatedAt   string  `json:"updated_at,omitempty"`
}

const maxGenRecordsMemory = 300

var (
	genMu          sync.Mutex
	genRecords     []GenerationRecord // 新记录在尾部
	genLogPath     string
	trainingPath   string
	dataDirOnce    sync.Once
)

func adminDataDir() string {
	return envOrDefault("MEMEC_DATA_DIR", "/root/data/root/meme-c/data")
}

func initAdminPaths() {
	dataDirOnce.Do(func() {
		_ = os.MkdirAll(adminDataDir(), 0755)
		genLogPath = envOrDefault("MEMEC_ADMIN_GEN_LOG", filepath.Join(adminDataDir(), "generations.jsonl"))
		trainingPath = envOrDefault("MEMEC_TRAINING_PROGRESS_FILE", filepath.Join(adminDataDir(), "training_progress.json"))
	})
}

func loadGenerationsFromDisk() {
	initAdminPaths()
	f, err := os.Open(genLogPath)
	if err != nil {
		return
	}
	defer f.Close()
	var lines []string
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line != "" {
			lines = append(lines, line)
		}
	}
	if len(lines) > maxGenRecordsMemory {
		lines = lines[len(lines)-maxGenRecordsMemory:]
	}
	genMu.Lock()
	defer genMu.Unlock()
	genRecords = genRecords[:0]
	for _, line := range lines {
		var r GenerationRecord
		if json.Unmarshal([]byte(line), &r) == nil && r.ID != "" {
			genRecords = append(genRecords, r)
		}
	}
}

func appendGeneration(rec GenerationRecord) {
	initAdminPaths()
	genMu.Lock()
	genRecords = append(genRecords, rec)
	if len(genRecords) > maxGenRecordsMemory {
		genRecords = genRecords[len(genRecords)-maxGenRecordsMemory:]
	}
	genMu.Unlock()

	line, err := json.Marshal(rec)
	if err != nil {
		return
	}
	f, err := os.OpenFile(genLogPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return
	}
	_, _ = f.Write(append(line, '\n'))
	_ = f.Close()
}

func listGenerations(limit int) []GenerationRecord {
	if limit <= 0 {
		limit = 50
	}
	if limit > maxGenRecordsMemory {
		limit = maxGenRecordsMemory
	}
	genMu.Lock()
	defer genMu.Unlock()
	n := len(genRecords)
	if n == 0 {
		return []GenerationRecord{}
	}
	start := n - limit
	if start < 0 {
		start = 0
	}
	out := make([]GenerationRecord, n-start)
	copy(out, genRecords[start:])
	// 新到旧
	for i, j := 0, len(out)-1; i < j; i, j = i+1, j-1 {
		out[i], out[j] = out[j], out[i]
	}
	return out
}

func readTrainingProgress() (TrainingProgress, error) {
	initAdminPaths()
	data, err := os.ReadFile(trainingPath)
	if err != nil {
		if os.IsNotExist(err) {
			return TrainingProgress{State: "idle", Message: "未找到训练进度文件（可写入 " + trainingPath + "）"}, nil
		}
		return TrainingProgress{}, err
	}
	var p TrainingProgress
	if err := json.Unmarshal(data, &p); err != nil {
		return TrainingProgress{State: "failed", Message: "进度文件 JSON 无效: " + err.Error()}, nil
	}
	if strings.TrimSpace(p.State) == "" {
		p.State = "unknown"
	}
	return p, nil
}

func adminCheckToken(cToken string) bool {
	want := strings.TrimSpace(os.Getenv("MEMEC_ADMIN_TOKEN"))
	if want == "" {
		return true
	}
	got := strings.TrimSpace(cToken)
	return got != "" && got == want
}

func previewText(s string, maxRunes int) string {
	s = strings.TrimSpace(s)
	if maxRunes <= 0 {
		maxRunes = 120
	}
	r := []rune(s)
	if len(r) <= maxRunes {
		return s
	}
	return string(r[:maxRunes]) + "…"
}

func newGenerationID() string {
	return fmt.Sprintf("%d", time.Now().UnixNano())
}
