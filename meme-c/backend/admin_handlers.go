package main

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

func registerAdminRoutes(r *gin.Engine) {
	r.GET("/api/admin/generations", func(c *gin.Context) {
		token := c.GetHeader("X-Admin-Token")
		if token == "" {
			token = c.Query("token")
		}
		if !adminCheckToken(token) {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized", "hint": "设置环境变量 MEMEC_ADMIN_TOKEN 后，请求头携带 X-Admin-Token"})
			return
		}
		limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
		c.JSON(http.StatusOK, gin.H{"items": listGenerations(limit)})
	})

	r.GET("/api/admin/training", func(c *gin.Context) {
		token := c.GetHeader("X-Admin-Token")
		if token == "" {
			token = c.Query("token")
		}
		if !adminCheckToken(token) {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			return
		}
		p, err := readTrainingProgress()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, p)
	})
}
