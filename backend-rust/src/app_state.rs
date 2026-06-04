use crate::config::Config;
use crate::domain::{
    Agent, AgentLog, AgentSnapshot, CreateAgentRequest, CreatePipelineRequest,
    CreateProjectRequest, CreateTaskRequest, ExecutionRun, LogType, ModelProvider, Pipeline,
    PipelineFixerAgent, PipelineSnapshot, PipelineStep, PipelineStepAgent, Project,
    ProjectPipeline, RunPhase, StepSnapshot, Task, TaskStatus, UpdateAgentRequest,
    UpdatePipelineRequest, UpdateProjectRequest,
};
use crate::events::{TaskEvent, TaskEventBus};
use chrono::Utc;
use std::collections::{BTreeMap, HashMap};
use std::process::Stdio;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::{watch, Mutex};
use tokio::time::Instant;

#[derive(Clone)]
pub struct AppState {
    pub config: Config,
    store: Arc<Mutex<Store>>,
    pub queue: Arc<Option<crate::queue::TaskQueue>>,
    event_bus: Arc<TaskEventBus>,
}

struct Store {
    agents: HashMap<String, Agent>,
    pipelines: HashMap<String, Pipeline>,
    projects: HashMap<String, Project>,
    tasks: HashMap<String, Task>,
    runs: HashMap<String, Vec<ExecutionRun>>,
    logs: HashMap<String, Vec<AgentLog>>,
    cancels: HashMap<String, watch::Sender<bool>>,
    next_seq: u64,
}

impl Store {
    fn next_id(&mut self, prefix: &str) -> String {
        let id = format!("{}-{}", prefix, self.next_seq);
        self.next_seq += 1;
        id
    }
}

