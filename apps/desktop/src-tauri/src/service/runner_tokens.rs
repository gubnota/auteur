use super::Reply;
use serde::{Deserialize, Serialize};

#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct RunnerTokens {
    #[serde(rename = "MYMOVIE_AGENT_TOKEN")]
    agent: String,
    #[serde(rename = "MYMOVIE_DESKTOP_TOKEN")]
    desktop: String,
}

impl RunnerTokens {
    fn validate(&self) -> Reply<()> {
        if [&self.agent, &self.desktop]
            .iter()
            .any(|v| !(24..=512).contains(&v.len()) || !v.bytes().all(|b| b.is_ascii_graphic()))
        {
            return Err("Use 24–512 printable characters without spaces for each token".into());
        }
        if self.agent == self.desktop {
            return Err("Agent and desktop tokens must be different".into());
        }
        Ok(())
    }
}

fn entry() -> Reply<keyring::Entry> {
    keyring::Entry::new("net.fenki.mymovie-studio", "runner-token-pair")
        .map_err(|_| "Unable to access the system token vault".into())
}

#[tauri::command]
pub fn get_runner_tokens() -> Reply<RunnerTokens> {
    let raw = match entry()?.get_password() {
        Ok(raw) => raw,
        Err(keyring::Error::NoEntry) => {
            include_str!("../../../../../deploy/node-auth.defaults.json").into()
        }
        Err(_) => return Err("Unable to read node tokens from the system vault".into()),
    };
    let tokens: RunnerTokens = serde_json::from_str(&raw)
        .map_err(|_| "Invalid node token configuration in the system vault")?;
    tokens.validate()?;
    Ok(tokens)
}

#[tauri::command]
pub fn save_runner_tokens(tokens: RunnerTokens) -> Reply<()> {
    tokens.validate()?;
    // One vault record keeps the pair atomic; no token goes into settings/project JSON.
    let raw = serde_json::to_string(&tokens).map_err(|_| "Unable to encode node tokens")?;
    entry()?
        .set_password(&raw)
        .map_err(|_| "Unable to save node tokens in the system vault".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn validates_distinct_pairs_without_exposing_values() {
        let valid = RunnerTokens {
            agent: "a".repeat(32),
            desktop: "d".repeat(32),
        };
        assert!(valid.validate().is_ok());
        for value in [
            "short".into(),
            "a".repeat(32),
            format!("{}\n", "d".repeat(32)),
        ] {
            assert!(
                RunnerTokens {
                    desktop: value,
                    ..valid.clone()
                }
                .validate()
                .is_err()
            );
        }
        let defaults: RunnerTokens = serde_json::from_str(include_str!(
            "../../../../../deploy/node-auth.defaults.json"
        ))
        .unwrap();
        assert!(defaults.validate().is_ok());
    }
}
