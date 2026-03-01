package main

import (
	"encoding/json"
	"fmt"
	"math/rand"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

var (
	port              = getEnv("PORT", "3002")
	serviceName       = getEnv("SERVICE_NAME", "billing-api")
	medioraProblems   = parseProblems(getEnv("MEDIORA_PROBLEMS", ""))
	chaosDelaySeconds = getEnvAsInt("CHAOS_DELAY_SECONDS", 0)
	startupTime       = time.Now()
)

// Helper to get string env var
func getEnv(key, fallback string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return fallback
}

// Helper to get int env var
func getEnvAsInt(key string, fallback int) int {
	strValue := getEnv(key, "")
	if value, err := strconv.Atoi(strValue); err == nil {
		return value
	}
	return fallback
}

// Parse comma-separated problems into a slice
func parseProblems(problemsStr string) []string {
	if problemsStr == "" {
		return []string{}
	}
	var problems []string
	for _, p := range strings.Split(problemsStr, ",") {
		problems = append(problems, strings.TrimSpace(p))
	}
	return problems
}

// Check if a specific chaos problem is active
func isChaosActive(problemName string) bool {
	isActive := false
	for _, p := range medioraProblems {
		if p == problemName {
			isActive = true
			break
		}
	}
	if !isActive {
		return false
	}
	elapsed := time.Since(startupTime).Seconds()
	return elapsed >= float64(chaosDelaySeconds)
}

// JSON structured logger middleware for Gin
func jsonLoggerMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		c.Next()
		duration := time.Since(start)

		logEntry := map[string]interface{}{
			"timestamp":  time.Now().Format(time.RFC3339),
			"level":      "info",
			"service":    serviceName,
			"message":    "request",
			"method":     c.Request.Method,
			"path":       c.Request.URL.Path,
			"statusCode": c.Writer.Status(),
			"durationMs": duration.Milliseconds(),
		}

		if len(c.Errors) > 0 {
			logEntry["level"] = "error"
			logEntry["errors"] = c.Errors.String()
		}

		logJSON, _ := json.Marshal(logEntry)
		fmt.Println(string(logJSON))
	}
}

// Custom log helper
func logMessage(level, message string, extra map[string]interface{}) {
	entry := map[string]interface{}{
		"timestamp": time.Now().Format(time.RFC3339),
		"level":     level,
		"service":   serviceName,
		"message":   message,
	}
	for k, v := range extra {
		entry[k] = v
	}
	logJSON, _ := json.Marshal(entry)
	fmt.Println(string(logJSON))
}

func main() {
	// Initialize Gin
	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.Use(gin.Recovery())
	r.Use(jsonLoggerMiddleware())

	// Health Check
	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status":  "ok",
			"service": serviceName,
		})
	})

	// Billing Endpoint
	r.POST("/api/billing/pay", func(c *gin.Context) {
		userId := c.GetHeader("X-User-ID")
		if userId == "" {
			userId = "unknown"
		}

		// Chaos Engine: Billing500
		if isChaosActive("Billing500") {
			logMessage("warn", "CHAOS Billing500 evaluated", map[string]interface{}{"userId": userId})
			// 40% chance to fail
			if rand.Float32() < 0.40 {
				logMessage("error", "CHAOS Billing500 injected 500 error", map[string]interface{}{"userId": userId})
				c.JSON(http.StatusInternalServerError, gin.H{
					"success": false,
					"service": serviceName,
					"message": "Payment system unavailable (Chaos Injected).",
				})
				return
			}
		}

		logMessage("info", "Payment processed explicitly", map[string]interface{}{"userId": userId, "amount": 150.0})
		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"service": serviceName,
			"message": "Payment processed successfully.",
			"amount":  150.0,
		})
	})

	// Start Server
	logMessage("info", fmt.Sprintf("%s listening on port %s", serviceName, port), nil)
	if len(medioraProblems) > 0 {
		logMessage("info", fmt.Sprintf("Chaos problems configured: %v - activation delay: %ds", medioraProblems, chaosDelaySeconds), nil)
	}

	if err := r.Run(fmt.Sprintf("0.0.0.0:%s", port)); err != nil {
		logMessage("error", "Server failed to start", map[string]interface{}{"error": err.Error()})
		os.Exit(1)
	}
}
