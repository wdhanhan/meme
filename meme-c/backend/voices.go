package main

import (
	"bytes"
	"database/sql"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

type UserVoiceResp struct {
	ID          int64  `json:"id"`
	Name        string `json:"name"`
	ReferenceID string `json:"reference_id"`
	Status      string `json:"status"`
	CreatedAt   string `json:"created_at"`
}

func registerVoiceRoutes(r *gin.Engine, db *sql.DB, cfg AppConfig, refs *referenceIndex) {
	authRequired := authRequiredMiddleware()

	// GET /api/voices — 当前用户的音色列表
	r.GET("/api/voices", authRequired, func(c *gin.Context) {
		uid := getUID(getUserClaims(c))
		if uid == 0 {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			return
		}
		rows, err := db.QueryContext(c.Request.Context(),
			`SELECT id, name, reference_id, status, created_at
			   FROM user_voices
			  WHERE user_id = $1
			  ORDER BY created_at DESC`, uid)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		defer rows.Close()
		result := []UserVoiceResp{}
		for rows.Next() {
			var v UserVoiceResp
			var createdAt time.Time
			if err := rows.Scan(&v.ID, &v.Name, &v.ReferenceID, &v.Status, &createdAt); err != nil {
				continue
			}
			v.CreatedAt = createdAt.Format(time.RFC3339)
			result = append(result, v)
		}
		c.JSON(http.StatusOK, gin.H{"voices": result})
	})

	// POST /api/voices — 上传音频，复刻新音色
	r.POST("/api/voices", authRequired, func(c *gin.Context) {
		uid := getUID(getUserClaims(c))
		if uid == 0 {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			return
		}

		name := strings.TrimSpace(c.PostForm("name"))
		if name == "" {
			name = "我的声音"
		}
		referenceText := strings.TrimSpace(c.PostForm("reference_text"))
		if referenceText == "" {
			referenceText = "这是一段声音样本。" // fallback，质量较差
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

		audioBytes, err := io.ReadAll(file)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read audio"})
			return
		}

		// 生成唯一 reference_id，前缀 vc_ 避免与管理员上传的 ID 碰撞
		refID := fmt.Sprintf("vc_%d_%d", uid, time.Now().UnixMilli())

		// 构建 multipart form，向所有 Fish Audio 实例同步上传
		var form bytes.Buffer
		w := multipart.NewWriter(&form)
		_ = w.WriteField("id", refID)
		_ = w.WriteField("text", referenceText)
		part, _ := w.CreateFormFile("audio", fileHeader.Filename)
		_, _ = part.Write(audioBytes)
		_ = w.Close()
		formBytes := form.Bytes()
		ct := w.FormDataContentType()

		uploadClient := &http.Client{Timeout: 120 * time.Second}
		successCount := 0
		var lastErrMsg string
		for _, fishAPI := range cfg.FishAPIs {
			upstreamURL := fmt.Sprintf("%s/v1/references/add?format=json", fishAPI)
			req, reqErr := http.NewRequest(http.MethodPost, upstreamURL, bytes.NewReader(formBytes))
			if reqErr != nil {
				lastErrMsg = reqErr.Error()
				continue
			}
			req.Header.Set("Content-Type", ct)
			resp, doErr := uploadClient.Do(req)
			if doErr != nil {
				lastErrMsg = doErr.Error()
				continue
			}
			resp.Body.Close()
			if resp.StatusCode < 400 {
				successCount++
				refs.addReferenceToAPI(fishAPI, refID)
			} else {
				lastErrMsg = fmt.Sprintf("upstream %s returned %d", fishAPI, resp.StatusCode)
			}
		}

		if successCount == 0 {
			c.JSON(http.StatusBadGateway, gin.H{"error": "voice engine upload failed", "detail": lastErrMsg})
			return
		}

		var voiceID int64
		if err := db.QueryRowContext(c.Request.Context(),
			`INSERT INTO user_voices (user_id, name, reference_id, status)
			 VALUES ($1, $2, $3, 'ready') RETURNING id`,
			uid, name, refID).Scan(&voiceID); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "db insert failed: " + err.Error()})
			return
		}

		c.JSON(http.StatusOK, UserVoiceResp{
			ID:          voiceID,
			Name:        name,
			ReferenceID: refID,
			Status:      "ready",
			CreatedAt:   time.Now().Format(time.RFC3339),
		})
	})

	// DELETE /api/voices/:id — 删除指定音色（仅删 DB 记录）
	r.DELETE("/api/voices/:id", authRequired, func(c *gin.Context) {
		uid := getUID(getUserClaims(c))
		if uid == 0 {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			return
		}
		id, err := strconv.ParseInt(c.Param("id"), 10, 64)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
			return
		}
		res, err := db.ExecContext(c.Request.Context(),
			`DELETE FROM user_voices WHERE id = $1 AND user_id = $2`, id, uid)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		if n, _ := res.RowsAffected(); n == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "voice not found"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"ok": true})
	})
}
