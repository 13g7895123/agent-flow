use axum::body::Body;
use axum::http::{Request, StatusCode};
use backend_rust::app_state::AppState;
use backend_rust::config::Config;
use backend_rust::health::{HealthProbe, HealthReport};
use backend_rust::build_app;
use tower::ServiceExt;

async fn body_to_json(response: axum::response::Response) -> serde_json::Value {
    let bytes = hyper::body::to_bytes(response.into_body()).await.unwrap();
    serde_json::from_slice(&bytes).unwrap()
}

fn test_config() -> Config {
    Config {
        port: 4242,
        run_seed: false,
        claude_timeout_secs: 123,
        default_max_retries: 7,
        task_concurrency: 4,
        allow_origins: vec![
            "http://localhost:3000".to_string(),
            "https://app.example.com".to_string(),
        ],
        gemini_api_key: Some("super-secret-key".to_string()),
    }
}

#[tokio::test]
async fn health_endpoint_returns_full_check_report() {
    let state = AppState::new(test_config()).with_health_probe(HealthProbe::mock(HealthReport::mock_ok()));
    let app = build_app(std::sync::Arc::new(state));

    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/health")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = body_to_json(response).await;
    assert_eq!(body["status"], "ok");
    assert_eq!(body["checks"]["backend"]["status"], "ok");
    assert_eq!(body["checks"]["database"]["status"], "ok");
    assert_eq!(body["checks"]["redis"]["status"], "ok");
    assert_eq!(body["checks"]["claude"]["status"], "ok");
    assert_eq!(body["checks"]["gemini"]["status"], "ok");
    assert_eq!(body["checks"]["gemini"]["configured"], true);
}

#[tokio::test]
async fn runtime_config_endpoint_masks_secrets() {
    let state = AppState::new(test_config()).with_health_probe(HealthProbe::mock(HealthReport::mock_ok()));
    let app = build_app(std::sync::Arc::new(state));

    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/runtime-config")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = body_to_json(response).await;
    assert_eq!(body["port"], 4242);
    assert_eq!(body["claudeTimeoutSecs"], 123);
    assert_eq!(body["defaultMaxRetries"], 7);
    assert_eq!(body["taskConcurrency"], 4);
    assert_eq!(
        body["allowOrigins"],
        serde_json::json!(["http://localhost:3000", "https://app.example.com"])
    );
    assert_eq!(body["geminiApiKeyConfigured"], true);
    assert!(body.get("geminiApiKey").is_none());
}

#[tokio::test]
async fn runtime_config_endpoint_reports_unconfigured_gemini_key() {
    let mut config = test_config();
    config.gemini_api_key = Some("   ".to_string());
    let state = AppState::new(config).with_health_probe(HealthProbe::mock(HealthReport::mock_ok()));
    let app = build_app(std::sync::Arc::new(state));

    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/runtime-config")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    let body = body_to_json(response).await;
    assert_eq!(body["geminiApiKeyConfigured"], false);
}
