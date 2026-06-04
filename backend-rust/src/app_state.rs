use crate::config::Config;
use crate::domain::{
    Agent, AgentSnapshot, CreateAgentRequest, CreatePipelineRequest, CreateProjectRequest,
    CreateTaskRequest, ExecutionRun, ModelProvider, Pipeline, PipelineFixerAgent, PipelineSnapshot,
    PipelineStep, PipelineStepAgent, Project, ProjectPipeline, StepSnapshot, Task, TaskStatus,
    UpdateAgentRequest, UpdatePipelineRequest, UpdateProjectRequest,
};
use crate::events::{TaskEvent, TaskEventBus};
use chrono::Utc;
use std::collections::{BTreeMap, HashMap};
use std::sync::Arc;
use tokio::sync::Mutex;

#[derive(Clone)]
pub struct AppState {
    pub config: Config,
    pub store: Arc<Mutex<Store>>,
    pub queue: Arc<Option<crate::queue::TaskQueue>>,
    event_bus: Arc<TaskEventBus>,
}

struct Store {
    agents: HashMap<String, Agent>,
    pipelines: HashMap<String, Pipeline>,
    projects: HashMap<String, Project>,
    tasks: HashMap<String, Task>,
    runs: HashMap<String, Vec<ExecutionRun>>,
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
        let task = {
            let mut store = self.store.lock().await;
            let task = store.tasks.get_mut(id)?;
            let now = Utc::now();
            task.status = TaskStatus::Cancelled;
            task.completed_at = Some(now);
            task.updated_at = now;
            task.clone()
        };

        self.publish_task_status(&task);
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
        let mut store = self.store.lock().await;
        if let Some(task) = store.tasks.get_mut(id) {
            task.status = status;
            task.updated_at = Utc::now();
        }
    }

    pub async fn set_task_completed(&self, id: &str, completed_at: Option<chrono::DateTime<Utc>>) {
        let mut store = self.store.lock().await;
        if let Some(task) = store.tasks.get_mut(id) {
            task.completed_at = completed_at;
            task.updated_at = Utc::now();
        }
    }
}
