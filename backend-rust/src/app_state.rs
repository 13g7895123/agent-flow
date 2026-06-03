use crate::config::Config;
use crate::domain::{
    AgentSnapshot, CreateTaskRequest, ExecutionRun, PipelineSnapshot, Project, ProjectPipeline,
    StepSnapshot, Task, TaskStatus,
};
use chrono::Utc;
use std::collections::{BTreeMap, HashMap};
use tokio::sync::Mutex;

#[derive(Clone)]
pub struct AppState {
    pub config: Config,
    store: std::sync::Arc<Mutex<Store>>,
}

struct Store {
    projects: HashMap<String, Project>,
    tasks: HashMap<String, Task>,
    runs: HashMap<String, Vec<ExecutionRun>>,
    next_task_seq: u64,
}

impl AppState {
    pub fn new(config: Config) -> Self {
        let now = Utc::now();
        let project = Project {
            id: "project-1".to_string(),
            name: "Sample Project".to_string(),
            path: "/tmp/sample-project".to_string(),
            test_command: "echo test".to_string(),
            pipeline_id: "pipeline-1".to_string(),
            pipeline: ProjectPipeline {
                id: "pipeline-1".to_string(),
                name: "Default Pipeline".to_string(),
            },
            created_at: now,
            updated_at: now,
        };

        Self {
            config,
            store: std::sync::Arc::new(Mutex::new(Store {
                projects: HashMap::from([(project.id.clone(), project)]),
                tasks: HashMap::new(),
                runs: HashMap::new(),
                next_task_seq: 1,
            })),
        }
    }

    pub async fn list_projects(&self) -> Vec<Project> {
        let store = self.store.lock().await;
        store.projects.values().cloned().collect()
    }

    pub async fn get_project(&self, project_id: &str) -> Option<Project> {
        let store = self.store.lock().await;
        store.projects.get(project_id).cloned()
    }

    pub async fn list_tasks(&self, project_id: &str) -> Vec<Task> {
        let store = self.store.lock().await;
        let mut tasks: Vec<_> = store
            .tasks
            .values()
            .filter(|task| task.project_id == project_id)
            .cloned()
            .collect();
        tasks.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        tasks
    }

    pub async fn get_task(&self, task_id: &str) -> Option<Task> {
        let store = self.store.lock().await;
        store.tasks.get(task_id).cloned()
    }

    pub async fn create_task(
        &self,
        project_id: &str,
        request: CreateTaskRequest,
    ) -> Option<Task> {
        let mut store = self.store.lock().await;
        let project = store.projects.get(project_id)?.clone();
        let now = Utc::now();
        let seq = store.next_task_seq;
        store.next_task_seq += 1;
        let task_id = format!("task-{seq}");

        let pipeline_snapshot = sample_pipeline_snapshot(&project);
        let task = Task {
            id: task_id.clone(),
            project_id: project_id.to_string(),
            prompt: request.prompt,
            status: TaskStatus::Pending,
            current_retry: 0,
            max_retries: request.max_retries,
            pipeline_snapshot,
            step_outputs: BTreeMap::new(),
            created_at: now,
            updated_at: now,
            completed_at: None,
        };

        store.tasks.insert(task_id.clone(), task.clone());
        store.runs.insert(task_id, vec![]);
        Some(task)
    }

    pub async fn cancel_task(&self, task_id: &str) -> Option<Task> {
        let mut store = self.store.lock().await;
        let task = store.tasks.get_mut(task_id)?;
        task.status = TaskStatus::Cancelled;
        task.completed_at = Some(Utc::now());
        task.updated_at = Utc::now();
        Some(task.clone())
    }

    pub async fn retry_task(&self, task_id: &str) -> Option<Task> {
        let mut store = self.store.lock().await;
        let task = store.tasks.get_mut(task_id)?;
        task.status = TaskStatus::Pending;
        task.completed_at = None;
        task.current_retry = (task.current_retry + 1).min(task.max_retries);
        task.updated_at = Utc::now();
        Some(task.clone())
    }

    pub async fn list_runs(&self, task_id: &str) -> Option<Vec<ExecutionRun>> {
        let store = self.store.lock().await;
        store.runs.get(task_id).cloned()
    }
}

fn sample_pipeline_snapshot(project: &Project) -> PipelineSnapshot {
    let fixer_agent = AgentSnapshot {
        id: "agent-fixer".to_string(),
        name: "Fixer".to_string(),
        model_provider: crate::domain::ModelProvider::Claude,
        model_id: "claude-3-5-sonnet-20241022".to_string(),
        system_prompt: "You are a helpful fixer agent.".to_string(),
        step_prompt: "Review the task and suggest a fix.".to_string(),
    };
    let step_agent = AgentSnapshot {
        id: "agent-step".to_string(),
        name: "Builder".to_string(),
        model_provider: crate::domain::ModelProvider::Claude,
        model_id: "claude-3-5-sonnet-20241022".to_string(),
        system_prompt: "You write code changes.".to_string(),
        step_prompt: "Implement the requested change.".to_string(),
    };

    PipelineSnapshot {
        id: project.pipeline_id.clone(),
        name: project.pipeline.name.clone(),
        fixer_agent,
        steps: vec![StepSnapshot {
            id: "step-1".to_string(),
            agent_id: "agent-step".to_string(),
            agent: step_agent,
            order: 1,
            label: "Implementation".to_string(),
        }],
    }
}
