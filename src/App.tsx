import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

import { SkinViewer, IdleAnimation, WalkingAnimation, RunningAnimation } from "skinview3d";
import { 
  Play, 
  Gamepad2, 
  Settings, 
  Compass, 
  Library, 
  ChevronDown,
  Wrench,
  UserPlus,
  Check,
  Square,
  X,
  Trash2,
  RefreshCw,
  FolderOpen,
  User,
  AlertTriangle,
  Terminal
} from "lucide-react";
import "./App.css";



interface User {
  username: string;
  uuid: string;
  is_offline: boolean;
  active_skin?: string;
  skins?: string[];
}

interface Instance {
  name: string;
  version: string;
  settings: {
    max_ram: number;
    min_ram: number;
    use_gamemode: boolean;
    use_mangohud: boolean;
    jvm_args: string;
  };
  mod_loader?: string;
  mod_loader_version?: string;
}

interface Theme {
  name: string;
  variables: { [key: string]: string };
  is_custom: boolean;
}

interface SkinAvatarProps {
  username: string;
  activeSkin?: string;
  size?: number;
  className?: string;
}

function SkinAvatar({ username, activeSkin, size = 36, className = "" }: SkinAvatarProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, size, size);
    ctx.imageSmoothingEnabled = false;

    const drawDefaultSteve = () => {
      ctx.fillStyle = "#a8775c";
      ctx.fillRect(0, 0, size, size);
      
      ctx.fillStyle = "#2a1b14";
      ctx.fillRect(0, 0, size, size * 0.25);
      ctx.fillRect(0, size * 0.25, size * 0.125, size * 0.25);
      ctx.fillRect(size * 0.875, size * 0.25, size * 0.125, size * 0.25);
      
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(size * 0.125, size * 0.5, size * 0.25, size * 0.125);
      ctx.fillRect(size * 0.625, size * 0.5, size * 0.25, size * 0.125);
      ctx.fillStyle = "#4c4cff";
      ctx.fillRect(size * 0.25, size * 0.5, size * 0.125, size * 0.125);
      ctx.fillRect(size * 0.625, size * 0.5, size * 0.125, size * 0.125);

      ctx.fillStyle = "#663b2c";
      ctx.fillRect(size * 0.375, size * 0.625, size * 0.25, size * 0.125);
      ctx.fillRect(size * 0.25, size * 0.75, size * 0.5, size * 0.125);
    };

    if (!activeSkin) {
      drawDefaultSteve();
      return;
    }

    invoke<string>("get_skin_base64", { username, skinName: activeSkin })
      .then(b64 => {
        const img = new Image();
        img.onload = () => {
          ctx.drawImage(img, 8, 8, 8, 8, 0, 0, size, size);
          ctx.drawImage(img, 40, 8, 8, 8, 0, 0, size, size);
        };
        img.onerror = () => {
          drawDefaultSteve();
        };
        img.src = b64;
      })
      .catch(err => {
        console.error("Failed to load skin:", err);
        drawDefaultSteve();
      });
  }, [username, activeSkin, size]);

  return (
    <canvas 
      ref={canvasRef} 
      width={size} 
      height={size} 
      className={className} 
      style={{ 
        width: size, 
        height: size, 
        borderRadius: '4px',
        display: 'block' 
      }} 
    />
  );
}

interface SkinViewer3DProps {
  username: string;
  skinName: string | null;
}

function SkinViewer3D({ username, skinName }: SkinViewer3DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [animationType, setAnimationType] = useState<"idle" | "walk" | "run" | "none">("idle");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const viewer = new SkinViewer({
      canvas,
      width: 200,
      height: 280,
    });

    viewer.fov = 70;
    viewer.zoom = 0.9;
    viewer.autoRotate = false;
    viewer.autoRotateSpeed = 0.8;

    let activeAnimation: any = null;
    if (animationType === "idle") {
      activeAnimation = new IdleAnimation();
      activeAnimation.speed = 0.6;
    } else if (animationType === "walk") {
      activeAnimation = new WalkingAnimation();
      activeAnimation.speed = 1.0;
    } else if (animationType === "run") {
      activeAnimation = new RunningAnimation();
      activeAnimation.speed = 1.2;
    }

    if (activeAnimation) {
      viewer.animation = activeAnimation;
    } else {
      viewer.animation = null;
    }

    const loadSkinTexture = async () => {
      if (!skinName) {
        viewer.loadSkin("/steve.png");
        return;
      }
      try {
        const b64 = await invoke<string>("get_skin_base64", { username, skinName });
        viewer.loadSkin(b64);
      } catch (err) {
        console.error("Error loading 3D skin texture:", err);
        viewer.loadSkin("/steve.png");
      }
    };

    loadSkinTexture();

    return () => {
      viewer.dispose();
    };
  }, [username, skinName, animationType]);

  return (
    <div className="skin-viewer-3d-container">
      <canvas ref={canvasRef} className="skin-viewer-3d-canvas" />
      <div className="skin-viewer-controls">
        <button 
          type="button"
          className={`control-btn ${animationType === 'idle' ? 'active' : ''}`}
          onClick={() => setAnimationType("idle")}
        >
          Idle
        </button>
        <button 
          type="button"
          className={`control-btn ${animationType === 'walk' ? 'active' : ''}`}
          onClick={() => setAnimationType("walk")}
        >
          Walk
        </button>
        <button 
          type="button"
          className={`control-btn ${animationType === 'run' ? 'active' : ''}`}
          onClick={() => setAnimationType("run")}
        >
          Run
        </button>
        <button 
          type="button"
          className={`control-btn ${animationType === 'none' ? 'active' : ''}`}
          onClick={() => setAnimationType("none")}
        >
          Pause
        </button>
      </div>
    </div>
  );
}

const getModLoaderMismatch = (filename: string, loader: string) => {
  const lower = filename.toLowerCase();
  const hasFabric = lower.includes("fabric");
  const hasForge = lower.includes("forge") && !lower.includes("neoforge");
  const hasNeoForge = lower.includes("neoforge");
  const hasQuilt = lower.includes("quilt");

  if (loader === "fabric") {
    if (hasForge || hasNeoForge) return "Forge/NeoForge mod in Fabric instance";
    if (hasQuilt && !hasFabric) return "Quilt mod in Fabric instance";
  } else if (loader === "quilt") {
    if (hasForge || hasNeoForge) return "Forge/NeoForge mod in Quilt instance";
  } else if (loader === "forge") {
    if (hasFabric || hasNeoForge || hasQuilt) return "Fabric/NeoForge/Quilt mod in Forge instance";
  } else if (loader === "neoforge") {
    if (hasFabric || hasQuilt) return "Fabric/Quilt mod in NeoForge instance";
  }
  return null;
};

interface LaunchError {
  instanceName: string;
  rawError: string;
  suggestion: string;
}

const analyzeLaunchError = (errorStr: string, instanceName: string): LaunchError => {
  const lower = errorStr.toLowerCase();
  let suggestion = "An unexpected error occurred while launching Minecraft. Please review the technical details below or check the Logs tab.";

  if (lower.includes("unsupportedclassversionerror") || lower.includes("class file version")) {
    suggestion = "Java Version Mismatch! Minecraft versions 1.17+ require Java 17 or higher. Minecraft 1.20.5+ requires Java 21. Please update your system's Java version or select a different instance version.";
  } else if (lower.includes("outofmemoryerror") || lower.includes("out of memory")) {
    suggestion = "Out of Memory! Try increasing the Maximum RAM allocated for this instance in the Settings tab.";
  } else if (lower.includes("modresolutionexception") || lower.includes("fabric-loader") || lower.includes("missing dependency") || lower.includes("requires mod")) {
    suggestion = "Mod Dependency Mismatch! One or more of your installed Fabric/Quilt mods requires a dependency that is missing (such as Fabric API) or is of an incompatible version.";
  } else if (lower.includes("modloadingexception") || lower.includes("dependencyresolutionexception") || lower.includes("forge crash")) {
    suggestion = "Mod Loading Failure! There is a conflict or missing dependency among your Forge/NeoForge mods. Please check if you mixed loader types (Fabric vs. Forge/NeoForge) in your mods list.";
  } else if (lower.includes("failed to spawn java") || lower.includes("no such file or directory") || lower.includes("cannot find path")) {
    suggestion = "Java not found! Java is either not installed or is not configured in your system's PATH environment. Please install the Java Development Kit (JDK 17 or JDK 21).";
  } else if (lower.includes("jvm_args") || lower.includes("unrecognized jvm option") || lower.includes("could not create the java virtual machine")) {
    suggestion = "Invalid JVM Arguments! One of the custom JVM arguments configured in your settings is invalid or unsupported by your current Java version.";
  }

  return {
    instanceName,
    rawError: errorStr,
    suggestion
  };
};

