use axum::{
    routing::get,
    Json,
    Router,
};
use serde_json::json;
use std::net::SocketAddr;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();

    let app = Router::new()
        .route("/api/health", get(health));

    let addr = SocketAddr::from(([127, 0, 0, 1], 3001));

    tracing::info!("listening on {}", addr);

    axum::Server::bind(&addr)
        .serve(app.into_make_service())
        .await
        .unwrap();
}

async fn health() -> Json<serde_json::Value> {
    Json(json!({"status": "ok"}))
}
