use crate::domain::ModelProvider;
use crate::runner::{ClaudeRunner, ModelRunner, RunOptions, RunResult};

pub struct RunnerDispatcher {
    claude_runner: ClaudeRunner,
}

impl RunnerDispatcher {
    pub fn new() -> Self {
        Self {
            claude_runner: ClaudeRunner::new(),
        }
    }

    pub async fn run(
        &self,
        provider: &ModelProvider,
        options: RunOptions,
    ) -> anyhow::Result<RunResult> {
        match provider {
            ModelProvider::Claude => self.claude_runner.run(options).await,
            ModelProvider::Gemini => {
                Err(anyhow::anyhow!("Gemini runner not yet implemented"))
            }
        }
    }
}

impl Default for RunnerDispatcher {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use std::time::Duration;

    #[tokio::test]
    async fn test_runner_dispatcher_claude() {
        let dispatcher = RunnerDispatcher::new();
        let options = RunOptions::new(
            "test prompt".to_string(),
            PathBuf::from("/tmp"),
            Duration::from_millis(10),
            "claude-3-5-sonnet-20241022".to_string(),
        );

        let result = dispatcher.run(&ModelProvider::Claude, options).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_runner_dispatcher_gemini_not_implemented() {
        let dispatcher = RunnerDispatcher::new();
        let options = RunOptions::new(
            "test prompt".to_string(),
            PathBuf::from("/tmp"),
            Duration::from_secs(1),
            "gemini-model".to_string(),
        );

        let result = dispatcher.run(&ModelProvider::Gemini, options).await;
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("not yet implemented"));
    }
}
