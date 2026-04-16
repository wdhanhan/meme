package main

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha1"
	"database/sql"
	"encoding/base64"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

type sendSMSCodeRequest struct {
	Phone string `json:"phone"`
}

type loginBySMSRequest struct {
	Phone string `json:"phone"`
	Code  string `json:"code"`
}

func registerAuthRoutes(r *gin.Engine, db *sql.DB) {
	r.GET("/api/auth/me", authRequiredMiddleware(), func(c *gin.Context) {
		claims, _ := c.Get("auth_claims")
		c.JSON(http.StatusOK, gin.H{"ok": true, "claims": claims})
	})

	r.POST("/api/auth/sms/send", func(c *gin.Context) {
		var req sendSMSCodeRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request", "detail": err.Error()})
			return
		}
		phone := normalizePhone(req.Phone)
		if phone == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "phone is required"})
			return
		}

		code := genSMSCode()
		if override := strings.TrimSpace(envOrDefault("MEMEC_SMS_DEV_FIXED_CODE", "")); override != "" {
			code = override
		}
		if err := sendSMSCodeViaAliyun(phone, code); err != nil {
			c.JSON(http.StatusBadGateway, gin.H{"error": "failed to send sms", "detail": err.Error()})
			return
		}
		expiresAt := time.Now().Add(5 * time.Minute)
		_, err := db.Exec(`
INSERT INTO user_sms_codes (phone, code, expires_at, used)
VALUES ($1, $2, $3, false);
`, phone, code, expiresAt)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to store sms code", "detail": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"ok":         true,
			"phone":      phone,
			"expires_at": expiresAt.Format(time.RFC3339),
		})
	})

	r.POST("/api/auth/sms/login", func(c *gin.Context) {
		var req loginBySMSRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request", "detail": err.Error()})
			return
		}
		phone := normalizePhone(req.Phone)
		code := strings.TrimSpace(req.Code)
		if phone == "" || code == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "phone and code are required"})
			return
		}

		var smsID int64
		err := db.QueryRow(`
SELECT id
FROM user_sms_codes
WHERE phone = $1
  AND code = $2
  AND used = false
  AND expires_at > NOW()
ORDER BY id DESC
LIMIT 1;
`, phone, code).Scan(&smsID)
		if err == sql.ErrNoRows {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid or expired code"})
			return
		}
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to verify sms code", "detail": err.Error()})
			return
		}

		tx, err := db.Begin()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to start transaction", "detail": err.Error()})
			return
		}
		defer tx.Rollback()

		if _, err := tx.Exec(`UPDATE user_sms_codes SET used = true WHERE id = $1;`, smsID); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to consume sms code", "detail": err.Error()})
			return
		}

		var userID int64
		var createdAt time.Time
		var updatedAt time.Time
		if err := tx.QueryRow(`
INSERT INTO users (phone)
VALUES ($1)
ON CONFLICT (phone)
DO UPDATE SET updated_at = NOW()
RETURNING id, created_at, updated_at;
`, phone).Scan(&userID, &createdAt, &updatedAt); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to upsert user", "detail": err.Error()})
			return
		}

		if err := tx.Commit(); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to commit transaction", "detail": err.Error()})
			return
		}

		token, err := issueJWTToken(userID, phone)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to issue jwt", "detail": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"ok":    true,
			"token": token,
			"user": gin.H{
				"id":         userID,
				"phone":      phone,
				"created_at": createdAt.Format(time.RFC3339),
				"updated_at": updatedAt.Format(time.RFC3339),
			},
		})
	})

	r.POST("/api/auth/sms/register", func(c *gin.Context) {
		var req loginBySMSRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request", "detail": err.Error()})
			return
		}
		phone := normalizePhone(req.Phone)
		code := strings.TrimSpace(req.Code)
		if phone == "" || code == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "phone and code are required"})
			return
		}

		var smsID int64
		err := db.QueryRow(`
SELECT id
FROM user_sms_codes
WHERE phone = $1
  AND code = $2
  AND used = false
  AND expires_at > NOW()
ORDER BY id DESC
LIMIT 1;
`, phone, code).Scan(&smsID)
		if err == sql.ErrNoRows {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid or expired code"})
			return
		}
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to verify sms code", "detail": err.Error()})
			return
		}

		tx, err := db.Begin()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to start transaction", "detail": err.Error()})
			return
		}
		defer tx.Rollback()

		var existed int
		if err := tx.QueryRow(`SELECT COUNT(1) FROM users WHERE phone = $1;`, phone).Scan(&existed); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to query user", "detail": err.Error()})
			return
		}
		if existed > 0 {
			c.JSON(http.StatusConflict, gin.H{"error": "user already exists"})
			return
		}

		if _, err := tx.Exec(`UPDATE user_sms_codes SET used = true WHERE id = $1;`, smsID); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to consume sms code", "detail": err.Error()})
			return
		}

		var userID int64
		var createdAt time.Time
		var updatedAt time.Time
		if err := tx.QueryRow(`
INSERT INTO users (phone)
VALUES ($1)
RETURNING id, created_at, updated_at;
`, phone).Scan(&userID, &createdAt, &updatedAt); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create user", "detail": err.Error()})
			return
		}

		if err := tx.Commit(); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to commit transaction", "detail": err.Error()})
			return
		}

		token, err := issueJWTToken(userID, phone)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to issue jwt", "detail": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"ok":    true,
			"token": token,
			"user": gin.H{
				"id":         userID,
				"phone":      phone,
				"created_at": createdAt.Format(time.RFC3339),
				"updated_at": updatedAt.Format(time.RFC3339),
			},
		})
	})
}

