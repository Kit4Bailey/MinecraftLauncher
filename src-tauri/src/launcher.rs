use reqwest::Client;
use serde_json::Value;
use std::fs;
use std::path::PathBuf;
use tokio::process::Command;
use futures::stream::{StreamExt, FuturesUnordered};
use tauri::Emitter;
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use tokio::sync::oneshot;
use tauri::Manager;
use std::sync::Arc;
use std::process::Stdio;
use tokio::io::AsyncBufReadExt;

pub struct LauncherState {
    pub kill_tx: Mutex<Option<oneshot::Sender<()>>>,
    pub aborted: AtomicBool,
}

impl LauncherState {
    pub fn new() -> Self {
        Self {
            kill_tx: Mutex::new(None),
            aborted: AtomicBool::new(false),
        }
    }
}

async fn handle_child_process(
    app: tauri::AppHandle,
    mut child: tokio::process::Child,
    log_path: PathBuf,
    kill_rx: oneshot::Receiver<()>,
) -> Result<String, String> {
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    if let Some(parent) = log_path.parent() {
        let _ = fs::create_dir_all(parent);
    }

    let log_file = fs::File::create(&log_path).map_err(|e| format!("Failed to create log file: {}", e))?;
    let log_file_arc = Arc::new(Mutex::new(log_file));
    let stderr_lines = Arc::new(Mutex::new(Vec::new()));

    let log_file_c1 = log_file_arc.clone();
    let app_c1 = app.clone();
    let stdout_handle = tokio::spawn(async move {
        if let Some(out) = stdout {
            let mut reader = tokio::io::BufReader::new(out).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                let _ = app_c1.emit("game-log", line.clone());
                if let Ok(mut file) = log_file_c1.lock() {
                    use std::io::Write;
                    let _ = writeln!(file, "{}", line);
                }
            }
        }
    });

    let log_file_c2 = log_file_arc.clone();
    let stderr_lines_c = stderr_lines.clone();
    let app_c2 = app.clone();
    let stderr_handle = tokio::spawn(async move {
        if let Some(err) = stderr {
            let mut reader = tokio::io::BufReader::new(err).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                let _ = app_c2.emit("game-log", line.clone());
                // Keep last 100 lines for analysis
                if let Ok(mut guard) = stderr_lines_c.lock() {
                    if guard.len() >= 100 {
                        guard.remove(0);
                    }
                    guard.push(line.clone());
                }
                if let Ok(mut file) = log_file_c2.lock() {
                    use std::io::Write;
                    let _ = writeln!(file, "{}", line);
                }
            }
        }
    });

    let wait_result = tokio::select! {
        status_res = child.wait() => {
            match status_res {
                Ok(status) => {
                    if status.success() {
                        Ok(format!("Game exited with status: {}", status))
                    } else {
                        let lines = if let Ok(guard) = stderr_lines.lock() {
                            guard.clone()
                        } else {
                            vec![]
                        };
                        let error_context = lines.join("\n");
                        Err(format!(
                            "Minecraft exited with a crash code ({})\n\nTechnical details:\n{}",
                            status.code().unwrap_or(-1),
                            error_context
                        ))
                    }
                }
                Err(e) => Err(format!("Failed to wait for game process: {}", e)),
            }
        }
        _ = kill_rx => {
            let _ = child.kill().await;
            Err("Game stopped by user".to_string())
        }
    };

    // Wait for output readers to finish
    let _ = stdout_handle.await;
    let _ = stderr_handle.await;

    wait_result
}

fn get_data_dir() -> PathBuf {
    let mut path = if let Ok(home) = std::env::var("HOME") {
        PathBuf::from(home)
    } else {
        std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
    };
    path.push(".noxlauncher");
    if !path.exists() {
        fs::create_dir_all(&path).unwrap();
    }
    path
}

