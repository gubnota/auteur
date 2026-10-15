use crate::{Args, initialization, post};
use project_core::Result;
use serde_json::{Value, json};
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt};
pub async fn serve(args: Args, client: reqwest::Client, relay: String, token: String) {
    if initialization::private_execution(&args).is_err() {
        return;
    }
    let url = format!("{relay}/v1/agent/nodes/{}/console", args.node_id);
    loop {
        if let Ok(v) = post(&client, &url, &token, json!({})).await {
            if v["state"] == "running" {
                // A process restart cannot restore the old PTY. Never replay its shell commands.
                let _ = post(&client, &url, &token, json!({"id":v["id"],"state":"closed","output":"\r\nAgent restarted; open a new terminal session.\r\n","sequence":v["sequence"].as_u64().unwrap_or(0)+1})).await;
            } else if v["state"] == "opening" {
                let id = v["id"].clone();
                if session(&args, &client, &url, &token, v).await.is_err() {
                    let _ = post(&client, &url, &token, json!({"id":id,"state":"closed"})).await;
                }
            }
        }
        tokio::time::sleep(Duration::from_secs(1)).await;
    }
}
async fn session(
    args: &Args,
    client: &reqwest::Client,
    url: &str,
    token: &str,
    mut v: Value,
) -> Result<()> {
    let id = v["id"].clone();
    let mut command = initialization::clean_command(args);
    command
        .arg("-u")
        .arg("-c")
        .arg(include_str!("../../../deploy/runner/mymovie_console.py"))
        .current_dir(args.comfy_root.as_ref().ok_or("Comfy root required")?)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null());
    // Opening an arbitrary shell invalidates readiness until inventory and initialization reverify it.
    let _ = std::fs::remove_file(args.data.join("attestation.json"));
    let cache = args.cache.clone().unwrap_or(args.data.join("cache"));
    project_core::atomic_json(
        &cache.join("restart-required.json"),
        &json!({"required":true}),
    )?;
    let mut child = command.spawn()?;
    let mut stdin = child.stdin.take().ok_or("Console input unavailable")?;
    let mut lines =
        tokio::io::BufReader::new(child.stdout.take().ok_or("Console output unavailable")?).lines();
    let mut ack = v["acked"].as_u64().unwrap_or(0);
    let mut sequence = v["sequence"].as_u64().unwrap_or(0);
    let mut pending = String::new();
    let mut tick = tokio::time::interval(Duration::from_millis(400));
    let deadline = tokio::time::Instant::now() + Duration::from_secs(1800);
    loop {
        tokio::select! {
            line=lines.next_line(), if pending.len()<55000 =>match line? {
                Some(line)=>{ let row:Value=serde_json::from_str(&line)?; let text=row["output"].as_str().unwrap_or("");
                    pending.push_str(text);
                }
                None=>break,
            },
            _=tick.tick()=>{
                if tokio::time::Instant::now()>deadline { break; }
                let next=sequence+u64::from(!pending.is_empty());
                if let Ok(reply)=post(client,url,token,json!({"id":id,"state":"running","acked":ack,"sequence":next,"output":pending})).await {
                    sequence=next; pending.clear(); v=reply;
                    if v["id"]!=id || v["state"]=="closed" { break; }
                    if let Some(commands)=v["commands"].as_array() { for cmd in commands {
                        let seq=cmd["seq"].as_u64().unwrap_or(0); if seq<=ack {continue;}
                        stdin.write_all(format!("{}\n",cmd).as_bytes()).await?;
                        ack=seq;
                    } }
                }
            }
        }
    }
    drop(stdin);
    if tokio::time::timeout(Duration::from_secs(2), child.wait())
        .await
        .is_err()
    {
        let _ = child.kill().await;
    }
    let _ = post(
        client,
        url,
        token,
        json!({"id":id,"state":"closed","acked":ack,"sequence":sequence+1,"output":pending}),
    )
    .await;
    Ok(())
}
