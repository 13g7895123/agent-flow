use crate::domain::{LogType, TaskStatus};
use axum::response::sse::Event;
use tokio::sync::broadcast;

#[derive(Clone, Debug)]
pub struct TaskEventBus {
    sender: broadcast::Sender<TaskEvent>,
}

impl TaskEventBus {
    pub fn new(capacity: usize) -> Self {
        let (sender, _) = broadcast::channel(capacity);
        Self { sender }
    }

    pub fn publish(&self, event: TaskEvent) {
        let _ = self.sender.send(event);
    }

    pub fn subscribe(&self) -> broadcast::Receiver<TaskEvent> {
        self.sender.subscribe()
    }
}

#[derive(Clone, Debug)]
pub enum TaskEvent {
    StepStart {
        task_id: String,
        step_order: u32,
        agent_name: String,
        label: String,
    },
    Log {
        task_id: String,
        log_type: LogType,
        content: String,
        sequence: u64,
    },
    StepDone {
        task_id: String,
        step_order: u32,
        agent_name: String,
        success: bool,
    },
    Status {
        task_id: String,
        status: TaskStatus,
        current_retry: i16,
    },
    Done {
        task_id: String,
        status: TaskStatus,
    },
}

impl TaskEvent {
    pub fn task_id(&self) -> &str {
        match self {
            TaskEvent::StepStart { task_id, .. }
            | TaskEvent::Log { task_id, .. }
            | TaskEvent::StepDone { task_id, .. }
            | TaskEvent::Status { task_id, .. }
            | TaskEvent::Done { task_id, .. } => task_id,
        }
    }

    pub fn event_name(&self) -> &'static str {
        match self {
            TaskEvent::StepStart { .. } => "step_start",
            TaskEvent::Log { .. } => "log",
            TaskEvent::StepDone { .. } => "step_done",
            TaskEvent::Status { .. } => "status",
            TaskEvent::Done { .. } => "done",
        }
    }

    pub fn to_sse(&self) -> String {
        let payload = self.payload_json();
        format!("event: {}\ndata: {}\n\n", self.event_name(), payload)
    }

    pub fn to_event(&self) -> Event {
        Event::default()
            .event(self.event_name())
            .data(self.payload_json())
    }

    fn payload_json(&self) -> String {
        serde_json::to_string(&self.payload()).unwrap_or_else(|_| "{}".to_string())
    }

    fn payload(&self) -> serde_json::Value {
        match self {
            TaskEvent::StepStart {
                task_id,
                step_order,
                agent_name,
                label,
            } => serde_json::json!({
                "taskId": task_id,
                "stepOrder": step_order,
                "agentName": agent_name,
                "label": label,
            }),
            TaskEvent::Log {
                task_id,
                log_type,
                content,
                sequence,
            } => serde_json::json!({
                "taskId": task_id,
                "type": log_type,
                "content": content,
                "sequence": sequence,
            }),
            TaskEvent::StepDone {
                task_id,
                step_order,
                agent_name,
                success,
            } => serde_json::json!({
                "taskId": task_id,
                "stepOrder": step_order,
                "agentName": agent_name,
                "success": success,
            }),
            TaskEvent::Status {
                task_id,
                status,
                current_retry,
            } => serde_json::json!({
                "taskId": task_id,
                "status": status,
                "currentRetry": current_retry,
            }),
            TaskEvent::Done { task_id, status } => serde_json::json!({
                "taskId": task_id,
                "status": status,
            }),
        }
    }

    pub fn status(task_id: String, status: TaskStatus, current_retry: i16) -> Self {
        Self::Status {
            task_id,
            status,
            current_retry,
        }
    }

    pub fn done(task_id: String, status: TaskStatus) -> Self {
        Self::Done { task_id, status }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn status_event_serializes_to_camel_case_sse() {
        let event = TaskEvent::status("task-1".to_string(), TaskStatus::Running, 2);
        let sse = event.to_sse();

        assert!(sse.starts_with("event: status\n"));
        assert!(sse.ends_with("\n\n"));
        assert!(sse.contains("\"taskId\":\"task-1\""));
        assert!(sse.contains("\"status\":\"running\""));
        assert!(sse.contains("\"currentRetry\":2"));
    }

    #[test]
    fn done_event_has_done_name_and_status() {
        let event = TaskEvent::done("task-9".to_string(), TaskStatus::Done);
        assert_eq!(event.event_name(), "done");
        assert_eq!(event.task_id(), "task-9");
        assert!(event.to_sse().contains("\"status\":\"done\""));
    }

    #[tokio::test]
    async fn bus_delivers_published_events_to_subscribers() {
        let bus = TaskEventBus::new(8);
        let mut rx = bus.subscribe();

        bus.publish(TaskEvent::status(
            "task-1".to_string(),
            TaskStatus::Pending,
            0,
        ));

        let received = rx.recv().await.expect("event delivered");
        assert_eq!(received.task_id(), "task-1");
        assert_eq!(received.event_name(), "status");
    }
}