pub async fn download_and_launch(
    app: tauri::AppHandle,
    version_id: &str,
    username: &str,
    uuid: &str,
    instance_name: &str,
    settings: &crate::LauncherSettings,
    mod_loader: Option<String>,
    mod_loader_version: Option<String>,
) -> Result<String, String> {
    let state = app.state::<LauncherState>();
    state.aborted.store(false, Ordering::Relaxed);
    {
        let mut guard = state.kill_tx.lock().unwrap();
        *guard = None;
    }

    if state.aborted.load(Ordering::Relaxed) {
        return Err("Launch aborted by user".to_string());
    }

    let client = Client::new();
    
    // 1. Fetch version manifest
    let manifest_url = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";
    let manifest_res = client.get(manifest_url).send().await.map_err(|e| e.to_string())?;
    let manifest: Value = manifest_res.json().await.map_err(|e| e.to_string())?;
    
    let version_entry = manifest["versions"]
        .as_array()
        .unwrap()
        .iter()
        .find(|v| v["id"].as_str().unwrap() == version_id)
        .ok_or("Could not find version entry")?;
        
    let version_url = version_entry["url"].as_str().unwrap();
    let version_res = client.get(version_url).send().await.map_err(|e| e.to_string())?;
    let version_data: Value = version_res.json().await.map_err(|e| e.to_string())?;
    
    if state.aborted.load(Ordering::Relaxed) {
        return Err("Launch aborted by user".to_string());
    }

    // 2. Download Client Jar
    let mut versions_dir = get_data_dir();
    versions_dir.push("versions");
    versions_dir.push(version_id);
    fs::create_dir_all(&versions_dir).map_err(|e| e.to_string())?;
    
    let mut client_jar = versions_dir.clone();
    client_jar.push(format!("{}.jar", version_id));
    
    if !client_jar.exists() {
        let client_url = version_data["downloads"]["client"]["url"].as_str().unwrap();
        let jar_bytes = client.get(client_url).send().await.map_err(|e| e.to_string())?.bytes().await.map_err(|e| e.to_string())?;
        fs::write(&client_jar, jar_bytes).map_err(|e| e.to_string())?;
    }

    if state.aborted.load(Ordering::Relaxed) {
        return Err("Launch aborted by user".to_string());
    }

    // 3. Download Libraries
    let mut libs_dir = get_data_dir();
    libs_dir.push("libraries");
    
    let libraries = version_data["libraries"].as_array().unwrap();
    let mut classpath = vec![client_jar.to_string_lossy().to_string()];
    
    // Sequential download for libraries to keep things simple for the base working version
    for lib in libraries {
        if state.aborted.load(Ordering::Relaxed) {
            return Err("Launch aborted by user".to_string());
        }
        // Skip natives for now or OS specific stuff if not linux
        // Very basic rule check
        if let Some(rules) = lib.get("rules").and_then(|r| r.as_array()) {
            let mut allow = false;
            for rule in rules {
                if rule["action"] == "allow" {
                    if let Some(os) = rule.get("os") {
                        if os["name"] == "linux" { allow = true; }
                    } else {
                        allow = true;
                    }
                } else if rule["action"] == "disallow" {
                    if let Some(os) = rule.get("os") {
                        if os["name"] == "linux" { allow = false; }
                    }
                }
            }
            if !allow { continue; }
        }

        if let Some(artifact) = lib.get("downloads").and_then(|d| d.get("artifact")) {
            if let Some(path) = artifact.get("path").and_then(|p| p.as_str()) {
                let url = artifact["url"].as_str().unwrap();
                let mut lib_path = libs_dir.clone();
                lib_path.push(path);
                
                classpath.push(lib_path.to_string_lossy().to_string());

                if !lib_path.exists() {
                    if let Some(parent) = lib_path.parent() {
                        fs::create_dir_all(parent).unwrap();
                    }
                    if let Ok(res) = client.get(url).send().await {
                        if let Ok(bytes) = res.bytes().await {
                            fs::write(&lib_path, bytes).unwrap_or(());
                        }
                    }
                }
            }
        }
    }

    if state.aborted.load(Ordering::Relaxed) {
        return Err("Launch aborted by user".to_string());
    }

    // 4. Download Asset Index
    let mut assets_dir = get_data_dir();
    assets_dir.push("assets");
    
    let asset_index_id = version_data["assetIndex"]["id"].as_str().unwrap();
    let asset_index_url = version_data["assetIndex"]["url"].as_str().unwrap();
    
    let mut indexes_dir = assets_dir.clone();
    indexes_dir.push("indexes");
    fs::create_dir_all(&indexes_dir).unwrap();
    
    let mut index_file = indexes_dir.clone();
    index_file.push(format!("{}.json", asset_index_id));
    
    let index_res = client.get(asset_index_url).send().await.map_err(|e| e.to_string())?;
    let index_text = index_res.text().await.map_err(|e| e.to_string())?;
    fs::write(&index_file, &index_text).unwrap();
    
    let asset_index: Value = serde_json::from_str(&index_text).unwrap();
    
    if state.aborted.load(Ordering::Relaxed) {
        return Err("Launch aborted by user".to_string());
    }

    // 5. Download Assets (Concurrent)
    let mut objects_dir = assets_dir.clone();
    objects_dir.push("objects");
    fs::create_dir_all(&objects_dir).unwrap();
    
    let objects = asset_index["objects"].as_object().unwrap();
    let mut fetch_tasks = FuturesUnordered::new();
    
    for (_key, obj) in objects {
        if state.aborted.load(Ordering::Relaxed) {
            return Err("Launch aborted by user".to_string());
        }
        let hash = obj["hash"].as_str().unwrap();
        let subhash = &hash[0..2];
        let url = format!("https://resources.download.minecraft.net/{}/{}", subhash, hash);
        
        let mut obj_path = objects_dir.clone();
        obj_path.push(subhash);
        obj_path.push(hash);
        
        let client_clone = client.clone();
        if !obj_path.exists() {
            fetch_tasks.push(tokio::spawn(async move {
                if let Some(parent) = obj_path.parent() {
                    fs::create_dir_all(parent).unwrap_or(());
                }
                if let Ok(res) = client_clone.get(&url).send().await {
                    if let Ok(bytes) = res.bytes().await {
                        fs::write(&obj_path, bytes).unwrap_or(());
                    }
                }
            }));
        }
    }
    
    // Wait for all assets to download
    while let Some(_) = fetch_tasks.next().await {}

    if state.aborted.load(Ordering::Relaxed) {
        return Err("Launch aborted by user".to_string());
    }

    // 6. Integrate Mod Loaders (Fabric / Quilt)
    let mut main_class = version_data["mainClass"].as_str().unwrap().to_string();

    if let Some(ref loader) = mod_loader {
        if let Some(ref loader_ver) = mod_loader_version {
            if loader == "fabric" || loader == "quilt" {
                let cache_folder = format!("{}-{}-{}", version_id, loader, loader_ver);
                let mut profile_json_path = get_data_dir();
                profile_json_path.push("versions");
                profile_json_path.push(&cache_folder);
                let _ = fs::create_dir_all(&profile_json_path);
                profile_json_path.push(format!("{}.json", cache_folder));

                let profile_data: Value = if profile_json_path.exists() {
                    let file_content = fs::read_to_string(&profile_json_path)
                        .map_err(|e| format!("Failed to read cached profile JSON: {}", e))?;
                    serde_json::from_str(&file_content)
                        .map_err(|e| format!("Failed to parse cached profile JSON: {}", e))?
                } else {
                    let _ = app.emit("game-status", format!("Downloading {} metadata...", loader));
                    let profile_url = if loader == "fabric" {
                        format!("https://meta.fabricmc.net/v2/versions/loader/{}/{}/profile/json", version_id, loader_ver)
                    } else {
                        format!("https://meta.quiltmc.org/v2/versions/loader/{}/{}/profile/json", version_id, loader_ver)
                    };

                    let res = client.get(&profile_url).send().await
                        .map_err(|e| format!("Failed to request loader profile: {}", e))?;
                    let data: Value = res.json().await
                        .map_err(|e| format!("Failed to parse loader profile response: {}", e))?;

                    if let Ok(json_str) = serde_json::to_string_pretty(&data) {
                        let _ = fs::write(&profile_json_path, json_str);
                    }
                    data
                };

                if let Some(mc) = profile_data["mainClass"].as_str() {
                    main_class = mc.to_string();
                }

                // Download loader libraries
                if let Some(loader_libs) = profile_data["libraries"].as_array() {
                    let mut loader_libs_dir = get_data_dir();
                    loader_libs_dir.push("libraries");

                    for lib in loader_libs {
                        if let Some(name) = lib["name"].as_str() {
                            let parts: Vec<&str> = name.split(':').collect();
                            if parts.len() >= 3 {
                                let group = parts[0].replace(".", "/");
                                let artifact = parts[1];
                                let ver_parts: Vec<&str> = parts[2].split('@').collect();
                                let ver = ver_parts[0];

                                let lib_rel_path = format!("{}/{}/{}/{}-{}.jar", group, artifact, ver, artifact, ver);
                                let mut lib_path = loader_libs_dir.clone();
                                lib_path.push(&lib_rel_path);

                                classpath.push(lib_path.to_string_lossy().to_string());

                                if !lib_path.exists() {
                                    if let Some(parent) = lib_path.parent() {
                                        fs::create_dir_all(parent).unwrap_or(());
                                    }
                                    let _ = app.emit("game-status", format!("Downloading dependency: {}...", artifact));
                                    let base_url = lib["url"].as_str().unwrap_or("https://maven.fabricmc.net/");
                                    let full_url = if base_url.ends_with('/') {
                                        format!("{}{}", base_url, lib_rel_path)
                                      } else {
                                        format!("{}/{}", base_url, lib_rel_path)
                                      };

                                      let dl_res = client.get(&full_url).send().await
                                          .map_err(|e| format!("Failed to download library {}: {}", name, e))?;
                                      let bytes = dl_res.bytes().await
                                          .map_err(|e| format!("Failed to read library bytes {}: {}", name, e))?;
                                      fs::write(&lib_path, bytes)
                                          .map_err(|e| format!("Failed to write library {}: {}", name, e))?;
                                  }
                              }
                          }
                      }
                  }
              }
          }
      }

    if let Some(ref loader) = mod_loader {
        if let Some(ref loader_ver) = mod_loader_version {
            if loader == "forge" || loader == "neoforge" {
                let loader_prefix = if loader == "forge" { "forge" } else { "neoforge" };
                let target_version_name = format!("{}-{}-{}", version_id, loader_prefix, loader_ver);
                
                let mut target_dir = get_data_dir();
                target_dir.push("versions");
                target_dir.push(&target_version_name);
                
                let mut target_json = target_dir.clone();
                target_json.push(format!("{}.json", target_version_name));
                
                if !target_json.exists() {
                    let _ = app.emit("game-status", format!("Downloading {} installer...", loader_prefix));
                    
                    let installer_url = if loader == "forge" {
                        format!(
                            "https://maven.minecraftforge.net/net/minecraftforge/forge/{}/forge-{}-installer.jar",
                            loader_ver, loader_ver
                        )
                    } else {
                        format!(
                            "https://maven.neoforged.net/releases/net/neoforged/neoforge/{}/neoforge-{}-installer.jar",
                            loader_ver, loader_ver
                        )
                    };
                    
                    let mut temp_dir = get_data_dir();
                    temp_dir.push("temp");
                    fs::create_dir_all(&temp_dir).map_err(|e| e.to_string())?;
                    
                    let mut installer_path = temp_dir.clone();
                    installer_path.push(format!("{}-installer.jar", loader_prefix));
                    
                    // Download installer
                    let res = client.get(&installer_url).send().await.map_err(|e| format!("Failed to download installer: {}", e))?;
                    let bytes = res.bytes().await.map_err(|e| format!("Failed to read installer bytes: {}", e))?;
                    fs::write(&installer_path, bytes).map_err(|e| format!("Failed to write installer jar: {}", e))?;
                    
                    let _ = app.emit("game-status", format!("Running {} installer headlessly (this can take 1-2 mins)...", loader_prefix));
                    
                    // Run installer
                    let mut cmd = tokio::process::Command::new("java");
                    cmd.arg("-jar")
                       .arg(&installer_path)
                       .arg("--installClient")
                       .arg(get_data_dir().to_string_lossy().to_string());
                       
                    // Run and wait for exit
                    let mut child = cmd.spawn().map_err(|e| format!("Failed to run java installer: {}", e))?;
                    let status = child.wait().await.map_err(|e| format!("Failed waiting for installer: {}", e))?;
                    
                    if !status.success() {
                        return Err(format!("Installer exited with error status: {}", status));
                    }
                    
                    // Delete temp installer
                    let _ = fs::remove_file(installer_path);
                    
                    // Verify if the target json exists. If not, look in versions folder
                    if !target_json.exists() {
                        let mut versions_dir = get_data_dir();
                        versions_dir.push("versions");
                        let mut found = false;
                        if let Ok(entries) = fs::read_dir(versions_dir) {
                            for entry in entries.flatten() {
                                let path = entry.path();
                                if path.is_dir() {
                                    let dir_name = path.file_name().unwrap().to_string_lossy().to_string();
                                    if dir_name.contains(loader_prefix) && dir_name.contains(loader_ver) {
                                        let possible_json = path.join(format!("{}.json", dir_name));
                                        if possible_json.exists() {
                                            target_json = possible_json;
                                            found = true;
                                            break;
                                        }
                                    }
                                }
                            }
                        }
                        if !found {
                            return Err(format!("{} installer ran but could not find the generated profile JSON", loader_prefix));
                        }
                    }
                }
                
                // Now parse the Forge JSON
                let launch_info = parse_forge_json(target_json, &libs_dir)?;
                let main_class = launch_info.main_class;
                
                // Add Forge libraries to classpath
                for lib in launch_info.classpath {
                    if !classpath.contains(&lib) {
                        classpath.push(lib);
                    }
                }
                
                let mut game_dir = get_data_dir();
                game_dir.push("instances");
                game_dir.push(instance_name);
                fs::create_dir_all(&game_dir).map_err(|e| e.to_string())?;
                
                // Add Forge JVM args and program args
                let cp_string = classpath.join(":");
                let resolved_jvm = replace_placeholders(
                    launch_info.jvm_args,
                    version_id,
                    &game_dir.to_string_lossy(),
                    &assets_dir.to_string_lossy(),
                    asset_index_id,
                    uuid,
                    username,
                    &cp_string,
                );
                let resolved_game = replace_placeholders(
                    launch_info.game_args,
                    version_id,
                    &game_dir.to_string_lossy(),
                    &assets_dir.to_string_lossy(),
                    asset_index_id,
                    uuid,
                    username,
                    &cp_string,
                );
                
                let mut cmd_args = Vec::new();
                let exec = if settings.use_gamemode && settings.use_mangohud {
                    cmd_args.push("mangohud".to_string());
                    cmd_args.push("java".to_string());
                    "gamemoderun"
                } else if settings.use_gamemode {
                    cmd_args.push("java".to_string());
                    "gamemoderun"
                } else if settings.use_mangohud {
                    cmd_args.push("java".to_string());
                    "mangohud"
                } else {
                    "java"
                };
                
                let mut cmd = Command::new(exec);
                cmd.current_dir(&game_dir);
                
                for arg in cmd_args {
                    cmd.arg(arg);
                }
                
                // Memory settings
                cmd.arg(format!("-Xmx{}G", settings.max_ram));
                cmd.arg(format!("-Xms{}G", settings.min_ram));
                
                // Add Forge JVM args
                for arg in resolved_jvm {
                    cmd.arg(arg);
                }
                
                // Add custom JVM arguments from settings
                if !settings.jvm_args.is_empty() {
                    for arg in settings.jvm_args.split_whitespace() {
                        cmd.arg(arg);
                    }
                }
                
                // Add main entry point
                cmd.arg(main_class);
                
                // Add program args
                for arg in resolved_game {
                    cmd.arg(arg);
                }
                
                cmd.stdout(Stdio::piped());
                cmd.stderr(Stdio::piped());

                app.emit("game-started", ()).map_err(|e| e.to_string())?;

                let mut child = cmd.spawn().map_err(|e| format!("Failed to spawn java: {}", e))?;
                
                let (tx, rx) = oneshot::channel();
                {
                    let mut guard = state.kill_tx.lock().unwrap();
                    *guard = Some(tx);
                }
                
                let log_path = game_dir.join("logs").join("game_output.log");
                let wait_result = handle_child_process(app.clone(), child, log_path, rx).await;
                
                {
                    let mut guard = state.kill_tx.lock().unwrap();
                    *guard = None;
                }
                
                app.emit("game-closed", ()).map_err(|e| e.to_string())?;
                
                return wait_result;
            }
        }
    }

    // 7. Launch Game
    let cp_arg = classpath.join(":");
    
    let mut game_dir = get_data_dir();
    game_dir.push("instances");
    game_dir.push(instance_name);
    fs::create_dir_all(&game_dir).map_err(|e| e.to_string())?;

    let mut cmd_args = Vec::new();
    let exec = if settings.use_gamemode && settings.use_mangohud {
        cmd_args.push("mangohud".to_string());
        cmd_args.push("java".to_string());
        "gamemoderun"
    } else if settings.use_gamemode {
        cmd_args.push("java".to_string());
        "gamemoderun"
    } else if settings.use_mangohud {
        cmd_args.push("java".to_string());
        "mangohud"
    } else {
        "java"
    };

    let mut cmd = Command::new(exec);
    cmd.current_dir(&game_dir);

    for arg in cmd_args {
        cmd.arg(arg);
    }

    cmd.arg(format!("-Xmx{}G", settings.max_ram));
    cmd.arg(format!("-Xms{}G", settings.min_ram));

    if !settings.jvm_args.is_empty() {
        for arg in settings.jvm_args.split_whitespace() {
            cmd.arg(arg);
        }
    }

    // Base JVM args
    cmd.arg("-cp").arg(cp_arg);
    cmd.arg(main_class);
    
    // Game args
    cmd.arg("--username").arg(username);
    cmd.arg("--version").arg(version_id);
    cmd.arg("--gameDir").arg(game_dir.to_string_lossy().to_string());
    cmd.arg("--assetsDir").arg(assets_dir.to_string_lossy().to_string());
    cmd.arg("--assetIndex").arg(asset_index_id);
    cmd.arg("--uuid").arg(uuid);
    cmd.arg("--accessToken").arg("offline");
    cmd.arg("--userType").arg("msa");
    cmd.arg("--versionType").arg("release");
    
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    app.emit("game-started", ()).map_err(|e| e.to_string())?;

    let mut child = cmd.spawn().map_err(|e| format!("Failed to spawn java: {}", e))?;
    
    let (tx, rx) = oneshot::channel();
    {
        let mut guard = state.kill_tx.lock().unwrap();
        *guard = Some(tx);
    }
    
    let log_path = game_dir.join("logs").join("game_output.log");
    let wait_result = handle_child_process(app.clone(), child, log_path, rx).await;
    
    {
        let mut guard = state.kill_tx.lock().unwrap();
        *guard = None;
    }
    
    app.emit("game-closed", ()).map_err(|e| e.to_string())?;
    
    wait_result
}

