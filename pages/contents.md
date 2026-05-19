# Application Contents

This page covers how electron-builder determines which files are included in the packaged app and how to customize file inclusion.

## How electron-builder Collects Files

electron-builder uses a two-phase approach to build the app bundle:

1. **App files** — your application source code and assets, placed inside the ASAR archive (or directly in the app folder if ASAR is disabled)
2. **Extra files/resources** — additional files copied into specific locations in the output package, outside the ASAR archive

## Default File Inclusion

By default, electron-builder includes all files matching `**/*` from the app directory, minus a comprehensive set of automatically-excluded files:

**Always excluded:**
- `node_modules` dev dependencies (only production dependencies are included)
- `*.iml`, `*.o`, `*.hprof`, `*.pyc`, `*.pyo`, `*.rbc`, `*.swp`, `.csproj`, `.sln`, `.xproj`
- `.editorconfig`, `._*`, `.DS_Store`, `.git`, `.hg`, `.svn`, `.gitignore`, `.gitattributes`
- `__pycache__`, `.flowconfig`, `.idea`, `.vs`, `.nyc_output`
- `appveyor.yml`, `.travis.yml`, `circle.yml`
- `npm-debug.log`, `yarn.lock`, `.yarn-integrity`, `.yarn-metadata.json`
- Test directories: `{test,__tests__,tests,powered-test,example,examples}` inside node_modules
- `*.d.ts` files inside node_modules
- `node_modules/.bin`

These exclusions are always applied even when you define custom patterns.

## The `files` Option

Override which files are included using the `files` option. Patterns are glob expressions relative to the app directory:

```yaml
files:
  - "**/*"
  - "!src/**"           # exclude source files
  - "!tests/**"         # exclude test directory
  - "!**/*.map"         # exclude source maps
  - "dist/**"           # include dist directory
```

