# Build Lifecycle

Every `electron-builder build` run passes through a fixed sequence of phases: dependency resolution, app staging, code signing, distributable assembly, and artifact publication. Understanding this sequence tells you **which hook to use**, **when it fires**, and **what state the filesystem is in** when your code runs.

## Complete Build Flow

```
electron-builder build
│
├─ 1. Configuration & Validation
│   └─ Load config, merge platform defaults, resolve output paths
│
├─ 2. For each Platform × Architecture
│   │
│   ├─ 2a. Install / Rebuild Native Deps
│   │   └─ 🪝 beforeBuild
│   │
│   ├─ 2b. Pre-Pack
│   │   └─ 🪝 beforePack
│   │
│   ├─ 2c. Extract Electron Binary → staging dir
│   │   └─ 🪝 afterExtract
│   │
│   ├─ 2d. Copy App Files
│   │   ├─ Filter via files / file patterns
│   │   ├─ Pack node_modules (honor onNodeModuleFile)
│   │   ├─ Create ASAR archive (if enabled)
│   │   ├─ Copy extraResources
│   │   └─ Copy extraFiles
│   │
│   ├─ 2e. Post-Pack (before signing)
│   │   └─ 🪝 afterPack
│   │
│   ├─ 2f. Apply Electron Fuses (if configured)
│   │
│   ├─ 2g. Code Sign the .app / .exe
│   │   └─ 🪝 afterSign  (only fires if signing actually ran)
│   │
│   └─ 2h. Build Distributables — For each Target
│       ├─ 🪝 artifactBuildStarted
│       ├─ [Target-specific build — see per-target section below]
│       └─ 🪝 artifactBuildCompleted
│           └─ Publish Manager schedules artifact upload
│
├─ 3. All Builds Complete
│   └─ 🪝 afterAllArtifactBuild
│
└─ 4. Publish
    └─ Upload all queued artifacts to configured providers
```

---

## Phase-by-Phase Reference

### Phase 1 — Configuration & Validation

electron-builder reads and merges configuration from (in priority order): CLI flags, `electron-builder.config.*`, `package.json#build`. Platform-specific options (`mac`, `win`, `linux`) are overlaid on top of the base config. Output directories are resolved and created.

No hooks fire here.

---

### Phase 2a — Install / Rebuild Native Dependencies

Before staging the app, electron-builder optionally rebuilds native Node.js add-ons (`node-gyp rebuild`) for the target platform and architecture. This happens once per platform/arch combination.

#### 🪝 `beforeBuild`

| Property | Value |
|---|---|
| **Fires** | Before native dependency install/rebuild |
| **Return `false`** | Skips native dependency installation entirely |
| **Context type** | `BeforeBuildContext` |

```js
beforeBuild: async ({ appDir, electronVersion, platform, arch }) => {
  console.log(`Building native deps for ${platform.name} ${arch}`)
  // return false to skip; useful when node_modules are managed externally
}
```

See also: [Loading App Dependencies Manually](/docs/tutorials/loading-app-dependencies-manually)

---

### Phase 2b — Pre-Pack

Fires before any file copying begins. The staging directory (`appOutDir`) has been created but is empty.

#### 🪝 `beforePack`

| Property | Value |
|---|---|
| **Fires** | Before files are copied into the app bundle |
| **Staging dir state** | Empty |
| **Context type** | `BeforePackContext` |

```js
beforePack: async ({ outDir, appOutDir, packager, electronPlatformName, arch, targets }) => {
  // Generate files that need to be in the build
}
```

---

### Phase 2c — Extract Electron Binary

The Electron binary for the target platform/arch is downloaded (or read from cache) and extracted into the staging directory. After this phase the directory contains the unmodified Electron shell — no app code yet.

#### 🪝 `afterExtract`

| Property | Value |
|---|---|
| **Fires** | After Electron is extracted; before any app files are placed |
| **Staging dir state** | Contains Electron binary only |
| **Context type** | `AfterExtractContext` (same shape as `PackContext`) |

```js
afterExtract: async ({ outDir, appOutDir, packager, electronPlatformName, arch, targets }) => {
  // Modify the Electron binary itself, e.g. replace embedded resources
}
```

