package main

import (
	"database/sql"
	"fmt"
	"net/http"
	"os"
	"sort"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/lib/pq"
)

type ClusterNode struct {
	NodeID       string    `json:"node_id"`
	TailscaleIP  string    `json:"tailscale_ip"`
	FishPortBase int       `json:"fish_port_base"`
	GPUCount     int       `json:"gpu_count"`
	HealthyPorts []int     `json:"healthy_ports"`
	Region       string    `json:"region"`
	Status       string    `json:"status"`
	LastSeenAt   time.Time `json:"last_seen_at"`
}

// FishAPIBases returns the upstream URLs the scheduler should fan out to.
// When the node reports a non-empty healthy_ports list we trust that (the
// heartbeat probes locally), otherwise we fall back to the configured
// fish_port_base + [0,gpu_count) range so brand-new nodes still get traffic
// before the first heartbeat round completes.
func (n ClusterNode) FishAPIBases() []string {
	if n.TailscaleIP == "" {
		return nil
	}
	base := n.FishPortBase
	if base <= 0 {
		base = 8080
	}
	if len(n.HealthyPorts) > 0 {
		ports := append([]int(nil), n.HealthyPorts...)
		sort.Ints(ports)
		out := make([]string, 0, len(ports))
		for _, p := range ports {
			if p <= 0 {
				continue
			}
			out = append(out, fmt.Sprintf("http://%s:%d", n.TailscaleIP, p))
		}
		return out
	}
	if n.GPUCount <= 0 {
		return nil
	}
	out := make([]string, 0, n.GPUCount)
	for i := 0; i < n.GPUCount; i++ {
		out = append(out, fmt.Sprintf("http://%s:%d", n.TailscaleIP, base+i))
	}
	return out
}

func clusterAuthToken() string {
	return strings.TrimSpace(os.Getenv("MEMEC_CLUSTER_TOKEN"))
}

func clusterAuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		expected := clusterAuthToken()
		if expected == "" {
			c.AbortWithStatusJSON(http.StatusServiceUnavailable, gin.H{
				"error": "cluster api disabled",
				"hint":  "set MEMEC_CLUSTER_TOKEN in backend env to enable",
			})
			return
		}
		got := strings.TrimSpace(c.GetHeader("X-Cluster-Token"))
		if got == "" || got != expected {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid cluster token"})
			return
		}
		c.Next()
	}
}

type nodeRegisterReq struct {
	NodeID       string `json:"node_id"`
	TailscaleIP  string `json:"tailscale_ip"`
	FishPortBase int    `json:"fish_port_base"`
	GPUCount     int    `json:"gpu_count"`
	HealthyPorts []int  `json:"healthy_ports"`
	Region       string `json:"region"`
}

func sanitizePorts(in []int) []int {
	seen := make(map[int]bool, len(in))
	out := make([]int, 0, len(in))
	for _, p := range in {
		if p <= 0 || p > 65535 || seen[p] {
			continue
		}
		seen[p] = true
		out = append(out, p)
	}
	sort.Ints(out)
	return out
}

func toInt64Slice(in []int) []int64 {
	out := make([]int64, len(in))
	for i, v := range in {
		out[i] = int64(v)
	}
	return out
}

func fromInt64Slice(in []int64) []int {
	out := make([]int, len(in))
	for i, v := range in {
		out[i] = int(v)
	}
	return out
}

func upsertClusterNode(db *sql.DB, req nodeRegisterReq) error {
	if strings.TrimSpace(req.NodeID) == "" {
		return fmt.Errorf("node_id is required")
	}
	if strings.TrimSpace(req.TailscaleIP) == "" {
		return fmt.Errorf("tailscale_ip is required")
	}
	if req.GPUCount <= 0 {
		return fmt.Errorf("gpu_count must be > 0")
	}
	if req.FishPortBase <= 0 {
		req.FishPortBase = 8080
	}
	ports := sanitizePorts(req.HealthyPorts)
	_, err := db.Exec(`
INSERT INTO cluster_nodes (node_id, tailscale_ip, fish_port_base, gpu_count, healthy_ports, region, status, last_seen_at, updated_at)
VALUES ($1, $2, $3, $4, $5, $6, 'active', NOW(), NOW())
ON CONFLICT (node_id) DO UPDATE SET
  tailscale_ip   = EXCLUDED.tailscale_ip,
  fish_port_base = EXCLUDED.fish_port_base,
  gpu_count      = EXCLUDED.gpu_count,
  healthy_ports  = EXCLUDED.healthy_ports,
  region         = EXCLUDED.region,
  status         = 'active',
  last_seen_at   = NOW(),
  updated_at     = NOW()
`, req.NodeID, req.TailscaleIP, req.FishPortBase, req.GPUCount, pq.Array(toInt64Slice(ports)), req.Region)
	return err
}

