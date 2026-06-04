use axum::{
    extract::{Extension, Path},
    http::StatusCode,
    response::sse::Sse,
    routing::{get, put},
    Json, Router,
};
use std::convert::Infallible;
use std::pin::Pin;
use std::sync::Arc;
use tokio_stream::{wrappers::BroadcastStream, StreamExt};

use crate::{
    app_state::AppState,
    domain::{
        CreateAgentRequest, CreatePipelineRequest, CreateProjectRequest, CreateTaskRequest, Task,
        UpdateAgentRequest, UpdatePipelineRequest, UpdateProjectRequest,
    },
    events::TaskEvent,
};

type TaskSseStream = Pin<
    Box<dyn tokio_stream::Stream<Item = Result<axum::response::sse::Event, Infallible>> + Send>,
>;

pub fn router(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/api/health", get(health))
        // Agents
        .route("/api/agents", get(list_agents).post(create_agent))
        .route(
            "/api/agents/:id",
            get(get_agent).put(update_agent).delete(del_agent),
        )
        .route("/api/agents/:id/toggle", put(toggle_agent))
        // Pipelines
        .route("/api/pipelines", get(list_pipelines).post(create_pipeline))
        .route(
            "/api/pipelines/:id",
            get(get_pipeline).put(update_pipeline).delete(del_pipeline),
        )
        .route("/api/pipelines/:id/default", put(set_default_pipeline))
        // Projects
        .route("/api/projects", get(list_projects).post(create_project))
        .route(
            "/api/projects/:id",
            get(get_project).put(update_project).delete(del_project),
        )
        // Tasks
        // 注意：axum 0.5 要求同一前綴下的捕捉段同名，故此處沿用 `:id`
        // 與 `/api/projects/:id` 對齊，避免路由註冊衝突。
        .route("/api/projects/:id/tasks", get(list_tasks).post(create_task))
        .route("/api/tasks/:id", get(get_task))
        .route("/api/tasks/:id/cancel", put(cancel_task))
        .route("/api/tasks/:id/retry", put(retry_task))
        .route("/api/tasks/:id/runs", get(list_runs))
        .route("/api/runs/:run_id/logs", get(get_run_logs))
        .route("/api/tasks/:id/stream", get(task_stream))
        .layer(Extension(state))
}

// ── Health ────────────────────────────────────────────────────────────────

async fn health() -> Json<serde_json::Value> {
    Json(serde_json::json!({ "status": "ok" }))
}

// ── Agents ────────────────────────────────────────────────────────────────

async fn list_agents(
    Extension(state): Extension<Arc<AppState>>,
) -> Json<Vec<crate::domain::Agent>> {
    Json(state.list_agents().await)
}

async fn get_agent(
    Path(id): Path<String>,
    Extension(state): Extension<Arc<AppState>>,
) -> Result<Json<crate::domain::Agent>, (StatusCode, Json<serde_json::Value>)> {
    state
        .get_agent(&id)
        .await
        .map(Json)
        .ok_or_else(|| not_found("Agent not found"))
}

async fn create_agent(
    Extension(state): Extension<Arc<AppState>>,
    Json(payload): Json<CreateAgentRequest>,
) -> Result<(StatusCode, Json<crate::domain::Agent>), (StatusCode, Json<serde_json::Value>)> {
    state
        .create_agent(payload)
        .await
        .map(|a| (StatusCode::CREATED, Json(a)))
        .map_err(|e| bad_request(&e))
}

async fn update_agent(
    Path(id): Path<String>,
    Extension(state): Extension<Arc<AppState>>,
    Json(payload): Json<UpdateAgentRequest>,
) -> Result<Json<crate::domain::Agent>, (StatusCode, Json<serde_json::Value>)> {
    state
        .update_agent(&id, payload)
        .await
        .map(Json)
        .ok_or_else(|| not_found("Agent not found"))
}

async fn toggle_agent(
    Path(id): Path<String>,
    Extension(state): Extension<Arc<AppState>>,
) -> Result<Json<crate::domain::Agent>, (StatusCode, Json<serde_json::Value>)> {
    state
        .toggle_agent(&id)
        .await
        .map(Json)
        .ok_or_else(|| not_found("Agent not found"))
}

async fn del_agent(
    Path(id): Path<String>,
    Extension(state): Extension<Arc<AppState>>,
) -> Result<StatusCode, (StatusCode, Json<serde_json::Value>)> {
    if state.delete_agent(&id).await {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(not_found("Agent not found"))
    }
}