To provide a fully custom Electron build instead of downloading the standard release, use the `electronDist` hook:

#### 🪝 `electronDist`

| Property | Value |
|---|---|
| **Fires** | Before Electron extraction, to override the source |
| **Return** | Path to a custom Electron directory or a folder of zip files |

```js
electronDist: async (context) => {
  return "/path/to/custom-electron-dist"
}
```

---

### Phase 2d — Copy App Files

This is the main packaging phase. electron-builder:

1. Computes the file set based on the `files` glob patterns (defaulting to everything except `node_modules` and dev artifacts).
2. Filters `node_modules` — only production deps are included by default.
3. Creates an ASAR archive (enabled by default). In v27 the `asar: true` sentinel was removed — omit the key to keep defaults, pass an `asar: {}` object to configure it, or `asar: false` to disable.
4. Copies `extraResources` into the platform resources directory.
5. Copies `extraFiles` into the app root.

#### 🪝 `onNodeModuleFile`

| Property | Value |
|---|---|
| **Fires** | Once per file inside `node_modules` during packaging |
| **Return `true`** | Force-include the file |
| **Return `false`** | Force-exclude the file |
| **Return `undefined`/`void`** | Use default inclusion logic |

```js
onNodeModuleFile: (filePath) => {
  if (filePath.includes("__tests__") || filePath.endsWith(".test.js")) {
    return false  // exclude test files from all modules
  }
}
```

No other hooks fire during file copying. Use `afterPack` (next phase) to inspect or modify the result.

---

### Phase 2e — Post-Pack (before signing)

All app files are in the staging directory. The app bundle is complete but **unsigned**. This is the primary hook for modifying the packaged app.

#### 🪝 `afterPack`

| Property | Value |
|---|---|
| **Fires** | After all files are packaged; **before** code signing |
| **Staging dir state** | Complete app bundle, unsigned |
| **Context type** | `AfterPackContext` |

```js
afterPack: async ({ outDir, appOutDir, packager, electronPlatformName, arch, targets }) => {
  // appOutDir points to the staged .app / win-unpacked / linux-unpacked dir
  const { join } = require("path")
  const { writeFileSync } = require("fs")
  writeFileSync(join(appOutDir, "VERSION"), packager.appInfo.version)
}
```

**Common uses:**
- Inject a `VERSION` or `BUILD_ID` file into the bundle
- Modify `Info.plist` (macOS) or `resources/app.asar` contents
- Strip debug symbols / strip binaries before signing

---

### Phase 2f — Apply Electron Fuses

If `electronFuses` is configured, fuse bits are flipped in the Electron binary at this point — after packing, before signing. Fuses are baked into the binary and cannot be changed post-sign.

See: [Adding Electron Fuses](/docs/tutorials/adding-electron-fuses)

---

### Phase 2g — Code Sign

The app bundle is signed using the platform-native toolchain:

| Platform | Tool | What is signed |
|---|---|---|
| macOS | `codesign` | `.app` bundle, all frameworks and dylibs |
| Windows | `signtool.exe` | EXE and DLL files |
| Linux | _(no signing in this phase)_ | — |

Notarization (macOS) runs here when `mac.notarize: true` is set.

#### 🪝 `afterSign`

| Property | Value |
|---|---|
| **Fires** | After signing completes; **only if signing actually ran** |
| **Not fired** | When signing is skipped (no certificate configured) |
| **Context type** | `AfterPackContext` |

```js
afterSign: async ({ outDir, appOutDir, packager, electronPlatformName, arch, targets }) => {
  // App is signed. Distributables have not been built yet.
}
```

:::tip[Built-in notarization]
Use `mac.notarize: true` for standard notarization — electron-builder handles it automatically. Only reach for `afterSign` when you need a custom notarization flow. See [Notarization](/docs/features/code-signing/notarization).
:::

For a fully custom signing implementation (replacing the built-in signer):

```yaml
# electron-builder.config.yml
mac:
  sign: ./scripts/custom-sign.js
win:
  sign:
    type: signtool
    sign: ./scripts/custom-sign.js
```

---

### Phase 2h — Build Distributables (per target)

For each requested output format (NSIS, DMG, AppImage, etc.), electron-builder assembles the final distributable from the staged app. Target builds run after signing, so the inputs are always signed binaries.

