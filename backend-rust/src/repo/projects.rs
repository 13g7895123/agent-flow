use sqlx::PgPool;
use uuid::Uuid;
use crate::domain::project::Project;
use crate::error::{ApiError, ApiResult};

pub struct ProjectRepo;

impl ProjectRepo {
    pub async fn list(pool: &PgPool) -> ApiResult<Vec<Project>> {
        sqlx::query_as::<_, Project>("SELECT * FROM projects ORDER BY created_at DESC")
            .fetch_all(pool)
            .await
            .map_err(|e| e.into())
    }

    pub async fn get(pool: &PgPool, id: Uuid) -> ApiResult<Option<Project>> {
        sqlx::query_as::<_, Project>("SELECT * FROM projects WHERE id = $1")
            .bind(id)
            .fetch_optional(pool)
            .await
            .map_err(|e| e.into())
    }

    pub async fn create(
        pool: &PgPool,
        name: String,
        path: String,
        test_command: Option<String>,
        pipeline_id: Uuid,
        description: Option<String>,
    ) -> ApiResult<Project> {
        sqlx::query_as::<_, Project>(
            "INSERT INTO projects (name, path, test_command, pipeline_id, description, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
             RETURNING *"
        )
        .bind(name)
        .bind(path)
        .bind(test_command.unwrap_or_default())
        .bind(pipeline_id)
        .bind(description.unwrap_or_default())
        .fetch_one(pool)
        .await
        .map_err(|e| e.into())
    }

    pub async fn update(
        pool: &PgPool,
        id: Uuid,
        name: Option<String>,
        path: Option<String>,
        test_command: Option<String>,
        pipeline_id: Option<Uuid>,
        description: Option<String>,
    ) -> ApiResult<Option<Project>> {
        let existing = Self::get(pool, id).await?;
        if existing.is_none() {
            return Ok(None);
        }

        let project = sqlx::query_as::<_, Project>(
            "UPDATE projects SET
             name = COALESCE($1, name),
             path = COALESCE($2, path),
             test_command = COALESCE($3, test_command),
             pipeline_id = COALESCE($4, pipeline_id),
             description = COALESCE($5, description),
             updated_at = NOW()
             WHERE id = $6
             RETURNING *"
        )
        .bind(name)
        .bind(path)
        .bind(test_command)
        .bind(pipeline_id)
        .bind(description)
        .bind(id)
        .fetch_one(pool)
        .await
        .map_err(|e| e.into())?;

        Ok(Some(project))
    }

    pub async fn delete(pool: &PgPool, id: Uuid) -> ApiResult<bool> {
        let result = sqlx::query("DELETE FROM projects WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await
            .map_err(|e| e.into())?;
        Ok(result.rows_affected() > 0)
    }

    pub async fn check_pipeline_usage(pool: &PgPool, pipeline_id: Uuid) -> ApiResult<i64> {
        let result = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM projects WHERE pipeline_id = $1"
        )
        .bind(pipeline_id)
        .fetch_one(pool)
        .await
        .map_err(|e| e.into())?;
        Ok(result)
    }
}
