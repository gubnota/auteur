mod catalogue;
use project_core::Result;
use rusqlite::Connection as Db;
use serde_json::json;
use std::path::Path;
use studio_contracts::*;
pub struct SettingsStore {
    db: Db,
}
impl SettingsStore {
    pub fn open(path: &Path) -> Result<Self> {
        std::fs::create_dir_all(path.parent().ok_or("Missing parent")?)?;
        let db = Db::open(path)?;
        db.execute_batch("PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS settings(id INTEGER PRIMARY KEY,json TEXT NOT NULL); CREATE TABLE IF NOT EXISTS recent(path TEXT PRIMARY KEY,name TEXT NOT NULL,opened TEXT NOT NULL);")?;
        Ok(Self { db })
    }
    pub fn read(&self) -> Result<AppSettings> {
        let raw = self
            .db
            .query_row("SELECT json FROM settings WHERE id=1", [], |r| {
                r.get::<_, String>(0)
            });
        match raw {
            Ok(s) => {
                let mut settings: AppSettings = serde_json::from_str(&s)?;
                // Retain vault references and historic receipts; retired destinations cannot execute.
                for connection in &mut settings.connections {
                    if connection.kind == "runninghub" {
                        connection.kind = "retired".into();
                    }
                }
                Ok(settings)
            }
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(AppSettings {
                theme: "light".into(),
                queue_height: 180.,
                storage: json!({}),
                ..Default::default()
            }),
            Err(e) => Err(e.into()),
        }
    }
    pub fn save(&self, s: &AppSettings) -> Result<()> {
        let mut ids = std::collections::HashSet::new();
        for c in &s.connections {
            uuid::Uuid::parse_str(&c.id)?;
            if !ids.insert(&c.id) || !(1..=8).contains(&c.concurrency) || c.name.trim().is_empty() {
                return Err("Invalid connection".into());
            }
            if ![
                "comfyui",
                "retired",
                "relay",
                "google",
                "fal",
                "custom-api",
                "deepseek",
                "openrouter",
            ]
            .contains(&c.kind.as_str())
            {
                return Err("Unknown connection type".into());
            }
            if c.hosting.as_deref().is_some_and(|h| {
                ![
                    "local-mac",
                    "linux",
                    "orbstack",
                    "runpod",
                    "ssh",
                    "colab",
                    "kaggle",
                ]
                .contains(&h)
                    || c.kind != "relay"
            }) {
                return Err("Hosting requires a supported private relay connection".into());
            }
            let url = reqwest::Url::parse(&c.url)?;
            if !url.username().is_empty()
                || url.password().is_some()
                || url.query().is_some()
                || url.fragment().is_some()
            {
                return Err(
                    "Connection URL must not contain credentials, query parameters or fragments"
                        .into(),
                );
            }
            if url.scheme() != "https"
                && !(c.kind == "comfyui" && url.scheme() == "http")
                && !(c.kind == "relay"
                    && url.scheme() == "http"
                    && matches!(url.host_str(), Some("localhost" | "127.0.0.1")))
            {
                return Err(
                    "API connections require HTTPS; local ComfyUI and loopback relay may use HTTP"
                        .into(),
                );
            }
            let known = match c.kind.as_str() {
                "google" => Some("generativelanguage.googleapis.com"),
                "deepseek" => Some("api.deepseek.com"),
                "openrouter" => Some("openrouter.ai"),
                _ => None,
            };
            if known.is_some_and(|h| url.host_str() != Some(h)) {
                return Err("Provider endpoint does not match its official host".into());
            }
        }
        if !s.queue_height.is_finite() || !(96.0..=2000.0).contains(&s.queue_height) {
            return Err("Invalid queue size".into());
        }
        if s.storage.get("manifestUrl").is_some() {
            return Err("Transfer URLs must stay in Keychain".into());
        }
        // Dismissal is monotonic: a stale Settings form must not restore finished jobs.
        let mut saved = s.clone();
        saved
            .dismissed_queue_job_ids
            .extend(self.read()?.dismissed_queue_job_ids);
        let mut seen = std::collections::HashSet::new();
        saved
            .dismissed_queue_job_ids
            .retain(|id| seen.insert(id.clone()));
        self.db.execute(
            "INSERT INTO settings VALUES(1,?1) ON CONFLICT(id) DO UPDATE SET json=excluded.json",
            [serde_json::to_string(&saved)?],
        )?;
        Ok(())
    }
    pub fn diagnostic(&self, level: &str, message: &str) -> Result<()> {
        let mut s = self.read()?;
        let d = Diagnostic {
            id: project_core::id(),
            level: level.into(),
            message: message.into(),
            created_at: chrono::Utc::now().to_rfc3339(),
        };
        s.logs.push(d.clone());
        s.notifications.push(d);
        for list in [&mut s.logs, &mut s.notifications] {
            if list.len() > 300 {
                list.drain(..list.len() - 300);
            }
        }
        self.save(&s)
    }
    pub fn recent(&self, path: &str, name: &str) -> Result<()> {
        self.db.execute("INSERT INTO recent VALUES(?1,?2,?3) ON CONFLICT(path) DO UPDATE SET name=excluded.name,opened=excluded.opened",rusqlite::params![path,name,chrono::Utc::now().to_rfc3339()])?;
        Ok(())
    }
    pub fn list_recent(&self) -> Result<serde_json::Value> {
        let mut st = self
            .db
            .prepare("SELECT path,name,opened FROM recent ORDER BY opened DESC LIMIT 12")?;
        let rows=st.query_map([],|r|Ok(json!({"path":r.get::<_,String>(0)?,"name":r.get::<_,String>(1)?,"opened":r.get::<_,String>(2)?})))?;
        Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?.into())
    }
    pub fn remove_recent(&self, path: &str) -> Result<()> {
        self.db
            .execute("DELETE FROM recent WHERE path=?1", [path])?;
        Ok(())
    }
    pub fn clear_recent(&self) -> Result<()> {
        self.db.execute("DELETE FROM recent", [])?;
        Ok(())
    }
}

