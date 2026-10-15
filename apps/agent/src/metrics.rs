use crate::Args;
use serde_json::Value;
pub async fn sample(args: &Args) -> Value {
    let mut command = crate::initialization::clean_command(args);
    command
        .arg("-c")
        .arg(include_str!("../../../deploy/runner/mymovie_metrics.py"))
        .kill_on_drop(true);
    match tokio::time::timeout(std::time::Duration::from_secs(6), command.output()).await {
        Ok(Ok(output)) if output.status.success() && output.stdout.len() < 32768 => {
            serde_json::from_slice(&output.stdout).unwrap_or(Value::Null)
        }
        _ => Value::Null,
    }
}
