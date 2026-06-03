pub mod api;
pub mod app_state;
pub mod config;
pub mod domain;
pub mod error;
pub mod repo;

#[cfg(test)]
mod tests {
    #[test]
    fn test_basic() {
        assert_eq!(2 + 2, 4);
    }

    #[test]
    fn test_placeholder() {
        // Placeholder for future domain/config/queue tests
        let val = true;
        assert!(val);
    }
}
