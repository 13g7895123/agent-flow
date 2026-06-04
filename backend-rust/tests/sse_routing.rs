// W3-TC SSE 整合測試（in-process，不需綁定 port）
// 驗證：
//  1. router 可成功建構（證明 /api/projects/:id 與 /api/projects/:id/tasks 路由不衝突）
//  2. 終態任務連 stream 時，SSE body 立即包含 status 與 done 事件

use axum::body::Body;
use axum::http::{Request, StatusCode};
use backend_rust::domain::{CreateTaskRequest, LogType, RunPhase};
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
    let task = state
        .create_task(
            "project-1",
            CreateTaskRequest {
                prompt: "Track execution history".to_string(),
                max_retries: 2,
            },
        )
        .await
        .expect("task should be created");

    let run = state
        .start_run(&task.id, Some("step-1".to_string()), RunPhase::Step)
        .await
        .expect("run should be created");

    state
        .append_run_log(&run.id, LogType::Stdout, "worker started".to_string())
        .await
        .expect("stdout log should be stored");
    state
        .append_run_log(&run.id, LogType::Stderr, "warning: retrying".to_string())
        .await
        .expect("stderr log should be stored");
    state
        .finish_run(
            &run.id,
            "worker started\nwarning: retrying".to_string(),
            0,
            None,
        )
        .await
        .expect("run should be updated");

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
    assert_eq!(runs[0]["id"], run.id);
    assert_eq!(runs[0]["taskId"], task.id);
    assert_eq!(runs[0]["phase"], "step");

    let app = build_app(state.clone());
    let logs_resp = app
        .oneshot(
            Request::builder()
                .uri(format!("/api/runs/{}/logs", run.id))
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
    assert_eq!(logs[0]["runId"], run.id);
    assert_eq!(logs[0]["type"], "stdout");
    assert_eq!(logs[0]["content"], "worker started");
    assert_eq!(logs[1]["type"], "stderr");
}
