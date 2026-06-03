use std::net::SocketAddr;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();
    let config = backend_rust::config::Config::from_env();
    let state = backend_rust::build_state_with_workers().await;
    let app = backend_rust::build_app(state);

    let addr = SocketAddr::from(([127, 0, 0, 1], config.port));

    tracing::info!("listening on {}", addr);

    axum::Server::bind(&addr)
        .serve(app.into_make_service())
        .await
        .unwrap();
}
