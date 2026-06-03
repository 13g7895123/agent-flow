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
        Self::from_env_with(|key| env::var(key).ok())
    }

    /// 以可注入的取值函式建立 Config，方便單元測試在不污染進程環境變數的情況下驗證解析邏輯。
    pub fn from_env_with<F>(mut get: F) -> Self
    where
        F: FnMut(&str) -> Option<String>,
    {
        let port = get("PORT")
            .unwrap_or_else(|| "3001".to_string())
            .parse()
            .unwrap_or(3001);
        let run_seed = get("RUN_SEED")
            .unwrap_or_else(|| "false".to_string())
            .parse()
            .unwrap_or(false);
        let claude_timeout_secs = get("CLAUDE_TIMEOUT_SECS")
            .unwrap_or_else(|| "300".to_string())
            .parse()
            .unwrap_or(300);
        let default_max_retries = get("DEFAULT_MAX_RETRIES")
            .unwrap_or_else(|| "5".to_string())
            .parse()
            .unwrap_or(5);
        let task_concurrency = get("TASK_CONCURRENCY")
            .unwrap_or_else(|| "2".to_string())
            .parse()
            .unwrap_or(2);
        let allow_origins = parse_allow_origins(
            &get("ALLOW_ORIGINS")
                .unwrap_or_else(|| "http://localhost:3000,http://localhost:5173".to_string()),
        );
        let gemini_api_key = get("GEMINI_API_KEY");

        Self {
            port,
            run_seed,
            claude_timeout_secs,
            default_max_retries,
            task_concurrency,
            allow_origins,
            gemini_api_key,
        }
    }
}

fn parse_allow_origins(raw: &str) -> Vec<String> {
    let parsed: Vec<_> = raw
        .split(',')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();

    if parsed.is_empty() {
        vec![
            "http://localhost:3000".to_string(),
            "http://localhost:5173".to_string(),
        ]
    } else {
        parsed
    }
}

#[cfg(test)]
mod tests {
    use super::Config;
    use std::collections::HashMap;

    #[test]
    fn parses_config_from_custom_env_map() {
        let vars = HashMap::from([
            ("PORT", "8080"),
            ("RUN_SEED", "true"),
            ("CLAUDE_TIMEOUT_SECS", "120"),
            ("DEFAULT_MAX_RETRIES", "9"),
            ("TASK_CONCURRENCY", "4"),
            (
                "ALLOW_ORIGINS",
                "https://app.example.com, http://localhost:3000 ",
            ),
            ("GEMINI_API_KEY", "secret"),
        ]);

        let config = Config::from_env_with(|key| vars.get(key).map(|v| (*v).to_string()));

        assert_eq!(config.port, 8080);
        assert!(config.run_seed);
        assert_eq!(config.claude_timeout_secs, 120);
        assert_eq!(config.default_max_retries, 9);
        assert_eq!(config.task_concurrency, 4);
        assert_eq!(
            config.allow_origins,
            vec![
                "https://app.example.com".to_string(),
                "http://localhost:3000".to_string(),
            ]
        );
        assert_eq!(config.gemini_api_key.as_deref(), Some("secret"));
    }

    #[test]
    fn falls_back_to_defaults_for_invalid_values() {
        let vars = HashMap::from([
            ("PORT", "not-a-port"),
            ("RUN_SEED", "not-a-bool"),
            ("CLAUDE_TIMEOUT_SECS", "NaN"),
            ("DEFAULT_MAX_RETRIES", "NaN"),
            ("TASK_CONCURRENCY", "NaN"),
            ("ALLOW_ORIGINS", ", ,"),
        ]);

        let config = Config::from_env_with(|key| vars.get(key).map(|v| (*v).to_string()));

        assert_eq!(config.port, 3001);
        assert!(!config.run_seed);
        assert_eq!(config.claude_timeout_secs, 300);
        assert_eq!(config.default_max_retries, 5);
        assert_eq!(config.task_concurrency, 2);
        assert_eq!(
            config.allow_origins,
            vec![
                "http://localhost:3000".to_string(),
                "http://localhost:5173".to_string(),
            ]
        );
        assert!(config.gemini_api_key.is_none());
    }
}
