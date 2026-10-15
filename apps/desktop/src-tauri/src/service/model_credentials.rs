//! Only explicit credential actions or authenticated model installation access the vault.
use super::*;
const REFERENCE: &str = "model:huggingface";
const FLAG: &str = "huggingFaceTokenConfigured";
fn valid(token: &str) -> bool {
    token.starts_with("hf_")
        && (8..1024).contains(&token.len())
        && !token.chars().any(char::is_whitespace)
}
#[tauri::command]
pub async fn model_token_status(state: S<'_>) -> Reply<bool> {
    Ok(state
        .inner
        .lock()
        .await
        .settings
        .read()
        .map_err(err)?
        .storage[FLAG]
        == true)
}
#[tauri::command]
pub async fn save_model_token(state: S<'_>, token: String) -> Reply<()> {
    if !valid(&token) {
        return Err("Enter a valid Hugging Face access token (hf_…)".into());
    }
    let i = state.inner.lock().await;
    keyring::Entry::new("net.fenki.mymovie-studio", REFERENCE)
        .map_err(err)?
        .set_password(&token)
        .map_err(err)?;
    credential_cache()
        .lock()
        .unwrap()
        .insert(REFERENCE.into(), token);
    let mut settings = i.settings.read().map_err(err)?;
    settings.storage[FLAG] = json!(true);
    i.settings.save(&settings).map_err(err)
}
#[tauri::command]
pub async fn remove_model_token(state: S<'_>) -> Reply<()> {
    let i = state.inner.lock().await;
    match keyring::Entry::new("net.fenki.mymovie-studio", REFERENCE)
        .map_err(err)?
        .delete_credential()
    {
        Ok(()) | Err(keyring::Error::NoEntry) => (),
        Err(e) => return Err(err(e)),
    }
    credential_cache().lock().unwrap().remove(REFERENCE);
    let mut settings = i.settings.read().map_err(err)?;
    settings.storage[FLAG] = json!(false);
    i.settings.save(&settings).map_err(err)
}
pub(super) fn for_install(settings: &AppSettings, workflow: &Workflow) -> Result<Option<String>> {
    let hf = workflow.requirements.artifacts.iter().any(|model| {
        reqwest::Url::parse(&model.source)
            .ok()
            .is_some_and(|u| u.host_str() == Some("huggingface.co"))
    });
    if !hf || settings.storage[FLAG] != true {
        return Ok(None);
    }
    if let Some(token) = credential_cache().lock().unwrap().get(REFERENCE).cloned() {
        return Ok(Some(token));
    }
    let token = keyring::Entry::new("net.fenki.mymovie-studio", REFERENCE)?.get_password()?;
    if !valid(&token) {
        return Err("Replace the Hugging Face token in Settings > Model downloads".into());
    }
    credential_cache()
        .lock()
        .unwrap()
        .insert(REFERENCE.into(), token.clone());
    Ok(Some(token))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn validates_without_accepting_whitespace_or_placeholders() {
        assert!(valid("hf_fixture_token"));
        for value in ["", "placeholder", "hf_short\n", "hf_ abcde"] {
            assert!(!valid(value));
        }
    }
}