Two hooks bracket every target build:

#### 🪝 `artifactBuildStarted`

| Property | Value |
|---|---|
| **Fires** | Immediately before a single artifact starts building |
| **Context type** | `ArtifactBuildStarted` |

```js
artifactBuildStarted: async ({ targetPresentableName, file, safeArtifactName, packager, arch }) => {
  console.log(`Starting: ${targetPresentableName}`)
}
```

#### 🪝 `artifactBuildCompleted`

| Property | Value |
|---|---|
| **Fires** | Immediately after a single artifact finishes building |
| **Context type** | `ArtifactCreated` |

```js
artifactBuildCompleted: async ({ file, safeArtifactName, target, packager, arch, sha512 }) => {
  console.log(`Done: ${file}  SHA512: ${sha512}`)
}
```

After `artifactBuildCompleted` fires, the Publish Manager queues the artifact for upload and schedules update-metadata generation (`latest.yml`, `latest-mac.yml`, etc.).

#### Target-specific hooks

Some targets expose additional hooks that fire inside their own build sequence:

| Hook | Target | Fires when |
|---|---|---|
| `msiProjectCreated` | MSI (WiX) | After WiX `.wxs` file is written to disk, before `candle.exe` / `light.exe` |
| `appxManifestCreated` | AppX / MSIX | After `AppxManifest.xml` is written to disk, before `makeappx.exe` |

```js
// Edit the WiX XML before MSI compilation
msiProjectCreated: async (wixProjectPath) => {
  const fs = require("fs")
  const wxsPath = require("path").join(wixProjectPath, "installer.wxs")
  let xml = fs.readFileSync(wxsPath, "utf8")
  xml = xml.replace('Manufacturer="PLACEHOLDER"', 'Manufacturer="Acme Corp"')
  fs.writeFileSync(wxsPath, xml)
}
```

```js
// Edit the AppX manifest before packaging
appxManifestCreated: async (manifestPath) => {
  const fs = require("fs")
  let manifest = fs.readFileSync(manifestPath, "utf8")
  manifest = manifest.replace(/<DisplayName>.*?<\/DisplayName>/, "<DisplayName>My App</DisplayName>")
  fs.writeFileSync(manifestPath, manifest)
}
```

---

### Phase 3 — All Builds Complete

Every platform, architecture, and target has finished. All artifacts are on disk.

#### 🪝 `afterAllArtifactBuild`

| Property | Value |
|---|---|
| **Fires** | After **every** platform/arch/target finishes; before publishing |
| **Context type** | `BuildResult` |
| **Return** | `string[]` — additional file paths to include in publish |

```js
afterAllArtifactBuild: async ({ outDir, artifactPaths, platformToTargets, configuration }) => {
  // Upload debug symbols
  const dsymPaths = artifactPaths.filter(p => p.endsWith(".dSYM"))
  for (const p of dsymPaths) {
    await uploadToSentry(p)
  }

  // Return extra files to include in the publish step
  const changelog = `${outDir}/CHANGELOG.md`
  writeChangelog(changelog)
  return [changelog]
}
```

---

### Phase 4 — Publish

The Publish Manager uploads all queued artifacts (and any extra paths returned from `afterAllArtifactBuild`) to the configured providers: GitHub Releases, S3, DigitalOcean Spaces, Generic server, GitLab, Keygen, Snap Store, etc.

Update metadata files (`latest.yml`, `latest-mac.yml`, `latest-linux.yml`) are written to the output directory and included in the publish.

See [Publish Configuration](/docs/publish) for provider setup.

---

## Hook Summary Table