impl AppState {
    pub fn new(config: Config) -> Self {
        let now = Utc::now();

        let agent = Agent {
            id: "agent-1".to_string(),
            name: "Builder".to_string(),
            description: "Default builder agent".to_string(),
            model_provider: ModelProvider::Claude,
            model_id: "claude-3-5-sonnet-20241022".to_string(),
            system_prompt: "You are a helpful coding assistant.".to_string(),
            step_prompt: "Implement the requested change.".to_string(),
            is_active: true,
            used_in_pipelines: 1,
            created_at: now,
            updated_at: now,
        };

        let fixer_agent = Agent {
            id: "agent-2".to_string(),
            name: "Fixer".to_string(),
            description: "Default fixer agent".to_string(),
            model_provider: ModelProvider::Claude,
            model_id: "claude-3-5-sonnet-20241022".to_string(),
            system_prompt: "You review and fix failing tests.".to_string(),
            step_prompt: "Review the error and suggest a fix.".to_string(),
            is_active: true,
            used_in_pipelines: 1,
            created_at: now,
            updated_at: now,
        };

        let pipeline = Pipeline {
            id: "pipeline-1".to_string(),
            name: "Default Pipeline".to_string(),
            description: "Default pipeline".to_string(),
            fixer_agent_id: "agent-2".to_string(),
            fixer_agent: PipelineFixerAgent {
                id: "agent-2".to_string(),
                name: "Fixer".to_string(),
                model_provider: ModelProvider::Claude,
            },
            steps: vec![PipelineStep {
                id: "step-1".to_string(),
                agent_id: "agent-1".to_string(),
                agent: PipelineStepAgent {
                    id: "agent-1".to_string(),
                    name: "Builder".to_string(),
                    model_provider: ModelProvider::Claude,
                    model_id: "claude-3-5-sonnet-20241022".to_string(),
                },
                order: 1,
                label: "Implementation".to_string(),
            }],
            is_default: true,
            is_active: true,
            created_at: now,
            updated_at: now,
        };

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
            store: Arc::new(Mutex::new(Store {
                agents: HashMap::from([
                    (agent.id.clone(), agent),
                    (fixer_agent.id.clone(), fixer_agent),
                ]),
                pipelines: HashMap::from([(pipeline.id.clone(), pipeline)]),
                projects: HashMap::from([(project.id.clone(), project)]),
                tasks: HashMap::new(),
                runs: HashMap::new(),
                logs: HashMap::new(),
                cancels: HashMap::new(),
                next_seq: 10,
            })),
            queue: Arc::new(None),
            event_bus: Arc::new(TaskEventBus::new(256)),
        }
    }

    pub fn task_events(&self) -> Arc<TaskEventBus> {
        Arc::clone(&self.event_bus)
    }

    fn publish_task_status(&self, task: &Task) {
        self.event_bus.publish(TaskEvent::status(
            task.id.clone(),
            task.status.clone(),
            task.current_retry,
        ));

        if task.status.is_terminal() {
            self.event_bus
                .publish(TaskEvent::done(task.id.clone(), task.status.clone()));
        }
    }

    fn publish_log(&self, task_id: &str, log_type: LogType, content: String, sequence: u32) {
        self.event_bus.publish(TaskEvent::Log {
            task_id: task_id.to_string(),
            log_type,
            content,
            sequence: sequence as u64,
        });
    }

    async fn register_cancel_handle(&self, task_id: &str) -> watch::Receiver<bool> {
        let mut store = self.store.lock().await;
        let (tx, rx) = watch::channel(false);
        store.cancels.insert(task_id.to_string(), tx);
        rx
    }

    async fn signal_cancel(&self, task_id: &str) {
        let store = self.store.lock().await;
        if let Some(sender) = store.cancels.get(task_id) {
            let _ = sender.send(true);
        }
    }

    async fn clear_cancel_handle(&self, task_id: &str) {
        let mut store = self.store.lock().await;
        store.cancels.remove(task_id);
    }

    async fn insert_run(&self, task_id: &str, run: ExecutionRun) {
        let mut store = self.store.lock().await;
        store.runs.entry(task_id.to_string()).or_default().push(run);
    }

    async fn update_run<F>(&self, task_id: &str, run_id: &str, mut f: F)
    where
        F: FnMut(&mut ExecutionRun),
    {
        let mut store = self.store.lock().await;
        if let Some(runs) = store.runs.get_mut(task_id) {
            if let Some(run) = runs.iter_mut().find(|run| run.id == run_id) {
                f(run);
            }
        }
    }

    async fn insert_log(&self, task_id: &str, run_id: &str, log_type: LogType, content: String) {
        let mut store = self.store.lock().await;
        let log_id = store.next_id("log");
        let logs = store.logs.entry(run_id.to_string()).or_default();
        let sequence = logs.len() as u32 + 1;
        logs.push(AgentLog {
            id: log_id,
            execution_run_id: run_id.to_string(),
            sequence,
            log_type: log_type.clone(),
            content: content.clone(),
            timestamp: Utc::now(),
        });
        drop(store);
        self.publish_log(task_id, log_type, content, sequence);
    }

    async fn set_task_status(
        &self,
        id: &str,
        status: TaskStatus,
        completed_at: Option<chrono::DateTime<Utc>>,
    ) -> Option<Task> {
        let task = {
            let mut store = self.store.lock().await;
            let task = store.tasks.get_mut(id)?;
            task.status = status;
            task.completed_at = completed_at;
            task.updated_at = Utc::now();
            task.clone()
        };

        self.publish_task_status(&task);
        Some(task)
    }

    pub fn with_queue(mut self, queue: crate::queue::TaskQueue) -> Self {
        self.queue = Arc::new(Some(queue));
        self
    }

    // ── Agents ────────────────────────────────────────────────────────────

    pub async fn list_agents(&self) -> Vec<Agent> {
        let store = self.store.lock().await;
        let mut list: Vec<_> = store.agents.values().cloned().collect();
        list.sort_by(|a, b| a.created_at.cmp(&b.created_at));
        list
    }

    pub async fn get_agent(&self, id: &str) -> Option<Agent> {
        let store = self.store.lock().await;
        store.agents.get(id).cloned()
    }

    pub async fn create_agent(&self, req: CreateAgentRequest) -> Result<Agent, String> {
        if req.name.trim().is_empty() {
            return Err("Agent name is required".to_string());
        }
        if req.system_prompt.trim().is_empty() {
            return Err("System prompt is required".to_string());
        }
        if req.step_prompt.trim().is_empty() {
            return Err("Step prompt is required".to_string());
        }
        let mut store = self.store.lock().await;
        let id = store.next_id("agent");
        let now = Utc::now();
        let agent = Agent {
            id: id.clone(),
            name: req.name,
            description: req.description.unwrap_or_default(),
            model_provider: req.model_provider,
            model_id: req.model_id.unwrap_or_default(),
            system_prompt: req.system_prompt,
            step_prompt: req.step_prompt,
            is_active: true,
            used_in_pipelines: 0,
            created_at: now,
            updated_at: now,
        };
        store.agents.insert(id, agent.clone());
        Ok(agent)
    }

    pub async fn update_agent(&self, id: &str, req: UpdateAgentRequest) -> Option<Agent> {
        let mut store = self.store.lock().await;
        let agent = store.agents.get_mut(id)?;
        if let Some(v) = req.name {
            agent.name = v;
        }
        if let Some(v) = req.description {
            agent.description = v;
        }
        if let Some(v) = req.model_provider {
            agent.model_provider = v;
        }
        if let Some(v) = req.model_id {
            agent.model_id = v;
        }
        if let Some(v) = req.system_prompt {
            agent.system_prompt = v;
        }
        if let Some(v) = req.step_prompt {
            agent.step_prompt = v;
        }
        agent.updated_at = Utc::now();
        Some(agent.clone())
    }

    pub async fn toggle_agent(&self, id: &str) -> Option<Agent> {
        let mut store = self.store.lock().await;
        let agent = store.agents.get_mut(id)?;
        agent.is_active = !agent.is_active;
        agent.updated_at = Utc::now();
        Some(agent.clone())
    }

    pub async fn delete_agent(&self, id: &str) -> bool {
        let mut store = self.store.lock().await;
        store.agents.remove(id).is_some()
    }

    // ── Pipelines ─────────────────────────────────────────────────────────

    pub async fn list_pipelines(&self) -> Vec<Pipeline> {
        let store = self.store.lock().await;
        let mut list: Vec<_> = store.pipelines.values().cloned().collect();
        list.sort_by(|a, b| a.created_at.cmp(&b.created_at));
        list
    }

    pub async fn get_pipeline(&self, id: &str) -> Option<Pipeline> {
        let store = self.store.lock().await;
        store.pipelines.get(id).cloned()
    }

    pub async fn create_pipeline(&self, req: CreatePipelineRequest) -> Result<Pipeline, String> {
        if req.name.trim().is_empty() {
            return Err("Pipeline name is required".to_string());
        }
        let mut store = self.store.lock().await;

        let fixer = store
            .agents
            .get(&req.fixer_agent_id)
            .ok_or_else(|| "Fixer agent not found".to_string())?
            .clone();

        let steps = req
            .steps
            .iter()
            .map(|s| {
                let a = store
                    .agents
                    .get(&s.agent_id)
                    .ok_or_else(|| format!("Agent {} not found", s.agent_id))?;
                Ok(PipelineStep {
                    id: format!("step-{}", s.order),
                    agent_id: s.agent_id.clone(),
                    agent: PipelineStepAgent {
                        id: a.id.clone(),
                        name: a.name.clone(),
                        model_provider: a.model_provider.clone(),
                        model_id: a.model_id.clone(),
                    },
                    order: s.order,
                    label: s.label.clone(),
                })
            })
            .collect::<Result<Vec<_>, String>>()?;

        let id = store.next_id("pipeline");
        let now = Utc::now();
        let pipeline = Pipeline {
            id: id.clone(),
            name: req.name,
            description: req.description.unwrap_or_default(),
            fixer_agent_id: fixer.id.clone(),
            fixer_agent: PipelineFixerAgent {
                id: fixer.id,
                name: fixer.name,
                model_provider: fixer.model_provider,
            },
            steps,
            is_default: false,
            is_active: true,
            created_at: now,
            updated_at: now,
        };
        store.pipelines.insert(id, pipeline.clone());
        Ok(pipeline)
    }

    pub async fn update_pipeline(&self, id: &str, req: UpdatePipelineRequest) -> Option<Pipeline> {
        let mut store = self.store.lock().await;
        let pipeline = store.pipelines.get_mut(id)?;
        if let Some(v) = req.name {
            pipeline.name = v;
        }
        if let Some(v) = req.description {
            pipeline.description = v;
        }
        if let Some(fixer_id) = req.fixer_agent_id {
            if let Some(a) = store.agents.get(&fixer_id).cloned() {
                let p = store.pipelines.get_mut(id).unwrap();
                p.fixer_agent_id = a.id.clone();
                p.fixer_agent = PipelineFixerAgent {
                    id: a.id,
                    name: a.name,
                    model_provider: a.model_provider,
                };
            }
        }
        if let Some(step_inputs) = req.steps {
            let steps = step_inputs
                .iter()
                .filter_map(|s| {
                    let a = store.agents.get(&s.agent_id)?;
                    Some(PipelineStep {
                        id: format!("step-{}", s.order),
                        agent_id: s.agent_id.clone(),
                        agent: PipelineStepAgent {
                            id: a.id.clone(),
                            name: a.name.clone(),
                            model_provider: a.model_provider.clone(),
                            model_id: a.model_id.clone(),
                        },
                        order: s.order,
                        label: s.label.clone(),
                    })
                })
                .collect();
            store.pipelines.get_mut(id).unwrap().steps = steps;
        }
        let p = store.pipelines.get_mut(id).unwrap();
        p.updated_at = Utc::now();
        Some(p.clone())
    }

    pub async fn set_default_pipeline(&self, id: &str) -> Option<Pipeline> {
        let mut store = self.store.lock().await;
        if !store.pipelines.contains_key(id) {
            return None;
        }
        let now = Utc::now();
        for p in store.pipelines.values_mut() {
            p.is_default = p.id == id;
            p.updated_at = now;
        }
        store.pipelines.get(id).cloned()
    }

    pub async fn delete_pipeline(&self, id: &str) -> bool {
        let mut store = self.store.lock().await;
        store.pipelines.remove(id).is_some()
    }

    // ── Projects ──────────────────────────────────────────────────────────

    pub async fn list_projects(&self) -> Vec<Project> {
        let store = self.store.lock().await;
        let mut list: Vec<_> = store.projects.values().cloned().collect();
        list.sort_by(|a, b| a.created_at.cmp(&b.created_at));
        list
    }

    pub async fn get_project(&self, id: &str) -> Option<Project> {
        let store = self.store.lock().await;
        store.projects.get(id).cloned()
    }

    pub async fn create_project(&self, req: CreateProjectRequest) -> Result<Project, String> {
        if req.name.trim().is_empty() {
            return Err("Project name is required".to_string());
        }
        if req.path.trim().is_empty() {
            return Err("Project path is required".to_string());
        }
        let mut store = self.store.lock().await;
        let pipeline = store
            .pipelines
            .get(&req.pipeline_id)
            .ok_or_else(|| "Pipeline not found".to_string())?
            .clone();
        let id = store.next_id("project");
        let now = Utc::now();
        let project = Project {
            id: id.clone(),
            name: req.name,
            path: req.path,
            test_command: req.test_command.unwrap_or_default(),
            pipeline_id: pipeline.id.clone(),
            pipeline: ProjectPipeline {
                id: pipeline.id,
                name: pipeline.name,
            },
            created_at: now,
            updated_at: now,
        };
        store.projects.insert(id, project.clone());
        Ok(project)
    }

    pub async fn update_project(&self, id: &str, req: UpdateProjectRequest) -> Option<Project> {
        let mut store = self.store.lock().await;
        if let Some(pipeline_id) = &req.pipeline_id {
            if let Some(p) = store.pipelines.get(pipeline_id).cloned() {
                let proj = store.projects.get_mut(id)?;
                proj.pipeline_id = p.id.clone();
                proj.pipeline = ProjectPipeline {
                    id: p.id,
                    name: p.name,
                };
            }
        }
        let proj = store.projects.get_mut(id)?;
        if let Some(v) = req.name {
            proj.name = v;
        }
        if let Some(v) = req.path {
            proj.path = v;
        }
        if let Some(v) = req.test_command {
            proj.test_command = v;
        }
        proj.updated_at = Utc::now();
        Some(proj.clone())
    }

    pub async fn delete_project(&self, id: &str) -> bool {
        let mut store = self.store.lock().await;
        store.projects.remove(id).is_some()
    }

    // ── Tasks ─────────────────────────────────────────────────────────────

    pub async fn list_tasks(&self, project_id: &str) -> Vec<Task> {
        let store = self.store.lock().await;
        let mut tasks: Vec<_> = store
            .tasks
            .values()
            .filter(|t| t.project_id == project_id)
            .cloned()
            .collect();
        tasks.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        tasks
    }

    pub async fn get_task(&self, id: &str) -> Option<Task> {
        let store = self.store.lock().await;
        store.tasks.get(id).cloned()
    }

    pub async fn create_task(&self, project_id: &str, req: CreateTaskRequest) -> Option<Task> {
        let mut store = self.store.lock().await;
        let project = store.projects.get(project_id)?.clone();
        let pipeline = store.pipelines.get(&project.pipeline_id)?.clone();
        let now = Utc::now();
        let id = store.next_id("task");

        let fixer_agent_data = store.agents.get(&pipeline.fixer_agent_id).cloned();
        let fixer_snapshot = fixer_agent_data
            .map(|a| AgentSnapshot {
                id: a.id,
                name: a.name,
                model_provider: a.model_provider,
                model_id: a.model_id,
                system_prompt: a.system_prompt,
                step_prompt: a.step_prompt,
            })
            .unwrap_or_else(|| AgentSnapshot {
                id: pipeline.fixer_agent_id.clone(),
                name: pipeline.fixer_agent.name.clone(),
                model_provider: pipeline.fixer_agent.model_provider.clone(),
                model_id: String::new(),
                system_prompt: String::new(),
                step_prompt: String::new(),
            });

        let steps = pipeline
            .steps
            .iter()
            .map(|s| {
                let agent_data = store.agents.get(&s.agent_id);
                let agent_snap = agent_data
                    .map(|a| AgentSnapshot {
                        id: a.id.clone(),
                        name: a.name.clone(),
                        model_provider: a.model_provider.clone(),
                        model_id: a.model_id.clone(),
                        system_prompt: a.system_prompt.clone(),
                        step_prompt: a.step_prompt.clone(),
                    })
                    .unwrap_or_else(|| AgentSnapshot {
                        id: s.agent_id.clone(),
                        name: s.agent.name.clone(),
                        model_provider: s.agent.model_provider.clone(),
                        model_id: s.agent.model_id.clone(),
                        system_prompt: String::new(),
                        step_prompt: String::new(),
                    });
                StepSnapshot {
                    id: s.id.clone(),
                    agent_id: s.agent_id.clone(),
                    agent: agent_snap,
                    order: s.order,
                    label: s.label.clone(),
                }
            })
            .collect();

        let task = Task {
            id: id.clone(),
            project_id: project_id.to_string(),
            prompt: req.prompt,
            status: TaskStatus::Pending,
            current_retry: 0,
            max_retries: req.max_retries,
            pipeline_snapshot: PipelineSnapshot {
                id: pipeline.id,
                name: pipeline.name,
                fixer_agent: fixer_snapshot,
                steps,
            },
            step_outputs: BTreeMap::new(),
            created_at: now,
            updated_at: now,
            completed_at: None,
        };

        store.tasks.insert(id.clone(), task.clone());
        store.runs.insert(id, vec![]);
        drop(store);

        self.publish_task_status(&task);
        Some(task)
    }

    pub async fn cancel_task(&self, id: &str) -> Option<Task> {
        let current = self.get_task(id).await?;
        if current.status.is_terminal() {
            return Some(current);
        }

        let task = self
            .set_task_status(id, TaskStatus::Cancelled, Some(Utc::now()))
            .await?;
        self.signal_cancel(id).await;
        Some(task)
    }

    pub async fn retry_task(&self, id: &str) -> Option<Task> {
        let task = {
            let mut store = self.store.lock().await;
            let task = store.tasks.get_mut(id)?;
            task.status = TaskStatus::Pending;
            task.completed_at = None;
            task.current_retry = (task.current_retry + 1).min(task.max_retries);
            task.updated_at = Utc::now();
            task.clone()
        };

        self.publish_task_status(&task);
        Some(task)
    }

    pub async fn list_runs(&self, task_id: &str) -> Option<Vec<ExecutionRun>> {
        let store = self.store.lock().await;
        store.runs.get(task_id).cloned()
    }

    pub async fn update_task_status(&self, id: &str, status: TaskStatus) {
        let _ = self.set_task_status(id, status, None).await;
    }

    pub async fn set_task_completed(&self, id: &str, completed_at: Option<chrono::DateTime<Utc>>) {
        let mut store = self.store.lock().await;
        if let Some(task) = store.tasks.get_mut(id) {
            task.completed_at = completed_at;
            task.updated_at = Utc::now();
        }
    }

    pub async fn execute_task(&self, task_id: &str) -> anyhow::Result<()> {
        let cancel_rx = self.register_cancel_handle(task_id).await;
        let task = self
            .get_task(task_id)
            .await
            .ok_or_else(|| anyhow::anyhow!("Task not found"))?;

        if task.status.is_terminal() {
            self.clear_cancel_handle(task_id).await;
            return Ok(());
        }

        let project = self
            .get_project(&task.project_id)
            .await
            .ok_or_else(|| anyhow::anyhow!("Project not found"))?;

        let mut task = task;
        task.status = TaskStatus::Running;
        task.updated_at = Utc::now();
        {
            let mut store = self.store.lock().await;
            if let Some(existing) = store.tasks.get_mut(task_id) {
                existing.status = TaskStatus::Running;
                existing.updated_at = task.updated_at;
            }
        }
        self.publish_task_status(&task);

        let mut run_index = 1u32;
        let mut step_outputs: BTreeMap<String, String> = task.step_outputs.clone();
        let mut previous_output = String::new();

        let mut steps = task.pipeline_snapshot.steps.clone();
        steps.sort_by(|a, b| a.order.cmp(&b.order));

        for step in steps {
            if *cancel_rx.borrow() {
                let _ = self
                    .set_task_status(task_id, TaskStatus::Cancelled, Some(Utc::now()))
                    .await;
                self.clear_cancel_handle(task_id).await;
                return Ok(());
            }

            let prompt =
                self.build_step_prompt(&task, &project, &step, &step_outputs, &previous_output);
            self.publish_task_event_step_start(task_id, step.order, &step.agent.name, &step.label);

            let run = self
                .new_run(
                    task_id,
                    Some(step.id.clone()),
                    Some(step.agent.id.clone()),
                    &step.agent.name,
                    RunPhase::Step,
                    run_index,
                    &prompt,
                )
                .await;

            let result = match self
                .run_model_prompt(
                    task_id,
                    &run.id,
                    &step.agent,
                    &prompt,
                    &project.path,
                    cancel_rx.clone(),
                )
                .await
            {
                Ok(result) => result,
                Err(err) => {
                    self.clear_cancel_handle(task_id).await;
                    return Err(err);
                }
            };

            let success = result.exit_code == 0;
            self.finish_run(
                task_id,
                &run.id,
                success,
                result.exit_code,
                result.stdout.clone(),
                result.stderr.clone(),
                None,
                Some(result.duration_ms),
            )
            .await;

            self.publish_task_event_step_done(task_id, step.order, &step.agent.name, success);

            if !success {
                let _ = self
                    .set_task_status(task_id, TaskStatus::Failed, Some(Utc::now()))
                    .await;
                self.clear_cancel_handle(task_id).await;
                return Err(anyhow::anyhow!("Step {} failed", step.order));
            }

            let combined = combine_output(&result.stdout, &result.stderr);
            step_outputs.insert(step.id.clone(), combined.clone());
            previous_output = combined;
            run_index += 1;
        }

        {
            let mut store = self.store.lock().await;
            if let Some(existing) = store.tasks.get_mut(task_id) {
                existing.step_outputs = step_outputs.clone();
                existing.updated_at = Utc::now();
            }
        }

        loop {
            if *cancel_rx.borrow() {
                let _ = self
                    .set_task_status(task_id, TaskStatus::Cancelled, Some(Utc::now()))
                    .await;
                self.clear_cancel_handle(task_id).await;
                return Ok(());
            }

            let verifying_run = self
                .new_run(
                    task_id,
                    None,
                    Some(task.pipeline_snapshot.fixer_agent.id.clone()),
                    &task.pipeline_snapshot.fixer_agent.name,
                    RunPhase::Verification,
                    run_index,
                    &project.test_command,
                )
                .await;

            let verify_result = match self
                .run_test_command(task_id, &verifying_run.id, &project, cancel_rx.clone())
                .await
            {
                Ok(result) => result,
                Err(err) => {
                    self.clear_cancel_handle(task_id).await;
                    return Err(err);
                }
            };

            let passed = verify_result.exit_code == 0;
            self.finish_run(
                task_id,
                &verifying_run.id,
                passed,
                verify_result.exit_code,
                verify_result.stdout.clone(),
                verify_result.stderr.clone(),
                None,
                Some(verify_result.duration_ms),
            )
            .await;

            if passed {
                let now = Utc::now();
                let _ = self
                    .set_task_status(task_id, TaskStatus::Done, Some(now))
                    .await;
                self.set_task_completed(task_id, Some(now)).await;
                self.clear_cancel_handle(task_id).await;
                return Ok(());
            }

            let current_retry = {
                let mut store = self.store.lock().await;
                let task = store.tasks.get_mut(task_id).ok_or_else(|| {
                    anyhow::anyhow!("Task {} disappeared during execution", task_id)
                })?;
                task.current_retry += 1;
                task.current_retry
            };

            if current_retry > task.max_retries {
                let now = Utc::now();
                let _ = self
                    .set_task_status(task_id, TaskStatus::Failed, Some(now))
                    .await;
                self.clear_cancel_handle(task_id).await;
                return Err(anyhow::anyhow!("Max retries exceeded"));
            }

            let _ = self
                .set_task_status(task_id, TaskStatus::Fixing, None)
                .await;
            run_index += 1;

            let fix_prompt = self.build_fix_prompt(
                &task,
                &project,
                &step_outputs,
                &verify_result.stdout,
                &previous_output,
                current_retry,
            );

            let fix_run = self
                .new_run(
                    task_id,
                    None,
                    Some(task.pipeline_snapshot.fixer_agent.id.clone()),
                    &task.pipeline_snapshot.fixer_agent.name,
                    RunPhase::Fix,
                    run_index,
                    &fix_prompt,
                )
                .await;

            let fix_result = match self
                .run_fix_prompt(
                    task_id,
                    &fix_run.id,
                    &task.pipeline_snapshot.fixer_agent,
                    &fix_prompt,
                    &project.path,
                    cancel_rx.clone(),
                )
                .await
            {
                Ok(result) => result,
                Err(err) => {
                    self.clear_cancel_handle(task_id).await;
                    return Err(err);
                }
            };

            let fix_success = fix_result.exit_code == 0;
            self.finish_run(
                task_id,
                &fix_run.id,
                fix_success,
                fix_result.exit_code,
                fix_result.stdout.clone(),
                fix_result.stderr.clone(),
                None,
                Some(fix_result.duration_ms),
            )
            .await;

            if !fix_success {
                let now = Utc::now();
                let _ = self
                    .set_task_status(task_id, TaskStatus::Failed, Some(now))
                    .await;
                self.clear_cancel_handle(task_id).await;
                return Err(anyhow::anyhow!("Fix run failed"));
            }

            previous_output = combine_output(&fix_result.stdout, &fix_result.stderr);
            run_index += 1;
        }
    }

    fn build_step_prompt(
        &self,
        task: &Task,
        project: &Project,
        step: &StepSnapshot,
        step_outputs: &BTreeMap<String, String>,
        previous_output: &str,
    ) -> String {
        let mut prompt = String::new();
        prompt.push_str(&format!("Project path: {}\n", project.path));
        prompt.push_str(&format!("Test command: {}\n", project.test_command));
        prompt.push_str(&format!("Task prompt: {}\n", task.prompt));
        prompt.push_str(&format!("Pipeline step: {}\n", step.label));
        if !previous_output.is_empty() {
            prompt.push_str(&format!("Previous output:\n{}\n", previous_output));
        }
        if !step_outputs.is_empty() {
            prompt.push_str("Step outputs:\n");
            for (step_id, output) in step_outputs {
                prompt.push_str(&format!("- {}:\n{}\n", step_id, output));
            }
        }
        prompt.push_str(&step.agent.step_prompt);
        prompt
    }

    fn build_fix_prompt(
        &self,
        task: &Task,
        project: &Project,
        step_outputs: &BTreeMap<String, String>,
        last_error: &str,
        previous_output: &str,
        current_retry: i16,
    ) -> String {
        let mut prompt = String::new();
        prompt.push_str(&format!("Project path: {}\n", project.path));
        prompt.push_str(&format!("Test command: {}\n", project.test_command));
        prompt.push_str(&format!("Task prompt: {}\n", task.prompt));
        prompt.push_str(&format!(
            "Current retry: {}/{}\n",
            current_retry, task.max_retries
        ));
        if !previous_output.is_empty() {
            prompt.push_str(&format!("Previous output:\n{}\n", previous_output));
        }
        prompt.push_str(&format!("Last error:\n{}\n", last_error));
        if !step_outputs.is_empty() {
            prompt.push_str("Step outputs:\n");
            for (step_id, output) in step_outputs {
                prompt.push_str(&format!("- {}:\n{}\n", step_id, output));
            }
        }
        prompt.push_str(&task.pipeline_snapshot.fixer_agent.step_prompt);
        prompt
    }

    fn publish_task_event_step_start(
        &self,
        task_id: &str,
        step_order: u32,
        agent_name: &str,
        label: &str,
    ) {
        self.event_bus.publish(TaskEvent::StepStart {
            task_id: task_id.to_string(),
            step_order,
            agent_name: agent_name.to_string(),
            label: label.to_string(),
        });
    }

    fn publish_task_event_step_done(
        &self,
        task_id: &str,
        step_order: u32,
        agent_name: &str,
        success: bool,
    ) {
        self.event_bus.publish(TaskEvent::StepDone {
            task_id: task_id.to_string(),
            step_order,
            agent_name: agent_name.to_string(),
            success,
        });
    }

    async fn new_run(
        &self,
        task_id: &str,
        step_id: Option<String>,
        agent_id: Option<String>,
        agent_name: &str,
        phase: RunPhase,
        run_index: u32,
        prompt_sent: &str,
    ) -> ExecutionRun {
        let run = ExecutionRun {
            id: {
                let mut store = self.store.lock().await;
                store.next_id("run")
            },
            task_id: task_id.to_string(),
            step_id,
            agent_id,
            agent_name: agent_name.to_string(),
            phase,
            run_index,
            prompt_sent: prompt_sent.to_string(),
            output: String::new(),
            error_message: String::new(),
            exit_code: None,
            success: None,
            duration_ms: None,
            started_at: Utc::now(),
            completed_at: None,
        };
        self.insert_run(task_id, run.clone()).await;
        run
    }

    async fn finish_run(
        &self,
        task_id: &str,
        run_id: &str,
        success: bool,
        exit_code: i32,
        stdout: String,
        stderr: String,
        error_message: Option<String>,
        duration_ms: Option<u64>,
    ) {
        let output = combine_output(&stdout, &stderr);
        let error_message = error_message.unwrap_or_else(|| {
            if success {
                String::new()
            } else if !stderr.trim().is_empty() {
                stderr.clone()
            } else {
                format!("exit code {}", exit_code)
            }
        });

        self.update_run(task_id, run_id, |run| {
            run.output = output.clone();
            run.error_message = error_message.clone();
            run.exit_code = Some(exit_code);
            run.success = Some(success);
            run.duration_ms = duration_ms;
            run.completed_at = Some(Utc::now());
        })
        .await;
    }

    async fn run_test_command(
        &self,
        task_id: &str,
        run_id: &str,
        project: &Project,
        cancel_rx: watch::Receiver<bool>,
    ) -> anyhow::Result<CommandResult> {
        self.run_shell_command(
            task_id,
            run_id,
            &project.test_command,
            &project.path,
            cancel_rx,
        )
        .await
    }

    async fn run_shell_command(
        &self,
        task_id: &str,
        run_id: &str,
        command: &str,
        working_dir: &str,
        cancel_rx: watch::Receiver<bool>,
    ) -> anyhow::Result<CommandResult> {
        let mut cancel_rx = cancel_rx;
        self.run_command(
            task_id,
            run_id,
            "sh",
            &["-c", command],
            working_dir,
            &mut cancel_rx,
        )
        .await
    }

    async fn run_fix_prompt(
        &self,
        task_id: &str,
        run_id: &str,
        agent: &AgentSnapshot,
        prompt: &str,
        working_dir: &str,
        cancel_rx: watch::Receiver<bool>,
    ) -> anyhow::Result<CommandResult> {
        let _ = agent;
        self.run_claude_command(task_id, run_id, prompt, working_dir, cancel_rx)
            .await
    }

    async fn run_model_prompt(
        &self,
        task_id: &str,
        run_id: &str,
        agent: &AgentSnapshot,
        prompt: &str,
        working_dir: &str,
        cancel_rx: watch::Receiver<bool>,
    ) -> anyhow::Result<CommandResult> {
        match &agent.model_provider {
            ModelProvider::Claude => {
                self.run_claude_command(task_id, run_id, prompt, working_dir, cancel_rx)
                    .await
            }
            ModelProvider::Gemini => Err(anyhow::anyhow!("Gemini runner not yet implemented")),
        }
    }

    async fn run_claude_command(
        &self,
        task_id: &str,
        run_id: &str,
        prompt: &str,
        working_dir: &str,
        mut cancel_rx: watch::Receiver<bool>,
    ) -> anyhow::Result<CommandResult> {
        self.run_command(
            task_id,
            run_id,
            "claude",
            &["-p", prompt],
            working_dir,
            &mut cancel_rx,
        )
        .await
    }

    async fn run_command(
        &self,
        task_id: &str,
        run_id: &str,
        program: &str,
        args: &[&str],
        working_dir: &str,
        cancel_rx: &mut watch::Receiver<bool>,
    ) -> anyhow::Result<CommandResult> {
        let started = Instant::now();
        let mut command = Command::new(program);
        command
            .args(args)
            .current_dir(working_dir)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        let mut child = command.spawn()?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| anyhow::anyhow!("Failed to open stdout"))?;
        let stderr = child
            .stderr
            .take()
            .ok_or_else(|| anyhow::anyhow!("Failed to open stderr"))?;

        let stdout_buf = Arc::new(Mutex::new(String::new()));
        let stderr_buf = Arc::new(Mutex::new(String::new()));

        let stdout_task = self.spawn_reader(
            task_id.to_string(),
            run_id.to_string(),
            stdout,
            LogType::Stdout,
            Arc::clone(&stdout_buf),
        );
        let stderr_task = self.spawn_reader(
            task_id.to_string(),
            run_id.to_string(),
            stderr,
            LogType::Stderr,
            Arc::clone(&stderr_buf),
        );

        let exit_status = tokio::select! {
            result = child.wait() => result?,
            changed = cancel_rx.changed() => {
                if changed.is_ok() {
                    let _ = child.kill().await;
                }
                let _ = child.wait().await;
                stdout_task.abort();
                stderr_task.abort();
                return Err(anyhow::anyhow!("task cancelled"));
            }
        };

        let _ = stdout_task.await;
        let _ = stderr_task.await;

        let stdout = stdout_buf.lock().await.clone();
        let stderr = stderr_buf.lock().await.clone();
        Ok(CommandResult {
            stdout,
            stderr,
            exit_code: exit_status.code().unwrap_or(-1),
            duration_ms: started.elapsed().as_millis() as u64,
        })
    }

    fn spawn_reader(
        &self,
        task_id: String,
        run_id: String,
        stream: impl tokio::io::AsyncRead + Unpin + Send + 'static,
        log_type: LogType,
        output_buf: Arc<Mutex<String>>,
    ) -> tokio::task::JoinHandle<()> {
        let state = self.clone();
        tokio::spawn(async move {
            let mut lines = BufReader::new(stream).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                {
                    let mut buf = output_buf.lock().await;
                    buf.push_str(&line);
                    buf.push('\n');
                }
                state
                    .insert_log(&task_id, &run_id, log_type.clone(), line)
                    .await;
            }
        })
    }
}

#[derive(Debug, Clone)]
struct CommandResult {
    stdout: String,
    stderr: String,
    exit_code: i32,
    duration_ms: u64,
}

fn combine_output(stdout: &str, stderr: &str) -> String {
    match (stdout.trim().is_empty(), stderr.trim().is_empty()) {
        (true, true) => String::new(),
        (false, true) => stdout.to_string(),
        (true, false) => stderr.to_string(),
        (false, false) => format!("{}\n{}", stdout.trim_end(), stderr.trim_end()),
    }
}
