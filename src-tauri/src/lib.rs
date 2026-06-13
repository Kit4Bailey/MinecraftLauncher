use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

mod launcher;

#[derive(Serialize, Deserialize, Clone)]
pub struct User {
    username: String,
    uuid: String,
    is_offline: bool,
    #[serde(default)]
    active_skin: Option<String>,
    #[serde(default)]
    skins: Vec<String>,
}

fn get_data_dir() -> PathBuf {
    let mut path = if let Ok(home) = std::env::var("HOME") {
        PathBuf::from(home)
    } else {
        std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
    };
    path.push(".riftlauncher");
    if !path.exists() {
        fs::create_dir_all(&path).unwrap();
    }
    path
}

#[tauri::command]
async fn add_offline_user(username: String) -> Result<User, String> {
    let mut data_dir = get_data_dir();
    data_dir.push("users.json");

    let mut users: Vec<User> = if data_dir.exists() {
        let content = fs::read_to_string(&data_dir).unwrap_or_else(|_| "[]".to_string());
        serde_json::from_str(&content).unwrap_or_else(|_| vec![])
    } else {
        vec![]
    };

    let new_user = User {
        username: username.clone(),
        uuid: format!("{:x}", md5::compute(username.as_bytes())),
        is_offline: true,
        active_skin: None,
        skins: vec![],
    };

    users.push(new_user.clone());

    let json = serde_json::to_string_pretty(&users).map_err(|e| e.to_string())?;
    fs::write(&data_dir, json).map_err(|e| e.to_string())?;

    Ok(new_user)
}