| Hook | Phase | What the filesystem looks like | Common use |
|---|---|---|---|
| `beforeBuild` | 2a | Source tree only | Skip or customize native rebuild |
| `beforePack` | 2b | Empty staging dir | Inject generated source files |
| `afterExtract` | 2c | Staging: Electron binary only | Modify the Electron binary |
| `electronDist` | 2c | _(before extraction)_ | Supply a custom Electron build |
| `onNodeModuleFile` | 2d | _(during file copy)_ | Filter node_modules inclusions |
| `afterPack` | 2e | Staging: full app bundle, unsigned | Modify bundle before signing |
| `afterSign` | 2g | Staging: full app bundle, signed | Custom post-sign steps |
| `artifactBuildStarted` | 2h | Target build starting | Logging, timing |
| `msiProjectCreated` | 2h (MSI) | WiX `.wxs` file on disk | Edit WiX XML |
| `appxManifestCreated` | 2h (AppX) | `AppxManifest.xml` on disk | Edit AppX manifest |
| `artifactBuildCompleted` | 2h | Artifact file on disk | Checksums, per-artifact upload |
| `afterAllArtifactBuild` | 3 | All artifacts on disk | Symbol upload, extra publish paths |

---

## Target Build Sequences

Each target runs inside Phase 2h. Here is what happens inside each one:

### Windows

| Target | Sequence |
|---|---|
| **NSIS** | Generate script → compile with `makensis` → sign installer → emit artifact |
| **MSI (WiX)** | Write `.wxs` → `msiProjectCreated` hook → `candle.exe` + `light.exe` → sign → emit |
| **AppX / MSIX** | Write manifest → `appxManifestCreated` hook → `makeappx.exe` + `makepri.exe` → sign → emit |
| **Portable** | Copy staged app into a self-extracting archive → emit |

### macOS

| Target | Sequence |
|---|---|
| **DMG** | Create `.dmg` via `dmgbuild` → emit |
| **ZIP** | Archive `.app` bundle → emit |
| **PKG** | Build `.pkg` via `pkgbuild` + `productbuild` → sign → emit |
| **MAS** | Re-sign with MAS provisioning profile → build `pkg` → emit |

### Linux

| Target | Sequence |
|---|---|
| **AppImage** | Create squashfs image → embed ELF header → emit |
| **DEB / RPM / Pacman** | Package via `fpm` → emit |
| **Snap** | Write `snapcraft.yaml` → run `snapcraft` → emit |
| **Flatpak** | Write manifest → run `flatpak-builder` → emit |

---

## Concurrency

By default electron-builder packs one platform/architecture combination at a time (`concurrency.jobs: 1`). Raising this value runs multiple platform × arch pack operations in parallel using an async pool.

```yaml
# electron-builder.config.yml
concurrency:
  jobs: 2   # pack up to 2 platform/arch combos simultaneously
```

### What concurrency affects

| Scope | Behavior |
|---|---|
| **Platform × arch loop** | Up to `jobs` pack operations run in parallel |
| **Hooks within one pack** | Always serial — each hook is fully awaited before the build advances |
| **`afterAllArtifactBuild`** | Fires once, after **all** concurrent packs complete |

So with `jobs: 2` and a build targeting `mac/x64`, `mac/arm64`, and `win/x64`:

- `mac/x64` and `mac/arm64` start concurrently (2 slots)
- `win/x64` starts as soon as one of the mac slots finishes
- `afterAllArtifactBuild` fires after the last one completes

### Concurrency limit

Setting `jobs` above `8` (the internal `MAX_FILE_REQUESTS` constant) logs a warning because each concurrent pack opens many file handles simultaneously. Exceeding the OS file descriptor limit causes `EMFILE` errors. The value is floored to an integer; any value less than `1` is reset to `1`.

```yaml
concurrency:
  jobs: 4   # safe upper bound on most systems
```

### Hook author implications

Because hooks for different platform/arch combinations may run at the same time, avoid writing to shared paths without coordination. Each hook receives its own `appOutDir`, `outDir`, and `arch` so there is no conflict when writing into the staging directory — the risk is only if your hook writes to a fixed global path (a log file, a shared temp directory, etc.).

See [Multi Platform Build](/docs/features/multi-platform-build) and [Build Architectures](/docs/architecture).

---

## Further Reading

- [Hooks Reference](/docs/features/hooks) — full API for every hook, with examples
- [File Patterns](/docs/file-patterns) — how `files`, `extraResources`, and `extraFiles` work
- [Code Signing](/docs/features/code-signing/code-signing) — signing setup for macOS and Windows
- [Publish Configuration](/docs/publish) — provider setup and update metadata
- [Programmatic Usage](/docs/programmatic-usage) — drive the build from Node.js
