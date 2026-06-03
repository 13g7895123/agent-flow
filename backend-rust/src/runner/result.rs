use crate::runner::RunOptions;
use std::future::Future;
use std::pin::Pin;

#[derive(Debug, Clone)]
pub struct RunResult {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
}

pub trait ModelRunner: Send + Sync {
    fn run(
        &self,
        options: RunOptions,
    ) -> Pin<Box<dyn Future<Output = anyhow::Result<RunResult>> + Send + '_>>;
}
