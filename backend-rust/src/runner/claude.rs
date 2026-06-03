use crate::runner::{ModelRunner, RunOptions, RunResult};
use std::future::Future;
use std::pin::Pin;
use std::process::Stdio;
use tokio::io::AsyncReadExt;
use tokio::process::Command;
use tokio::time::timeout;

pub struct ClaudeRunner;

impl ClaudeRunner {
    pub fn new() -> Self {
        Self
    }
}

impl Default for ClaudeRunner {
    fn default() -> Self {
        Self::new()
    }
}

impl ModelRunner for ClaudeRunner {
    fn run(
        &self,
        options: RunOptions,
    ) -> Pin<Box<dyn Future<Output = anyhow::Result<RunResult>> + Send + '_>> {
        Box::pin(self.run_impl(options))
    }
}

impl ClaudeRunner {
    async fn run_impl(&self, options: RunOptions) -> anyhow::Result<RunResult> {
        let mut cmd = Command::new("claude");

        cmd.arg("-p")
            .arg(&options.prompt)
            .current_dir(&options.working_dir)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        let mut child = cmd.spawn()?;

        let stdout_handle = {
            let stdout = child
                .stdout
                .take()
                .ok_or_else(|| anyhow::anyhow!("Failed to open stdout"))?;
            tokio::spawn(async move {
                let mut buf = String::new();
                let mut reader = stdout;
                reader.read_to_string(&mut buf).await.ok();
                buf
            })
        };

        let stderr_handle = {
            let stderr = child
                .stderr
                .take()
                .ok_or_else(|| anyhow::anyhow!("Failed to open stderr"))?;
            tokio::spawn(async move {
                let mut buf = String::new();
                let mut reader = stderr;
                reader.read_to_string(&mut buf).await.ok();
                buf
            })
        };

        let wait_result = timeout(options.timeout, child.wait()).await;

        let exit_code = match wait_result {
            Ok(Ok(status)) => status.code().unwrap_or(-1),
            Ok(Err(e)) => return Err(anyhow::anyhow!("Process error: {}", e)),
            Err(_) => {
                let _ = child.kill().await;
                return Err(anyhow::anyhow!(
                    "Process timeout after {:?}",
                    options.timeout
                ));
            }
        };

        let stdout = stdout_handle.await.unwrap_or_default();
        let stderr = stderr_handle.await.unwrap_or_default();

        Ok(RunResult {
            stdout,
            stderr,
            exit_code,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use std::time::Duration;

    #[tokio::test]
    async fn test_claude_runner_timeout() {
        let runner = ClaudeRunner::new();
        let options = RunOptions::new(
            "test prompt".to_string(),
            PathBuf::from("/tmp"),
            Duration::from_millis(10),
            "claude-3-5-sonnet-20241022".to_string(),
        );

        let result = runner.run(options).await;
        assert!(result.is_err(), "Should timeout");
    }

    #[tokio::test]
    async fn test_claude_runner_invalid_working_dir() {
        let runner = ClaudeRunner::new();
        let options = RunOptions::new(
            "test prompt".to_string(),
            PathBuf::from("/nonexistent/path/that/does/not/exist"),
            Duration::from_secs(1),
            "claude-3-5-sonnet-20241022".to_string(),
        );

        let result = runner.run(options).await;
        assert!(result.is_err(), "Should fail with invalid directory");
    }
}
