use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

// ── Enums ──────────────────────────────────────────────────────────────────

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ModelProvider {
    Claude,
    Gemini,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum TaskStatus {
    Pending,
    Running,
    Verifying,
    Fixing,
    Done,
    Failed,
    Cancelled,
}

impl TaskStatus {
    pub fn is_terminal(&self) -> bool {
        matches!(
            self,
            TaskStatus::Done | TaskStatus::Failed | TaskStatus::Cancelled
        )
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum RunPhase {
    Step,
    Fix,
    Verification,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum LogType {
    Stdout,
    Stderr,
}

// ── Agent ──────────────────────────────────────────────────────────────────

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Agent {
    pub id: String,
    pub name: String,
    pub description: String,
    pub model_provider: ModelProvider,
    pub model_id: String,
    pub system_prompt: String,
    pub step_prompt: String,
    pub is_active: bool,
    pub used_in_pipelines: u32,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateAgentRequest {
    pub name: String,
    pub description: Option<String>,
    pub model_provider: ModelProvider,
    pub model_id: Option<String>,
    pub system_prompt: String,
    pub step_prompt: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateAgentRequest {
    pub name: Option<String>,
    pub description: Option<String>,
    pub model_provider: Option<ModelProvider>,
    pub model_id: Option<String>,
    pub system_prompt: Option<String>,
    pub step_prompt: Option<String>,
}

// ── Pipeline ───────────────────────────────────────────────────────────────

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PipelineStepAgent {
    pub id: String,
    pub name: String,
    pub model_provider: ModelProvider,
    pub model_id: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PipelineStep {
    pub id: String,
    pub agent_id: String,
    pub agent: PipelineStepAgent,
    pub order: u32,
    pub label: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PipelineFixerAgent {
    pub id: String,
    pub name: String,
    pub model_provider: ModelProvider,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Pipeline {
    pub id: String,
    pub name: String,
    pub description: String,
    pub fixer_agent_id: String,
    pub fixer_agent: PipelineFixerAgent,
    pub steps: Vec<PipelineStep>,
    pub is_default: bool,
    pub is_active: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PipelineStepInput {
    pub agent_id: String,
    pub order: u32,
    pub label: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatePipelineRequest {
    pub name: String,
    pub description: Option<String>,
    pub fixer_agent_id: String,
    pub steps: Vec<PipelineStepInput>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdatePipelineRequest {
    pub name: Option<String>,
    pub description: Option<String>,
    pub fixer_agent_id: Option<String>,
    pub steps: Option<Vec<PipelineStepInput>>,
}

// ── Snapshot (used in Task) ────────────────────────────────────────────────

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSnapshot {
    pub id: String,
    pub name: String,
    pub model_provider: ModelProvider,
    pub model_id: String,
    pub system_prompt: String,
    pub step_prompt: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StepSnapshot {
    pub id: String,
    pub agent_id: String,
    pub agent: AgentSnapshot,
    pub order: u32,
    pub label: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PipelineSnapshot {
    pub id: String,
    pub name: String,
    pub fixer_agent: AgentSnapshot,
    pub steps: Vec<StepSnapshot>,
}

// ── Project ────────────────────────────────────────────────────────────────

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectPipeline {
    pub id: String,
    pub name: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub name: String,
    pub path: String,
    pub test_command: String,
    pub pipeline_id: String,
    pub pipeline: ProjectPipeline,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateProjectRequest {
    pub name: String,
    pub path: String,
    pub test_command: Option<String>,
    pub pipeline_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProjectRequest {
    pub name: Option<String>,
    pub path: Option<String>,
    pub test_command: Option<String>,
    pub pipeline_id: Option<String>,
}

// ── Task ───────────────────────────────────────────────────────────────────

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    pub project_id: String,
    pub prompt: String,
    pub status: TaskStatus,
    pub current_retry: i16,
    pub max_retries: i16,
    pub pipeline_snapshot: PipelineSnapshot,
    #[serde(default)]
    pub step_outputs: BTreeMap<String, String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub completed_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTaskRequest {
    pub prompt: String,
    pub max_retries: i16,
}

// ── ExecutionRun ───────────────────────────────────────────────────────────

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionRun {
    pub id: String,
    pub task_id: String,
    pub step_id: Option<String>,
    pub agent_id: Option<String>,
    pub agent_name: String,
    pub phase: RunPhase,
    pub run_index: u32,
    pub prompt_sent: String,
    pub output: String,
    pub error_message: String,
    pub exit_code: Option<i32>,
    pub success: Option<bool>,
    pub duration_ms: Option<u64>,
    pub started_at: DateTime<Utc>,
    pub completed_at: Option<DateTime<Utc>>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentLog {
    pub id: String,
    pub execution_run_id: String,
    pub sequence: u32,
    pub log_type: LogType,
    pub content: String,
    pub timestamp: DateTime<Utc>,
}
