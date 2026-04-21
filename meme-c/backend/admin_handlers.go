package main

import (
	"database/sql"
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

// 硬编码的后台管理员账号（按需求写在代码里，不走 env）。
const (
	adminConsoleUsername = "admin"
	adminConsolePassword = "memec-admin-2026"
)

// adminAuth 允许 3 种身份：
//  1. 旧版 X-Admin-Token（兼容）
//  2. Query 参数 token（兼容）
//  3. Bearer JWT（/api/admin/login 下发、含 admin=true）
func adminAuthOK(c *gin.Context) bool {
	if t := strings.TrimSpace(c.GetHeader("X-Admin-Token")); t != "" && adminCheckToken(t) {
		return true
	}
	if t := strings.TrimSpace(c.Query("token")); t != "" && adminCheckToken(t) {
		return true
	}
	secret := strings.TrimSpace(envOrDefault("MEMEC_JWT_SECRET", ""))
	if secret == "" {
		return false
	}
	auth := strings.TrimSpace(c.GetHeader("Authorization"))
	if !strings.HasPrefix(auth, "Bearer ") {
		return false
	}
	raw := strings.TrimSpace(strings.TrimPrefix(auth, "Bearer "))
	if raw == "" {
		return false
	}
	tok, err := jwt.Parse(raw, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method")
		}
		return []byte(secret), nil
	})
	if err != nil || !tok.Valid {
		return false
	}
	claims, ok := tok.Claims.(jwt.MapClaims)
	if !ok {
		return false
	}
	isAdmin, _ := claims["admin"].(bool)
	return isAdmin
}

func issueAdminJWT(username string) (string, error) {
	secret := strings.TrimSpace(envOrDefault("MEMEC_JWT_SECRET", ""))
	if secret == "" {
		return "", fmt.Errorf("jwt secret not configured")
	}
	now := time.Now()
	claims := jwt.MapClaims{
		"sub":   "admin:" + username,
		"admin": true,
		"user":  username,
		"iat":   now.Unix(),
		"exp":   now.Add(12 * time.Hour).Unix(),
	}
	t := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return t.SignedString([]byte(secret))
}

// ─── GPU dashboard types ─────────────────────────────────────────────────────

type GPUCard struct {
	Upstream      string         `json:"upstream"`
	NodeID        string         `json:"node_id"`
	TailscaleIP   string         `json:"tailscale_ip"`
	GPUIndex      int            `json:"gpu_index"`
	Region        string         `json:"region"`
	NodeStatus    string         `json:"node_status"` // active | stale | dead | static
	LastSeenAt    time.Time      `json:"last_seen_at"`
	IsStatic      bool           `json:"is_static"`
	QueueLen      int            `json:"queue_len"`
	QueueCap      int            `json:"queue_cap"`
	Healthy       bool           `json:"healthy"`
	LastCheckAt   time.Time      `json:"last_check_at,omitempty"`
	LastError     string         `json:"last_error,omitempty"`
	Busy          bool           `json:"busy"`
	Concurrency   int            `json:"concurrency"`
	InFlightCount int            `json:"in_flight_count"`
	InFlight      *InFlightInfo  `json:"in_flight,omitempty"`
	InFlights     []InFlightInfo `json:"in_flights,omitempty"`
	FailStreak    int            `json:"fail_streak"`
	LastSuccessAt time.Time      `json:"last_success_at,omitempty"`
}

type NodeSummary struct {
	NodeID       string    `json:"node_id"`
	TailscaleIP  string    `json:"tailscale_ip"`
	Region       string    `json:"region"`
	Status       string    `json:"status"`
	GPUTotal     int       `json:"gpu_total"`
	GPUHealthy   int       `json:"gpu_healthy"`
	GPUBusy      int       `json:"gpu_busy"`
	GPUUnreach   int       `json:"gpu_unreachable"`
	LastSeenAt   time.Time `json:"last_seen_at"`
}

type GPUDashboard struct {
	UpdatedAt     string        `json:"updated_at"`
	TotalGPUs     int           `json:"total_gpus"`
	HealthyGPUs   int           `json:"healthy_gpus"`
	ActiveGPUs    int           `json:"active_gpus"`
	BusyGPUs      int           `json:"busy_gpus"`
	UnreachableGPUs int         `json:"unreachable_gpus"`
	Nodes         []NodeSummary `json:"nodes"`
	GPUs          []GPUCard     `json:"gpus"`
}