function App() {
  const [activeTab, setActiveTab] = useState("play");
  const [users, setUsers] = useState<User[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [statusMsg, setStatusMsg] = useState("");
  const [isDownloading, setIsDownloading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [versions, setVersions] = useState<{ id: string; type: string }[]>([]);
  const [instances, setInstances] = useState<Instance[]>([]);
  const [currentInstance, setCurrentInstance] = useState<Instance | null>(null);
  const [newInstanceName, setNewInstanceName] = useState("");
  const [newInstanceVersion, setNewInstanceVersion] = useState("");
  const [maxRam, setMaxRam] = useState(4);
  const [minRam, setMinRam] = useState(2);
  const [useGamemode, setUseGamemode] = useState(false);
  const [useMangohud, setUseMangohud] = useState(false);
  const [jvmArgs, setJvmArgs] = useState("");
  const [settingsInstanceName, setSettingsInstanceName] = useState<string>("");

  // Theme & User States
  const [themes, setThemes] = useState<Theme[]>([]);
  const [activeThemeName, setActiveThemeName] = useState("OLED Black");
  const [showUserSelector, setShowUserSelector] = useState(false);

  // Logs & Error States
  const [logsText, setLogsText] = useState<string>("");
  const [launchError, setLaunchError] = useState<LaunchError | null>(null);
  const logsTerminalRef = useRef<HTMLDivElement>(null);

  // Skins Tab States
  const [selectedSkinUser, setSelectedSkinUser] = useState<User | null>(null);
  const [selectedSkinName, setSelectedSkinName] = useState<string | null>(null);

  // Mods Tab States
  const [installedMods, setInstalledMods] = useState<string[]>([]);
  const [modLoader, setModLoader] = useState<string>("none");
  const [modLoaderVer, setModLoaderVer] = useState<string>("");
  const [modLoaderVersions, setModLoaderVersions] = useState<string[]>([]);
  const [isModsLoading, setIsModsLoading] = useState(false);
  
  // Modrinth Search States
  const [modsSubTab, setModsSubTab] = useState<"local" | "modrinth">("local");
  const [modrinthQuery, setModrinthQuery] = useState("");
  const [modrinthResults, setModrinthResults] = useState<any[]>([]);
  const [isModrinthSearching, setIsModrinthSearching] = useState(false);
  const [installingModId, setInstallingModId] = useState<string | null>(null);
  const [installedModIds, setInstalledModIds] = useState<string[]>([]);

  const applyTheme = (theme: Theme) => {
    const root = document.documentElement;
    Object.entries(theme.variables).forEach(([key, val]) => {
      root.style.setProperty(key, val);
    });
  };

  useEffect(() => {
    // Load active theme and all themes
    invoke<any>("get_settings").then(settings => {
      const themeName = settings.active_theme || "OLED Black";
      setActiveThemeName(themeName);
      
      invoke<Theme[]>("get_themes").then(res => {
        setThemes(res);
        const active = res.find(t => t.name === themeName);
        if (active) {
          applyTheme(active);
        }
      }).catch(console.error);
    }).catch(console.error);

    invoke<User[]>("get_users").then(res => {
      setUsers(res);
      if (res.length > 0) {
        setCurrentUser(res[0]);
        setSelectedSkinUser(res[0]);
        setSelectedSkinName(res[0].active_skin || null);
      }
    }).catch(console.error);

    invoke<{ id: string; type: string }[]>("get_minecraft_versions").then(res => {
      setVersions(res);
      const latestRelease = res.find(v => v.type === "release");
      if (latestRelease) {
        setNewInstanceVersion(latestRelease.id);
      } else if (res.length > 0) {
        setNewInstanceVersion(res[0].id);
      }
    }).catch(console.error);

    invoke<Instance[]>("get_instances").then(res => {
      setInstances(res);
      if (res.length > 0) {
        setCurrentInstance(res[0]);
        setSettingsInstanceName(res[0].name);
        
        const settings = res[0].settings;
        setMaxRam(settings.max_ram);
        setMinRam(settings.min_ram);
        setUseGamemode(settings.use_gamemode);
        setUseMangohud(settings.use_mangohud);
        setJvmArgs(settings.jvm_args);
      }
    }).catch(console.error);

    const unlistenStart = listen("game-started", () => {
      setIsDownloading(false);
      setIsPlaying(true);
      setStatusMsg("Game is running! Have fun!");
    });

    const unlistenClose = listen("game-closed", () => {
      setIsPlaying(false);
      setStatusMsg("Game closed. Ready to play again.");
    });

    const unlistenLog = listen<string>("game-log", (event) => {
      setLogsText(prev => {
        const cleanPrev = prev.startsWith("No logs found") ? "" : prev;
        const next = cleanPrev + event.payload + "\n";
        const lines = next.split("\n");
        if (lines.length > 5000) {
          return lines.slice(lines.length - 5000).join("\n");
        }
        return next;
      });
    });

    return () => {
      unlistenStart.then(f => f());
      unlistenClose.then(f => f());
      unlistenLog.then(f => f());
    };
  }, []);

  const fetchLogs = async (instanceName: string) => {
    try {
      const text = await invoke<string>("read_instance_log", { instanceName });
      setLogsText(text);
    } catch (err) {
      console.error(err);
      setLogsText(`Failed to load logs: ${err}`);
    }
  };

  useEffect(() => {
    if (currentInstance) {
      setModLoader(currentInstance.mod_loader || "none");
      setModLoaderVer(currentInstance.mod_loader_version || "");
      loadModsAndLoader(
        currentInstance.name, 
        currentInstance.mod_loader || "none", 
        currentInstance.version
      );
      if (activeTab === "logs") {
        fetchLogs(currentInstance.name);
      }
    }
  }, [currentInstance?.name, activeTab]);

  useEffect(() => {
    if (logsTerminalRef.current) {
      logsTerminalRef.current.scrollTop = logsTerminalRef.current.scrollHeight;
    }
  }, [logsText, activeTab]);

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim()) return;
    try {
      const user = await invoke<User>("add_offline_user", { username: newUsername.trim() });
      setUsers([...users, user]);
      setCurrentUser(user);
      setIsAddingUser(false);
      setNewUsername("");
      setStatusMsg(`Added and switched to user '${user.username}'`);
    } catch (err) {
      console.error(err);
      setStatusMsg(`Failed to add user: ${err}`);
    }
  };

  const handleDeleteUser = async (username: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (users.length <= 1) {
      setStatusMsg("You must keep at least one user account.");
      return;
    }
    if (!window.confirm(`Remove user account '${username}'?`)) {
      return;
    }
    try {
      await invoke("delete_user", { username });
      const filtered = users.filter(u => u.username !== username);
      setUsers(filtered);
      if (currentUser?.username === username) {
        setCurrentUser(filtered[0]);
      }
      setStatusMsg(`Removed user account '${username}'`);
    } catch (err) {
      console.error(err);
      setStatusMsg(`Error: ${err}`);
    }
  };

  const handleSelectSkinForUser = async (username: string, skinName: string) => {
    try {
      await invoke("select_user_skin", { username, skinName });
      const updatedUsers = await invoke<User[]>("get_users");
      setUsers(updatedUsers);
      
      if (currentUser?.username === username) {
        const matched = updatedUsers.find(u => u.username === username);
        if (matched) setCurrentUser(matched);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleUploadSkinForUser = (username: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const nameWithoutExt = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const b64Data = event.target?.result as string;
      try {
        await invoke("add_user_skin", {
          username,
          skinName: nameWithoutExt,
          base64Data: b64Data
        });
        
        const updatedUsers = await invoke<User[]>("get_users");
        setUsers(updatedUsers);
        
        if (currentUser?.username === username) {
          const matched = updatedUsers.find(u => u.username === username);
          if (matched) setCurrentUser(matched);
        }

        if (selectedSkinUser?.username === username) {
          const matched = updatedUsers.find(u => u.username === username);
          if (matched) {
            setSelectedSkinUser(matched);
            setSelectedSkinName(nameWithoutExt);
          }
        }
        setStatusMsg(`Uploaded custom skin '${nameWithoutExt}' for ${username} successfully.`);
      } catch (err) {
        console.error(err);
        setStatusMsg(`Failed to upload skin: ${err}`);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleThemeChange = async (themeName: string) => {
    setActiveThemeName(themeName);
    const theme = themes.find(t => t.name === themeName);
    if (theme) {
      applyTheme(theme);
    }
    
    try {
      const globalSettings = await invoke<any>("get_settings");
      globalSettings.active_theme = themeName;
      await invoke("save_settings", { settings: globalSettings });
    } catch (err) {
      console.error("Failed to save theme setting:", err);
    }
  };

  const handleOpenThemesFolder = async () => {
    try {
      await invoke("open_themes_folder");
    } catch (err) {
      console.error(err);
      setStatusMsg(`Error opening themes folder: ${err}`);
    }
  };

  const handleRefreshThemes = async () => {
    try {
      const res = await invoke<Theme[]>("get_themes");
      setThemes(res);
      const active = res.find(t => t.name === activeThemeName);
      if (active) applyTheme(active);
      setStatusMsg("Themes refreshed successfully.");
    } catch (err) {
      console.error(err);
      setStatusMsg(`Failed to refresh themes: ${err}`);
    }
  };

  const handlePlay = async () => {
    if (!currentUser) {
      setStatusMsg("Please add a user first.");
      return;
    }
    if (!currentInstance) {
      setStatusMsg("Please select or create an instance first.");
      return;
    }
    
    setIsDownloading(true);
    setStatusMsg(`Downloading dependencies and launching '${currentInstance.name}'...`);
    
    try {
      const res = await invoke<string>("launch_instance", { 
        username: currentUser.username,
        uuid: currentUser.uuid,
        instanceName: currentInstance.name
      });
      setStatusMsg(res);
    } catch (err: any) {
      console.error("Launch failed:", err);
      const errorStr = typeof err === "string" ? err : err.message || JSON.stringify(err);
      setStatusMsg(`Launch failed: ${errorStr}`);
      const analyzed = analyzeLaunchError(errorStr, currentInstance.name);
      setLaunchError(analyzed);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleStop = async () => {
    try {
      await invoke("stop_game");
      setStatusMsg("Stopping...");
    } catch (err) {
      setStatusMsg(`Error: ${err}`);
    }
  };

  const handleCreateInstance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newInstanceName.trim() || !newInstanceVersion) return;
    try {
      const newInst = await invoke<Instance>("create_instance", { 
        name: newInstanceName.trim(), 
        version: newInstanceVersion 
      });
      setInstances([...instances, newInst]);
      setCurrentInstance(newInst);
      setNewInstanceName("");
      setStatusMsg(`Created instance '${newInst.name}'`);
    } catch (err) {
      console.error(err);
      setStatusMsg(`Error: ${err}`);
    }
  };

  const loadModsAndLoader = async (instanceName: string, loaderType: string, mcVersion: string) => {
    setIsModsLoading(true);
    try {
      const mods = await invoke<string[]>("get_installed_mods", { instanceName });
      setInstalledMods(mods);
    } catch (err) {
      console.error("Failed to load mods:", err);
    } finally {
      setIsModsLoading(false);
    }

    if (loaderType !== "none") {
      fetchLoaderVersions(loaderType, mcVersion);
    } else {
      setModLoaderVersions([]);
    }
  };

  const fetchLoaderVersions = async (loaderType: string, mcVersion: string) => {
    try {
      const versions = await invoke<string[]>("get_loader_versions", { loader: loaderType, mcVersion });
      setModLoaderVersions(versions);
      
      if (versions.length > 0) {
        if (!versions.includes(modLoaderVer)) {
          setModLoaderVer(versions[0]);
        }
      } else {
        setModLoaderVer("");
      }
    } catch (err) {
      console.error(`Failed to fetch ${loaderType} versions:`, err);
    }
  };

  const handleSaveLoader = async () => {
    if (!currentInstance) return;
    try {
      const loaderVal = modLoader === "none" ? null : modLoader;
      const loaderVerVal = modLoader === "none" ? null : modLoaderVer;
      await invoke("save_instance_loader", {
        instanceName: currentInstance.name,
        modLoader: loaderVal,
        modLoaderVersion: loaderVerVal
      });
      
      const updatedInstances = instances.map(inst => {
        if (inst.name === currentInstance.name) {
          return { ...inst, mod_loader: loaderVal || undefined, mod_loader_version: loaderVerVal || undefined };
        }
        return inst;
      });
      setInstances(updatedInstances);
      
      const matched = updatedInstances.find(i => i.name === currentInstance.name);
      if (matched) setCurrentInstance(matched);
      
      setStatusMsg(`Mod loader configuration saved for '${currentInstance.name}'`);
    } catch (err) {
      console.error(err);
      setStatusMsg(`Failed to save loader: ${err}`);
    }
  };

  const handleUploadMod = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentInstance) return;
    
    const reader = new FileReader();
    reader.onload = async (event) => {
      const b64Data = event.target?.result as string;
      try {
        await invoke("upload_mod", {
          instanceName: currentInstance.name,
          filename: file.name,
          base64Data: b64Data
        });
        const mods = await invoke<string[]>("get_installed_mods", { instanceName: currentInstance.name });
        setInstalledMods(mods);
        setStatusMsg(`Uploaded mod '${file.name}' successfully.`);
      } catch (err) {
        console.error(err);
        setStatusMsg(`Failed to upload mod: ${err}`);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDeleteMod = async (filename: string) => {
    if (!currentInstance) return;
    if (!window.confirm(`Delete mod '${filename}'?`)) return;
    try {
      await invoke("delete_mod", {
        instanceName: currentInstance.name,
        modFilename: filename
      });
      const mods = await invoke<string[]>("get_installed_mods", { instanceName: currentInstance.name });
      setInstalledMods(mods);
      setStatusMsg(`Deleted mod '${filename}' successfully.`);
    } catch (err) {
      console.error(err);
      setStatusMsg(`Failed to delete mod: ${err}`);
    }
  };

  const handleOpenInstanceFolder = async (name: string) => {
    try {
      await invoke("open_instance_folder", { instanceName: name });
    } catch (err) {
      console.error(err);
      setStatusMsg(`Failed to open folder: ${err}`);
    }
  };

  const handleModrinthSearch = async (queryStr: string) => {
    if (!currentInstance) return;
    setIsModrinthSearching(true);
    try {
      const mcVer = currentInstance.version;
      const loader = currentInstance.mod_loader || "none";
      
      let facets = `[["project_type:mod"],["versions:${mcVer}"]]`;
      if (loader !== "none") {
        facets = `[["project_type:mod"],["versions:${mcVer}"],["categories:${loader}"]]`;
      }
      
      const url = `https://api.modrinth.com/v2/search?query=${encodeURIComponent(queryStr)}&facets=${encodeURIComponent(facets)}&limit=20`;
      const res = await fetch(url, {
        headers: {
          "User-Agent": "dev.rift.minecraftlauncher/0.1.0 (riftlauncher@nox.dev)"
        }
      });
      const data = await res.json();
      setModrinthResults(data.hits || []);
    } catch (err) {
      console.error("Modrinth search failed:", err);
      setStatusMsg("Failed to search Modrinth. Please check your connection.");
    } finally {
      setIsModrinthSearching(false);
    }
  };

  const handleInstallModrinthMod = async (mod: any) => {
    if (!currentInstance) return;
    setInstallingModId(mod.project_id);
    try {
      const mcVer = currentInstance.version;
      const loader = currentInstance.mod_loader || "none";
      
      const url = `https://api.modrinth.com/v2/project/${mod.project_id}/version`;
      const res = await fetch(url, {
        headers: {
          "User-Agent": "dev.rift.minecraftlauncher/0.1.0 (riftlauncher@nox.dev)"
        }
      });
      const versions = await res.json();
      const matchingVersion = versions.find((v: any) => {
        const matchesGameVer = v.game_versions.includes(mcVer);
        const matchesLoader = loader === "none" || v.loaders.includes(loader);
        return matchesGameVer && matchesLoader;
      });
      
      if (!matchingVersion || !matchingVersion.files || matchingVersion.files.length === 0) {
        throw new Error(`No compatible file downloads found for Minecraft ${mcVer} and loader ${loader === "none" ? "Vanilla" : loader}.`);
      }
      
      const file = matchingVersion.files.find((f: any) => f.primary) || matchingVersion.files[0];
      const downloadUrl = file.url;
      const filename = file.filename;
      
      await invoke("download_mod", {
        instanceName: currentInstance.name,
        filename,
        url: downloadUrl
      });
      
      const mods = await invoke<string[]>("get_installed_mods", { instanceName: currentInstance.name });
      setInstalledMods(mods);
      
      setInstalledModIds(prev => [...prev, mod.project_id]);
      setStatusMsg(`Successfully installed mod '${mod.title}'`);
    } catch (err: any) {
      console.error("Failed to install Modrinth mod:", err);
      setStatusMsg(`Failed to install mod: ${err.message || err}`);
    } finally {
      setInstallingModId(null);
    }
  };

  const handleDeleteInstance = async (name: string) => {
    if (instances.length <= 1) {
      setStatusMsg("You must keep at least one instance.");
      return;
    }
    if (!window.confirm(`Are you sure you want to delete instance '${name}'?`)) {
      return;
    }
    try {
      await invoke("delete_instance", { name });
      const filtered = instances.filter(i => i.name !== name);
      setInstances(filtered);
      if (currentInstance?.name === name) {
        setCurrentInstance(filtered[0]);
      }
      setStatusMsg(`Deleted instance '${name}'`);
    } catch (err) {
      console.error(err);
      setStatusMsg(`Error: ${err}`);
    }
  };

  const handleSettingsInstanceChange = (name: string) => {
    setSettingsInstanceName(name);
    const inst = instances.find(i => i.name === name);
    if (inst) {
      setMaxRam(inst.settings.max_ram);
      setMinRam(inst.settings.min_ram);
      setUseGamemode(inst.settings.use_gamemode);
      setUseMangohud(inst.settings.use_mangohud);
      setJvmArgs(inst.settings.jvm_args);
    }
  };

  const handleSaveSettings = async (updatedSettings: { max_ram: number; min_ram: number; use_gamemode: boolean; use_mangohud: boolean; jvm_args: string }) => {
    if (!settingsInstanceName) return;
    try {
      await invoke("save_instance_settings", { 
        instanceName: settingsInstanceName, 
        settings: updatedSettings 
      });
      
      const updatedInstances = instances.map(inst => {
        if (inst.name === settingsInstanceName) {
          return { ...inst, settings: updatedSettings };
        }
        return inst;
      });
      setInstances(updatedInstances);
      
      if (currentInstance?.name === settingsInstanceName) {
        setCurrentInstance({ ...currentInstance, settings: updatedSettings });
      }
      
      setStatusMsg(`Settings saved for '${settingsInstanceName}' successfully.`);
    } catch (err) {
      console.error(err);
      setStatusMsg(`Error: ${err}`);
    }
  };



  return (
    <div className="app-container">
      <div className="app-body">
        {/* Sidebar Navigation */}
        <aside className="sidebar glass-panel">
          <div className="logo-container">
            <Gamepad2 className="logo-icon" />
            <span className="logo-text">Rift Launcher</span>
          </div>

          <nav className="nav-links">
            <div 
              className={`nav-item ${activeTab === 'play' ? 'active' : ''}`}
              onClick={() => setActiveTab('play')}
            >
              <Play className="nav-icon" />
              <span>Play</span>
            </div>
            <div 
              className={`nav-item ${activeTab === 'instances' ? 'active' : ''}`}
              onClick={() => setActiveTab('instances')}
            >
              <Library className="nav-icon" />
              <span>Instances</span>
            </div>
            <div 
              className={`nav-item ${activeTab === 'mods' ? 'active' : ''}`}
              onClick={() => setActiveTab('mods')}
            >
              <Wrench className="nav-icon" />
              <span>Mods</span>
            </div>
            <div 
              className={`nav-item ${activeTab === 'skins' ? 'active' : ''}`}
              onClick={() => setActiveTab('skins')}
            >
              <User className="nav-icon" />
              <span>Skins</span>
            </div>
            <div 
              className={`nav-item ${activeTab === 'discover' ? 'active' : ''}`}
              onClick={() => setActiveTab('discover')}
            >
              <Compass className="nav-icon" />
              <span>Discover</span>
            </div>
            <div 
              className={`nav-item ${activeTab === 'logs' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('logs');
                if (currentInstance) {
                  fetchLogs(currentInstance.name);
                }
              }}
            >
              <Terminal className="nav-icon" />
              <span>Logs</span>
            </div>
            <div 
              className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`}
              onClick={() => setActiveTab('settings')}
            >
              <Settings className="nav-icon" />
              <span>Settings</span>
            </div>
          </nav>

          {/* User Profile Area */}
          <div className="user-section-container">
            {showUserSelector && !isAddingUser && (
              <div className="user-selector-popover">
                <div className="user-selector-list">
                  {users.map(u => (
                    <div 
                      key={u.username} 
                      className={`user-selector-item-wrapper ${currentUser?.username === u.username ? 'active' : ''}`}
                    >
                      <div 
                        className="user-selector-item-main"
                        onClick={() => {
                          setCurrentUser(u);
                          setSelectedSkinUser(u);
                          setSelectedSkinName(u.active_skin || null);
                          setShowUserSelector(false);
                        }}
                      >
                        <SkinAvatar username={u.username} activeSkin={u.active_skin} size={24} className="avatar-small" />
                        <div className="user-selector-info">
                          <span className="user-selector-name">{u.username}</span>
                          <span className="user-selector-status">Offline</span>
                        </div>
                        <button 
                          className="delete-user-btn" 
                          type="button"
                          onClick={(e) => handleDeleteUser(u.username, e)}
                          title="Remove Account"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                      
                      {u.skins && u.skins.length > 0 && (
                        <div className="user-selector-skins-row">
                          <span className="user-selector-skins-label">Skins:</span>
                          <button
                            type="button"
                            className={`mini-skin-dot ${!u.active_skin ? 'active' : ''}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSelectSkinForUser(u.username, "");
                            }}
                            title="Default Steve"
                          >
                            Steve
                          </button>
                          {u.skins.map(skin => (
                            <button
                              key={skin}
                              type="button"
                              className={`mini-skin-dot ${u.active_skin === skin ? 'active' : ''}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSelectSkinForUser(u.username, skin);
                              }}
                              title={skin}
                            >
                              {skin}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="user-selector-divider"></div>
                <button 
                  className="popover-add-btn" 
                  type="button"
                  onClick={() => {
                    setIsAddingUser(true);
                    setShowUserSelector(false);
                  }}
                >
                  <UserPlus size={14} />
                  <span>Add Account</span>
                </button>
              </div>
            )}

            {isAddingUser ? (
              <form onSubmit={handleAddUser} className="add-user-form">
                <input 
                  type="text" 
                  placeholder="Username..." 
                  value={newUsername}
                  onChange={e => setNewUsername(e.target.value)}
                  autoFocus
                  className="user-input"
                />
                <button type="submit" className="add-user-btn submit">
                  <Check size={16} />
                </button>
                <button 
                  type="button" 
                  className="add-user-btn cancel"
                  onClick={() => setIsAddingUser(false)}
                >
                  <X size={16} />
                </button>
              </form>
            ) : currentUser ? (
              <div 
                className="user-profile" 
                onClick={() => setShowUserSelector(!showUserSelector)} 
                title="Click to manage accounts"
              >
                <SkinAvatar username={currentUser.username} activeSkin={currentUser.active_skin} size={36} className="avatar" />
                <div className="user-info">
                  <span className="username">{currentUser.username}</span>
                  <span className="status">Offline Mode</span>
                </div>
                <ChevronDown size={14} className="user-profile-chevron" />
              </div>
            ) : (
              <button className="user-profile add-user-prompt" onClick={() => setIsAddingUser(true)}>
                <UserPlus className="avatar-placeholder" size={24} />
                <div className="user-info">
                  <span className="username">Add User</span>
                  <span className="status">Offline Login</span>
                </div>
              </button>
            )}
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="main-content">
          <div className="view-container">
            {activeTab === 'play' && (
              <>
                <div className="welcome-section">
                  <span className="badge">{currentInstance ? `Minecraft ${currentInstance.version}` : 'No Instance'}</span>
                  <h1 className="welcome-title">
                    {currentInstance ? currentInstance.name : 'Create an Instance'}
                  </h1>
                  <p className="welcome-subtitle">
                    Isolated environments: world saves, screenshots, options, and mods are stored completely separately.
                  </p>
                  {statusMsg && (
                    <div className="status-message">
                      {statusMsg}
                    </div>
                  )}
                </div>

                <div className="play-section">
                  <div className="version-selector">
                    <span className="version-label">Current Instance</span>
                    <div className="version-dropdown-container">
                      <select 
                        value={currentInstance?.name || ""} 
                        onChange={e => {
                          const inst = instances.find(i => i.name === e.target.value);
                          if (inst) setCurrentInstance(inst);
                        }}
                        className="version-select"
                      >
                        {instances.map(inst => (
                          <option key={inst.name} value={inst.name}>
                            {inst.name} ({inst.version})
                          </option>
                        ))}
                      </select>
                      <ChevronDown size={20} className="dropdown-arrow" />
                    </div>
                  </div>

                  <div className="play-btn-container">
                    {isDownloading || isPlaying ? (
                      <button 
                        className="play-btn stop-btn" 
                        onClick={handleStop}
                      >
                        <Square fill="currentColor" size={20} />
                        {isDownloading ? 'STOP LAUNCH' : 'STOP GAME'}
                      </button>
                    ) : (
                      <button 
                        className="play-btn" 
                        onClick={handlePlay}
                        disabled={!currentInstance}
                      >
                        <Play fill="currentColor" size={24} />
                        PLAY
                      </button>
                    )}
                  </div>

                  <button className="quick-settings" title="Instance Settings" onClick={() => setActiveTab('instances')}>
                    <Wrench size={24} />
                  </button>
                </div>
              </>
            )}

            {activeTab === 'instances' && (
              <div className="instances-view">
                <div className="instances-header">
                  <h2 className="view-title">Manage Instances</h2>
                  <p className="view-subtitle">Create and configure isolated Minecraft runtimes.</p>
                  {statusMsg && <div className="status-message">{statusMsg}</div>}
                </div>

                <div className="instances-layout">
                  {/* Left Column: List of Instances */}
                  <div className="instances-list-column">
                    <div className="instances-grid">
                      {/* List of Instances */}
                      {instances.map(inst => (
                        <div 
                          key={inst.name} 
                          className={`instance-card ${currentInstance?.name === inst.name ? 'active' : ''}`}
                          onClick={() => {
                            setCurrentInstance(inst);
                          }}
                          style={{ cursor: 'pointer' }}
                        >
                          <div className="instance-icon-wrapper">
                            <Gamepad2 className="instance-card-icon" size={32} />
                          </div>
                          <div className="instance-card-details">
                            <h3 className="instance-card-name">{inst.name}</h3>
                            <span className="instance-card-version">Minecraft {inst.version}</span>
                            {inst.mod_loader && (
                              <div className="instance-card-loader-badge">
                                {inst.mod_loader.toUpperCase()} {inst.mod_loader_version}
                              </div>
                            )}
                          </div>
                          <div className="instance-card-actions">
                            <button 
                              className="card-action-btn play" 
                              title="Select & Play"
                              onClick={(e) => {
                                e.stopPropagation();
                                setCurrentInstance(inst);
                                setActiveTab('play');
                              }}
                            >
                              <Play size={16} fill="currentColor" />
                            </button>
                            <button 
                              className="card-action-btn delete" 
                              title="Delete Instance"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteInstance(inst.name);
                              }}
                            >
                              <X size={16} />
                            </button>
                          </div>
                        </div>
                      ))}

                      {/* Create Instance Card */}
                      <div className="instance-card create-card">
                        <h3 className="create-card-title">New Instance</h3>
                        <form onSubmit={handleCreateInstance} className="create-instance-form">
                          <input 
                            type="text" 
                            placeholder="Name..." 
                            value={newInstanceName}
                            onChange={e => setNewInstanceName(e.target.value)}
                            required
                            className="create-input"
                          />
                          <div className="create-select-wrapper">
                            <select
                              value={newInstanceVersion}
                              onChange={e => setNewInstanceVersion(e.target.value)}
                              required
                              className="create-select"
                            >
                              <option value="" disabled>Version...</option>
                              {versions.map(v => (
                                <option key={v.id} value={v.id}>{v.id} ({v.type})</option>
                              ))}
                            </select>
                            <ChevronDown size={16} className="dropdown-arrow-small" />
                          </div>
                          <button type="submit" className="create-submit-btn">
                            Create
                          </button>
                        </form>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Configuration Summary */}
                  {currentInstance && (
                    <div className="instance-details-column">
                      <div className="details-header-row">
                        <div className="details-meta">
                          <h3 className="details-title">{currentInstance.name}</h3>
                          <span className="details-subtitle">Minecraft {currentInstance.version}</span>
                        </div>
                        <button
                          type="button"
                          className="open-folder-btn"
                          onClick={() => handleOpenInstanceFolder(currentInstance.name)}
                          title="Open Instance Directory"
                        >
                          <FolderOpen size={16} />
                          <span>Open Folder</span>
                        </button>
                      </div>

                      {/* Summary Section */}
                      <div className="details-section">
                        <h4 className="details-section-title">Instance Summary</h4>
                        <div className="summary-card glass-panel" style={{ padding: '16px', borderRadius: '8px', background: 'rgba(0, 0, 0, 0.2)', border: '1px solid var(--panel-border)', marginTop: '8px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                              <span style={{ color: 'var(--text-muted)' }}>Minecraft Version:</span>
                              <span style={{ color: '#ffffff', fontWeight: 600 }}>{currentInstance.version}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                              <span style={{ color: 'var(--text-muted)' }}>Mod Loader:</span>
                              <span style={{ color: currentInstance.mod_loader ? 'var(--success)' : '#ffffff', fontWeight: 600, textTransform: 'capitalize' }}>
                                {currentInstance.mod_loader || 'Vanilla'}
                              </span>
                            </div>
                            {currentInstance.mod_loader && (
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                                <span style={{ color: 'var(--text-muted)' }}>Loader Version:</span>
                                <span style={{ color: '#ffffff', fontWeight: 600 }}>{currentInstance.mod_loader_version || 'Default'}</span>
                              </div>
                            )}
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                              <span style={{ color: 'var(--text-muted)' }}>Installed Mods:</span>
                              <span style={{ color: '#ffffff', fontWeight: 600 }}>{installedMods.length} mods</span>
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          className="save-loader-btn"
                          onClick={() => setActiveTab('mods')}
                          style={{ marginTop: '16px', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                        >
                          <Wrench size={14} />
                          <span>Manage Mods & Loader</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'mods' && (
              <div className="mods-view">
                <div className="mods-header">
                  <h2 className="view-title">Mods Manager</h2>
                  <p className="view-subtitle">Select an instance to manage its mod loader and install mod jars.</p>
                  {statusMsg && <div className="status-message">{statusMsg}</div>}
                </div>

                <div className="mods-view-layout">
                  {/* Select Instance Dropdown and Mod Loader */}
                  <div className="mods-left-panel glass-panel">
                    <h3 className="panel-title">Instance Selection</h3>
                    <div className="mods-instance-selector-row">
                      <span className="selector-label">Target Instance</span>
                      <div className="selector-dropdown-wrapper">
                        <select
                          value={currentInstance?.name || ""}
                          onChange={(e) => {
                            const inst = instances.find(i => i.name === e.target.value);
                            if (inst) {
                              setCurrentInstance(inst);
                            }
                          }}
                          className="mods-instance-dropdown"
                        >
                          <option value="" disabled>Select Instance...</option>
                          {instances.map(inst => (
                            <option key={inst.name} value={inst.name}>
                              {inst.name} ({inst.version})
                            </option>
                          ))}
                        </select>
                        <ChevronDown size={16} className="dropdown-arrow-small" />
                      </div>
                    </div>

                    {currentInstance && (
                      <>
                        <div className="mods-divider"></div>
                        <h3 className="panel-title">Mod Loader Configuration</h3>
                        
                        <div className="mods-loader-config-card">
                          <div className="loader-field">
                            <label className="loader-label">Mod Loader</label>
                            <div className="loader-select-wrapper">
                              <select
                                value={modLoader}
                                onChange={(e) => {
                                  const loader = e.target.value;
                                  setModLoader(loader);
                                  setModLoaderVer("");
                                  if (loader !== "none") {
                                    fetchLoaderVersions(loader, currentInstance.version);
                                  } else {
                                    setModLoaderVersions([]);
                                  }
                                }}
                                className="loader-select"
                              >
                                <option value="none">None (Vanilla)</option>
                                <option value="fabric">Fabric</option>
                                <option value="quilt">Quilt</option>
                                <option value="forge">Forge</option>
                                <option value="neoforge">NeoForge</option>
                              </select>
                              <ChevronDown size={16} className="dropdown-arrow-small" />
                            </div>
                          </div>

                          {modLoader !== "none" && (
                            <div className="loader-field" style={{ marginTop: '14px' }}>
                              <label className="loader-label">Loader Version</label>
                              <div className="loader-select-wrapper">
                                <select
                                  value={modLoaderVer}
                                  onChange={(e) => setModLoaderVer(e.target.value)}
                                  className="loader-select"
                                >
                                  <option value="" disabled>Select Version...</option>
                                  {modLoaderVersions.map(ver => (
                                    <option key={ver} value={ver}>{ver}</option>
                                  ))}
                                </select>
                                <ChevronDown size={16} className="dropdown-arrow-small" />
                              </div>
                            </div>
                          )}

                          <button
                            type="button"
                            className="save-loader-btn-large"
                            onClick={handleSaveLoader}
                            style={{ marginTop: '18px', width: '100%' }}
                          >
                            Save Loader Settings
                          </button>
                        </div>

                        <div className="mods-divider"></div>
                        <div className="mods-actions-card">
                          <button
                            type="button"
                            className="open-folder-btn-large"
                            onClick={() => handleOpenInstanceFolder(currentInstance.name)}
                          >
                            <FolderOpen size={16} />
                            <span>Open Mods Folder</span>
                          </button>
                          <p className="helper-text">
                            You can drop jar files directly into the mods folder or use the uploader on the right.
                          </p>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Mods List and Upload */}
                  <div className="mods-right-panel glass-panel">
                    {currentInstance ? (
                      <>
                        <div className="panel-header-row" style={{ borderBottom: 'none', marginBottom: '8px', paddingBottom: '0' }}>
                          <div className="mods-subtab-headers">
                            <button
                              type="button"
                              className={`mods-subtab-btn ${modsSubTab === 'local' ? 'active' : ''}`}
                              onClick={() => setModsSubTab('local')}
                            >
                              Local Mods ({installedMods.length})
                            </button>
                            <button
                              type="button"
                              className={`mods-subtab-btn ${modsSubTab === 'modrinth' ? 'active' : ''}`}
                              onClick={() => {
                                setModsSubTab('modrinth');
                                if (modrinthResults.length === 0) {
                                  handleModrinthSearch(modrinthQuery);
                                }
                              }}
                            >
                              Add from Modrinth
                            </button>
                          </div>
                        </div>

                        {!currentInstance.mod_loader && (
                          <div className="vanilla-warning-box">
                            <AlertTriangle size={20} className="warning-icon" />
                            <div className="warning-content">
                              <strong>Vanilla Instance Mode</strong>
                              <p>Vanilla Minecraft ignores mods. Configure Fabric, Quilt, Forge, or NeoForge in the left panel to load mods.</p>
                            </div>
                          </div>
                        )}

                        {modsSubTab === 'local' ? (
                          <>
                            <div className="mods-list-container-large">
                              {isModsLoading ? (
                                <div className="mods-loading-state">Loading mods...</div>
                              ) : installedMods.length === 0 ? (
                                <div className="mods-empty-state">
                                  <Wrench size={48} className="empty-icon" />
                                  <p>No mods installed for this instance.</p>
                                  <p className="empty-subtext">Drop .jar files into the folder or click upload below.</p>
                                </div>
                              ) : (
                                <div className="installed-mods-list-large">
                                  {installedMods.map(mod => {
                                    const mismatch = currentInstance.mod_loader
                                      ? getModLoaderMismatch(mod, currentInstance.mod_loader)
                                      : null;
                                    return (
                                      <div key={mod} className="mod-item-large">
                                        <div className="mod-item-info" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                          <span className="mod-name" title={mod}>{mod}</span>
                                          {mismatch && (
                                            <span className="mod-mismatch-badge" title={mismatch}>
                                              {mismatch}
                                            </span>
                                          )}
                                        </div>
                                        <button
                                          type="button"
                                          className="delete-mod-btn-large"
                                          onClick={() => handleDeleteMod(mod)}
                                          title="Delete Mod"
                                        >
                                          <X size={14} />
                                        </button>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>

                            <div className="mods-upload-container-large">
                              <label className="upload-mod-btn-label-large">
                                <UserPlus size={18} />
                                <span>Upload Mod Jar File...</span>
                                <input
                                  type="file"
                                  accept=".jar"
                                  onChange={handleUploadMod}
                                  style={{ display: "none" }}
                                />
                              </label>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="modrinth-search-bar">
                              <input
                                type="text"
                                placeholder="Search mods on Modrinth..."
                                value={modrinthQuery}
                                onChange={(e) => setModrinthQuery(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    handleModrinthSearch(modrinthQuery);
                                  }
                                }}
                                className="modrinth-search-input"
                              />
                              <button
                                type="button"
                                className="modrinth-search-btn"
                                onClick={() => handleModrinthSearch(modrinthQuery)}
                              >
                                Search
                              </button>
                            </div>

                            <div className="modrinth-results-container">
                              {isModrinthSearching ? (
                                <div className="mods-loading-state">Searching Modrinth...</div>
                              ) : modrinthResults.length === 0 ? (
                                <div className="mods-empty-state">
                                  <Compass size={48} className="empty-icon" />
                                  <p>No mods found. Try adjusting your search query.</p>
                                  <p className="empty-subtext">Filters: Minecraft {currentInstance.version} • Loader: {currentInstance.mod_loader || 'none'}</p>
                                </div>
                              ) : (
                                <div className="modrinth-results-list">
                                  {modrinthResults.map((mod: any) => {
                                    const isInstalled = installedMods.some(localName => 
                                      localName.toLowerCase().replace(/\s+/g, '').includes(mod.title.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '')) ||
                                      localName.toLowerCase().includes(mod.slug.toLowerCase())
                                    ) || installedModIds.includes(mod.project_id);
                                    
                                    const isInstalling = installingModId === mod.project_id;
                                    
                                    return (
                                      <div key={mod.project_id} className="modrinth-result-item">
                                        <img
                                          src={mod.icon_url || "/steve.png"} 
                                          alt={mod.title}
                                          className="modrinth-mod-icon"
                                          onError={(e) => {
                                            (e.target as HTMLImageElement).src = "/steve.png";
                                          }}
                                        />
                                        <div className="modrinth-mod-details">
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                            <span className="modrinth-mod-title">{mod.title}</span>
                                            <span className="modrinth-mod-author">by {mod.author}</span>
                                          </div>
                                          <p className="modrinth-mod-description">{mod.description}</p>
                                          <span className="modrinth-mod-downloads">{mod.downloads.toLocaleString()} downloads</span>
                                        </div>
                                        
                                        <button
                                          type="button"
                                          className={`modrinth-install-btn ${isInstalled ? 'installed' : ''} ${isInstalling ? 'installing' : ''}`}
                                          disabled={isInstalled || isInstalling}
                                          onClick={() => handleInstallModrinthMod(mod)}
                                        >
                                          {isInstalling ? 'Installing...' : isInstalled ? 'Installed' : 'Install'}
                                        </button>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </>
                        )}
                      </>
                    ) : (
                      <div className="panel-empty-state">
                        <Wrench size={48} className="empty-icon" />
                        <p>Please select an instance from the left column to view its mods.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'discover' && (
              <div className="placeholder-view">
                <Compass size={48} className="placeholder-icon" />
                <h2>Discover Modpacks</h2>
                <p>Explore curated modpacks and maps directly inside Rift Launcher. (Coming soon)</p>
              </div>
            )}

            {activeTab === 'skins' && (
              <div className="skins-view-container">
                <div className="skins-view-header">
                  <h2 className="view-title">Skins Manager</h2>
                  <p className="view-subtitle">Select, upload, and view player models in real-time 3D.</p>
                  {statusMsg && <div className="status-message">{statusMsg}</div>}
                </div>

                <div className="skins-view-body">
                  {/* Left Column: 3D Preview */}
                  <div className="skins-preview-column glass-panel">
                    <h3 className="column-title">3D Preview</h3>
                    {selectedSkinUser ? (
                      <div className="preview-model-wrapper">
                        <SkinViewer3D 
                          username={selectedSkinUser.username} 
                          skinName={selectedSkinName} 
                        />
                        <div className="selected-skin-meta">
                          <span className="selected-skin-title">
                            {selectedSkinName || "Default Steve"}
                          </span>
                          <span className="selected-skin-owner">
                            Profile: {selectedSkinUser.username}
                          </span>
                          
                          {/* Set Active Button */}
                          {selectedSkinUser.active_skin !== (selectedSkinName || undefined) && (
                            <button
                              type="button"
                              className="set-active-skin-btn"
                              onClick={async () => {
                                if (selectedSkinUser) {
                                  await handleSelectSkinForUser(selectedSkinUser.username, selectedSkinName || "");
                                  // Refresh user state
                                  const updatedUsers = await invoke<User[]>("get_users");
                                  const matched = updatedUsers.find(u => u.username === selectedSkinUser.username);
                                  if (matched) setSelectedSkinUser(matched);
                                }
                              }}
                            >
                              Apply to {selectedSkinUser.username}
                            </button>
                          )}
                          {selectedSkinUser.active_skin === (selectedSkinName || undefined) && (
                            <div className="skin-applied-badge">
                              <Check size={12} /> Applied
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="preview-empty-state">
                        <User size={48} className="placeholder-icon" />
                        <p>Select a skin from the list to preview it in 3D</p>
                      </div>
                    )}
                  </div>

                  {/* Right Column: List & Upload */}
                  <div className="skins-list-column glass-panel">
                    <div className="profile-select-header">
                      <span className="profile-select-label">Active Profile</span>
                      <div className="profile-dropdown-wrapper">
                        <select
                          value={selectedSkinUser?.username || ""}
                          onChange={(e) => {
                            const matched = users.find(u => u.username === e.target.value);
                            if (matched) {
                              setSelectedSkinUser(matched);
                              setSelectedSkinName(matched.active_skin || null);
                            }
                          }}
                          className="profile-select-dropdown"
                        >
                          {users.map(u => (
                            <option key={u.username} value={u.username}>
                              {u.username}
                            </option>
                          ))}
                        </select>
                        <ChevronDown size={16} className="dropdown-arrow-small" />
                      </div>
                    </div>

                    {selectedSkinUser && (
                      <div className="skins-management-content">
                        <div className="skins-section-title">Saved Skins</div>
                        <div className="skins-grid-3d-tab">
                          {/* Default Steve Skin */}
                          <div 
                            className={`skin-card-item ${selectedSkinName === null ? 'active' : ''}`}
                            onClick={() => setSelectedSkinName(null)}
                          >
                            <div className="skin-card-face-wrapper">
                              <SkinAvatar username={selectedSkinUser.username} size={48} />
                            </div>
                            <div className="skin-card-details">
                              <span className="skin-card-name">Default Steve</span>
                              {(selectedSkinUser.active_skin === undefined || selectedSkinUser.active_skin === null || selectedSkinUser.active_skin === "") ? (
                                <span className="skin-card-status">Active</span>
                              ) : null}
                            </div>
                          </div>

                          {/* Custom Skins */}
                          {selectedSkinUser.skins?.map(skin => (
                            <div 
                              key={skin}
                              className={`skin-card-item ${selectedSkinName === skin ? 'active' : ''}`}
                              onClick={() => setSelectedSkinName(skin)}
                            >
                              <div className="skin-card-face-wrapper">
                                <SkinAvatar username={selectedSkinUser.username} activeSkin={skin} size={48} />
                              </div>
                              <div className="skin-card-details">
                                <span className="skin-card-name">{skin}</span>
                                {selectedSkinUser.active_skin === skin ? (
                                  <span className="skin-card-status">Active</span>
                                ) : null}
                              </div>
                              <button 
                                className="skin-card-delete-btn"
                                type="button"
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  if (!window.confirm(`Delete skin '${skin}'?`)) return;
                                  try {
                                    await invoke("delete_user_skin", { username: selectedSkinUser.username, skinName: skin });
                                    const updatedUsers = await invoke<User[]>("get_users");
                                    setUsers(updatedUsers);
                                    const matched = updatedUsers.find(u => u.username === selectedSkinUser.username);
                                    if (matched) {
                                      setSelectedSkinUser(matched);
                                      if (selectedSkinName === skin) {
                                        setSelectedSkinName(null);
                                      }
                                    }
                                    if (currentUser?.username === selectedSkinUser.username) {
                                      const matchedActive = updatedUsers.find(u => u.username === currentUser.username);
                                      if (matchedActive) setCurrentUser(matchedActive);
                                    }
                                    setStatusMsg(`Deleted skin '${skin}' successfully.`);
                                  } catch (err) {
                                    console.error(err);
                                  }
                                }}
                                title="Delete Skin"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          ))}
                        </div>

                        <div className="skins-upload-section">
                          <label className="upload-skin-area-btn">
                            <UserPlus size={20} />
                            <div className="upload-btn-texts">
                              <span className="upload-title">Upload new skin PNG...</span>
                              <span className="upload-subtitle">Supports standard 64x64 or 64x32 textures</span>
                            </div>
                            <input 
                              type="file" 
                              accept="image/png"
                              onChange={handleUploadSkinForUser(selectedSkinUser.username)}
                              style={{ display: 'none' }}
                            />
                          </label>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'logs' && (
              <div className="logs-view-layout-container">
                <div className="logs-header-section">
                  <h2 className="view-title">System & Game Logs</h2>
                  <p className="view-subtitle">Monitor real-time output and debug reports from Minecraft.</p>
                </div>
                <div className="logs-main-card glass-panel">
                  <div className="logs-control-bar">
                    <div className="logs-instance-selector-group">
                      <span className="selector-label">Target Instance</span>
                      <div className="selector-dropdown-wrapper">
                        <select
                          value={currentInstance?.name || ""}
                          onChange={(e) => {
                            const inst = instances.find(i => i.name === e.target.value);
                            if (inst) {
                              setCurrentInstance(inst);
                              fetchLogs(inst.name);
                            }
                          }}
                          className="logs-instance-dropdown"
                        >
                          <option value="" disabled>Select Instance...</option>
                          {instances.map(inst => (
                            <option key={inst.name} value={inst.name}>
                              {inst.name} ({inst.version})
                            </option>
                          ))}
                        </select>
                        <ChevronDown size={16} className="dropdown-arrow-small" />
                      </div>
                    </div>
                    <div className="logs-actions-group">
                      <button
                        type="button"
                        className="logs-btn refresh"
                        onClick={() => currentInstance && fetchLogs(currentInstance.name)}
                      >
                        <RefreshCw size={14} />
                        <span>Refresh</span>
                      </button>
                      <button
                        type="button"
                        className="logs-btn clear"
                        onClick={() => setLogsText("")}
                      >
                        <span>Clear View</span>
                      </button>
                    </div>
                  </div>
                  <div className="logs-terminal-viewer" ref={logsTerminalRef}>
                    {logsText ? (
                      <pre className="logs-pre-content">{logsText}</pre>
                    ) : (
                      <div className="logs-viewer-empty">
                        <Terminal size={48} className="empty-icon" />
                        <p>No log records loaded.</p>
                        <p className="empty-subtext">Select an instance and click refresh, or launch Minecraft to capture output logs here.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'settings' && (
              <div className="settings-view">
                <div className="settings-header">
                  <h2 className="view-title">Launcher Settings</h2>
                  <p className="view-subtitle">Adjust memory limits, launch wrappers, and extra Java flags.</p>
                  {statusMsg && <div className="status-message">{statusMsg}</div>}
                </div>

                {/* Quick Instance Switcher Tabs */}
                <div className="settings-switcher-container">
                  <span className="settings-switcher-label">Instance Profile</span>
                  <div className="settings-tabs-list">
                    {instances.map(inst => (
                      <button
                        key={inst.name}
                        type="button"
                        className={`settings-tab-btn ${settingsInstanceName === inst.name ? 'active' : ''}`}
                        onClick={() => handleSettingsInstanceChange(inst.name)}
                      >
                        <Gamepad2 size={14} className="tab-btn-icon" />
                        <div className="tab-btn-meta">
                          <span className="tab-btn-name">{inst.name}</span>
                          <span className="tab-btn-version">Minecraft {inst.version}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <form onSubmit={(e) => {
                  e.preventDefault();
                  handleSaveSettings({
                    max_ram: maxRam,
                    min_ram: minRam,
                    use_gamemode: useGamemode,
                    use_mangohud: useMangohud,
                    jvm_args: jvmArgs
                  });
                }} className="settings-form">
                  <div className="settings-section">
                    <h3 className="section-title">Java Memory Allocation (RAM)</h3>
                    <div className="memory-controls">
                      <div className="memory-control">
                        <div className="label-wrapper">
                          <label className="input-label">Minimum RAM (GB)</label>
                          <span className="value-display">{minRam} GB</span>
                        </div>
                        <input 
                          type="range" 
                          min="1" 
                          max="16" 
                          value={minRam}
                          onChange={e => {
                            const val = parseInt(e.target.value);
                            setMinRam(val);
                            if (val > maxRam) setMaxRam(val);
                          }}
                          className="settings-range"
                        />
                      </div>

                      <div className="memory-control">
                        <div className="label-wrapper">
                          <label className="input-label">Maximum RAM (GB)</label>
                          <span className="value-display">{maxRam} GB</span>
                        </div>
                        <input 
                          type="range" 
                          min="1" 
                          max="32" 
                          value={maxRam}
                          onChange={e => {
                            const val = parseInt(e.target.value);
                            setMaxRam(val);
                            if (val < minRam) setMinRam(val);
                          }}
                          className="settings-range"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="settings-section">
                    <h3 className="section-title">Linux Wrapper Settings</h3>
                    <div className="toggles-grid">
                      <div className="toggle-control" onClick={() => setUseGamemode(!useGamemode)}>
                        <div className="toggle-info">
                          <span className="toggle-label">Feral GameMode</span>
                          <p className="toggle-desc">Prepend 'gamemoderun' to optimize system settings on launch.</p>
                        </div>
                        <div className={`switch ${useGamemode ? 'on' : ''}`}>
                          <div className="slider"></div>
                        </div>
                      </div>

                      <div className="toggle-control" onClick={() => setUseMangohud(!useMangohud)}>
                        <div className="toggle-info">
                          <span className="toggle-label">MangoHud Overlay</span>
                          <p className="toggle-desc">Prepend 'mangohud' to show FPS, CPU/GPU loads, and temperatures.</p>
                        </div>
                        <div className={`switch ${useMangohud ? 'on' : ''}`}>
                          <div className="slider"></div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="settings-section">
                    <h3 className="section-title">Custom Java Arguments</h3>
                    <textarea 
                      placeholder="JVM flags..." 
                      value={jvmArgs}
                      onChange={e => setJvmArgs(e.target.value)}
                      className="settings-textarea"
                      rows={4}
                    />
                  </div>

                  <div className="settings-section">
                    <h3 className="section-title">Launcher Theme</h3>
                    <div className="theme-controls">
                      <p className="settings-desc" style={{ marginBottom: '12px', fontSize: '12px', color: 'var(--text-muted)' }}>
                        Select a theme style or add custom themes by placing JSON files in the themes folder.
                      </p>
                      
                      <div className="theme-grid">
                        {themes.map(t => (
                          <button
                            key={t.name}
                            type="button"
                            className={`theme-card ${activeThemeName === t.name ? 'active' : ''}`}
                            onClick={() => handleThemeChange(t.name)}
                          >
                            <span className="theme-card-name">{t.name}</span>
                            {t.is_custom && <span className="theme-custom-badge">Custom</span>}
                          </button>
                        ))}
                      </div>

                      <div className="theme-actions">
                        <button 
                          type="button" 
                          className="theme-action-btn secondary"
                          onClick={handleOpenThemesFolder}
                        >
                          <FolderOpen size={14} />
                          Open Themes Folder
                        </button>
                        <button 
                          type="button" 
                          className="theme-action-btn secondary"
                          onClick={handleRefreshThemes}
                        >
                          <RefreshCw size={14} />
                          Refresh Themes
                        </button>
                      </div>
                    </div>
                  </div>



                  <button type="submit" className="save-settings-btn">
                    Save Configurations
                  </button>
                </form>
              </div>
            )}
          </div>
        </main>
      </div>

      {launchError && (
        <div className="modal-overlay">
          <div className="error-modal glass-panel">
            <div className="error-modal-header">
              <AlertTriangle size={24} className="error-icon" />
              <h3>Minecraft Launch Failure</h3>
            </div>
            
            <div className="error-modal-body">
              <p className="error-instance-label">Instance: <strong>{launchError.instanceName}</strong></p>
              
              <div className="error-suggestion-box">
                <span className="suggestion-title">Suggested Solution</span>
                <p className="suggestion-text">{launchError.suggestion}</p>
              </div>

              <div className="error-details-collapsible">
                <details>
                  <summary>Technical Details (Stdout/Stderr)</summary>
                  <pre className="error-raw-pre">{launchError.rawError}</pre>
                </details>
              </div>
            </div>

            <div className="error-modal-footer">
              <button
                type="button"
                className="error-modal-btn secondary"
                onClick={() => {
                  setLaunchError(null);
                  setActiveTab("logs");
                  fetchLogs(launchError.instanceName);
                }}
              >
                Go to Logs
              </button>
              <button
                type="button"
                className="error-modal-btn primary"
                onClick={() => setLaunchError(null)}
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
