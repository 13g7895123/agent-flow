use crate::runner::{ClaudeRunner, CommandTester, ModelRunner, RunOptions};
use std::path::PathBuf;
use std::time::Duration;

#[test]
fn test_run_options_creation() {
    let options = RunOptions::new(
        "test prompt".to_string(),
        PathBuf::from("/tmp"),
        Duration::from_secs(5),
        "claude-3-5-sonnet-20241022".to_string(),
    );

    assert_eq!(options.prompt, "test prompt");
    assert_eq!(options.working_dir, PathBuf::from("/tmp"));
    assert_eq!(options.timeout, Duration::from_secs(5));
    assert_eq!(options.model_id, "claude-3-5-sonnet-20241022");
}

#[tokio::test]
async fn test_claude_runner_error_handling() {
    let runner = ClaudeRunner::new();
    let options = RunOptions::new(
        "test".to_string(),
        PathBuf::from("/nonexistent"),
        Duration::from_secs(1),
        "claude-3-5-sonnet-20241022".to_string(),
    );

    let result = runner.run(options).await;
    assert!(result.is_err());
}

#[tokio::test]
async fn test_command_tester_with_valid_command() {
    let result =
        CommandTester::test_command("echo hello", &PathBuf::from("/tmp"), Duration::from_secs(5))
            .await;

    assert!(result.is_ok());
    let test_result = result.unwrap();
    assert!(test_result.passed);
}