#[tauri::command]
async fn delete_user(username: String) -> Result<(), String> {
    let mut data_dir = get_data_dir();
    data_dir.push("users.json");
    
    if !data_dir.exists() {
        return Ok(());
    }
    
    let content = fs::read_to_string(&data_dir).map_err(|e| e.to_string())?;
    let mut users: Vec<User> = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    
    users.retain(|u| u.username != username);
    
    let json = serde_json::to_string_pretty(&users).map_err(|e| e.to_string())?;
    fs::write(&data_dir, json).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn add_user_skin(username: String, skin_name: String, base64_data: String) -> Result<String, String> {
    let mut data_dir = get_data_dir();
    data_dir.push("skins");
    data_dir.push(&username);
    if !data_dir.exists() {
        fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
    }
    
    let safe_name = skin_name.replace("/", "_").replace("\\", "_");
    let file_path = data_dir.join(format!("{}.png", safe_name));
    
    // Decode base64_data (skip prefix like "data:image/png;base64," if present)
    let b64 = if base64_data.contains(",") {
        base64_data.split(',').nth(1).unwrap_or(&base64_data)
    } else {
        &base64_data
    };
    
    use base64::{Engine as _, engine::general_purpose};
    let bytes = general_purpose::STANDARD.decode(b64).map_err(|e| e.to_string())?;
    fs::write(&file_path, bytes).map_err(|e| e.to_string())?;
    
    // Update users.json
    let mut users_file = get_data_dir();
    users_file.push("users.json");
    if users_file.exists() {
        let content = fs::read_to_string(&users_file).map_err(|e| e.to_string())?;
        let mut users: Vec<User> = serde_json::from_str(&content).map_err(|e| e.to_string())?;
        if let Some(user) = users.iter_mut().find(|u| u.username == username) {
            if !user.skins.contains(&safe_name) {
                user.skins.push(safe_name.clone());
            }
            user.active_skin = Some(safe_name.clone());
        }
        let json = serde_json::to_string_pretty(&users).map_err(|e| e.to_string())?;
        fs::write(&users_file, json).map_err(|e| e.to_string())?;
    }
    
    Ok(safe_name)
}

#[tauri::command]
async fn select_user_skin(username: String, skin_name: String) -> Result<(), String> {
    let mut users_file = get_data_dir();
    users_file.push("users.json");
    if !users_file.exists() {
        return Err("No users found".to_string());
    }
    
    let content = fs::read_to_string(&users_file).map_err(|e| e.to_string())?;
    let mut users: Vec<User> = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    if let Some(user) = users.iter_mut().find(|u| u.username == username) {
        user.active_skin = Some(skin_name);
    }
    
    let json = serde_json::to_string_pretty(&users).map_err(|e| e.to_string())?;
    fs::write(&users_file, json).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn delete_user_skin(username: String, skin_name: String) -> Result<(), String> {
    let mut users_file = get_data_dir();
    users_file.push("users.json");
    if !users_file.exists() {
        return Err("No users found".to_string());
    }
    
    let content = fs::read_to_string(&users_file).map_err(|e| e.to_string())?;
    let mut users: Vec<User> = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    
    if let Some(user) = users.iter_mut().find(|u| u.username == username) {
        user.skins.retain(|s| s != &skin_name);
        if user.active_skin.as_ref() == Some(&skin_name) {
            user.active_skin = None;
        }
    }
    
    let json = serde_json::to_string_pretty(&users).map_err(|e| e.to_string())?;
    fs::write(&users_file, json).map_err(|e| e.to_string())?;
    
    // Delete file
    let mut path = get_data_dir();
    path.push("skins");
    path.push(&username);
    path.push(format!("{}.png", skin_name));
    if path.exists() {
        let _ = fs::remove_file(path);
    }
    
    Ok(())
}

#[tauri::command]
async fn get_skin_base64(username: String, skin_name: String) -> Result<String, String> {
    let mut path = get_data_dir();
    path.push("skins");
    path.push(&username);
    path.push(format!("{}.png", skin_name));
    
    if !path.exists() {
        return Err("Skin not found".to_string());
    }
    
    let bytes = fs::read(&path).map_err(|e| e.to_string())?;
    use base64::{Engine as _, engine::general_purpose};
    let b64 = general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:image/png;base64,{}", b64))
}

#[tauri::command]
async fn get_users() -> Result<Vec<User>, String> {
    let mut data_dir = get_data_dir();
    data_dir.push("users.json");

    if data_dir.exists() {
        let content = fs::read_to_string(&data_dir).map_err(|e| e.to_string())?;
        let users: Vec<User> = serde_json::from_str(&content).map_err(|e| e.to_string())?;
        Ok(users)
    } else {
        Ok(vec![])
    }
}

#[derive(Serialize, Deserialize, Clone)]
pub struct McVersion {
    id: String,
    #[serde(rename = "type")]
    version_type: String,
}

#[tauri::command]
async fn get_minecraft_versions() -> Result<Vec<McVersion>, String> {
    let client = reqwest::Client::new();
    let manifest_url = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";
    let manifest_res = client.get(manifest_url).send().await.map_err(|e| e.to_string())?;
    
    #[derive(Deserialize)]
    struct Manifest {
        versions: Vec<McVersion>,
    }
    
    let manifest: Manifest = manifest_res.json().await.map_err(|e| e.to_string())?;
    Ok(manifest.versions)
}

#[derive(Serialize, Deserialize, Clone)]
pub struct Instance {
    pub name: String,
    pub version: String,
    #[serde(default)]
    pub settings: LauncherSettings,
    #[serde(default)]
    pub mod_loader: Option<String>,
    #[serde(default)]
    pub mod_loader_version: Option<String>,
}

#[tauri::command]
async fn get_instances() -> Result<Vec<Instance>, String> {
    let mut data_dir = get_data_dir();
    data_dir.push("instances.json");

    let mut instances: Vec<Instance> = if data_dir.exists() {
        let content = fs::read_to_string(&data_dir).map_err(|e| e.to_string())?;
        serde_json::from_str(&content).map_err(|e| e.to_string())?
    } else {
        vec![]
    };

    if instances.is_empty() {
        let default_instance = Instance {
            name: "Default Vanilla".to_string(),
            version: "1.21".to_string(),
            settings: LauncherSettings::default(),
            mod_loader: None,
            mod_loader_version: None,
        };
        instances.push(default_instance);
        let json = serde_json::to_string_pretty(&instances).map_err(|e| e.to_string())?;
        fs::write(&data_dir, json).map_err(|e| e.to_string())?;
    }

    Ok(instances)
}

#[tauri::command]
async fn create_instance(name: String, version: String) -> Result<Instance, String> {
    let mut data_dir = get_data_dir();
    data_dir.push("instances.json");

    let mut instances: Vec<Instance> = if data_dir.exists() {
        let content = fs::read_to_string(&data_dir).unwrap_or_else(|_| "[]".to_string());
        serde_json::from_str(&content).unwrap_or_else(|_| vec![])
    } else {
        vec![]
    };

    if instances.iter().any(|i| i.name == name) {
        return Err("An instance with this name already exists".to_string());
    }

    let new_instance = Instance {
        name: name.clone(),
        version,
        settings: LauncherSettings::default(),
        mod_loader: None,
        mod_loader_version: None,
    };

    instances.push(new_instance.clone());

    let json = serde_json::to_string_pretty(&instances).map_err(|e| e.to_string())?;
    fs::write(&data_dir, json).map_err(|e| e.to_string())?;

    // Create the instance folder
    let mut folder = get_data_dir();
    folder.push("instances");
    folder.push(&name);
    fs::create_dir_all(folder).map_err(|e| e.to_string())?;

    Ok(new_instance)
}

#[tauri::command]
async fn delete_instance(name: String) -> Result<(), String> {
    let mut data_dir = get_data_dir();
    data_dir.push("instances.json");

    if !data_dir.exists() {
        return Ok(());
    }

    let content = fs::read_to_string(&data_dir).map_err(|e| e.to_string())?;
    let mut instances: Vec<Instance> = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    
    instances.retain(|i| i.name != name);

    let json = serde_json::to_string_pretty(&instances).map_err(|e| e.to_string())?;
    fs::write(&data_dir, json).map_err(|e| e.to_string())?;

    // Remove the folder
    let mut folder = get_data_dir();
    folder.push("instances");
    folder.push(&name);
    if folder.exists() {
        fs::remove_dir_all(folder).map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
async fn launch_instance(app: tauri::AppHandle, username: String, uuid: String, instance_name: String) -> Result<String, String> {
    let mut data_dir = get_data_dir();
    data_dir.push("instances.json");

    let instances: Vec<Instance> = if data_dir.exists() {
        let content = fs::read_to_string(&data_dir).unwrap_or_else(|_| "[]".to_string());
        serde_json::from_str(&content).unwrap_or_else(|_| vec![])
    } else {
        vec![]
    };

    let instance = instances.iter().find(|i| i.name == instance_name)
        .ok_or_else(|| format!("Instance '{}' not found", instance_name))?;

    launcher::download_and_launch(
        app, 
        &instance.version, 
        &username, 
        &uuid, 
        &instance.name, 
        &instance.settings,
        instance.mod_loader.clone(),
        instance.mod_loader_version.clone()
    ).await
}

#[tauri::command]
async fn stop_game(state: tauri::State<'_, launcher::LauncherState>) -> Result<(), String> {
    state.aborted.store(true, std::sync::atomic::Ordering::Relaxed);
    if let Some(tx) = state.kill_tx.lock().unwrap().take() {
        let _ = tx.send(());
    }
    Ok(())
}

#[derive(Serialize, Deserialize, Clone)]
pub struct LauncherSettings {
    pub max_ram: u32,
    pub min_ram: u32,
    pub use_gamemode: bool,
    pub use_mangohud: bool,
    pub jvm_args: String,
    #[serde(default = "default_theme")]
    pub active_theme: String,
}

fn default_theme() -> String {
    "OLED Black".to_string()
}

impl Default for LauncherSettings {
    fn default() -> Self {
        Self {
            max_ram: 4,
            min_ram: 2,
            use_gamemode: false,
            use_mangohud: false,
            jvm_args: "-XX:+UnlockExperimentalVMOptions -XX:+UseG1GC -XX:G1NewSizePercent=20 -XX:G1ReservePercent=20 -XX:MaxGCPauseMillis=50 -XX:G1HeapRegionSize=32M".to_string(),
            active_theme: "OLED Black".to_string(),
        }
    }
}

#[tauri::command]
async fn get_settings() -> Result<LauncherSettings, String> {
    let mut data_dir = get_data_dir();
    data_dir.push("settings.json");

    if data_dir.exists() {
        let content = fs::read_to_string(&data_dir).map_err(|e| e.to_string())?;
        let settings: LauncherSettings = serde_json::from_str(&content).map_err(|e| e.to_string())?;
        Ok(settings)
    } else {
        let default_settings = LauncherSettings::default();
        let json = serde_json::to_string_pretty(&default_settings).map_err(|e| e.to_string())?;
        fs::write(&data_dir, json).map_err(|e| e.to_string())?;
        Ok(default_settings)
    }
}

#[tauri::command]
async fn save_settings(settings: LauncherSettings) -> Result<(), String> {
    let mut data_dir = get_data_dir();
    data_dir.push("settings.json");

    let json = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    fs::write(&data_dir, json).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn save_instance_settings(instance_name: String, settings: LauncherSettings) -> Result<(), String> {
    let mut data_dir = get_data_dir();
    data_dir.push("instances.json");

    if !data_dir.exists() {
        return Err("No instances found".to_string());
    }

    let content = fs::read_to_string(&data_dir).map_err(|e| e.to_string())?;
    let mut instances: Vec<Instance> = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    
    if let Some(inst) = instances.iter_mut().find(|i| i.name == instance_name) {
        inst.settings = settings;
    } else {
        return Err(format!("Instance '{}' not found", instance_name));
    }

    let json = serde_json::to_string_pretty(&instances).map_err(|e| e.to_string())?;
    fs::write(&data_dir, json).map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Serialize, Deserialize, Clone)]
pub struct Theme {
    pub name: String,
    pub variables: HashMap<String, String>,
    #[serde(default)]
    pub is_custom: bool,
}

fn get_themes_dir() -> PathBuf {
    let mut path = get_data_dir();
    path.push("themes");
    if !path.exists() {
        let _ = fs::create_dir_all(&path);
        // Seed a sample custom theme template file
        let template_theme = serde_json::json!({
            "name": "Custom Theme Example",
            "variables": {
                "--bg-color": "#0a0512",
                "--panel-bg": "#120b24",
                "--panel-border": "#281b47",
                "--text-main": "#f3e8ff",
                "--text-muted": "#a78bfa",
                "--accent": "#c084fc",
                "--accent-hover": "#a855f7"
            }
        });
        let _ = fs::write(
            path.join("custom_example.json"),
            serde_json::to_string_pretty(&template_theme).unwrap_or_default()
        );
    }
    path
}

#[tauri::command]
async fn get_themes() -> Result<Vec<Theme>, String> {
    let themes_dir = get_themes_dir();
    let mut themes = vec![
        Theme {
            name: "OLED Black".to_string(),
            is_custom: false,
            variables: vec![
                ("--bg-color", "#000000"),
                ("--panel-bg", "#090a0c"),
                ("--panel-border", "#16181c"),
                ("--text-main", "#ffffff"),
                ("--text-muted", "#888888"),
                ("--accent", "#2563eb"),
                ("--accent-hover", "#1d4ed8"),
            ].into_iter().map(|(k, v)| (k.to_string(), v.to_string())).collect(),
        },
        Theme {
            name: "Slate Dark".to_string(),
            is_custom: false,
            variables: vec![
                ("--bg-color", "#0f172a"),
                ("--panel-bg", "#1e293b"),
                ("--panel-border", "#334155"),
                ("--text-main", "#f8fafc"),
                ("--text-muted", "#94a3b8"),
                ("--accent", "#3b82f6"),
                ("--accent-hover", "#2563eb"),
            ].into_iter().map(|(k, v)| (k.to_string(), v.to_string())).collect(),
        },
        Theme {
            name: "Nordic Frost".to_string(),
            is_custom: false,
            variables: vec![
                ("--bg-color", "#2e3440"),
                ("--panel-bg", "#242933"),
                ("--panel-border", "#3b4252"),
                ("--text-main", "#eceff4"),
                ("--text-muted", "#d8dee9"),
                ("--accent", "#88c0d0"),
                ("--accent-hover", "#81a1c1"),
            ].into_iter().map(|(k, v)| (k.to_string(), v.to_string())).collect(),
        },
        Theme {
            name: "Emerald Green".to_string(),
            is_custom: false,
            variables: vec![
                ("--bg-color", "#022c22"),
                ("--panel-bg", "#064e3b"),
                ("--panel-border", "#0f766e"),
                ("--text-main", "#f0fdf4"),
                ("--text-muted", "#86efac"),
                ("--accent", "#10b981"),
                ("--accent-hover", "#059669"),
            ].into_iter().map(|(k, v)| (k.to_string(), v.to_string())).collect(),
        },
        Theme {
            name: "Rose Pine".to_string(),
            is_custom: false,
            variables: vec![
                ("--bg-color", "#191724"),
                ("--panel-bg", "#26233a"),
                ("--panel-border", "#403d52"),
                ("--text-main", "#e0def4"),
                ("--text-muted", "#908caa"),
                ("--accent", "#ebbcba"),
                ("--accent-hover", "#eb6f92"),
            ].into_iter().map(|(k, v)| (k.to_string(), v.to_string())).collect(),
        },
    ];

    if themes_dir.exists() {
        if let Ok(entries) = fs::read_dir(themes_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("json") {
                    if let Ok(content) = fs::read_to_string(&path) {
                        if let Ok(mut custom_theme) = serde_json::from_str::<Theme>(&content) {
                            custom_theme.is_custom = true;
                            // Ensure the name doesn't conflict with built-in names
                            if !themes.iter().any(|t| t.name == custom_theme.name) {
                                themes.push(custom_theme);
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(themes)
}

#[tauri::command]
async fn open_themes_folder() -> Result<(), String> {
    let themes_dir = get_themes_dir();
    
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(themes_dir)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(themes_dir)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(themes_dir)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    
    Ok(())
}

#[tauri::command]
async fn open_instance_folder(instance_name: String) -> Result<(), String> {
    let mut path = get_data_dir();
    path.push("instances");
    path.push(&instance_name);
    if !path.exists() {
        fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    }
    
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    
    Ok(())
}

#[tauri::command]
async fn get_installed_mods(instance_name: String) -> Result<Vec<String>, String> {
    let mut path = get_data_dir();
    path.push("instances");
    path.push(&instance_name);
    path.push("mods");
    if !path.exists() {
        return Ok(vec![]);
    }
    let mut mods = vec![];
    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("jar") {
                if let Some(filename) = path.file_name().and_then(|s| s.to_str()) {
                    mods.push(filename.to_string());
                }
            }
        }
    }
    Ok(mods)
}

#[tauri::command]
async fn delete_mod(instance_name: String, mod_filename: String) -> Result<(), String> {
    let mut path = get_data_dir();
    path.push("instances");
    path.push(&instance_name);
    path.push("mods");
    path.push(&mod_filename);
    if path.exists() {
        fs::remove_file(path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn upload_mod(instance_name: String, filename: String, base64_data: String) -> Result<(), String> {
    let mut path = get_data_dir();
    path.push("instances");
    path.push(&instance_name);
    path.push("mods");
    if !path.exists() {
        fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    }
    path.push(&filename);
    
    let b64 = if base64_data.contains(",") {
        base64_data.split(',').nth(1).unwrap_or(&base64_data)
    } else {
        &base64_data
    };
    
    use base64::{Engine as _, engine::general_purpose};
    let bytes = general_purpose::STANDARD.decode(b64).map_err(|e| e.to_string())?;
    fs::write(path, bytes).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn download_mod(instance_name: String, filename: String, url: String) -> Result<(), String> {
    let client = reqwest::Client::new();
    let res = client.get(&url).send().await.map_err(|e| format!("Failed to download mod: {}", e))?;
    let bytes = res.bytes().await.map_err(|e| format!("Failed to read mod bytes: {}", e))?;
    
    let mut path = get_data_dir();
    path.push("instances");
    path.push(&instance_name);
    path.push("mods");
    if !path.exists() {
        fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    }
    path.push(&filename);
    fs::write(path, bytes).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn save_instance_loader(
    instance_name: String, 
    mod_loader: Option<String>, 
    mod_loader_version: Option<String>
) -> Result<(), String> {
    let mut data_dir = get_data_dir();
    data_dir.push("instances.json");
    if !data_dir.exists() {
        return Err("No instances found".to_string());
    }
    let content = fs::read_to_string(&data_dir).map_err(|e| e.to_string())?;
    let mut instances: Vec<Instance> = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    if let Some(inst) = instances.iter_mut().find(|i| i.name == instance_name) {
        inst.mod_loader = mod_loader;
        inst.mod_loader_version = mod_loader_version;
    } else {
        return Err(format!("Instance '{}' not found", instance_name));
    }
    let json = serde_json::to_string_pretty(&instances).map_err(|e| e.to_string())?;
    fs::write(&data_dir, json).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn get_loader_versions(loader: String, mc_version: String) -> Result<Vec<String>, String> {
    let client = reqwest::Client::new();
    if loader == "fabric" {
        let url = "https://meta.fabricmc.net/v2/versions/loader";
        let res = client.get(url).send().await.map_err(|e| e.to_string())?;
        let data: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
        let mut versions = vec![];
        if let Some(arr) = data.as_array() {
            for item in arr {
                if let Some(ver) = item["version"].as_str() {
                    versions.push(ver.to_string());
                }
            }
        }
        Ok(versions)
    } else if loader == "quilt" {
        let url = "https://meta.quiltmc.org/v2/versions/loader";
        let res = client.get(url).send().await.map_err(|e| e.to_string())?;
        let data: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
        let mut versions = vec![];
        if let Some(arr) = data.as_array() {
            for item in arr {
                if let Some(ver) = item["version"].as_str() {
                    versions.push(ver.to_string());
                }
            }
        }
        Ok(versions)
    } else if loader == "forge" {
        let url = "https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml";
        let res = client.get(url).send().await.map_err(|e| e.to_string())?;
        let xml_text = res.text().await.map_err(|e| e.to_string())?;
        
        let mut raw_versions = Vec::new();
        let mut input = xml_text.as_str();
        while let Some(start_idx) = input.find("<version>") {
            let after_start = &input[start_idx + 9..];
            if let Some(end_idx) = after_start.find("</version>") {
                let version = &after_start[..end_idx];
                raw_versions.push(version.to_string());
                input = &after_start[end_idx + 10..];
            } else {
                break;
            }
        }
        
        let mut versions = vec![];
        let prefix = format!("{}-", mc_version);
        for ver in raw_versions {
            if ver.starts_with(&prefix) {
                versions.push(ver);
            }
        }
        versions.sort_by(|a, b| b.cmp(a));
        Ok(versions)
    } else if loader == "neoforge" {
        let url = "https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml";
        let res = client.get(url).send().await.map_err(|e| e.to_string())?;
        let xml_text = res.text().await.map_err(|e| e.to_string())?;
        
        let mut raw_versions = Vec::new();
        let mut input = xml_text.as_str();
        while let Some(start_idx) = input.find("<version>") {
            let after_start = &input[start_idx + 9..];
            if let Some(end_idx) = after_start.find("</version>") {
                let version = &after_start[..end_idx];
                raw_versions.push(version.to_string());
                input = &after_start[end_idx + 10..];
            } else {
                break;
            }
        }
        
        let mut versions = vec![];
        let parts: Vec<&str> = mc_version.split('.').collect();
        let prefix1 = format!("{}-", mc_version);
        let prefix2 = if parts.len() >= 2 {
            let major = parts[1];
            let minor = if parts.len() >= 3 { parts[2] } else { "0" };
            format!("{}.{}.", major, minor)
        } else {
            "invalid_prefix_dummy".to_string()
        };
        let prefix3 = if parts.len() >= 2 {
            format!("{}.", parts[1])
        } else {
            "invalid_prefix_dummy".to_string()
        };
        
        for ver in raw_versions {
            let is_match = ver.starts_with(&prefix1) || 
                           ver.starts_with(&prefix2) || 
                           (parts.len() == 2 && ver.starts_with(&prefix3));
            if is_match {
                versions.push(ver);
            }
        }
        versions.sort_by(|a, b| b.cmp(a));
        Ok(versions)
    } else {
        Ok(vec![])
    }
}

#[tauri::command]
async fn read_instance_log(instance_name: String) -> Result<String, String> {
    let mut path = get_data_dir();
    path.push("instances");
    path.push(&instance_name);
    path.push("logs");
    path.push("game_output.log");

    if !path.exists() {
        let mut fallback = get_data_dir();
        fallback.push("instances");
        fallback.push(&instance_name);
        fallback.push("logs");
        fallback.push("latest.log");
        if !fallback.exists() {
            return Ok("No logs found for this instance yet. Start the game to generate logs.".to_string());
        }
        path = fallback;
    }

    fs::read_to_string(&path).map_err(|e| format!("Failed to read log file: {}", e))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(launcher::LauncherState::new())
        .invoke_handler(tauri::generate_handler![
            add_offline_user,
            get_users,
            delete_user,
            stop_game,
            get_minecraft_versions,
            get_instances,
            create_instance,
            delete_instance,
            launch_instance,
            get_settings,
            save_settings,
            save_instance_settings,
            get_themes,
            open_themes_folder,
            add_user_skin,
            select_user_skin,
            delete_user_skin,
            get_skin_base64,
            open_instance_folder,
            get_installed_mods,
            delete_mod,
            upload_mod,
            save_instance_loader,
            get_loader_versions,
            download_mod,
            read_instance_log
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
