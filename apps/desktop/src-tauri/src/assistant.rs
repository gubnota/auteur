use serde_json::{Value, json};

pub async fn request(kind: &str, key: &str, model: &str, text: &str) -> Result<Value, String> {
    if text.trim().is_empty()
        || text.len() > 32_768
        || model.is_empty()
        || model.len() > 160
        || !model
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"-._/".contains(&b))
        || model.contains("..")
    {
        return Err("Enter a valid model ID and up to 32 KiB of text".into());
    }
    // Fixed destinations prevent sending Keychain secrets to edited URLs or redirects.
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(std::time::Duration::from_secs(90))
        .build()
        .map_err(|_| "Assistant unavailable")?;
    let request = match kind {
        "google" if !model.contains('/') => client.post(format!("https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"))
            .header("x-goog-api-key", key).json(&json!({"contents":[{"role":"user","parts":[{"text":text}]}],"generationConfig":{"maxOutputTokens":2048}})),
        "deepseek" | "openrouter" => client.post(if kind == "deepseek" { "https://api.deepseek.com/chat/completions" } else { "https://openrouter.ai/api/v1/chat/completions" })
            .bearer_auth(key).json(&json!({"model":model,"messages":[{"role":"user","content":text}],"max_tokens":2048,"stream":false})),
        _ => return Err("This connection does not support text assistance".into()),
    };
    let mut response = request
        .send()
        .await
        .map_err(|_| "Assistant connection failed")?;
    if !response.status().is_success() {
        return Err(format!(
            "Assistant returned HTTP {}. Check key, model access and quota.",
            response.status().as_u16()
        ));
    }
    let mut bytes = vec![];
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "Assistant response interrupted")?
    {
        if bytes.len() + chunk.len() > 2 * 1024 * 1024 {
            return Err("Assistant response exceeds limit".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    let value: Value = serde_json::from_slice(&bytes).map_err(|_| "Invalid assistant response")?;
    let answer = extract(kind, &value)
        .ok_or("No text returned; the model may have declined this request")?;
    Ok(json!({"text":answer,"model":model,"provider":kind}))
}
fn extract(kind: &str, value: &Value) -> Option<String> {
    if kind == "google" {
        let parts = value["candidates"][0]["content"]["parts"].as_array()?;
        let text = parts
            .iter()
            .filter(|p| p["thought"] != true)
            .filter_map(|p| p["text"].as_str())
            .collect::<Vec<_>>()
            .join("\n");
        (!text.is_empty()).then_some(text)
    } else {
        value["choices"][0]["message"]["content"]
            .as_str()
            .filter(|s| !s.is_empty())
            .map(str::to_owned)
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn parses_provider_text_without_reasoning_or_credentials() {
        assert_eq!(
            extract(
                "google",
                &json!({"candidates":[{"content":{"parts":[{"text":"private reasoning","thought":true},{"text":"A quiet harbor"}]}}]})
            ),
            Some("A quiet harbor".into())
        );
        assert_eq!(
            extract(
                "deepseek",
                &json!({"choices":[{"message":{"reasoning_content":"private","content":"A storm"}}]})
            ),
            Some("A storm".into())
        );
        assert_eq!(extract("openrouter", &json!({"choices":[]})), None);
    }
}
