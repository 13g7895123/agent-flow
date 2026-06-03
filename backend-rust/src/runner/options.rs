use std::path::PathBuf;
use std::time::Duration;

#[derive(Debug, Clone)]
pub struct RunOptions {
    pub prompt: String,
    pub working_dir: PathBuf,
    pub timeout: Duration,
    pub model_id: String,
}

impl RunOptions {
    pub fn new(prompt: String, working_dir: PathBuf, timeout: Duration, model_id: String) -> Self {
        Self {
            prompt,
            working_dir,
            timeout,
            model_id,
        }
    }
}
