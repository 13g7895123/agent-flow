use std::env;

#[derive(Clone, Debug)]
pub struct Config {
    pub port: u16,
    pub database_url: String,
    pub redis_url: String,
    pub run_seed: bool,
    pub claude_timeout_secs: u64,
    pub default_max_retries: i16,
    pub task_concurrency: usize,
    pub allow_origins: Vec<String>,
    pub gemini_api_key: Option<String>,
}

impl Config {
    pub fn from_env() -> Self {
        dotenvy::dotenv().ok();

        Self {
            port: env::var("PORT")
                .unwrap_or("3001".to_string())
                .parse()
                .unwrap_or(3001),
            database_url: env::var("DATABASE_URL")
                .unwrap_or("postgres://postgres:postgres@localhost:5432/agent_flow".to_string()),
            redis_url: env::var("REDIS_URL")
                .unwrap_or("redis://localhost:6379".to_string()),
            run_seed: env::var("RUN_SEED")
                .unwrap_or("false".to_string())
                .parse()
                .unwrap_or(false),
            claude_timeout_secs: env::var("CLAUDE_TIMEOUT_SECS")
                .unwrap_or("300".to_string())
                .parse()
                .unwrap_or(300),
            default_max_retries: env::var("DEFAULT_MAX_RETRIES")
                .unwrap_or("5".to_string())
                .parse()
                .unwrap_or(5),
            task_concurrency: env::var("TASK_CONCURRENCY")
                .unwrap_or("2".to_string())
                .parse()
                .unwrap_or(2),
            allow_origins: env::var("ALLOW_ORIGINS")
                .unwrap_or("http://localhost:3000,http://localhost:5173".to_string())
                .split(',')
                .map(|s| s.trim().to_string())
                .collect(),
            gemini_api_key: env::var("GEMINI_API_KEY").ok(),
        }
    }
}