struct ForgeLaunchInfo {
    main_class: String,
    classpath: Vec<String>,
    jvm_args: Vec<String>,
    game_args: Vec<String>,
}

fn maven_to_path(name: &str) -> Option<String> {
    let parts: Vec<&str> = name.split(':').collect();
    if parts.len() >= 3 {
        let group = parts[0].replace(".", "/");
        let artifact = parts[1];
        
        let ver_and_ext: Vec<&str> = parts[2].split('@').collect();
        let ver = ver_and_ext[0];
        
        let classifier = if parts.len() >= 4 {
            Some(parts[3])
        } else {
            None
        };
        
        let filename = if let Some(clf) = classifier {
            format!("{}-{}-{}.jar", artifact, ver, clf)
        } else {
            format!("{}-{}.jar", artifact, ver)
        };
        
        Some(format!("{}/{}/{}/{}", group, artifact, ver, filename))
    } else {
        None
    }
}

fn parse_forge_json(json_path: PathBuf, libs_dir: &PathBuf) -> Result<ForgeLaunchInfo, String> {
    let content = fs::read_to_string(&json_path).map_err(|e| e.to_string())?;
    let data: Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    
    let main_class = data["mainClass"].as_str()
        .ok_or_else(|| "Missing mainClass in Forge JSON".to_string())?
        .to_string();
        
    let mut classpath = Vec::new();
    if let Some(libs) = data["libraries"].as_array() {
        for lib in libs {
            if let Some(rules) = lib.get("rules").and_then(|r| r.as_array()) {
                let mut allow = false;
                for rule in rules {
                    if rule["action"] == "allow" {
                        if let Some(os) = rule.get("os") {
                            if os["name"] == "linux" { allow = true; }
                        } else {
                            allow = true;
                        }
                    } else if rule["action"] == "disallow" {
                        if let Some(os) = rule.get("os") {
                            if os["name"] == "linux" { allow = false; }
                        }
                    }
                }
                if !allow { continue; }
            }
            
            if let Some(name) = lib["name"].as_str() {
                if let Some(rel_path) = maven_to_path(name) {
                    let mut lib_path = libs_dir.clone();
                    lib_path.push(rel_path);
                    classpath.push(lib_path.to_string_lossy().to_string());
                }
            }
        }
    }
    
    let mut jvm_args = Vec::new();
    let mut game_args = Vec::new();
    
    if let Some(args) = data.get("arguments") {
        if let Some(jvm) = args.get("jvm").and_then(|j| j.as_array()) {
            for arg in jvm {
                if let Some(s) = arg.as_str() {
                    jvm_args.push(s.to_string());
                } else if let Some(obj) = arg.as_object() {
                    let mut allow = false;
                    if let Some(rules) = obj.get("rules").and_then(|r| r.as_array()) {
                        for rule in rules {
                            if rule["action"] == "allow" {
                                if let Some(os) = rule.get("os") {
                                    if os["name"] == "linux" { allow = true; }
                                } else {
                                    allow = true;
                                }
                            } else if rule["action"] == "disallow" {
                                if let Some(os) = rule.get("os") {
                                    if os["name"] == "linux" { allow = false; }
                                }
                            }
                        }
                    } else {
                        allow = true;
                    }
                    if allow {
                        if let Some(value) = obj.get("value") {
                            if let Some(s) = value.as_str() {
                                jvm_args.push(s.to_string());
                            } else if let Some(arr) = value.as_array() {
                                for v in arr {
                                    if let Some(vs) = v.as_str() {
                                        jvm_args.push(vs.to_string());
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        
        if let Some(game) = args.get("game").and_then(|g| g.as_array()) {
            for arg in game {
                if let Some(s) = arg.as_str() {
                    game_args.push(s.to_string());
                }
            }
        }
    } else if let Some(mc_args) = data.get("minecraftArguments").and_then(|m| m.as_str()) {
        for arg in mc_args.split_whitespace() {
            game_args.push(arg.to_string());
        }
    }
    
    Ok(ForgeLaunchInfo {
        main_class,
        classpath,
        jvm_args,
        game_args,
    })
}

fn replace_placeholders(
    args: Vec<String>,
    version_id: &str,
    game_dir: &str,
    assets_dir: &str,
    asset_index: &str,
    uuid: &str,
    username: &str,
    classpath: &str,
) -> Vec<String> {
    args.into_iter().map(|arg| {
        arg.replace("${version_name}", version_id)
           .replace("${game_directory}", game_dir)
           .replace("${assets_root}", assets_dir)
           .replace("${assets_index_name}", asset_index)
           .replace("${auth_uuid}", uuid)
           .replace("${auth_access_token}", "offline")
           .replace("${user_properties}", "{}")
           .replace("${user_type}", "msa")
           .replace("${auth_player_name}", username)
           .replace("${version_type}", "release")
           .replace("${classpath}", classpath)
    }).collect()
}
