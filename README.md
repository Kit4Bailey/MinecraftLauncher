# NoxLauncher

NoxLauncher is a sleek, lightweight, offline (cracked) Minecraft launcher built on a high-performance **Tauri (Rust)** backend and a responsive **React + TypeScript** frontend. 

It is designed with rich, modern, and minimal OLED-black aesthetics, featuring native window control integrations, isolated game directories, custom skins, mod loader setups, Modrinth search capabilities, and a real-time console log viewer.

---

## ✨ Features

- **👤 Multi-User Offline Support (Cracked):** Create and manage local offline profiles instantly with automatic UUID generation.
- **👕 3D Skin Manager:** Upload skin files, preview them in an interactive real-time 3D model viewer, and save multiple skins per user with face-icon tags.
- **📂 Isolated Instances:** Create and play distinct Minecraft versions, each stored in their own directories to keep your save games, resource packs, and configurations completely clean.
- **🛠️ Integrated Mod Loaders:** Seamlessly install and configure **Fabric, Quilt, Forge, and NeoForge** mod loaders directly from the UI.
- **🔍 Modrinth Integration:** Browse, filter, and install mods with strict compatibility checks (Minecraft version and loader matching) to prevent game crashes.
- **📜 Console Logs Viewer:** Stream live stdout/stderr logs directly from the Minecraft JVM process into a monospace terminal interface.
- **💡 Crash Diagnosis Popup:** Analyzes JVM exceptions and exits, providing helpful instructions on how to solve launch issues (e.g. out of memory, Java mismatches, or missing mods).
- **🎨 OLED Custom Themes:** Choose from built-in OLED-black, Nord, Slate, or Rose Pine themes, or load your custom JSON theme files.

---

## 🚀 Getting Started

### Prerequisites

To compile and run NoxLauncher, you need:

1. **Rust:** Install via [rustup](https://rustup.rs/)
2. **Node.js & npm:** Install from [nodejs.org](https://nodejs.org/)
3. **Java:** Ensure you have Java 17 and Java 21 installed on your system (Java 17 is required for MC 1.17+, and Java 21 is required for MC 1.20.5+).

### Development Setup

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd MinecraftLauncher
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Run in development mode:**
   ```bash
   npm run tauri dev
   ```

---

## 📦 Building for Production

To compile a production-ready package for your platform (Linux/Windows):

```bash
npm run tauri build
```

This will output an optimized installer/binary under the `src-tauri/target/release/bundle/` directory.

---

## 📂 Directory Structure

NoxLauncher isolates all files under your home directory to prevent conflicts with official Minecraft launchers:

- **Config & Logs:** `~/.noxlauncher/`
  - **Instances:** `~/.noxlauncher/instances/<instance_name>/` (Holds mods, saves, options, resource packs)
  - **Skins:** `~/.noxlauncher/skins/<username>/`
  - **Custom Themes:** `~/.noxlauncher/themes/`
  - **Minecraft Assets & Libraries:** Shared under `~/.noxlauncher/assets/` and `~/.noxlauncher/libraries/`

---

## ⚖️ Legal & Disclaimer

NoxLauncher is an offline (cracked) client developed for educational purposes, mod testing, and offline play. If you enjoy Minecraft, please support the developers by purchasing an official account at [minecraft.net](https://www.minecraft.net/).
