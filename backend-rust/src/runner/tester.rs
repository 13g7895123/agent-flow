use std::path::PathBuf;
use std::process::Stdio;
use std::time::Duration;
use tokio::io::AsyncReadExt;
use tokio::process::Command;
use tokio::time::timeout;

#[derive(Debug, Clone)]
pub struct TestResult {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
    pub passed: bool,
}

pub struct CommandTester;

impl CommandTester {
    pub async fn test_command(
        command: &str,
        working_dir: &PathBuf,
        timeout_duration: Duration,
    ) -> anyhow::Result<TestResult> {
        let mut cmd = Command::new("sh");
        cmd.arg("-c")
            .arg(command)
            .current_dir(working_dir)
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

        let wait_result = timeout(timeout_duration, child.wait()).await;

        let exit_code = match wait_result {
            Ok(Ok(status)) => status.code().unwrap_or(-1),
            Ok(Err(e)) => return Err(anyhow::anyhow!("Process error: {}", e)),
            Err(_) => {
                let _ = child.kill().await;
                return Err(anyhow::anyhow!("Test command timeout"));
            }
        };

        let stdout = stdout_handle.await.unwrap_or_default();
        let stderr = stderr_handle.await.unwrap_or_default();

        Ok(TestResult {
            stdout,
            stderr,
            exit_code,
            passed: exit_code == 0,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_command_tester_success() {
        let result = CommandTester::test_command(
            "echo 'test'",
            &PathBuf::from("/tmp"),
            Duration::from_secs(1),
        )
        .await;

        assert!(result.is_ok());
        let test_result = result.unwrap();
        assert!(test_result.passed);
        assert_eq!(test_result.exit_code, 0);
        assert!(test_result.stdout.contains("test"));
    }

    #[tokio::test]
    async fn test_command_tester_failure() {
        let result =
            CommandTester::test_command("exit 1", &PathBuf::from("/tmp"), Duration::from_secs(1))
                .await;

        assert!(result.is_ok());
        let test_result = result.unwrap();
        assert!(!test_result.passed);
        assert_eq!(test_result.exit_code, 1);
    }

    #[tokio::test]
    async fn test_command_tester_timeout() {
        let result = CommandTester::test_command(
            "sleep 10",
            &PathBuf::from("/tmp"),
            Duration::from_millis(50),
        )
        .await;

        assert!(result.is_err());
    }
}
