use axum::{
    extract::{Path, State, Json},
    http::StatusCode,
};
use uuid::Uuid;
use crate::{
    app_state::AppState,
    domain::project::{CreateProjectRequest, UpdateProjectRequest, ProjectResponse},
    error::{ApiError, ApiResult},
    repo::ProjectRepo,
};

pub async fn list(State(state): State<AppState>) -> ApiResult<Json<Vec<ProjectResponse>>> {
    let projects = ProjectRepo::list(&state.db).await?;
    Ok(Json(projects.into_iter().map(|p| p.into()).collect()))
}

pub async fn get(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<ProjectResponse>> {
    let project = ProjectRepo::get(&state.db, id)
        .await?
        .ok_or(ApiError::NotFound)?;
    Ok(Json(project.into()))
}

pub async fn create(
    State(state): State<AppState>,
    Json(req): Json<CreateProjectRequest>,
) -> ApiResult<(StatusCode, Json<ProjectResponse>)> {
    if req.name.trim().is_empty() {
        return Err(ApiError::BadRequest("Project name is required".to_string()));
    }
    if req.path.trim().is_empty() {
        return Err(ApiError::BadRequest("Project path is required".to_string()));
    }

    let project = ProjectRepo::create(
        &state.db,
        req.name,
        req.path,
        req.test_command,
        req.pipeline_id,
        req.description,
    )
    .await?;

    Ok((StatusCode::CREATED, Json(project.into())))
}

pub async fn update(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Json(req): Json<UpdateProjectRequest>,
) -> ApiResult<Json<ProjectResponse>> {
    let project = ProjectRepo::update(
        &state.db,
        id,
        req.name,
        req.path,
        req.test_command,
        req.pipeline_id,
        req.description,
    )
    .await?
    .ok_or(ApiError::NotFound)?;

    Ok(Json(project.into()))
}

pub async fn delete(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> ApiResult<StatusCode> {
    let deleted = ProjectRepo::delete(&state.db, id).await?;
    if deleted {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(ApiError::NotFound)
    }
}
