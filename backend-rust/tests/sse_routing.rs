// W3-TC SSE 整合測試（in-process，不需綁定 port）
// 驗證：
//  1. router 可成功建構（證明 /api/projects/:id 與 /api/projects/:id/tasks 路由不衝突）
//  2. 終態任務連 stream 時，SSE body 立即包含 status 與 done 事件

use axum::body::Body;
use axum::http::{Request, StatusCode};
use backend_rust::domain::{CreatePipelineRequest, CreateProjectRequest, CreateTaskRequest};
use backend_rust::{build_app, build_state};
use tower::ServiceExt; // for `oneshot`

async fn body_to_string<B>(body: B) -> String
where
    B: hyper::body::HttpBody,
    B::Error: std::fmt::Debug,
{
    let bytes = hyper::body::to_bytes(body).await.unwrap();
    String::from_utf8(bytes.to_vec()).unwrap()
}

#[tokio::test]
async fn router_builds_without_route_conflict() {
    // build_app 內部呼叫 router()；若路由衝突會在此 panic。
    let app = build_app(build_state());

    let resp = app
        .oneshot(
            Request::builder()
                .uri("/api/health")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(resp.status(), StatusCode::OK);
}

#[tokio::test]
async fn project_tasks_route_and_project_detail_route_coexist() {
    let state = build_state();

    // GET /api/projects/:id（專案詳情）
    let app = build_app(state.clone());
    let detail = app
        .oneshot(
            Request::builder()
                .uri("/api/projects/project-1")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(detail.status(), StatusCode::OK);

    // GET /api/projects/:id/tasks（專案任務列表）
    let app = build_app(state.clone());
    let tasks = app
        .oneshot(
            Request::builder()
                .uri("/api/projects/project-1/tasks")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(tasks.status(), StatusCode::OK);
}

#[tokio::test]
async fn terminal_task_stream_emits_status_and_done() {
    let state = build_state();

    // 建立 task
    let app = build_app(state.clone());
    let created = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/projects/project-1/tasks")
                .header("content-type", "application/json")
                .body(Body::from(r#"{"prompt":"hello","maxRetries":1}"#))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(created.status(), StatusCode::CREATED);
    let created_json: serde_json::Value =
        serde_json::from_str(&body_to_string(created.into_body()).await).unwrap();
    let task_id = created_json["id"].as_str().unwrap().to_string();

    // cancel 進入終態
    let app = build_app(state.clone());
    let cancelled = app
        .oneshot(
            Request::builder()
                .method("PUT")
                .uri(format!("/api/tasks/{task_id}/cancel"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(cancelled.status(), StatusCode::OK);

    // 連 stream：終態任務應立即回傳 status + done 後結束
    let app = build_app(state.clone());
    let stream = app
        .oneshot(
            Request::builder()
                .uri(format!("/api/tasks/{task_id}/stream"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(stream.status(), StatusCode::OK);
    let ct = stream
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    assert!(
        ct.contains("text/event-stream"),
        "content-type should be SSE, got: {ct}"
    );

    let body = body_to_string(stream.into_body()).await;
    // axum 0.5 SSE 欄位格式為 `event:<name>`（冒號後無空白）
    assert!(
        body.contains("event:status"),
        "missing status event: {body}"
    );
    assert!(body.contains("event:done"), "missing done event: {body}");
    assert!(
        body.contains("\"status\":\"cancelled\""),
        "done payload should reflect cancelled status: {body}"
    );
}

#[tokio::test]
async fn runs_and_run_logs_endpoints_return_execution_history() {
    let state = build_state();
    let pipeline = state
        .create_pipeline(CreatePipelineRequest {
            name: "Verification Only".to_string(),
            description: Some("Generate historical logs".to_string()),
            fixer_agent_id: "agent-2".to_string(),
            steps: vec![],
        })
        .await
        .expect("pipeline should be created");

    let project = state
        .create_project(CreateProjectRequest {
            name: "History Project".to_string(),
            path: "/tmp".to_string(),
            test_command: Some("sh -c 'echo worker started; echo warning: retrying 1>&2'".to_string()),
            pipeline_id: pipeline.id,
        })
        .await
        .expect("project should be created");

    let task = state
        .create_task(
            &project.id,
            CreateTaskRequest {
                prompt: "Track execution history".to_string(),
                max_retries: 0,
            },
        )
        .await
        .expect("task should be created");

    state
        .execute_task(&task.id)
        .await
        .expect("task should execute");

    let app = build_app(state.clone());
    let runs_resp = app
        .oneshot(
            Request::builder()
                .uri(format!("/api/tasks/{}/runs", task.id))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(runs_resp.status(), StatusCode::OK);
    let runs_json: serde_json::Value =
        serde_json::from_str(&body_to_string(runs_resp.into_body()).await).unwrap();
    let runs = runs_json.as_array().expect("runs should be an array");
    assert_eq!(runs.len(), 1);
    let run_id = runs[0]["id"].as_str().expect("run should have id").to_string();
    assert_eq!(runs[0]["taskId"], task.id);
    assert_eq!(runs[0]["phase"], "verification");

    let app = build_app(state.clone());
    let logs_resp = app
        .oneshot(
            Request::builder()
                .uri(format!("/api/runs/{run_id}/logs"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(logs_resp.status(), StatusCode::OK);
    let logs_json: serde_json::Value =
        serde_json::from_str(&body_to_string(logs_resp.into_body()).await).unwrap();
    let logs = logs_json.as_array().expect("logs should be an array");
    assert_eq!(logs.len(), 2);
    assert_eq!(logs[0]["executionRunId"], run_id);
    assert_eq!(logs[0]["logType"], "stdout");
    assert_eq!(logs[0]["content"], "worker started");
    assert_eq!(logs[1]["logType"], "stderr");
}
