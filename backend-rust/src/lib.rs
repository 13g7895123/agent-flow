pub mod api;
pub mod app_state;
pub mod config;
pub mod domain;
pub mod events;
pub mod orchestrator;
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
            tracing::info!("Spawned {} task workers", config.task_concurrency);
            state
        }
        Err(e) => {
            tracing::error!(
                "Failed to initialize Redis queue: {:?}, falling back to no queue",
                e
            );
            Arc::new(state)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::{
        CreatePipelineRequest, CreateProjectRequest, CreateTaskRequest, TaskStatus,
    };

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

    #[tokio::test]
    async fn task_lifecycle_publishes_status_events() {
        use crate::domain::TaskStatus;

        let state = AppState::new(Config::from_env());
        let mut rx = state.task_events().subscribe();

        let task = state
            .create_task(
                "project-1",
                CreateTaskRequest {
                    prompt: "Stream me".to_string(),
                    max_retries: 1,
                },
            )
            .await
            .expect("task should be created");

        // create_task 應廣播 pending status 事件
        let created_event = rx.recv().await.expect("status event for create");
        assert_eq!(created_event.task_id(), task.id);
        assert_eq!(created_event.event_name(), "status");

        // cancel 為終態：應先收到 status，再收到 done
        state.cancel_task(&task.id).await.expect("task exists");

        let status_event = rx.recv().await.expect("status event for cancel");
        assert_eq!(status_event.event_name(), "status");
        assert!(matches!(
            status_event,
            crate::events::TaskEvent::Status {
                status: TaskStatus::Cancelled,
                ..
            }
        ));

        let done_event = rx.recv().await.expect("done event for terminal status");
        assert_eq!(done_event.event_name(), "done");
        assert_eq!(done_event.task_id(), task.id);
    }

    #[tokio::test]
    async fn execute_task_with_empty_pipeline_reaches_done() {
        let state = AppState::new(Config::from_env());

        let pipeline = state
            .create_pipeline(CreatePipelineRequest {
                name: "No Step Pipeline".to_string(),
                description: Some("Verification only".to_string()),
                fixer_agent_id: "agent-2".to_string(),
                steps: vec![],
            })
            .await
            .expect("pipeline should be created");

        let project = state
            .create_project(CreateProjectRequest {
                name: "Temp Project".to_string(),
                path: "/tmp".to_string(),
                test_command: Some("echo test".to_string()),
                pipeline_id: pipeline.id.clone(),
            })
            .await
            .expect("project should be created");

        let task = state
            .create_task(
                &project.id,
                CreateTaskRequest {
                    prompt: "Verify task".to_string(),
                    max_retries: 1,
                },
            )
            .await
            .expect("task should be created");

        state
            .execute_task(&task.id)
            .await
            .expect("task should complete");

        let completed = state.get_task(&task.id).await.expect("task exists");
        assert_eq!(completed.status, TaskStatus::Done);
        assert!(completed.completed_at.is_some());

        let runs = state.list_runs(&task.id).await.expect("runs should exist");
        assert_eq!(runs.len(), 1);
        assert_eq!(runs[0].phase, crate::domain::RunPhase::Verification);
        assert_eq!(runs[0].success, Some(true));
    }

    #[tokio::test]
    async fn canceling_running_task_marks_it_cancelled() {
        let state = AppState::new(Config::from_env());

        let pipeline = state
            .create_pipeline(CreatePipelineRequest {
                name: "Cancelable Pipeline".to_string(),
                description: Some("Verification only".to_string()),
                fixer_agent_id: "agent-2".to_string(),
                steps: vec![],
            })
            .await
            .expect("pipeline should be created");

        let project = state
            .create_project(CreateProjectRequest {
                name: "Cancelable Project".to_string(),
                path: "/tmp".to_string(),
                test_command: Some("sleep 2".to_string()),
                pipeline_id: pipeline.id.clone(),
            })
            .await
            .expect("project should be created");

        let task = state
            .create_task(
                &project.id,
                CreateTaskRequest {
                    prompt: "Cancel me".to_string(),
                    max_retries: 1,
                },
            )
            .await
            .expect("task should be created");

        let state_for_worker = state.clone();
        let task_id = task.id.clone();
        let worker = tokio::spawn(async move { state_for_worker.execute_task(&task_id).await });

        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        state
            .cancel_task(&task.id)
            .await
            .expect("task should cancel");

        let result = worker.await.expect("worker task should join");
        assert!(result.is_err(), "cancellation should surface as an error");

        let cancelled = state.get_task(&task.id).await.expect("task exists");
        assert_eq!(cancelled.status, TaskStatus::Cancelled);
        assert!(cancelled.completed_at.is_some());
    }
}
