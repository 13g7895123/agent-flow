use anyhow::{anyhow, Result};
use redis::{aio::ConnectionManager, AsyncCommands};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskPayload {
    pub task_id: String,
}

#[derive(Clone)]
pub struct TaskQueue {
    redis: ConnectionManager,
}

impl TaskQueue {
    pub async fn new(redis_url: &str) -> Result<Self> {
        let client = redis::Client::open(redis_url)?;
        let redis = ConnectionManager::new(client).await?;
        Ok(TaskQueue { redis })
    }

    pub async fn enqueue(&self, task_id: String) -> Result<()> {
        let payload = TaskPayload { task_id };
        let json = serde_json::to_string(&payload)?;
        let _: i64 = self.redis.clone().rpush("agent_flow:tasks", &json).await?;
        Ok(())
    }

    pub async fn dequeue(&self) -> Result<Option<TaskPayload>> {
        let json: Option<String> = self.redis.clone().lpop("agent_flow:tasks", None).await?;

        match json {
            Some(j) => {
                let payload = serde_json::from_str(&j)?;
                Ok(Some(payload))
            }
            None => Ok(None),
        }
    }

    pub async fn blpop(&self, timeout_secs: u64) -> Result<Option<TaskPayload>> {
        // BLPOP 回傳 (list_key, value)，逾時則為空。
        let popped: Option<(String, String)> = self
            .redis
            .clone()
            .blpop("agent_flow:tasks", timeout_secs as f64)
            .await?;

        match popped {
            Some((_, j)) => {
                let payload = serde_json::from_str(&j)?;
                Ok(Some(payload))
            }
            None => Ok(None),
        }
    }

    pub async fn queue_len(&self) -> Result<usize> {
        let len: usize = self.redis.clone().llen("agent_flow:tasks").await?;
        Ok(len)
    }
}

pub struct TaskWorker {
    // 保留 queue 參考供 worker 生命週期管理（後續可用於監控/重新入佇列）。
    #[allow(dead_code)]
    queue: Arc<TaskQueue>,
    pub handle: tokio::task::JoinHandle<()>,
}

impl TaskWorker {
    pub fn spawn(queue: Arc<TaskQueue>, app_state: Arc<crate::AppState>, worker_id: usize) -> Self {
        let worker_queue = queue.clone();
        let handle = tokio::spawn(async move {
            loop {
                match worker_queue.blpop(5).await {
                    Ok(Some(payload)) => {
                        tracing::info!("Worker {} processing task {}", worker_id, payload.task_id);
                        if let Err(e) = process_task(&app_state, &payload.task_id).await {
                            tracing::error!(
                                "Worker {} failed to process task {}: {:?}",
                                worker_id,
                                payload.task_id,
                                e
                            );
                        }
                    }
                    Ok(None) => {
                        tracing::debug!("Worker {} waiting for tasks...", worker_id);
                    }
                    Err(e) => {
                        tracing::error!("Worker {} queue error: {:?}", worker_id, e);
                        tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
                    }
                }
            }
        });

        TaskWorker { queue, handle }
    }
}

async fn process_task(state: &crate::AppState, task_id: &str) -> Result<()> {
    if let Some(mut task) = state.get_task(task_id).await {
        task.status = crate::domain::TaskStatus::Running;
        task.updated_at = chrono::Utc::now();
        state.update_task_status(task_id, task.status.clone()).await;

        tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;

        task.status = crate::domain::TaskStatus::Done;
        task.completed_at = Some(chrono::Utc::now());
        task.updated_at = chrono::Utc::now();
        state.update_task_status(task_id, task.status.clone()).await;
        state.set_task_completed(task_id, task.completed_at).await;

        tracing::info!("Task {} completed", task_id);
        Ok(())
    } else {
        Err(anyhow!("Task {} not found", task_id))
    }
}

#[cfg(test)]
mod tests {
    use super::TaskPayload;

    #[test]
    fn encodes_and_decodes_task_payload() {
        let payload = TaskPayload {
            task_id: "task-1".to_string(),
        };

        let encoded = serde_json::to_string(&payload).expect("payload should encode");
        assert_eq!(encoded, r#"{"task_id":"task-1"}"#);

        let decoded: TaskPayload = serde_json::from_str(&encoded).expect("payload should decode");
        assert_eq!(decoded.task_id, "task-1");
    }

    #[test]
    fn rejects_invalid_payload_json() {
        let decoded: serde_json::Result<TaskPayload> = serde_json::from_str(r#"{"task_id":1}"#);
        assert!(decoded.is_err());
    }
}
