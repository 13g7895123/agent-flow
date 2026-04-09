package handler

import (
	"bufio"
	"fmt"

	"github.com/gofiber/fiber/v2"
)

func (h *Handler) StreamTask(c *fiber.Ctx) error {
	taskID := c.Params("id")

	c.Set("Content-Type", "text/event-stream")
	c.Set("Cache-Control", "no-cache")
	c.Set("Connection", "keep-alive")
	c.Set("X-Accel-Buffering", "no")

	// 先取任務當前狀態
	var status string
	var currentRetry int16
	h.db.QueryRow(c.Context(), "SELECT status, current_retry FROM tasks WHERE id=$1::uuid", taskID).
		Scan(&status, &currentRetry)

	pubsub := h.redis.Subscribe(c.Context(), "task:"+taskID)

	c.Context().SetBodyStreamWriter(func(w *bufio.Writer) {
		defer pubsub.Close()

		// 先推送當前狀態
		initialMsg := fmt.Sprintf("event: status\ndata: {\"taskId\":%q,\"status\":%q,\"currentRetry\":%d}\n\n",
			taskID, status, currentRetry)
		w.WriteString(initialMsg)
		w.Flush()

		// 若任務已完成，直接推送 done 事件後關閉
		if status == "done" || status == "failed" || status == "cancelled" {
			w.WriteString(fmt.Sprintf("event: done\ndata: {\"taskId\":%q,\"status\":%q}\n\n", taskID, status))
			w.Flush()
			return
		}

		ch := pubsub.Channel()
		for {
			select {
			case msg, ok := <-ch:
				if !ok {
					return
				}
				w.WriteString(msg.Payload)
				w.Flush()
			case <-c.Context().Done():
				return
			}
		}
	})

	return nil
}
