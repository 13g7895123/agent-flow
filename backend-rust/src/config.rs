use std::env;

#[derive(Clone, Debug)]
pub struct Config {
    pub port: u16,
    pub run_seed: bool,
    pub claude_timeout_secs: u64,
    pub default_max_retries: i16,
    pub task_concurrency: usize,
    pub allow_origins: Vec<String>,
    pub gemini_api_key: Option<String>,
}

impl Config {
    pub fn from_env() -> Self {
        Self {
            port: env::var("PORT")
                .unwrap_or_else(|_| "3001".to_string())
                .parse()
                .unwrap_or(3001),
            run_seed: env::var("RUN_SEED")
                .unwrap_or_else(|_| "false".to_string())
                .parse()
                .unwrap_or(false),
            claude_timeout_secs: env::var("CLAUDE_TIMEOUT_SECS")
                .unwrap_or_else(|_| "300".to_string())
                .parse()
                .unwrap_or(300),
            default_max_retries: env::var("DEFAULT_MAX_RETRIES")
                .unwrap_or_else(|_| "5".to_string())
                .parse()
                .unwrap_or(5),
            task_concurrency: env::var("TASK_CONCURRENCY")
                .unwrap_or_else(|_| "2".to_string())
                .parse()
                .unwrap_or(2),
            allow_origins: env::var("ALLOW_ORIGINS")
                .unwrap_or_else(|_| "http://localhost:3000,http://localhost:5173".to_string())
                .split(',')
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect(),
            gemini_api_key: env::var("GEMINI_API_KEY").ok(),
        }
    }
}
