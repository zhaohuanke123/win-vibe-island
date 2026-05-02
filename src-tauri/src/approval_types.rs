/// Approval type constants for permission requests
///
/// These types determine how the frontend renders the approval panel:
/// - PERMISSION: Standard tool approval with risk level and action description
/// - QUESTION: AskUserQuestion tool with interactive questions
/// - PLAN: ExitPlanMode tool with plan content to review
pub mod approval_types {
    pub const PERMISSION: &str = "permission";
    pub const QUESTION: &str = "question";
    pub const PLAN: &str = "plan";

    /// Determine approval type from tool name
    pub fn from_tool_name(tool_name: &str) -> &'static str {
        match tool_name {
            "AskUserQuestion" => QUESTION,
            "ExitPlanMode" => PLAN,
            _ => PERMISSION,
        }
    }
}