func touchClusterNode(db *sql.DB, nodeID string, healthyPorts []int, hasHealthy bool) (int64, error) {
	if strings.TrimSpace(nodeID) == "" {
		return 0, fmt.Errorf("node_id is required")
	}
	if hasHealthy {
		ports := sanitizePorts(healthyPorts)
		res, err := db.Exec(`
UPDATE cluster_nodes
   SET last_seen_at  = NOW(),
       status        = 'active',
       healthy_ports = $2,
       updated_at    = NOW()
 WHERE node_id = $1
`, nodeID, pq.Array(toInt64Slice(ports)))
		if err != nil {
			return 0, err
		}
		return res.RowsAffected()
	}
	res, err := db.Exec(`
UPDATE cluster_nodes SET last_seen_at = NOW(), status = 'active', updated_at = NOW()
WHERE node_id = $1
`, nodeID)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

func markClusterNodeDead(db *sql.DB, nodeID string) error {
	if strings.TrimSpace(nodeID) == "" {
		return fmt.Errorf("node_id is required")
	}
	_, err := db.Exec(
		`UPDATE cluster_nodes SET status='dead', healthy_ports='{}', updated_at=NOW() WHERE node_id=$1`,
		nodeID,
	)
	return err
}

func listClusterNodes(db *sql.DB, activeOnly bool, staleAfter time.Duration) ([]ClusterNode, error) {
	query := `SELECT node_id, tailscale_ip, fish_port_base, gpu_count, COALESCE(healthy_ports, '{}'), region, status, last_seen_at FROM cluster_nodes`
	args := []any{}
	if activeOnly {
		query += ` WHERE status = 'active' AND last_seen_at > NOW() - $1::interval`
		args = append(args, fmt.Sprintf("%d seconds", int(staleAfter.Seconds())))
	}
	query += ` ORDER BY region, node_id`
	rows, err := db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []ClusterNode
	for rows.Next() {
		var n ClusterNode
		var ports pq.Int64Array
		if err := rows.Scan(&n.NodeID, &n.TailscaleIP, &n.FishPortBase, &n.GPUCount, &ports, &n.Region, &n.Status, &n.LastSeenAt); err != nil {
			return nil, err
		}
		n.HealthyPorts = fromInt64Slice([]int64(ports))
		out = append(out, n)
	}
	return out, rows.Err()
}

func registerClusterRoutes(r *gin.Engine, db *sql.DB) {
	grp := r.Group("/api/internal/nodes")
	grp.Use(clusterAuthMiddleware())

	grp.POST("/register", func(c *gin.Context) {
		var req nodeRegisterReq
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request", "detail": err.Error()})
			return
		}
		if err := upsertClusterNode(db, req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"status": "ok", "node_id": req.NodeID})
	})

	grp.POST("/heartbeat", func(c *gin.Context) {
		var req struct {
			NodeID       string `json:"node_id"`
			HealthyPorts *[]int `json:"healthy_ports,omitempty"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request", "detail": err.Error()})
			return
		}
		var ports []int
		hasHealthy := req.HealthyPorts != nil
		if hasHealthy {
			ports = *req.HealthyPorts
		}
		affected, err := touchClusterNode(db, req.NodeID, ports, hasHealthy)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		if affected == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "node not registered", "hint": "call /register first"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	grp.POST("/deregister", func(c *gin.Context) {
		var req struct {
			NodeID string `json:"node_id"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request", "detail": err.Error()})
			return
		}
		if err := markClusterNodeDead(db, req.NodeID); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	grp.GET("", func(c *gin.Context) {
		activeOnly := c.DefaultQuery("active", "1") == "1"
		nodes, err := listClusterNodes(db, activeOnly, 60*time.Second)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"items": nodes})
	})
}