func normalizePhone(v string) string {
	v = strings.TrimSpace(v)
	v = strings.ReplaceAll(v, " ", "")
	return v
}

func genSMSCode() string {
	b := make([]byte, 3)
	if _, err := rand.Read(b); err != nil {
		return "123456"
	}
	n := int(b[0])<<16 | int(b[1])<<8 | int(b[2])
	return fmt.Sprintf("%06d", n%1000000)
}

func issueJWTToken(userID int64, phone string) (string, error) {
	secret := strings.TrimSpace(envOrDefault("MEMEC_JWT_SECRET", ""))
	if secret == "" {
		return "", fmt.Errorf("jwt secret not configured")
	}
	expHours := envIntOrDefault("MEMEC_JWT_EXPIRE_HOURS", 336)
	if expHours <= 0 {
		expHours = 336
	}
	now := time.Now()
	claims := jwt.MapClaims{
		"sub":   fmt.Sprintf("%d", userID),
		"uid":   userID,
		"phone": phone,
		"iat":   now.Unix(),
		"exp":   now.Add(time.Duration(expHours) * time.Hour).Unix(),
	}
	t := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return t.SignedString([]byte(secret))
}

func sendSMSCodeViaAliyun(phone, code string) error {
	accessKeyID := strings.TrimSpace(envOrDefault("ALIYUN_SMS_ACCESS_KEY_ID", ""))
	accessKeySecret := strings.TrimSpace(envOrDefault("ALIYUN_SMS_ACCESS_KEY_SECRET", ""))
	signName := strings.TrimSpace(envOrDefault("ALIYUN_SMS_SIGN_NAME", ""))
	templateCode := strings.TrimSpace(envOrDefault("ALIYUN_SMS_TEMPLATE_CODE", ""))
	regionID := strings.TrimSpace(envOrDefault("ALIYUN_SMS_REGION_ID", "cn-hangzhou"))
	if accessKeyID == "" || accessKeySecret == "" || signName == "" || templateCode == "" {
		return fmt.Errorf("aliyun sms not configured")
	}

	params := map[string]string{
		"Action":           "SendSms",
		"Version":          "2017-05-25",
		"RegionId":         regionID,
		"PhoneNumbers":     phone,
		"SignName":         signName,
		"TemplateCode":     templateCode,
		"TemplateParam":    fmt.Sprintf("{\"code\":\"%s\"}", code),
		"Format":           "JSON",
		"AccessKeyId":      accessKeyID,
		"SignatureMethod":  "HMAC-SHA1",
		"SignatureVersion": "1.0",
		"SignatureNonce":   fmt.Sprintf("%d", time.Now().UnixNano()),
		"Timestamp":        time.Now().UTC().Format("2006-01-02T15:04:05Z"),
	}
	signature := signAliyunRequest(http.MethodPost, params, accessKeySecret)
	params["Signature"] = signature

	keys := make([]string, 0, len(params))
	for k := range params {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	bodyParts := make([]string, 0, len(keys))
	for _, k := range keys {
		bodyParts = append(bodyParts, percentEncode(k)+"="+percentEncode(params[k]))
	}
	postBody := strings.Join(bodyParts, "&")

	req, err := http.NewRequest(http.MethodPost, "https://dysmsapi.aliyuncs.com", strings.NewReader(postBody))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	timeoutSec := envIntOrDefault("MEMEC_SMS_HTTP_TIMEOUT_SEC", 8)
	if timeoutSec < 1 {
		timeoutSec = 8
	}
	client := &http.Client{Timeout: time.Duration(timeoutSec) * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
	if resp.StatusCode/100 != 2 {
		return fmt.Errorf("aliyun sms http %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}
	respStr := string(body)
	if !strings.Contains(respStr, "\"Code\":\"OK\"") {
		return fmt.Errorf("aliyun sms business failed: %s", strings.TrimSpace(respStr))
	}
	return nil
}

func signAliyunRequest(method string, params map[string]string, secret string) string {
	keys := make([]string, 0, len(params))
	for k := range params {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	var canonicalized strings.Builder
	for i, k := range keys {
		if i > 0 {
			canonicalized.WriteByte('&')
		}
		canonicalized.WriteString(percentEncode(k))
		canonicalized.WriteByte('=')
		canonicalized.WriteString(percentEncode(params[k]))
	}
	stringToSign := method + "&" + percentEncode("/") + "&" + percentEncode(canonicalized.String())
	mac := hmac.New(sha1.New, []byte(secret+"&"))
	_, _ = mac.Write([]byte(stringToSign))
	return base64.StdEncoding.EncodeToString(mac.Sum(nil))
}

func percentEncode(s string) string {
	encoded := url.QueryEscape(s)
	encoded = strings.ReplaceAll(encoded, "+", "%20")
	encoded = strings.ReplaceAll(encoded, "*", "%2A")
	encoded = strings.ReplaceAll(encoded, "%7E", "~")
	return encoded
}