func buildGPUDashboard(db *sql.DB, pool *UpstreamPool) GPUDashboard {
	// 拉取全部节点（含 dead / stale），用以标注 GPU 卡片。
	allNodes, _ := listClusterNodes(db, false, 365*24*time.Hour)
	type meta struct {
		node ClusterNode
		gpu  int
	}
	urlMeta := make(map[string]meta, len(allNodes)*4)
	for _, n := range allNodes {
		base := n.FishPortBase
		if base <= 0 {
			base = 8080
		}
		// Enumerate every port the node could be serving (healthy + configured
		// range) so the dashboard keeps a stable GPU index even when a card
		// drops out of the healthy list.
		ports := make(map[int]bool, n.GPUCount+len(n.HealthyPorts))
		for i := 0; i < n.GPUCount; i++ {
			ports[base+i] = true
		}
		for _, p := range n.HealthyPorts {
			if p > 0 {
				ports[p] = true
			}
		}
		for p := range ports {
			url := fmt.Sprintf("http://%s:%d", n.TailscaleIP, p)
			urlMeta[url] = meta{node: n, gpu: p - base}
		}
	}

	stats := pool.Stats()
	gpus := make([]GPUCard, 0, len(stats))
	nodeAgg := make(map[string]*NodeSummary, len(allNodes)+1)

	staleAfter := 60 * time.Second
	activeCount := 0
	healthyCount := 0
	busyCount := 0
	unreachCount := 0

	for _, s := range stats {
		card := GPUCard{
			Upstream:      s.API,
			QueueLen:      s.QueueLen,
			QueueCap:      s.QueueCap,
			IsStatic:      s.IsStatic,
			Healthy:       s.Healthy,
			LastCheckAt:   s.LastCheckAt,
			LastError:     s.LastError,
			Concurrency:   s.Concurrency,
			InFlightCount: s.InFlightCount,
			InFlight:      s.InFlight,
			InFlights:     s.InFlights,
			FailStreak:    s.FailStreak,
			LastSuccessAt: s.LastSuccessAt,
			Busy:          s.InFlightCount > 0,
		}
		if m, ok := urlMeta[s.API]; ok {
			card.NodeID = m.node.NodeID
			card.TailscaleIP = m.node.TailscaleIP
			card.GPUIndex = m.gpu
			card.Region = m.node.Region
			card.LastSeenAt = m.node.LastSeenAt
			status := m.node.Status
			if status == "active" && time.Since(m.node.LastSeenAt) > staleAfter {
				status = "stale"
			}
			card.NodeStatus = status
		} else {
			card.NodeID = "local"
			card.NodeStatus = "static"
			card.LastSeenAt = time.Now()
		}

		nodeOK := card.NodeStatus == "active" || card.NodeStatus == "static"
		probed := !card.LastCheckAt.IsZero()
		active := nodeOK && (!probed || card.Healthy)
		unreachable := probed && !card.Healthy

		if card.Healthy {
			healthyCount++
		}
		if active {
			activeCount++
		}
		if unreachable {
			unreachCount++
		}
		if card.Busy {
			busyCount++
		}

		key := card.NodeID
		sum, ok := nodeAgg[key]
		if !ok {
			sum = &NodeSummary{
				NodeID:      card.NodeID,
				TailscaleIP: card.TailscaleIP,
				Region:      card.Region,
				Status:      card.NodeStatus,
				LastSeenAt:  card.LastSeenAt,
			}
			nodeAgg[key] = sum
		}
		sum.GPUTotal++
		if card.Healthy {
			sum.GPUHealthy++
		}
		if card.Busy {
			sum.GPUBusy++
		}
		if unreachable {
			sum.GPUUnreach++
		}
		gpus = append(gpus, card)
	}

	sort.Slice(gpus, func(i, j int) bool {
		if gpus[i].NodeID != gpus[j].NodeID {
			return gpus[i].NodeID < gpus[j].NodeID
		}
		if gpus[i].GPUIndex != gpus[j].GPUIndex {
			return gpus[i].GPUIndex < gpus[j].GPUIndex
		}
		return gpus[i].Upstream < gpus[j].Upstream
	})

	nodes := make([]NodeSummary, 0, len(nodeAgg))
	for _, v := range nodeAgg {
		nodes = append(nodes, *v)
	}
	sort.Slice(nodes, func(i, j int) bool { return nodes[i].NodeID < nodes[j].NodeID })

	return GPUDashboard{
		UpdatedAt:       time.Now().UTC().Format(time.RFC3339Nano),
		TotalGPUs:       len(gpus),
		HealthyGPUs:     healthyCount,
		ActiveGPUs:      activeCount,
		BusyGPUs:        busyCount,
		UnreachableGPUs: unreachCount,
		Nodes:           nodes,
		GPUs:            gpus,
	}
}

// ─── Routes ──────────────────────────────────────────────────────────────────

func registerAdminRoutes(r *gin.Engine, db *sql.DB, pool *UpstreamPool) {
	r.POST("/api/admin/login", func(c *gin.Context) {
		var req struct {
			Username string `json:"username"`
			Password string `json:"password"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
			return
		}
		if strings.TrimSpace(req.Username) != adminConsoleUsername || req.Password != adminConsolePassword {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "账号或密码错误"})
			return
		}
		tok, err := issueAdminJWT(req.Username)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"ok":    true,
			"token": tok,
			"user":  gin.H{"username": req.Username},
		})
	})

	unauthorized := func(c *gin.Context) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
	}

	r.GET("/api/admin/generations", func(c *gin.Context) {
		if !adminAuthOK(c) {
			unauthorized(c)
			return
		}
		limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
		c.JSON(http.StatusOK, gin.H{"items": listGenerations(limit)})
	})

	r.GET("/api/admin/training", func(c *gin.Context) {
		if !adminAuthOK(c) {
			unauthorized(c)
			return
		}
		p, err := readTrainingProgress()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, p)
	})

	r.GET("/api/admin/gpus", func(c *gin.Context) {
		if !adminAuthOK(c) {
			unauthorized(c)
			return
		}
		c.JSON(http.StatusOK, buildGPUDashboard(db, pool))
	})

	r.GET("/api/admin/nodes", func(c *gin.Context) {
		if !adminAuthOK(c) {
			unauthorized(c)
			return
		}
		activeOnly := c.DefaultQuery("active", "0") == "1"
		nodes, err := listClusterNodes(db, activeOnly, 60*time.Second)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"items": nodes})
	})
}
