package handler

import (
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jarvis/agent-flow/internal/orchestrator"
	redisclient "github.com/jarvis/agent-flow/internal/redis"
)

type Handler struct {
	db           *pgxpool.Pool
	redis        *redisclient.Client
	enqueue      func(taskID uuid.UUID) error
	orchestrator *orchestrator.Orchestrator
}

func New(db *pgxpool.Pool, redis *redisclient.Client, enqueue func(uuid.UUID) error, orch *orchestrator.Orchestrator) *Handler {
	return &Handler{
		db:           db,
		redis:        redis,
		enqueue:      enqueue,
		orchestrator: orch,
	}
}