// ── Pipelines ─────────────────────────────────────────────────────────────

async fn list_pipelines(
    Extension(state): Extension<Arc<AppState>>,
) -> Json<Vec<crate::domain::Pipeline>> {
    Json(state.list_pipelines().await)
}

async fn get_pipeline(
    Path(id): Path<String>,
    Extension(state): Extension<Arc<AppState>>,
) -> Result<Json<crate::domain::Pipeline>, (StatusCode, Json<serde_json::Value>)> {
    state
        .get_pipeline(&id)
        .await
        .map(Json)
        .ok_or_else(|| not_found("Pipeline not found"))
}

async fn create_pipeline(
    Extension(state): Extension<Arc<AppState>>,
    Json(payload): Json<CreatePipelineRequest>,
) -> Result<(StatusCode, Json<crate::domain::Pipeline>), (StatusCode, Json<serde_json::Value>)> {
    state
        .create_pipeline(payload)
        .await
        .map(|p| (StatusCode::CREATED, Json(p)))
        .map_err(|e| bad_request(&e))
}

async fn update_pipeline(
    Path(id): Path<String>,
    Extension(state): Extension<Arc<AppState>>,
    Json(payload): Json<UpdatePipelineRequest>,
) -> Result<Json<crate::domain::Pipeline>, (StatusCode, Json<serde_json::Value>)> {
    state
        .update_pipeline(&id, payload)
        .await
        .map(Json)
        .ok_or_else(|| not_found("Pipeline not found"))
}

async fn set_default_pipeline(
    Path(id): Path<String>,
    Extension(state): Extension<Arc<AppState>>,
) -> Result<Json<crate::domain::Pipeline>, (StatusCode, Json<serde_json::Value>)> {
    state
        .set_default_pipeline(&id)
        .await
        .map(Json)
        .ok_or_else(|| not_found("Pipeline not found"))
}

async fn del_pipeline(
    Path(id): Path<String>,
    Extension(state): Extension<Arc<AppState>>,
) -> Result<StatusCode, (StatusCode, Json<serde_json::Value>)> {
    if state.delete_pipeline(&id).await {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(not_found("Pipeline not found"))
    }
}

// ── Projects ──────────────────────────────────────────────────────────────

async fn list_projects(
    Extension(state): Extension<Arc<AppState>>,
) -> Json<Vec<crate::domain::Project>> {
    Json(state.list_projects().await)
}

async fn get_project(
    Path(id): Path<String>,
    Extension(state): Extension<Arc<AppState>>,
) -> Result<Json<crate::domain::Project>, (StatusCode, Json<serde_json::Value>)> {
    state
        .get_project(&id)
        .await
        .map(Json)
        .ok_or_else(|| not_found("Project not found"))
}

async fn create_project(
    Extension(state): Extension<Arc<AppState>>,
    Json(payload): Json<CreateProjectRequest>,
) -> Result<(StatusCode, Json<crate::domain::Project>), (StatusCode, Json<serde_json::Value>)> {
    state
        .create_project(payload)
        .await
        .map(|p| (StatusCode::CREATED, Json(p)))
        .map_err(|e| bad_request(&e))
}

async fn update_project(
    Path(id): Path<String>,
    Extension(state): Extension<Arc<AppState>>,
    Json(payload): Json<UpdateProjectRequest>,
) -> Result<Json<crate::domain::Project>, (StatusCode, Json<serde_json::Value>)> {
    state
        .update_project(&id, payload)
        .await
        .map(Json)
        .ok_or_else(|| not_found("Project not found"))
}

async fn del_project(
    Path(id): Path<String>,
    Extension(state): Extension<Arc<AppState>>,
) -> Result<StatusCode, (StatusCode, Json<serde_json::Value>)> {
    if state.delete_project(&id).await {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(not_found("Project not found"))
    }
}

// ── Tasks ─────────────────────────────────────────────────────────────────

async fn list_tasks(
    Path(project_id): Path<String>,
    Extension(state): Extension<Arc<AppState>>,
) -> Result<Json<Vec<Task>>, (StatusCode, Json<serde_json::Value>)> {
    state
        .get_project(&project_id)
        .await
        .ok_or_else(|| not_found("Project not found"))?;
    Ok(Json(state.list_tasks(&project_id).await))
}

