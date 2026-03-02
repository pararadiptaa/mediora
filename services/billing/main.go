package main

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"math/rand"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	_ "github.com/lib/pq"
)

var (
	port              = getEnv("PORT", "3002")
	serviceName       = getEnv("SERVICE_NAME", "billing-api")
	medioraProblems   = parseProblems(getEnv("MEDIORA_PROBLEMS", ""))
	chaosDelaySeconds = getEnvAsInt("CHAOS_DELAY_SECONDS", 0)
	startupTime       = time.Now()
	validationAPIURL  = getEnv("VALIDATION_API_URL", "http://validation-api:3003")
	
	// Database configuration
	dbHost     = getEnv("DB_HOST", "postgres")
	dbPort     = getEnv("DB_PORT", "5432")
	dbUser     = getEnv("DB_USER", "mediora")
	dbPassword = getEnv("DB_PASSWORD", "mediora_pass")
	dbName     = getEnv("DB_NAME", "mediora_db")
	db         *sql.DB
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

// callValidationAPI makes a synchronous HTTP call to the validation service
// and forwards the W3C trace context headers
func callValidationAPI(cardNumber, traceparent, tracestate string) (bool, error) {
	url := fmt.Sprintf("%s/api/validate-card", validationAPIURL)
	
	payload := map[string]string{
		"cardNumber": cardNumber,
	}
	payloadBytes, _ := json.Marshal(payload)

	req, err := http.NewRequest("POST", url, bytes.NewBuffer(payloadBytes))
	if err != nil {
		logMessage("error", "Failed to create validation request", map[string]interface{}{"error": err.Error()})
		return false, err
	}

	// Set Content-Type
	req.Header.Set("Content-Type", "application/json")

	// Forward W3C Trace Context headers
	if traceparent != "" {
		req.Header.Set("traceparent", traceparent)
		logMessage("info", "Forwarding traceparent to validation-api", map[string]interface{}{"traceparent": traceparent})
	}
	if tracestate != "" {
		req.Header.Set("tracestate", tracestate)
		logMessage("info", "Forwarding tracestate to validation-api", map[string]interface{}{"tracestate": tracestate})
	}

	client := &http.Client{
		Timeout: 5 * time.Second,
	}

	resp, err := client.Do(req)
	if err != nil {
		logMessage("error", "Validation API call failed", map[string]interface{}{"error": err.Error(), "url": url})
		return false, err
	}
	defer resp.Body.Close()

	// Parse response
	body, _ := io.ReadAll(resp.Body)
	var result map[string]interface{}
	json.Unmarshal(body, &result)

	if resp.StatusCode == http.StatusOK {
		isValid, ok := result["valid"].(bool)
		if ok && isValid {
			logMessage("info", "Card validated by validation-api", map[string]interface{}{"statusCode": resp.StatusCode})
			return true, nil
		}
	}

	logMessage("warn", "Card validation failed", map[string]interface{}{"statusCode": resp.StatusCode})
	return false, fmt.Errorf("validation service returned status %d", resp.StatusCode)
}

// initDatabase initializes the PostgreSQL connection pool
func initDatabase() error {
	connStr := fmt.Sprintf(
		"host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
		dbHost, dbPort, dbUser, dbPassword, dbName,
	)

	var err error
	db, err = sql.Open("postgres", connStr)
	if err != nil {
		return err
	}

	// Configure connection pool
	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(5 * time.Minute)

	// Test the connection
	err = db.Ping()
	if err != nil {
		return err
	}

	logMessage("info", "Database connection established", map[string]interface{}{
		"host":     dbHost,
		"database": dbName,
	})

	return nil
}

func main() {
	// Initialize database connection
	if err := initDatabase(); err != nil {
		logMessage("error", "Failed to initialize database", map[string]interface{}{"error": err.Error()})
		os.Exit(1)
	}
	defer db.Close()

	// Initialize Gin
	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.Use(gin.Recovery())
	r.Use(jsonLoggerMiddleware())

	// Health Check with database verification
	r.GET("/health", func(c *gin.Context) {
		err := db.Ping()
		if err != nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{
				"status":   "unhealthy",
				"service":  serviceName,
				"database": "disconnected",
				"error":    err.Error(),
			})
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"status":   "ok",
			"service":  serviceName,
			"database": "connected",
		})
	})

	// Billing Endpoint
	r.POST("/api/billing/pay", func(c *gin.Context) {
		userId := c.GetHeader("X-User-ID")
		if userId == "" {
			userId = "unknown"
		}

		// Parse the request body to extract appointment_id
		var req struct {
			AppointmentID int    `json:"appointment_id"`
			Invoice       string `json:"invoice"`
			Amount        float64 `json:"amount"`
		}

		if err := c.ShouldBindJSON(&req); err != nil {
			logMessage("error", "Invalid request body", map[string]interface{}{
				"userId": userId,
				"error":  err.Error(),
			})
			c.JSON(http.StatusBadRequest, gin.H{
				"success": false,
				"message": "Invalid request body - appointment_id is required",
			})
			return
		}

		appointmentID := req.AppointmentID

		// Extract card number (default for testing)
		cardNumber := c.GetHeader("X-Card-Number")
		if cardNumber == "" {
			cardNumber = "4111111111111111"
		}

		// Extract W3C Trace Context headers
		traceparent := c.GetHeader("traceparent")
		tracestate := c.GetHeader("tracestate")

		logMessage("info", "Payment request initiated", map[string]interface{}{
			"userId":        userId,
			"appointmentID": appointmentID,
			"traceparent":   traceparent,
		})

		// ── DB SELECT: Verify appointment exists ──────────────────
		var appointmentStatus string
		err := db.QueryRow(
			"SELECT status FROM appointments WHERE id = $1",
			appointmentID,
		).Scan(&appointmentStatus)

		if err != nil {
			if err == sql.ErrNoRows {
				logMessage("error", "Appointment not found in database", map[string]interface{}{
					"appointmentID": appointmentID,
					"userId":        userId,
				})
				c.JSON(http.StatusNotFound, gin.H{
					"success": false,
					"service": serviceName,
					"message": "Appointment not found",
				})
				return
			}
			logMessage("error", "Database query failed", map[string]interface{}{
				"appointmentID": appointmentID,
				"error":         err.Error(),
			})
			c.JSON(http.StatusInternalServerError, gin.H{
				"success": false,
				"service": serviceName,
				"message": "Database error",
			})
			return
		}

		logMessage("info", "Appointment verified in database", map[string]interface{}{
			"appointmentID":     appointmentID,
			"appointmentStatus": appointmentStatus,
		})

		// ── Call Validation API ──────────────────────────────────
		isValid, err := callValidationAPI(cardNumber, traceparent, tracestate)
		if err != nil || !isValid {
			logMessage("error", "Validation API call failed, rejecting payment", map[string]interface{}{
				"appointmentID": appointmentID,
				"userId":        userId,
				"error":         err,
			})
			c.JSON(http.StatusPaymentRequired, gin.H{
				"success": false,
				"service": serviceName,
				"message": "Card validation failed. Payment rejected.",
			})
			return
		}

		// ── Chaos Engine: Billing500 ────────────────────────────
		if isChaosActive("Billing500") {
			logMessage("warn", "CHAOS Billing500 evaluated", map[string]interface{}{
				"userId":        userId,
				"appointmentID": appointmentID,
			})
			// 40% chance to fail
			if rand.Float32() < 0.40 {
				logMessage("error", "CHAOS Billing500 injected 500 error", map[string]interface{}{
					"userId":        userId,
					"appointmentID": appointmentID,
				})
				c.JSON(http.StatusInternalServerError, gin.H{
					"success": false,
					"service": serviceName,
					"message": "Payment system unavailable (Chaos Injected).",
				})
				return
			}
		}

		// ── DB UPDATE: Mark appointment as paid ──────────────────
		_, err = db.Exec(
			"UPDATE appointments SET status = 'paid' WHERE id = $1",
			appointmentID,
		)

		if err != nil {
			logMessage("error", "Failed to update appointment status", map[string]interface{}{
				"appointmentID": appointmentID,
				"error":         err.Error(),
			})
			c.JSON(http.StatusInternalServerError, gin.H{
				"success": false,
				"service": serviceName,
				"message": "Payment processed but failed to update appointment status",
			})
			return
		}

		logMessage("info", "Payment processed successfully and appointment updated", map[string]interface{}{
			"appointmentID": appointmentID,
			"userId":        userId,
			"amount":        req.Amount,
		})

		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"service": serviceName,
			"message": "Payment processed successfully.",
			"amount":  req.Amount,
			"appointmentID": appointmentID,
			"status": "paid",
		})
	})

	// Start Server
	logMessage("info", fmt.Sprintf("%s listening on port %s", serviceName, port), nil)
	logMessage("info", fmt.Sprintf("Database: %s on %s:%s", dbName, dbHost, dbPort), nil)
	if len(medioraProblems) > 0 {
		logMessage("info", fmt.Sprintf("Chaos problems configured: %v - activation delay: %ds", medioraProblems, chaosDelaySeconds), nil)
	}

	if err := r.Run(fmt.Sprintf("0.0.0.0:%s", port)); err != nil {
		logMessage("error", "Server failed to start", map[string]interface{}{"error": err.Error()})
		os.Exit(1)
	}
}
