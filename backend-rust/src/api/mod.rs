use axum::{
    extract::{Extension, Path},
    http::{header, StatusCode},
    response::IntoResponse,
    routing::{get, put},
    Json, Router,
};
use std::sync::Arc;

use crate::{
    app_state::AppState,
    domain::{CreateTaskRequest, Task},
};

pub fn router(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/api/health", get(health))
        .route("/api/projects", get(list_projects))
        .route("/api/projects/:project_id", get(get_project))
        .route("/api/projects/:project_id/tasks", get(list_tasks).post(create_task))
        .route("/api/tasks/:task_id", get(get_task))
        .route("/api/tasks/:task_id/runs", get(list_runs))
        .route("/api/tasks/:task_id/cancel", put(cancel_task))
        .route("/api/tasks/:task_id/retry", put(retry_task))
        .route("/api/tasks/:task_id/stream", get(task_stream))
        .layer(Extension(state))
}

async fn health() -> Json<serde_json::Value> {
    Json(serde_json::json!({ "status": "ok" }))
}

async fn list_projects(Extension(state): Extension<Arc<AppState>>) -> Json<Vec<crate::domain::Project>> {
    Json(state.list_projects().await)
}

async fn get_project(
    Path(project_id): Path<String>,
    Extension(state): Extension<Arc<AppState>>,
) -> Result<Json<crate::domain::Project>, (StatusCode, Json<serde_json::Value>)> {
    state
        .get_project(&project_id)
        .await
        .map(Json)
        .ok_or_else(|| not_found("Project not found"))
}

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
    Path(task_id): Path<String>,
    Extension(state): Extension<Arc<AppState>>,
) -> Result<Json<Task>, (StatusCode, Json<serde_json::Value>)> {
    state
        .get_task(&task_id)
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
        return Err(unprocessable("Prompt is required"));
    }

    state
        .get_project(&project_id)
        .await
        .ok_or_else(|| not_found("Project not found"))?;

    let task = state
        .create_task(&project_id, payload)
        .await
        .ok_or_else(|| not_found("Project not found"))?;

    Ok((StatusCode::CREATED, Json(task)))
}

async fn cancel_task(
    Path(task_id): Path<String>,
    Extension(state): Extension<Arc<AppState>>,
) -> Result<Json<Task>, (StatusCode, Json<serde_json::Value>)> {
    state
        .cancel_task(&task_id)
        .await
        .map(Json)
        .ok_or_else(|| not_found("Task not found"))
}

async fn retry_task(
    Path(task_id): Path<String>,
    Extension(state): Extension<Arc<AppState>>,
) -> Result<Json<Task>, (StatusCode, Json<serde_json::Value>)> {
    state
        .retry_task(&task_id)
        .await
        .map(Json)
        .ok_or_else(|| not_found("Task not found"))
}

async fn list_runs(
    Path(task_id): Path<String>,
    Extension(state): Extension<Arc<AppState>>,
) -> Result<Json<Vec<crate::domain::ExecutionRun>>, (StatusCode, Json<serde_json::Value>)> {
    state
        .get_task(&task_id)
        .await
        .ok_or_else(|| not_found("Task not found"))?;
    Ok(Json(state.list_runs(&task_id).await.unwrap_or_default()))
}

async fn task_stream(
    Path(task_id): Path<String>,
    Extension(state): Extension<Arc<AppState>>,
) -> Result<impl IntoResponse, (StatusCode, Json<serde_json::Value>)> {
    state
        .get_task(&task_id)
        .await
        .ok_or_else(|| not_found("Task not found"))?;

    Ok((
        StatusCode::OK,
        [
            (header::CONTENT_TYPE, "text/event-stream"),
            (header::CACHE_CONTROL, "no-cache"),
            (header::CONNECTION, "keep-alive"),
        ],
        ": connected\n\n",
    ))
}

fn not_found(message: &str) -> (StatusCode, Json<serde_json::Value>) {
    (StatusCode::NOT_FOUND, Json(serde_json::json!({ "error": message })))
}

fn unprocessable(message: &str) -> (StatusCode, Json<serde_json::Value>) {
    (StatusCode::UNPROCESSABLE_ENTITY, Json(serde_json::json!({ "error": message })))
}