async fn get_task(
    Path(id): Path<String>,
    Extension(state): Extension<Arc<AppState>>,
) -> Result<Json<Task>, (StatusCode, Json<serde_json::Value>)> {
    state
        .get_task(&id)
        .await
        .map(Json)
        .ok_or_else(|| not_found("Task not found"))
}

async fn create_task(
    Path(project_id): Path<String>,
    Extension(state): Extension<Arc<AppState>>,
    Json(payload): Json<CreateTaskRequest>,
) -> Result<(StatusCode, Json<Task>), (StatusCode, Json<serde_json::Value>)> {
    if payload.prompt.trim().is_empty() {
        return Err(bad_request("Prompt is required"));
    }
    match state.create_task(&project_id, payload).await {
        Some(task) => {
            if let Some(queue) = state.queue.as_ref().as_ref() {
                if let Err(e) = queue.enqueue(task.id.clone()).await {
                    tracing::error!("Failed to enqueue task {}: {:?}", task.id, e);
                }
            }
            Ok((StatusCode::CREATED, Json(task)))
        }
        None => Err(not_found("Project not found")),
    }
}

async fn cancel_task(
    Path(id): Path<String>,
    Extension(state): Extension<Arc<AppState>>,
) -> Result<Json<Task>, (StatusCode, Json<serde_json::Value>)> {
    state
        .cancel_task(&id)
        .await
        .map(Json)
        .ok_or_else(|| not_found("Task not found"))
}

async fn retry_task(
    Path(id): Path<String>,
    Extension(state): Extension<Arc<AppState>>,
) -> Result<Json<Task>, (StatusCode, Json<serde_json::Value>)> {
    state
        .retry_task(&id)
        .await
        .map(Json)
        .ok_or_else(|| not_found("Task not found"))
}

async fn list_runs(
    Path(id): Path<String>,
    Extension(state): Extension<Arc<AppState>>,
) -> Result<Json<Vec<crate::domain::ExecutionRun>>, (StatusCode, Json<serde_json::Value>)> {
    state
        .get_task(&id)
        .await
        .ok_or_else(|| not_found("Task not found"))?;
    Ok(Json(state.list_runs(&id).await.unwrap_or_default()))
}

async fn get_run_logs(
    Path(run_id): Path<String>,
    Extension(state): Extension<Arc<AppState>>,
) -> Result<Json<Vec<crate::domain::AgentLog>>, (StatusCode, Json<serde_json::Value>)> {
    state
        .get_run(&run_id)
        .await
        .ok_or_else(|| not_found("Run not found"))?;

    Ok(Json(state.list_run_logs(&run_id).await.unwrap_or_default()))
}

async fn task_stream(
    Path(id): Path<String>,
    Extension(state): Extension<Arc<AppState>>,
) -> Result<Sse<TaskSseStream>, (StatusCode, Json<serde_json::Value>)> {
    let task = state
        .get_task(&id)
        .await
        .ok_or_else(|| not_found("Task not found"))?;

    let mut initial_events = vec![Ok::<axum::response::sse::Event, Infallible>(
        TaskEvent::status(task.id.clone(), task.status.clone(), task.current_retry).to_event(),
    )];

    if task.status.is_terminal() {
        initial_events.push(Ok(
            TaskEvent::done(task.id.clone(), task.status.clone()).to_event()
        ));
        let stream: TaskSseStream = Box::pin(tokio_stream::iter(initial_events));
        return Ok(Sse::new(stream));
    }

    let task_id = task.id.clone();
    let stream: TaskSseStream = Box::pin(tokio_stream::iter(initial_events).chain(
        BroadcastStream::new(state.task_events().subscribe()).filter_map(move |item| match item {
            Ok(event) if event.task_id() == task_id => Some(Ok::<_, Infallible>(event.to_event())),
            Ok(_) => None,
            Err(_) => None,
        }),
    ));

    Ok(Sse::new(stream))
}

// ── Error helpers ─────────────────────────────────────────────────────────

fn not_found(msg: &str) -> (StatusCode, Json<serde_json::Value>) {
    (
        StatusCode::NOT_FOUND,
        Json(serde_json::json!({ "error": msg })),
    )
}

fn bad_request(msg: &str) -> (StatusCode, Json<serde_json::Value>) {
    (
        StatusCode::BAD_REQUEST,
        Json(serde_json::json!({ "error": msg })),
    )
}
