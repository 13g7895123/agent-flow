package config

import (
	"os"
	"strconv"
	"time"
)

type Config struct {
	Port              string
	DatabaseURL       string
	RedisURL          string
	RunSeed           bool
	ClaudeTimeout     time.Duration
	DefaultMaxRetries int
	TaskConcurrency   int
	AllowOrigins      string
}

func Load() *Config {
	claudeTimeout := 10 * time.Minute
	if v := os.Getenv("CLAUDE_TIMEOUT"); v != "" {
		if d, err := time.ParseDuration(v); err == nil {
			claudeTimeout = d
		}
	}

	maxRetries := 5
	if v := os.Getenv("CLAUDE_DEFAULT_MAX_RETRIES"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			maxRetries = n
		}
	}

	concurrency := 1
	if v := os.Getenv("TASK_CONCURRENCY"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			concurrency = n
		}
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "3001"
	}

	allowOrigins := os.Getenv("ALLOW_ORIGINS")
	if allowOrigins == "" {
		allowOrigins = "http://localhost:3000,http://localhost:5173"
	}

	return &Config{
		Port:              port,
		DatabaseURL:       os.Getenv("DATABASE_URL"),
		RedisURL:          os.Getenv("REDIS_URL"),
		RunSeed:           os.Getenv("RUN_SEED") == "true",
		ClaudeTimeout:     claudeTimeout,
		DefaultMaxRetries: maxRetries,
		TaskConcurrency:   concurrency,
		AllowOrigins:      allowOrigins,
	}
}