#[cfg(test)]
mod settings_tests {
    use super::*;

    fn connection(kind: &str, hosting: Option<&str>) -> studio_contracts::Connection {
        studio_contracts::Connection {
            id: project_core::id(),
            name: "Test connection".into(),
            kind: kind.into(),
            url: "http://127.0.0.1:8789".into(),
            credential_ref: None,
            deployment_id: Some("local-mps-0".into()),
            api_family: None,
            concurrency: 1,
            hosting: hosting.map(str::to_owned),
        }
    }

    #[test]
    fn supported_relay_hosting_survives_save_and_reopening() {
        let root = std::env::temp_dir().join(format!("mymovie-hosting-{}", project_core::id()));
        let path = root.join("settings.sqlite");
        let expected;
        {
            let store = SettingsStore::open(&path).unwrap();
            let mut settings = store.read().unwrap();
            settings.connections = [
                "local-mac",
                "linux",
                "orbstack",
                "runpod",
                "ssh",
                "colab",
                "kaggle",
            ]
            .into_iter()
            .map(|hosting| connection("relay", Some(hosting)))
            .collect();
            expected = serde_json::to_value(&settings.connections).unwrap();
            store.save(&settings).unwrap();
        }
        let store = SettingsStore::open(&path).unwrap();
        assert_eq!(
            serde_json::to_value(store.read().unwrap().connections).unwrap(),
            expected
        );
        drop(store);
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn invalid_hosting_does_not_replace_saved_connections() {
        let root = std::env::temp_dir().join(format!("mymovie-hosting-{}", project_core::id()));
        let store = SettingsStore::open(&root.join("settings.sqlite")).unwrap();
        let mut original = store.read().unwrap();
        original.connections = vec![connection("relay", Some("colab"))];
        let expected = serde_json::to_value(&original.connections).unwrap();
        store.save(&original).unwrap();
        for (kind, hosting) in [
            ("relay", "unsupported"),
            ("comfyui", "local-mac"),
            ("comfyui", "colab"),
        ] {
            let mut settings = original.clone();
            settings.connections = vec![connection(kind, Some(hosting))];
            assert!(store.save(&settings).is_err(), "{kind}: {hosting}");
            assert_eq!(
                serde_json::to_value(store.read().unwrap().connections).unwrap(),
                expected
            );
        }
        drop(store);
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn connections_without_hosting_remain_supported() {
        let root = std::env::temp_dir().join(format!("mymovie-hosting-{}", project_core::id()));
        let store = SettingsStore::open(&root.join("settings.sqlite")).unwrap();
        let mut settings = store.read().unwrap();
        settings.connections = vec![connection("relay", None), connection("comfyui", None)];
        store.save(&settings).unwrap();
        assert_eq!(store.read().unwrap().connections.len(), 2);
        drop(store);
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn dismissed_failures_survive_stale_settings_and_reopening() {
        let root = std::env::temp_dir().join(format!("mymovie-settings-{}", project_core::id()));
        let path = root.join("settings.sqlite");
        {
            let store = SettingsStore::open(&path).unwrap();
            let stale = store.read().unwrap();
            let mut cleared = stale.clone();
            cleared.dismissed_queue_job_ids = vec![
                "failed-job".into(),
                "completed-job".into(),
                "canceled-job".into(),
            ];
            store.save(&cleared).unwrap();
            store.save(&stale).unwrap();
            store.diagnostic("info", "Background refresh").unwrap();
        }
        let store = SettingsStore::open(&path).unwrap();
        assert_eq!(
            store.read().unwrap().dismissed_queue_job_ids,
            ["failed-job", "completed-job", "canceled-job"]
        );
        drop(store);
        std::fs::remove_dir_all(root).unwrap();
    }
}
