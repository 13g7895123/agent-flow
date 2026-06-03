//! Orchestrator 狀態機。
//!
//! 目前僅提供純函式的狀態轉移輔助（供 W3-TD 單元測試與 W4-TA 完整狀態機共用）。
//! 完整的 step/verification/fix 執行流程屬於 Wave 4（W4-TA），在此基礎上擴充。

use crate::domain::TaskStatus;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum StepOutcome {
    Success,
    Failure,
}

/// 單一 step 執行完畢後的狀態轉移：成功進入 verifying，失敗進入 fixing；
/// 已是終態（done/failed/cancelled）則維持不變。
pub fn advance_after_step_outcome(current: TaskStatus, outcome: StepOutcome) -> TaskStatus {
    match current {
        TaskStatus::Cancelled | TaskStatus::Done | TaskStatus::Failed => current,
        _ => match outcome {
            StepOutcome::Success => TaskStatus::Verifying,
            StepOutcome::Failure => TaskStatus::Fixing,
        },
    }
}

/// 驗證階段後的狀態轉移：通過則 done；未通過且仍有重試額度則 fixing；額度用盡則 failed。
pub fn advance_after_verification(
    current_retry: i16,
    max_retries: i16,
    passed: bool,
) -> TaskStatus {
    if passed {
        TaskStatus::Done
    } else if current_retry < max_retries {
        TaskStatus::Fixing
    } else {
        TaskStatus::Failed
    }
}

/// 是否為終態。
pub fn is_terminal(status: TaskStatus) -> bool {
    matches!(
        status,
        TaskStatus::Done | TaskStatus::Failed | TaskStatus::Cancelled
    )
}

#[cfg(test)]
mod tests {
    use super::{advance_after_step_outcome, advance_after_verification, is_terminal, StepOutcome};
    use crate::domain::TaskStatus;

    #[test]
    fn step_success_moves_to_verifying() {
        assert_eq!(
            advance_after_step_outcome(TaskStatus::Running, StepOutcome::Success),
            TaskStatus::Verifying
        );
    }

    #[test]
    fn step_failure_moves_to_fixing_when_not_terminal() {
        assert_eq!(
            advance_after_step_outcome(TaskStatus::Running, StepOutcome::Failure),
            TaskStatus::Fixing
        );
    }

    #[test]
    fn terminal_status_is_preserved_on_step_outcome() {
        assert_eq!(
            advance_after_step_outcome(TaskStatus::Cancelled, StepOutcome::Success),
            TaskStatus::Cancelled
        );
    }

    #[test]
    fn verification_success_moves_to_done() {
        assert_eq!(advance_after_verification(0, 3, true), TaskStatus::Done);
    }

    #[test]
    fn verification_failure_keeps_retrying_until_budget_is_exhausted() {
        assert_eq!(advance_after_verification(0, 3, false), TaskStatus::Fixing);
        assert_eq!(advance_after_verification(3, 3, false), TaskStatus::Failed);
    }

    #[test]
    fn terminal_status_detection_matches_expected_statuses() {
        assert!(is_terminal(TaskStatus::Done));
        assert!(is_terminal(TaskStatus::Failed));
        assert!(is_terminal(TaskStatus::Cancelled));
        assert!(!is_terminal(TaskStatus::Pending));
        assert!(!is_terminal(TaskStatus::Running));
    }
}
