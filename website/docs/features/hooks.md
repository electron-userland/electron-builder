## Build Hooks

Build hooks let you run custom code at specific points in the electron-builder build lifecycle. Use them to modify the app bundle, perform additional signing, upload symbols, or integrate with external services.

## Build Lifecycle

Hooks fire in this order during every build. Pick the hook that runs at the right stage for your task — modifying app files before signing, triggering external tools after all artifacts are ready, etc.

| Hook | When it fires | Common use |
|---|---|---|
| `beforeBuild` | Before native deps are installed/rebuilt | Skip or customize native module rebuild |
| `beforePack` | Before files are copied into the app bundle | Inject generated files, modify source before pack |
| `afterExtract` | After Electron binary is extracted | Modify the Electron binary or its resources |
| `afterPack` | After files are packaged, **before signing** | Modify app bundle structure, add unpacked files |
| `afterSign` | After signing, **before distributable is created** | Custom post-sign steps, extra notarization workflows |
| `artifactBuildStarted` | When each installer/image starts building | Per-artifact logging or tracking |
| `artifactBuildCompleted` | When each installer/image finishes | Checksum capture, per-artifact upload |
| `afterAllArtifactBuild` | After **all** artifacts are done | Upload debug symbols, generate changelogs, return extra publish paths |

Hook execution is serial within each platform/arch combination. Async hooks are awaited before the build proceeds.

**Target-specific hooks** (only fire for their respective target):
- `electronDist` — supply a custom Electron binary
- `msiProjectCreated` — edit WiX XML before MSI compilation
- `appxManifestCreated` — edit AppX manifest XML before packaging
- `onNodeModuleFile` — filter which `node_modules` files are included in the bundle

## Defining Hooks

Hooks can be defined in three ways:

### 1. Inline Function (JS/TS config only)

```js
// electron-builder.config.js
module.exports = {
  afterPack: async (context) => {
    console.log("afterPack:", context.appOutDir)
  }
}
```

### 2. Path to File

Use a file path string when using JSON/YAML config, or when you want to keep hooks in separate files:

```yaml
# electron-builder.yml
afterPack: ./scripts/afterPack.js
```

```js
// scripts/afterPack.js
exports.default = async function(context) {
  console.log("afterPack:", context.appOutDir)
}
```

The function must be the **default export** of the module.

### 3. Module ID

Reference a node module:

```yaml
afterPack: my-electron-builder-plugin
```

## Hook Reference

### `beforeBuild`

Runs before native dependencies are installed or rebuilt (before `npm rebuild`). Resolving to `false` skips dependency installation entirely.

```js
beforeBuild: async (context) => {
  // context: BeforeBuildContext
  // { appDir, electronVersion, platform, arch }
  console.log("Building for:", context.platform.name, context.arch)
  // return false to skip dependency install
}
```

### `beforePack`

Runs before files are copied into the app bundle.

```js
beforePack: async (context) => {
  // context: BeforePackContext
  // { outDir, appOutDir, packager, electronPlatformName, arch, targets }
}
```

### `afterExtract`

Runs after the Electron binary has been extracted into the output directory, before app files are placed. Useful for manipulating the Electron binary or its resources.

```js
afterExtract: async (context) => {
  // context: AfterExtractContext (same shape as PackContext)
  // { outDir, appOutDir, packager, electronPlatformName, arch, targets }
}
```

### `afterPack`

Runs after the app is fully packaged but before code signing. This is the ideal hook for:
- Modifying the app bundle structure
- Adding files that should not be ASAR-archived
- Running post-processing on the packaged app

```js
afterPack: async (context) => {
  // context: AfterPackContext
  // { outDir, appOutDir, packager, electronPlatformName, arch, targets }
  const path = require("path")
  const fs = require("fs")

  // Example: add a VERSION file to the app bundle
  const versionFile = path.join(context.appOutDir, "VERSION")
  fs.writeFileSync(versionFile, context.packager.appInfo.version)
}
```

### `afterSign`

Runs after the app is signed but before the distributable (DMG, NSIS installer, etc.) is created. Commonly used for macOS notarization in custom workflows.

```js
afterSign: async (context) => {
  // context: AfterPackContext
  // { outDir, appOutDir, packager, electronPlatformName, arch, targets }
}
```

:::tip[Notarization]
electron-builder has built-in notarization support via `mac.notarize: true`. Only use `afterSign` for notarization if you need a custom notarization workflow. See [Notarization](/docs/features/code-signing/notarization).
:::

### `artifactBuildStarted`

Runs when an individual artifact (e.g., a DMG, an NSIS installer) starts being built.

