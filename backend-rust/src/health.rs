use crate::config::Config;
use redis::aio::ConnectionManager;
use serde::Serialize;
use std::time::Duration;
use tokio::process::Command;
use tokio::time::timeout;
use tokio_postgres::NoTls;

const HEALTH_TIMEOUT: Duration = Duration::from_secs(2);

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum HealthState {
    Ok,
    Warn,
    Error,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthCheck {
    pub status: HealthState,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub configured: Option<bool>,
}

impl HealthCheck {
    pub fn ok() -> Self {
        Self {
            status: HealthState::Ok,
            detail: None,
            configured: None,
        }
    }

    pub fn warn(detail: impl Into<String>) -> Self {
        Self {
            status: HealthState::Warn,
            detail: Some(detail.into()),
            configured: None,
        }
    }

    pub fn error(detail: impl Into<String>) -> Self {
        Self {
            status: HealthState::Error,
            detail: Some(detail.into()),
            configured: None,
        }
    }

    pub fn configured(configured: bool, status: HealthState, detail: Option<String>) -> Self {
        Self {
            status,
            detail,
            configured: Some(configured),
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthChecks {
    pub backend: HealthCheck,
    pub database: HealthCheck,
    pub redis: HealthCheck,
    pub claude: HealthCheck,
    pub gemini: HealthCheck,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum HealthStatus {
    Ok,
    Warn,
    Error,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthReport {
    pub status: HealthStatus,
    pub checks: HealthChecks,
}

impl HealthReport {
    pub fn from_checks(checks: HealthChecks) -> Self {
        let status = if matches!(checks.database.status, HealthState::Error)
            || matches!(checks.redis.status, HealthState::Error)
            || matches!(checks.claude.status, HealthState::Error)
        {
            HealthStatus::Error
        } else if matches!(checks.database.status, HealthState::Warn)
            || matches!(checks.redis.status, HealthState::Warn)
            || matches!(checks.claude.status, HealthState::Warn)
            || matches!(checks.gemini.status, HealthState::Warn)
        {
            HealthStatus::Warn
        } else {
            HealthStatus::Ok
        };

        Self { status, checks }
    }

    pub fn mock_ok() -> Self {
        Self::from_checks(HealthChecks {
            backend: HealthCheck::ok(),
            database: HealthCheck::ok(),
            redis: HealthCheck::ok(),
            claude: HealthCheck::ok(),
            gemini: HealthCheck::configured(true, HealthState::Ok, None),
        })
    }
}

#[derive(Clone)]
pub enum HealthProbe {
    Real,
    Mock(HealthReport),
}

impl HealthProbe {
    pub fn real() -> Self {
        Self::Real
    }

    pub fn mock(report: HealthReport) -> Self {
        Self::Mock(report)
    }

    pub async fn check(&self, config: &Config) -> HealthReport {
        match self {
            HealthProbe::Real => collect_health_report(config).await,
            HealthProbe::Mock(report) => report.clone(),
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeConfigResponse {
    pub port: u16,
    pub claude_timeout_secs: u64,
    pub default_max_retries: i16,
    pub task_concurrency: usize,
    pub allow_origins: Vec<String>,
    pub gemini_api_key_configured: bool,
}

impl From<&Config> for RuntimeConfigResponse {
    fn from(config: &Config) -> Self {
        Self {
            port: config.port,
            claude_timeout_secs: config.claude_timeout_secs,
            default_max_retries: config.default_max_retries,
            task_concurrency: config.task_concurrency,
            allow_origins: config.allow_origins.clone(),
            gemini_api_key_configured: config.gemini_api_key_configured(),
        }
    }
}

async fn collect_health_report(config: &Config) -> HealthReport {
    let checks = HealthChecks {
        backend: HealthCheck::ok(),
        database: check_database().await,
        redis: check_redis().await,
        claude: check_claude().await,
        gemini: check_gemini(config),
    };

    HealthReport::from_checks(checks)
}

async fn check_database() -> HealthCheck {
    let database_url = match std::env::var("DATABASE_URL") {
        Ok(url) if !url.trim().is_empty() => url,
        _ => return HealthCheck::error("DATABASE_URL is not set"),
    };

    match timeout(HEALTH_TIMEOUT, tokio_postgres::connect(&database_url, NoTls)).await {
        Ok(Ok((client, connection))) => {
            let connection_task = tokio::spawn(async move {
                if let Err(error) = connection.await {
                    tracing::debug!("database connection task ended: {:?}", error);
                }
            });

            let query_result = timeout(HEALTH_TIMEOUT, client.simple_query("SELECT 1")).await;
            connection_task.abort();

            match query_result {
                Ok(Ok(_)) => HealthCheck::ok(),
                Ok(Err(error)) => HealthCheck::error(format!("database ping failed: {error}")),
                Err(_) => HealthCheck::error("database ping timed out"),
            }
        }
        Ok(Err(error)) => HealthCheck::error(format!("database connect failed: {error}")),
        Err(_) => HealthCheck::error("database connect timed out"),
    }
}

async fn check_redis() -> HealthCheck {
    let redis_url = std::env::var("REDIS_URL").unwrap_or_else(|_| "redis://localhost".to_string());
    let client = match redis::Client::open(redis_url.clone()) {
        Ok(client) => client,
        Err(error) => return HealthCheck::error(format!("redis client error: {error}")),
    };

    match timeout(HEALTH_TIMEOUT, ConnectionManager::new(client)).await {
        Ok(Ok(mut connection)) => match timeout(
            HEALTH_TIMEOUT,
            redis::cmd("PING").query_async::<_, String>(&mut connection),
        )
        .await
        {
            Ok(Ok(_)) => HealthCheck::ok(),
            Ok(Err(error)) => HealthCheck::error(format!("redis ping failed: {error}")),
            Err(_) => HealthCheck::error("redis ping timed out"),
        },
        Ok(Err(error)) => HealthCheck::error(format!("redis connect failed: {error}")),
        Err(_) => HealthCheck::error("redis connect timed out"),
    }
}

async fn check_claude() -> HealthCheck {
    let command = timeout(HEALTH_TIMEOUT, Command::new("claude").arg("--version").output()).await;

    match command {
        Ok(Ok(output)) if output.status.success() => HealthCheck::ok(),
        Ok(Ok(output)) => HealthCheck::error(format!(
            "claude --version exited with status {}",
            output.status
        )),
        Ok(Err(error)) => HealthCheck::error(format!("claude command failed: {error}")),
        Err(_) => HealthCheck::error("claude command timed out"),
    }
}

fn check_gemini(config: &Config) -> HealthCheck {
    let configured = config.gemini_api_key_configured();
    if configured {
        HealthCheck::configured(true, HealthState::Ok, None)
    } else {
        HealthCheck::configured(
            false,
            HealthState::Warn,
            Some("GEMINI_API_KEY is not set".to_string()),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_config() -> Config {
        Config {
            port: 3001,
            run_seed: false,
            claude_timeout_secs: 300,
            default_max_retries: 5,
            task_concurrency: 2,
            allow_origins: vec!["http://localhost:3000".to_string()],
            gemini_api_key: Some("secret".to_string()),
        }
    }

    #[test]
    fn runtime_config_masks_api_key() {
        let response = RuntimeConfigResponse::from(&sample_config());

        assert_eq!(response.port, 3001);
        assert!(response.gemini_api_key_configured);
        assert_eq!(response.allow_origins, vec!["http://localhost:3000".to_string()]);
    }

    #[test]
    fn health_report_uses_warn_when_gemini_is_unconfigured() {
        let report = HealthReport::from_checks(HealthChecks {
            backend: HealthCheck::ok(),
            database: HealthCheck::ok(),
            redis: HealthCheck::ok(),
            claude: HealthCheck::ok(),
            gemini: HealthCheck::configured(false, HealthState::Warn, None),
        });

        assert!(matches!(report.status, HealthStatus::Warn));
    }
}
