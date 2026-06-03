pub mod api;
pub mod app_state;
pub mod config;
pub mod domain;
pub mod queue;
pub mod runner;

use std::sync::Arc;

use api::router;
use app_state::AppState;
use axum::Router;
use config::Config;
use queue::TaskQueue;

pub fn build_app(state: Arc<AppState>) -> Router {
    router(state)
}

pub fn build_state() -> Arc<AppState> {
    Arc::new(AppState::new(Config::from_env()))
}

pub async fn build_state_with_workers() -> Arc<AppState> {
    let config = Config::from_env();
    let mut state = AppState::new(config.clone());
    let redis_url = std::env::var("REDIS_URL").unwrap_or_else(|_| "redis://localhost".to_string());

    match TaskQueue::new(&redis_url).await {
        Ok(queue) => {
            state = state.with_queue(queue.clone());
            let state = Arc::new(state);
            for i in 0..config.task_concurrency {
                let _ = queue::TaskWorker::spawn(Arc::new(queue.clone()), state.clone(), i);
            }
            tracing::info!(
                "Spawned {} task workers",
                config.task_concurrency
            );
            state
        }
        Err(e) => {
            tracing::error!("Failed to initialize Redis queue: {:?}, falling back to no queue", e);
            Arc::new(state)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::{CreateTaskRequest, TaskStatus};

    #[tokio::test]
    async fn create_cancel_and_retry_task_updates_status() {
        let state = AppState::new(Config::from_env());

        let task = state
            .create_task(
                "project-1",
                CreateTaskRequest {
                    prompt: "Implement the feature".to_string(),
                    max_retries: 3,
                },
            )
            .await
            .expect("task should be created");

        assert_eq!(task.status, TaskStatus::Pending);
        assert_eq!(task.current_retry, 0);

        let cancelled = state.cancel_task(&task.id).await.expect("task exists");
        assert_eq!(cancelled.status, TaskStatus::Cancelled);
        assert!(cancelled.completed_at.is_some());

        let retried = state.retry_task(&task.id).await.expect("task exists");
        assert_eq!(retried.status, TaskStatus::Pending);
        assert_eq!(retried.current_retry, 1);
        assert!(retried.completed_at.is_none());
    }

    #[tokio::test]
    async fn list_tasks_scopes_to_project() {
        let state = AppState::new(Config::from_env());

        state
            .create_task(
                "project-1",
                CreateTaskRequest {
                    prompt: "First".to_string(),
                    max_retries: 2,
                },
            )
            .await
            .expect("task should be created");

        let tasks = state.list_tasks("project-1").await;
        assert_eq!(tasks.len(), 1);

        let missing = state.list_tasks("missing").await;
        assert!(missing.is_empty());
    }
}