```js
artifactBuildStarted: async (context) => {
  // context: ArtifactBuildStarted
  // { targetPresentableName, file, safeArtifactName, packager, arch }
  console.log("Building artifact:", context.targetPresentableName)
}
```

### `artifactBuildCompleted`

Runs when an individual artifact finishes building.

```js
artifactBuildCompleted: async (context) => {
  // context: ArtifactCreated
  // { file, safeArtifactName, target, packager, publishConfig, isWriteUpdateInfo, updateInfo, sha2, sha512, artifactName, arch }
  console.log("Built:", context.file, "SHA512:", context.sha512)
}
```

### `afterAllArtifactBuild`

Runs after all artifacts have been built. Can return an array of additional file paths to publish.

```js
afterAllArtifactBuild: async (buildResult) => {
  // buildResult: BuildResult
  // { outDir, artifactPaths, platformToTargets, configuration }

  // Example: upload debug symbols to Sentry
  for (const artifactPath of buildResult.artifactPaths) {
    if (artifactPath.endsWith('.dSYM') || artifactPath.endsWith('.pdb')) {
      await uploadSymbols(artifactPath)
    }
  }

  // Return additional files to publish
  return ["/path/to/additional-artifact.zip"]
}
```

### `electronDist`

Provide a custom Electron binary instead of the standard downloaded one. The hook receives `PrepareApplicationStageDirectoryOptions` and should return the path to a custom Electron build or a directory of Electron zip files.

```js
electronDist: async (context) => {
  // Return path to custom Electron directory
  return "/path/to/custom/electron-dist"
}
```

### `msiProjectCreated`

Runs after the WiX project has been created on disk but before it is compiled into an MSI. Receives the path to the WiX project directory.

```js
msiProjectCreated: async (wixProjectPath) => {
  // Modify WiX XML files at wixProjectPath
}
```

### `appxManifestCreated`

Runs after the AppX manifest has been created but before the package is assembled. Receives the path to the manifest file.

```js
appxManifestCreated: async (manifestPath) => {
  // Modify the AppX manifest XML
  const fs = require("fs")
  let manifest = fs.readFileSync(manifestPath, "utf8")
  // ... modify manifest ...
  fs.writeFileSync(manifestPath, manifest)
}
```

### `onNodeModuleFile`

Called for each file in `node_modules` during packaging. Return `true` to force-include, `false` to force-exclude, or `undefined`/`void` to use default behavior.

```js
onNodeModuleFile: async (filePath) => {
  // Exclude test files from all node_modules
  if (filePath.includes("__tests__") || filePath.endsWith(".test.js")) {
    return false
  }
}
```

## Common Hook Patterns

### Modifying Info.plist After Pack

```js
const path = require("path")
const plist = require("plist")
const fs = require("fs")

afterPack: async (context) => {
  if (context.electronPlatformName !== "darwin") return

  const plistPath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
    "Contents",
    "Info.plist"
  )
  const plistData = plist.parse(fs.readFileSync(plistPath, "utf8"))
  plistData.LSUIElement = true   // Hide from dock
  fs.writeFileSync(plistPath, plist.build(plistData))
}
```

### Custom Code Signing

```js
mac:
  sign: "./scripts/sign.js"
```

```js
// scripts/sign.js
exports.default = async function(configuration) {
  // configuration: CustomMacSign
  // { path, packager, entitlements, ... }
  const { execSync } = require("child_process")
  execSync(`codesign --deep --sign "${configuration.identity}" "${configuration.path}"`)
}
```

### Uploading Symbols to Sentry

```js
afterAllArtifactBuild: async (buildResult) => {
  const { execSync } = require("child_process")
  const dsymPaths = buildResult.artifactPaths.filter(p => p.endsWith(".dSYM"))
  for (const dsym of dsymPaths) {
    execSync(`sentry-cli upload-dif ${dsym}`)
  }
}
```

### Generating a Changelog File

```js
afterAllArtifactBuild: async (buildResult) => {
  const fs = require("fs")
  const changelogPath = `${buildResult.outDir}/CHANGELOG.txt`
  fs.writeFileSync(changelogPath, generateChangelog())
  return [changelogPath]   // include in publish
}
```

## Async and Error Handling

All hooks support async functions. If a hook throws an error, the build fails:

```js
afterPack: async (context) => {
  try {
    await doSomething()
  } catch (err) {
    console.error("afterPack failed:", err)
    throw err   // rethrow to fail the build
  }
}
```

## Debugging Hooks

Add `console.log` or `console.error` inside your hooks — output appears in the electron-builder terminal output.

Enable verbose electron-builder logging to see the full build lifecycle:

```bash
DEBUG=electron-builder electron-builder build
```

## Interface Reference

{!./app-builder-lib.Interface.Hooks.md!}
