use sqlx::PgPool;
use redis::aio::ConnectionManager;

use crate::config::Config;

#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
    pub redis: ConnectionManager,
    pub config: Config,
}

impl AppState {
    pub async fn new(config: Config) -> anyhow::Result<Self> {
        let db = PgPool::connect(&config.database_url).await?;
        let redis = redis::Client::open(config.redis_url.as_str())?
            .get_connection_manager()
            .await?;

        Ok(Self { db, redis, config })
    }
}
