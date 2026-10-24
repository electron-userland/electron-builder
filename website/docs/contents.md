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
- The extensions of [`fileOptions.excludedExts`](./file-patterns.md#default-ignored-files) (`"default"`: `*.iml`, `*.hprof`, `*.orig`, `*.pyc`, `*.pyo`, `*.rbc`, `*.swp`, `*.csproj`, `*.sln`, `*.slnx`, `*.suo`, `*.xproj`, `*.cc`, `*.d.ts`, `*.mk`, `*.a`, `*.o`, `*.obj`, `*.forge-meta`, `*.pdb`), also in `node_modules`
- `.editorconfig`, `._*`, `.DS_Store`, `.git`, `.hg`, `.svn`, `.gitignore`, `.gitattributes`
- `__pycache__`, `.flowconfig`, `.idea`, `.vs`, `.nyc_output`
- `appveyor.yml`, `.travis.yml`, `circle.yml`
- `npm-debug.log`, `yarn.lock`, `.yarn-integrity`, `.yarn-metadata.json`
- Test directories: `{test,__tests__,tests,powered-test,example,examples}` inside node_modules
- `*.d.ts` files inside node_modules
- `node_modules/.bin`

These exclusions are applied even when you define custom patterns. To keep an excluded file, name it in a `fileOptions.files` pattern (one that names an excluded extension includes only the files it matches: `**/*.obj` every `.obj` file outside `node_modules` and the build resources and output directories, `models/teapot.obj` only that file), or change the excluded extensions with `fileOptions.excludedExts`.

The file options are nested under `fileOptions` (`fileOptions.files`, `fileOptions.extraResources`, `fileOptions.extraFiles`), at the configuration root and in the platform sections (e.g. `mac.fileOptions`). A platform's lists are added to the root ones. Run `electron-builder migrate-schema` to move `files`, `extraResources` and `extraFiles` keys set directly on the configuration into `fileOptions`; see [file options](./migration/v27-config-changes.md#file-options-fileoptions).

## The `files` Option

Override which files are included using the `fileOptions.files` option. Patterns are glob expressions relative to the app directory:

```yaml
fileOptions:
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
fileOptions:
  files:
    - "**/*"
    - "!src/**"
    - "!*.ts"
    - "!tsconfig*.json"
```

### Only Include Specific Directories

```yaml
fileOptions:
  files:
    - dist/**
    - assets/**
    - node_modules/**     # production node_modules (already automatic)
    - package.json        # always included, but can be explicit
```

### Exclude Large Unused Files

```yaml
fileOptions:
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
fileOptions:
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
fileOptions:
  files:
    - from: dist/main.js
      to: app.js
```

### Copying from Outside the App Directory

```yaml
fileOptions:
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
fileOptions:
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
fileOptions:
  extraFiles:
    - from: config/
      to: config
    - "LICENSE"
```

:::tip[Native Modules and Extra Binaries]
Use `extraResources` for native binaries, CLI tools, or data files that need to be accessible at runtime. Access them in your app via `process.resourcesPath`.
:::

## Symbolic Links {#symbolic-links}

Only the build configuration is trusted. The files electron-builder copies (the app directory, `node_modules`, and the `extraResources` / `extraFiles` / `extraDistFiles` sources) and the symlinks among them are not: a symlink planted in a dependency or a copied directory could otherwise make the build package files from elsewhere on the build machine (SSH keys, credentials), or write outside the output directory. electron-builder therefore checks packaged files, copied symlinks and write destinations by their real path.

### Linked files must resolve inside the workspace {#linked-files-must-resolve-inside-the-workspace}

A file of the app (packed into `app.asar` or copied with `asar: false`) that is a symlink, or is reached through one (a linked package in `node_modules`, a symlinked directory in the app directory), is packaged only when its real path is inside:

- the workspace root (the project directory when there is no workspace), the project directory or the app directory, or
- the package-manager store (pnpm's `storeDir` and `virtualStoreDir`, read from `node_modules/.modules.yaml`, which covers `enableGlobalVirtualStore`).

Packages linked by pnpm, yarn, npm or bun workspaces are inside the workspace. A file that resolves anywhere else (an `npm link`, a `file:../lib` dependency outside the repository, a symlink into the home or temp directory) fails the build with `InvalidConfigurationError` (code `ERR_ELECTRON_BUILDER_FILE_OUTSIDE_WORKSPACE`):

```text
Cannot copy file [node_modules/lib/src/index.js] symlinked to file [/home/me/src/lib/src/index.js] outside the package: electron-builder only packages files whose real path is inside the workspace root (/home/me/src/app) or the package-manager store. ...
```

To fix it, add the linked package to the workspace (`pnpm-workspace.yaml`, `workspaces` in `package.json`), install it from a tarball (`npm pack`) or the registry instead of linking it, or replace the symlink with a copy. If packaging it from where it is is intended, [allow it](#allowing-external-links).

### Symlinks that leave the app are refused {#symlinks-that-leave-the-app-are-refused}

Destinations are checked by real path when they are written. The build fails with `InvalidConfigurationError` (code `ERR_ELECTRON_BUILDER_PATH_OUTSIDE_ROOT`) when:

- **a copy would be written through a symlink that leads out of the app output directory**, e.g. the app directory (`asar: false`) puts a `resources/data -> /somewhere` symlink in place and `extraResources` then copies into `data/`. The same applies to the files electron-builder writes itself after the copies (`app-update.yml`, `package-type`, `apparmor-profile`, NSIS `elevate.exe`, the snap `command.sh`, Squirrel's `Squirrel.exe` and execution stub). A symlink *at* such a file name is replaced, never followed.
- **a copied symlink would lead outside the output.** `extraResources` / `extraFiles` keep a symlink as it is, but only when it stays inside the app output directory or leads into the workspace or the package-manager store. In that last case it is dangling on other machines, and the build warns once. With `asar: false`, a symlink in the app directory that leaves it is copied as the file it points to (see [Linked files must resolve inside the workspace](#linked-files-must-resolve-inside-the-workspace)), and one that is kept must stay inside the app, including through other symlinks (`x/a -> up/..` where `x/up -> ..`).
- **a Windows archive or installer would store files from outside the app.** The Windows `zip` / `7z` targets, the NSIS app package, AppX/MSIX and Squirrel.Windows store what a symlink points to rather than the symlink, so a symlink in the app output directory that leads outside it fails these targets.

To fix it, replace the symlink with a copy of what it points to (or point it at a path inside the app), or exclude it from the copy with a `"!"` pattern. The error names the symlink, where it resolves to and, when the symlink can be allowed, the entry that allows it.

### Allowing external links {#allowing-external-links}

`fileOptions.allowExternalLinks` allows symlinks that are intended to lead outside the app, the workspace and the package-manager store. It is `false` by default.

- `true` allows any such symlink.
- A list of paths, relative to the project directory or absolute, allows a symlink only when the real path of what it points to is inside (the real path of) one of them. A listed path that does not exist fails the build.

```yaml
fileOptions:
  allowExternalLinks:
    - ../shared-lib
linux:
  fileOptions:
    allowExternalLinks: true   # any link, for Linux builds only
```

Set it at the configuration root or per platform (`mac.fileOptions`, `win.fileOptions`, `linux.fileOptions`). A platform's value replaces the root one rather than being added to it, so `false` there turns the root list off for that platform.

An allowed symlink is packaged: what it points to is copied (or stored by the archive), and a copied symlink is kept as it is. The build warns once when this option allows a symlink. A refusal suggests the entry to add, e.g. `To allow it, set "fileOptions": { "allowExternalLinks": ["../shared-lib"] } (or { "allowExternalLinks": true }) in your build configuration.`

:::warning[Writes through symlinks are always refused]
`allowExternalLinks` only allows what is packaged. A copy, or a file electron-builder writes (`app-update.yml`, ...), whose destination leads out of the output directory through a symlink is always refused.
:::

## ASAR Packaging

ASAR is Electron's archive format — it bundles all app files into a single `app.asar` file for faster loading and to prevent casual file inspection.

```yaml
asar: {}    # ASAR is enabled by default — pass an object to configure, or set asar: false to disable
```

Set `asar: false` to disable ASAR packaging (all files are placed in the app directory directly). Useful for debugging or if you have unusual file access patterns.

### Unpacking Files from ASAR

Some files cannot be inside an ASAR archive:
- Native modules (`.node` files)
- Large binary assets that need random-access reads
- Files that need to be executed directly

Use `asar.unpack` to unpack specific files into `app.asar.unpacked/`:

```yaml
asar:
  unpack:
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

When enabled, electron-builder automatically detects executables and native modules and unpacks them from ASAR. You generally don't need to configure `asar.unpack` manually unless you have unusual cases.

### ASAR Ordering

Optimize app startup time by specifying file ordering within the ASAR archive. Files listed first are packed first, enabling faster sequential reads at startup:

```yaml
asar:
  ordering: build/asar-ordering.txt
```

```text
index.js
renderer.js
node_modules/some-dependency/lib/index.js
```

- **Where the file is found:** the `ordering` path is resolved like other build resources, relative to the build resources directory (`directories.buildResources`, default `build`) first, then the project directory. A missing file fails the build.
- **Line syntax:** one file per line, relative to the app directory (where the app's `package.json` sits, i.e. the root of `app.asar`). A leading `/` and a `<count>:` prefix (as written by load counters) are accepted, `\` separators are treated as `/`, and blank lines are ignored. There is no comment syntax: a `#` line is read as a path and never matches. Lines naming a directory are ignored, and listed files that are not packaged (for example `node_modules/electron`, which is never in the archive) are skipped. The build log reports `matched N/M`; run with `DEBUG=electron-builder` to see the first unmatched lines.
- **Resulting layout:** directory entries first (they hold no data), then the listed files in the order of the file, then everything else in its default order.

:::note[Trade-off with differential updates]
Without an ordering file, electron-builder packs dependencies first and your app files last, so the files that change most often sit at the end of the archive and differential updates download less. An ordering file moves the listed files to the front, so a change to any of them shifts the offsets of everything packed after it, which can increase differential update download size. Measure startup gains against update size before adopting it.
:::

## Practical Examples

### Electron App with Native Modules

```yaml
fileOptions:
  files:
    - "**/*"
    - "!src/**"
    - "!**/*.ts"
    - "!**/*.map"
asar:
  unpack:
    - "**/*.node"
```

### App with Large Video Assets

```yaml
fileOptions:
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

fileOptions:
  files:
    - "**/*"
    - "!src/**"
```

See [Two package.json Structure](tutorials/two-package-structure.md) for the full monorepo setup.

## Including Default-Excluded Files

electron-builder excludes a set of development-only file extensions and names by default — for example
build artifacts such as `.obj`, `.o`, `.a`, and `.d.ts`, lockfiles such as `yarn.lock` and
`package-lock.json`, and VCS/tooling metadata such as `.git`, `.idea`, and `.github`.

To ship a file that would otherwise be excluded, add an explicit `fileOptions.files` glob that targets it. An
explicit include overrides the matching default exclusion:

```yaml
fileOptions:
  files:
    - "**/*"
    - "**/*.obj"        # keep Wavefront .obj 3D models that are excluded by default
```

The same applies to default-excluded names — reference the name in a pattern segment, e.g.:

```yaml
fileOptions:
  files:
    - "**/*"
    - "**/.github/**"   # keep the .github directory that is excluded by default
```

A pattern that names an excluded extension includes only the files it matches: `**/*.obj` includes every `.obj` file outside `node_modules` and the build resources and output directories, `models/teapot.obj` only that file. A pattern with a default-excluded name as a path segment opts that name back in. Broad patterns such as `**/*` continue to honor the defaults.

## Troubleshooting

**File is missing from packaged app:** Check if the file is being excluded by a pattern. Run `DEBUG=electron-builder electron-builder build` to see detailed file collection output.

**Native module crashes at runtime:** The module likely needs to be outside the ASAR archive. Add it to `asar.unpack`:
```yaml
asar:
  unpack:
    - "node_modules/better-sqlite3/**"
```

**App directory is too large:** Profile what's included by examining the app bundle after building. Common culprits: source maps (`*.map`), TypeScript source files (`*.ts`), and large test fixtures.

**FileSet `from` path not found:** Remember that `from` in `files` is relative to the app directory. For `extraResources`/`extraFiles`, it's relative to the project root.

## File Contents Configuration

{!./app-builder-lib.Interface.FilesBuildOptions.md!}

## FileSet Configuration

{!./app-builder-lib.Interface.FileSet.md!}