**Important behavior:**
- If any pattern does NOT start with `!` (i.e., it's an include pattern), the default `**/*` pattern is NOT automatically prepended. You must include it explicitly if you want to start from all files.
- `package.json` and `node_modules/**/*` (production only) are always included regardless of patterns.
- All default ignores (listed above) are always applied.

### Simple Include Example

```yaml
files:
  - "**/*"
  - "!src/**"
  - "!*.ts"
  - "!tsconfig*.json"
```

### Only Include Specific Directories

```yaml
files:
  - dist/**
  - assets/**
  - node_modules/**     # production node_modules (already automatic)
  - package.json        # always included, but can be explicit
```

### Exclude Large Unused Files

```yaml
files:
  - "**/*"
  - "!node_modules/**/README*"
  - "!node_modules/**/*.md"
  - "!node_modules/**/*.map"
  - "!**/test/**"
  - "!**/__tests__/**"
```

## FileSet Objects

For advanced scenarios, use FileSet objects instead of (or alongside) glob strings. FileSets let you copy files from a different source directory:

```yaml
files:
  - from: dist
    to: .
    filter:
      - "**/*"
      - "!**/*.map"
  - from: assets
    to: assets
```

| Field | Description |
|---|---|
| `from` | Source path. Relative to the app directory for `files`; relative to project dir for `extraResources`/`extraFiles`. Defaults to the app directory. |
| `to` | Destination path. Relative to the ASAR root for `files`; relative to content dir for `extraFiles`; relative to resources dir for `extraResources`. |
| `filter` | Glob patterns relative to `from`. Defaults to `**/*`. |

### Renaming a File

```yaml
files:
  - from: dist/main.js
    to: app.js
```

### Copying from Outside the App Directory

```yaml
files:
  - "**/*"
  - from: ../shared/assets
    to: shared-assets
```

## Extra Files and Resources

Copy files into the packaged app outside the ASAR archive:

### `extraResources`

Copies into the `resources/` directory:
- macOS: `MyApp.app/Contents/Resources/`
- Windows/Linux: `resources/`

```yaml
extraResources:
  - from: native-binaries/
    to: bin
    filter:
      - "**/*"
  - "assets/icon.png"     # string shorthand — copies to resources/assets/icon.png
```

### `extraFiles`

Copies into the app content directory:
- macOS: `MyApp.app/Contents/`
- Windows/Linux: the install directory root

```yaml
extraFiles:
  - from: config/
    to: config
  - "LICENSE"
```

!!! tip "Native Modules and Extra Binaries"
    Use `extraResources` for native binaries, CLI tools, or data files that need to be accessible at runtime. Access them in your app via `process.resourcesPath`.

## ASAR Packaging

ASAR is Electron's archive format — it bundles all app files into a single `app.asar` file for faster loading and to prevent casual file inspection.

```yaml
asar: true    # Default: true
```

Set `asar: false` to disable ASAR packaging (all files are placed in the app directory directly). Useful for debugging or if you have unusual file access patterns.

### Unpacking Files from ASAR

Some files cannot be inside an ASAR archive:
- Native modules (`.node` files)
- Large binary assets that need random-access reads
- Files that need to be executed directly

Use `asarUnpack` to unpack specific files into `app.asar.unpacked/`:

```yaml
asarUnpack:
  - "**/*.node"                   # all native modules
  - "resources/ffmpeg"            # large binary
  - "**/**/node_modules/sharp/**" # specific module
```

Files in `app.asar.unpacked/` are accessible via the same paths as if they were in the ASAR — Electron transparently redirects reads.

### Smart Unpack

```yaml
asar:
  smartUnpack: true    # Default: true
```

When enabled, electron-builder automatically detects executables and native modules and unpacks them from ASAR. You generally don't need to configure `asarUnpack` manually unless you have unusual cases.

### ASAR Ordering

Optimize app startup time by specifying file ordering within the ASAR archive. Files listed first are packed first, enabling faster sequential reads at startup:

```yaml
asar:
  ordering: build/asar-ordering.txt
```

```
# build/asar-ordering.txt — list files loaded at startup first
index.js
renderer.js
node_modules/electron/index.js
```

## Practical Examples

### Electron App with Native Modules

```yaml
files:
  - "**/*"
  - "!src/**"
  - "!**/*.ts"
  - "!**/*.map"
asarUnpack:
  - "**/*.node"
```

### App with Large Video Assets

```yaml
files:
  - "**/*"
  - "!src/**"
  - "!videos/**"      # exclude from ASAR
extraResources:
  - from: videos/
    to: videos         # place outside ASAR, accessible via process.resourcesPath
```

### Monorepo Setup (Two-Package Structure)

```yaml
directories:
  app: packages/app   # app directory is not the project root

files:
  - "**/*"
  - "!src/**"
```

See [Two package.json Structure](tutorials/two-package-structure.md) for the full monorepo setup.

## Disabling Default Ignored Files

```yaml
disableDefaultIgnoredFiles: false    # Default: false
```

Set to `true` to opt out of all default exclusion patterns. This includes every file in the app directory — including test files, source maps, and hidden files. Not recommended for production.

## Troubleshooting

**File is missing from packaged app:** Check if the file is being excluded by a pattern. Run `DEBUG=electron-builder electron-builder build` to see detailed file collection output.

**Native module crashes at runtime:** The module likely needs to be outside the ASAR archive. Add it to `asarUnpack`:
```yaml
asarUnpack:
  - "node_modules/better-sqlite3/**"
```

**App directory is too large:** Profile what's included by examining the app bundle after building. Common culprits: source maps (`*.map`), TypeScript source files (`*.ts`), and large test fixtures.

**FileSet `from` path not found:** Remember that `from` in `files` is relative to the app directory. For `extraResources`/`extraFiles`, it's relative to the project root.

## File Contents Configuration

{!./app-builder-lib.Interface.FilesBuildOptions.md!}

## FileSet Configuration

{!./app-builder-lib.Interface.FileSet.md!}
