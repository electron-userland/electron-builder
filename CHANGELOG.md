# [27.0.0-alpha.11](https://github.com/electron-userland/electron-builder/compare/electron-builder@27.0.0-alpha.10...electron-builder@27.0.0-alpha.11) (2026-10-18)

## electron-builder@27.0.0-alpha.11

### Major Changes

- Feat!: nest `files`, `extraResources` and `extraFiles` under `fileOptions` _[`#10319`](https://github.com/electron-userland/electron-builder/pull/10319) [`8f55928`](https://github.com/electron-userland/electron-builder/commit/8f5592839b6b2752754c19b8b7190ec86f55ef94)_ — `electron-builder`, `app-builder-lib`, `builder-util-runtime`

  The three file-copy lists live in a `fileOptions?: FilesBuildOptions | null` property at the configuration root and in every platform section (`mac`, `mas`, `masDev`, `win`, `linux`), the same way `directories` groups the build directories: `fileOptions.files`, `mac.fileOptions.extraResources`, and so on. `PlatformSpecificBuildOptions` does not extend `FilesBuildOptions`, and the TypeScript types and the JSON schema only have `fileOptions`.

  Flat `files` / `extraResources` / `extraFiles` keys in a config file, an `extends` parent, a `-c.files=…` override or the `config` object passed to `build()` are applied as their `fileOptions` counterparts before the configuration is validated, logging one warning per process that names the keys found and where they belong. When a flat key and its `fileOptions` counterpart are set on the same object, `fileOptions` wins and the build warns about the conflict. A CLI override or a parent config's flat key is merged with `fileOptions`. A `fileOptions` that is not an object (for example a list of globs written directly under it) fails the build with a message showing the nested form.

  Code that reads `files`, `extraResources` or `extraFiles` from the loaded configuration (for example a hook reading `context.packager.config.files`, or `buildResult.configuration.extraResources`) gets the `fileOptions` value, with a warning per key: the loaded configuration and its platform sections forward these reads through non-enumerable properties, which stay out of the effective config, `JSON.stringify` and `Object.keys`. Assigning them throws a configuration error naming the `fileOptions` property to set instead.

  `deepAssign` (builder-util-runtime) copies only enumerable own properties, so the forwarding properties are never copied into merged options.

  `electron-builder migrate-schema` (static and JS/TS configs) moves flat keys under `fileOptions` at the root and per platform. A flat key also set under `fileOptions` is removed with a warning, since the build ignores it.

  See https://www.electron.build/docs/migration/v27-breaking-changes#file-options-fileoptions
- Fix: confine linked files to the workspace and package-manager store by real path; opt in to external links with `fileOptions.allowExternalLinks`. A file of the app (packed into `app.asar` or copied with `asar: false`) that is a symlink, or is reached through one, is packaged only when its real path is inside the workspace root, the project or app directory, or the package-manager store (pnpm `storeDir`/`virtualStoreDir` from `node_modules/.modules.yaml`). Any other one, such as an `npm link` or a `file:` dependency outside the workspace, fails with `InvalidConfigurationError` (code `ERR_ELECTRON_BUILDER_FILE_OUTSIDE_WORKSPACE`), which names the file, its real path and the `fileOptions.allowExternalLinks` entry that allows it (`true`, or a list of directories, relative to the project directory or absolute, that linked files may resolve into; at the top level or per platform; default `false`, with a one-time warning when it allows a link). See https://www.electron.build/docs/contents#linked-files-must-resolve-inside-the-workspace _[`#10321`](https://github.com/electron-userland/electron-builder/pull/10321) [`08e8044`](https://github.com/electron-userland/electron-builder/commit/08e80443d3470f2d6bf5a0075e54f4e906079c9b)_ — `app-builder-lib`
- Fix: confine copies to the app output directory by real path, so that a symlink among copied files (app directory, `extraResources`/`extraFiles`/`extraDistFiles` sources, `node_modules`) cannot make electron-builder write or package files elsewhere on the build machine; opt in to external links with `fileOptions.allowExternalLinks`. `copyDir` (extraResources/extraFiles) and the `asar: false` app copy refuse a destination whose directory resolves outside the app output directory, replace (never follow) a symlink at a destination file, and recreate a symlink only when it stays inside the output (or, for extraResources/extraFiles, leads into the workspace or the package-manager store, with a one-time warning). The fixed-name files written after the copies (`app-update.yml`, `package-type`, `apparmor-profile`, NSIS `elevate.exe`, the snap `command.sh`, `Squirrel.exe` and the Squirrel execution stub) replace a symlink at their name instead of writing through it. Windows `zip`/`7z` archives, the NSIS app package, AppX/MSIX and Squirrel.Windows packages, which store what a symlink points to, refuse a symlink that leaves the app. An intended symlink of this kind is allowed by the `fileOptions.allowExternalLinks` build option (`true`, or a list of directories its real target may be in; at the top level or per platform, a platform's value replacing the top-level one), with a one-time warning; a write through a symlink is always refused. Errors are `InvalidConfigurationError` with code `ERR_ELECTRON_BUILDER_PATH_OUTSIDE_ROOT`, suggest the `fileOptions.allowExternalLinks` entry and link to https://www.electron.build/docs/contents#symlinks-that-leave-the-app-are-refused. New builder-util helpers: `assertWritableWithin`, `prepareFixedNameWrite`, `WriteContainment`, `resolvePhysicalPath`, `findEscapingSymlinks`, `assertNoSymlinkLeaves`, `ExternalLinkPolicy`. _[`#10321`](https://github.com/electron-userland/electron-builder/pull/10321) [`08e8044`](https://github.com/electron-userland/electron-builder/commit/08e80443d3470f2d6bf5a0075e54f4e906079c9b)_ — `app-builder-lib`, `builder-util`, `electron-builder-squirrel-windows`
- Feat(flatpak): build bundles with `flatpak` and `flatpak-builder` directly, without `@malept/flatpak-bundler`, and build in unprivileged containers _[`#10316`](https://github.com/electron-userland/electron-builder/pull/10316) [`3f1d50b`](https://github.com/electron-userland/electron-builder/commit/3f1d50b49d96a48d38ad9008009782d4bcabd91a)_ — `app-builder-lib`

  The flatpak target now runs `flatpak` and `flatpak-builder` itself, and the `@malept/flatpak-bundler` dependency is removed. A failed command prints the tool's output in the build error, and five known failures (`Failure spawning rofiles-fuse`, a `bwrap:` failure in `flatpak build-export`, `No remote refs found`, `Command 'electron-wrapper' not found` when rofiles-fuse cannot mount the app directory, and `execvp appstream-compose` when a `flatpak-builder` older than 1.4 composes AppStream metadata with the freedesktop SDK 24.08 or newer) log how to fix them first. A build with `flatpak.modules` warns once when `flatpak-builder` is older than 1.4.4, which the 24.08 and newer SDKs recommend for meson and cmake modules. The scratch directory is removed when the build ends.

  New options:

  - `flatpak.additionalArgs` passes extra arguments to the tools, by tool: `flatpakBuilder`, `buildExport` and `buildBundle`. With `{ flatpakBuilder: ["--disable-rofiles-fuse"], buildExport: ["--disable-sandbox"] }` the target builds in CI containers that have neither FUSE nor user namespaces (#10306).
  - `flatpak.installOrUpdateRefs`, `"all"` (the default) or a list of `"runtime"`, `"sdk"` and `"base"`: the refs that are left out are used as installed, without a `flatpak install` or `flatpak update`, and a missing one fails the build before anything is downloaded. `[]` builds with the refs of an image or an offline machine, and where the build user cannot update the base app (based on the options proposed in #10313).

  BREAKING CHANGE: `flatpak` >= 1.12.4 and `flatpak-builder` >= 1.2.2 are required, and checked before a runtime is installed. The stock packages of Ubuntu 22.04, Debian 12, RHEL 8 and 9 and newer releases meet this; v26 accepted older tools. `DEBUG=@malept/flatpak-bundler` no longer has any effect, and a flatpak build warns once when `DEBUG` still names it: use `DEBUG=electron-builder` to log every command.

  BREAKING CHANGE: `flatpak.runtimeVersion` and `flatpak.baseVersion` default to `26.08` instead of `20.08`, which Flathub reports as end-of-life. A build that sets neither is built for the `26.08` runtime, and the build machine installs the `26.08` runtime, SDK and base app if they are missing (about 3.2 GB). A build that leaves either option unset warns once, naming electron-builder v27 and the migration guide. Set both to `"20.08"` to keep the previous ones.

  BREAKING CHANGE: the default `flatpak.finishArgs` grant `--filesystem=xdg-download` instead of `--filesystem=home`: with read/write access to the home directory, code running in the app could write `~/.config/autostart` or `~/.bashrc` and so run outside the sandbox at the next login. App data under `~/.var/app` and files picked in a dialog are not affected; paths the app opens on its own outside Downloads are. They also leave out `--talk-name=org.freedesktop.Notifications` unless the base is `org.electronjs.Electron2.BaseApp` older than `23.08`, whose libnotify predates the notification portal; on desktops without a portal backend for notifications, notifications no longer appear. Builds that set `flatpak.finishArgs` are not affected, and a build that uses the defaults warns once, naming electron-builder v27 and the migration guide. To keep the v26 permissions, set `finishArgs` to the v26 list from the migration guide.

  BREAKING CHANGE: a `flatpak.files` destination or a `flatpak.symlinks` link that leaves the app prefix with `..` fails the build with an `InvalidConfigurationError`, before anything is installed. It was written outside the app in the build directory, for example over the app's `metadata`. The pairs of `flatpak.files` are copied one after another, and a directory can no longer be copied onto a symlink to a directory: v26 copied through the link, and the build now fails with `Cannot overwrite non-directory with directory` (`ERR_FS_CP_DIR_TO_NON_DIR`). Symlinks inside a copied directory are kept as they are. The errors of the tool-version check and of the app-prefix check say that they are new in electron-builder v27 and link the migration guide.

### Minor Changes

- Feat(app-builder-lib): warn at build start when a `process.env` variable removed in v26 → v27 is still set _[`#10293`](https://github.com/electron-userland/electron-builder/pull/10293) [`d2c979b`](https://github.com/electron-userland/electron-builder/commit/d2c979b19f222f4c296c96acd0d2f3917acbf536)_ — `app-builder-lib`

  - Added `warnOnRemovedEnvVars()` (registry in `app-builder-lib/src/util/removedEnvVars.ts`), invoked once per build from the `Packager` constructor so both the CLI and programmatic `build()` API surface the same guidance. When a removed variable is still present in the environment it is otherwise silently ignored — this logs a one-time deprecation warning naming the variable and its replacement.
  - Covers the removed toolset-path overrides (`APPIMAGE_TOOLS_PATH`, `MKSQUASHFS_PATH`, `LINUX_TOOLS_MAC_PATH`, `CUSTOM_FPM_PATH`, `ELECTRON_BUILDER_NSIS_DIR`, `ELECTRON_BUILDER_NSIS_RESOURCES_DIR`, `CUSTOM_NSIS_RESOURCES`, `ELECTRON_BUILDER_WINE_TOOLSET_DIR`, `ELECTRON_BUILDER_7ZIP_PATH`, `ELECTRON_BUILDER_ICONS_TOOLSET_DIR`, `ELECTRON_BUILDER_OSSL_SIGNCODE_PATH`, `ELECTRON_BUILDER_RCEDIT_PATH`, `ELECTRON_BUILDER_WINDOWS_KITS_PATH`, `SIGNTOOL_PATH`) → `toolsets.*` / `win.sign`; the `USE_SYSTEM_*` toggles; `ELECTRON_BUILDER_BINARIES_ALLOW_HTTP` → `ELECTRON_BUILDER_DANGEROUSLY_ALLOW_HTTP`; `CI_BUILD_TAG` → `CI_COMMIT_TAG`; and `ALLOW_ELECTRON_BUILDER_AS_PRODUCTION_DEPENDENCY` → `ignoredProductionDependencies`.
  - Internal/test-only variables (`JEST_WORKER_ID`, `TEST_SET_BABEL_PRESET`) and `npm_lifecycle_event` (set by npm for every script) are intentionally excluded from the runtime scan.
  - Migration docs: filled the previously undocumented removed vars in the v27 breaking-changes catalogue (the toolset-path family plus `MKSQUASHFS_PATH`), added a "Replace with" column, and documented the `ELECTRON_BUILDER_BINARIES_ALLOW_HTTP` rename and the removed `npm run release` implicit-publish behavior.
- Feat(builder-util): `log.limit({ key, max, scope })` / `log.once(key, scope)` emit a keyed message at most N times (per process, or per scope object), replacing hand-rolled "already warned" flags; electron-updater counts once-per-updater warnings internally without changing the injectable `Logger` interface. Both share one limiter (`wrap()` on any `{ info, warn, error, debug? }` logger, including `console`), and its `LogLevel`, `LogLimitOptions`, `LoggerLike` and `LimitedLogger` types are now exported from builder-util-runtime (builder-util re-exports them) _[`#10302`](https://github.com/electron-userland/electron-builder/pull/10302) [`5cbbc8d`](https://github.com/electron-userland/electron-builder/commit/5cbbc8de8e0fb585cfa97e80644e8a29ab7d8ff4)_ — `electron-builder`, `app-builder-lib`, `builder-util`, `builder-util-runtime`
- Fix(asar): `asar.ordering` is now honored — the documented option was typed but never applied to the archive electron-builder packs (it packs through `@electron/asar`'s stream API, which takes no ordering option). Listed files are packed first, in the order of the file (same line syntax as `@electron/asar`: optional leading `/` or `<count>:` prefix, blank lines ignored), directories keep their positions, everything else follows in its original order; coverage is logged. _[`#10310`](https://github.com/electron-userland/electron-builder/pull/10310) [`8eff005`](https://github.com/electron-userland/electron-builder/commit/8eff005219db1d17363add3ef4902e5b14798241)_ — `app-builder-lib`
- Feat(snap): `"default"` in `snapcraft.core24.plugs` now merges the remaining entries into the full default plug set (including `browser-support` and, without the `gnome` extension, the content-snap plugs), deduplicated by name, with descriptor objects overriding a default plug's attributes _[`#10294`](https://github.com/electron-userland/electron-builder/pull/10294) [`efec238`](https://github.com/electron-userland/electron-builder/commit/efec2385c8c768587e565cab20013fc8dca0c33a)_ — `app-builder-lib`
- Feat(flatpak): warn about `--no-sandbox` and the flatpak id, and fix the wrapper, `useWaylandFlags`, MIME types and failed builds _[`#10316`](https://github.com/electron-userland/electron-builder/pull/10316) [`3f1d50b`](https://github.com/electron-userland/electron-builder/commit/3f1d50b49d96a48d38ad9008009782d4bcabd91a)_ — `app-builder-lib`

  - Warns once per build when `--no-sandbox` reaches the flatpak's `electron-wrapper`, naming `linux.executableArgs` and/or `flatpak.executableArgs` as its source: inside flatpak, Chromium's sandbox works through zypak, and the flag gives renderer processes every permission of the app. The flag is kept. `linux.executableArgs` are merged into the flatpak options, and an empty `flatpak.executableArgs` adds nothing: `--no-sandbox` for the AppImage alone belongs in `appImage.executableArgs`, and `flatpak.executableArgs: null` leaves all of `linux.executableArgs` out of the flatpak.
  - Warns once per build when the flatpak id is derived from the package name (neither `linux.appId` nor `appId` is set: the id names the app's `~/.var/app/<id>` data directory, and another vendor's bundle with the same `com.electron.<name>` id installs over the app), and when `desktopName` is set but is not `<flatpak id>.desktop` (the bundle's desktop entry is named after the id, and Electron names the app's windows after `desktopName`, so desktops cannot match the two).
  - The `electron-wrapper` script replaces itself with the app (`exec`) instead of staying as its parent shell, and tests the session with the POSIX `=`: the `==` failed with "unexpected operator" where `/bin/sh` is dash, and dropped the Wayland flags.
  - `flatpak.useWaylandFlags` picks its flags by Electron version: none from Electron 38, which chooses Wayland by itself in a Wayland session (the build logs that the option has no effect), `--ozone-platform=wayland` from Electron 16, and `--enable-features=UseOzonePlatform --ozone-platform=wayland` before that or for an unknown version. From Electron 16 the wrapper no longer adds a second `--enable-features`, which could replace one in `executableArgs`; a build with Electron 16 to 37 warns once about the change, naming electron-builder v27 and the migration guide.
  - An invalid flatpak id (fewer than three elements, an empty element or one starting with a digit, more than 255 characters), such as `com.myapp` or `com.electron.3d_viewer` from a package named `3d-viewer`, fails the build before the runtime, SDK and base app are installed, with an `InvalidConfigurationError` naming the rule. It failed in `flatpak-builder`, after those were installed (about 3.2 GB for the default version).
  - The `__flatpak-<arch>` stage directory is removed from the output directory when preparing it fails, for example on an invalid desktop entry or a missing license file.
  - The MIME types of `fileAssociations` (every `mimeType` that is set) are declared in the bundle's `share/mime/packages/<id>.xml`, which flatpak exports, as the AppImage and deb/rpm targets do: the desktop entry listed the types, but nothing defined a custom one. Set `mimeType` only for a type of your own: each is declared with the description `<productName> document`, which for a standard type such as `text/markdown` can change how the desktop describes every such file. List standard types in `linux.mimeTypes`, which only adds them to the desktop entry.
- Feat(asar): `asar.contentAlignment` — align the start of every packed file's content inside `app.asar` to a multiple of N bytes (zero padding between files; order, sizes and per-file integrity unchanged). Meant for differential updates with `nsis.differentialPackage: "store-asar"`: the asar header stores absolute content offsets, so without alignment a change that grows a file by one byte shifts every later offset and most of the header is re-downloaded; with `512` a small length-changing edit measured 414 KB → 139 KB of differential download for 2.2 % more asar size. Off by default. _[`#10311`](https://github.com/electron-userland/electron-builder/pull/10311) [`a4ff5db`](https://github.com/electron-userland/electron-builder/commit/a4ff5db6261c8370d6041fd597437443ca5d3bb8)_ — `app-builder-lib`

### Patch Changes

- Chore(deps): update @electron/___ dependencies to `latest` _[`#10244`](https://github.com/electron-userland/electron-builder/pull/10244) [`a49daae`](https://github.com/electron-userland/electron-builder/commit/a49daae0ad0a2ca8a53e07aa031c5d00fde8bbb5)_ — `app-builder-lib`
- Fix: encode GitLab publisher package path segments _[`#10140`](https://github.com/electron-userland/electron-builder/pull/10140) [`4b6e63f`](https://github.com/electron-userland/electron-builder/commit/4b6e63f3490a50806839fa44fb790612cf5da1a2)_ — `electron-publish`
- Fix: escape Squirrel project URLs in nuspec XML _[`#10141`](https://github.com/electron-userland/electron-builder/pull/10141) [`09a2f30`](https://github.com/electron-userland/electron-builder/commit/09a2f305dc550bf817d5564631073c14c002ea6b)_ — `electron-builder-squirrel-windows`
- Fix: stop retry backoff immediately when cancelled _[`#10126`](https://github.com/electron-userland/electron-builder/pull/10126) [`68aa2ff`](https://github.com/electron-userland/electron-builder/commit/68aa2ff1d5bc713819cd98bfb34c890fbe03a93a)_ — `builder-util-runtime`
- Fix(appimage): resolve a `toolsets.appimage` version pin to exactly that release instead of letting any pin other than `"1.0.3"` float to the newest bundle, and reject unknown versions with an `InvalidConfigurationError` rather than downloading without a checksum _[`#10291`](https://github.com/electron-userland/electron-builder/pull/10291) [`86298ab`](https://github.com/electron-userland/electron-builder/commit/86298abd9857f56e7124d59e4c5373333d05ceda)_ — `app-builder-lib`
- Fix(snap): pack legacy-base (core18/core20/core22) template snaps with the `mksquashfs` from `toolsets.appimage` instead of the hardwired legacy `"0.0.0"` bundle, whose mksquashfs supports only gzip/xz, so `compression: "lzo"` (and `linux.compression: "store"`, which maps to lzo) builds again (#7013); a `toolsets.appimage: "0.0.0"` pin combined with `lzo` now fails early with an `InvalidConfigurationError` instead of inside `mksquashfs` _[`#10291`](https://github.com/electron-userland/electron-builder/pull/10291) [`86298ab`](https://github.com/electron-userland/electron-builder/commit/86298abd9857f56e7124d59e4c5373333d05ceda)_ — `app-builder-lib`
- Fix(nsis): the installer copies itself into `%LOCALAPPDATA%\<app>-updater` only when the app has an `app-update.yml`. Before, every install kept that copy, which only electron-updater reads (as the base for a differential download), so apps without an update configuration carried a second copy of their installer, and the uninstaller left it behind. After, those apps get no copy; apps with an update configuration keep it as before. _[`#10261`](https://github.com/electron-userland/electron-builder/pull/10261) [`0df65dc`](https://github.com/electron-userland/electron-builder/commit/0df65dc90671b6d97ed89303ca6874a2938b8c35)_ — `app-builder-lib`
- Fix(nsis): log once when the installer skips keeping its copy for electron-updater's differential download cache because `resources/app-update.yml` was not found _[`#10298`](https://github.com/electron-userland/electron-builder/pull/10298) [`38fe001`](https://github.com/electron-userland/electron-builder/commit/38fe001fabb97129dafa3e96ac08c0376b35465f)_ — `app-builder-lib`
- Fix(nsis): point the removed `customNsisBinary` / `customNsisResources` build error and `migrate-schema` warning at the custom NSIS migration guide and the `toolsets.nsis` bundle docs, and fix their stale breaking-changes anchor _[`#10286`](https://github.com/electron-userland/electron-builder/pull/10286) [`7e42d2f`](https://github.com/electron-userland/electron-builder/commit/7e42d2f526fb4fc03c4ccfcc3e7d37290c44b632)_ — `app-builder-lib`
- Fix: retry an Electron/toolset download that times out instead of failing the build. Before, a silent connection ended in undici's 300s headers/body timeout, which was not treated as retryable, and the 10 minute cap on a download was one `AbortSignal.timeout()` shared by all attempts, so no attempt could follow it. After, each attempt gets its own 10 minute cap, and an attempt that hits it or undici's timeouts is retried once, with a warning in the log. _[`#10269`](https://github.com/electron-userland/electron-builder/pull/10269) [`e7d9cad`](https://github.com/electron-userland/electron-builder/commit/e7d9cad9e4d49cbcffd2bcea204260728b23f3ea)_ — `app-builder-lib`
- Fix(docs): repair broken links and anchors across the docs site and JSDoc, and export the `SnapOptions24`, `SnapOptionsLegacy`, `SnapOptionsCustom` and `RemoteBuildOptions` types from `app-builder-lib` so their API reference pages are generated _[`#10305`](https://github.com/electron-userland/electron-builder/pull/10305) [`2fdbcae`](https://github.com/electron-userland/electron-builder/commit/2fdbcae5b136c486d3afa3e564d032b5a79dae05)_ — `app-builder-lib`, `builder-util-runtime`
- Refactor: once-only build and updater warnings use `log.once` / `log.limit` (and the updater's per-instance counter) instead of hand-rolled flags and sets; a concurrently resolved NSIS ProgID notice can no longer print twice _[`#10303`](https://github.com/electron-userland/electron-builder/pull/10303) [`6fe881e`](https://github.com/electron-userland/electron-builder/commit/6fe881ea4db4a92c8fbac7d435607d0ccebe2775)_ — `app-builder-lib`
- Fix: reject shell line-break characters _[`#10131`](https://github.com/electron-userland/electron-builder/pull/10131) [`8854be3`](https://github.com/electron-userland/electron-builder/commit/8854be3dda9bc3f51a71ad44b51961b946a8c99e)_ — `builder-util`
- Fix: honor uppercase http(s) proxy environment variables _[`#10132`](https://github.com/electron-userland/electron-builder/pull/10132) [`ea41d9a`](https://github.com/electron-userland/electron-builder/commit/ea41d9af10840fbb56d60ff701e1282a0e16a6fb)_ — `builder-util`
- Fix: reject aborted S3 upload responses _[`#10145`](https://github.com/electron-userland/electron-builder/pull/10145) [`80c9c3f`](https://github.com/electron-userland/electron-builder/commit/80c9c3fdf4a332a00df2f2a4ad75428a24136c93)_ — `app-builder-lib`, `electron-publish`
- Fix: enforce workspace path boundaries for asar _[`#10135`](https://github.com/electron-userland/electron-builder/pull/10135) [`ed43b10`](https://github.com/electron-userland/electron-builder/commit/ed43b10045454c01b6ce87633cf8f0d517aa07df)_ — `app-builder-lib`
- Fix: accept forward slashes in isOutsidePath on Windows _[`#10307`](https://github.com/electron-userland/electron-builder/pull/10307) [`0dffd5b`](https://github.com/electron-userland/electron-builder/commit/0dffd5b787df50d8796817b42d1f542f831f0d6b)_ — `app-builder-lib`
- Fix: bump @electron/rebuild to 4.2.1 so cross-platform builds from one node_modules no longer reuse a native module built for another platform (#10031) _[`#10308`](https://github.com/electron-userland/electron-builder/pull/10308) [`067913d`](https://github.com/electron-userland/electron-builder/commit/067913dcd586dc9c016206f28326e186de8d9d85)_ — `app-builder-lib`
- Fix(asar): a missing `asar.ordering` file now fails with a configuration error naming the paths tried and the v27 migration notes, builds that apply an ordering file warn once that the option is now honored, ordering lines with `\` separators match on macOS and Linux, and lines naming a directory no longer count as missing in the coverage log _[`#10320`](https://github.com/electron-userland/electron-builder/pull/10320) [`866bb00`](https://github.com/electron-userland/electron-builder/commit/866bb0082c6561be357c6d9df4de6bd66e524607)_ — `app-builder-lib`
- Fix: contain mapped app file destinations _[`#10137`](https://github.com/electron-userland/electron-builder/pull/10137) [`bb6b24c`](https://github.com/electron-userland/electron-builder/commit/bb6b24c25e96e00a87ec183b5369b553880bea18)_ — `app-builder-lib`
- Fix(snap): core24 no longer requests `browser-support` with `allow-sandbox` by default (the Snap Store rejects it for non-vetted publishers); default core24 snaps now launch with `--no-sandbox` and omit `chrome-sandbox`, and an explicitly configured `allow-sandbox` logs a store-review warning _[`#10294`](https://github.com/electron-userland/electron-builder/pull/10294) [`efec238`](https://github.com/electron-userland/electron-builder/commit/efec2385c8c768587e565cab20013fc8dca0c33a)_ — `app-builder-lib`
- Docs(blockmap): state the regions size/sha512 guarantee for file-output mode only _[`#10325`](https://github.com/electron-userland/electron-builder/pull/10325) [`d2af5d1`](https://github.com/electron-userland/electron-builder/commit/d2af5d1b07bc9d1e00e4b65a3d6a9da471ea6ea9)_ — `app-builder-lib`
- Fix(linux): validate `.desktop` entry keys and values before writing them, for every Linux target _[`#10316`](https://github.com/electron-userland/electron-builder/pull/10316) [`3f1d50b`](https://github.com/electron-userland/electron-builder/commit/3f1d50b49d96a48d38ad9008009782d4bcabd91a)_ — `app-builder-lib`

  The desktop entry of every Linux target that writes one is checked before it is written, so a configuration can no longer produce a corrupt `.desktop` file. The build fails with an `InvalidConfigurationError` naming the group and the key for a value with `\r` or `\n` inside it (from `linux.desktop.entry`, `desktopActions`, `linux.category`, `linux.mimeTypes`, `fileAssociations` or `protocols`), whose second line would become a new key or group of the file; a key that GLib, which most desktops read the file with, rejects (empty, or with `=`, a line break, or brackets other than a trailing locale such as `Name[de]`), which makes it ignore the whole file; and a `desktopActions` name with `[`, `]` or a control character. Write such a value on one line, with a newline in a string value as `\n`. Line breaks at the end of a value, as in a YAML block scalar, are dropped, and values are otherwise still written as given, so escapes such as `\;` keep working. Keys that the specification does not allow but desktop environments read, such as `X_Foo`, are kept.
- Fix(snap): stop deleting `chrome-sandbox` from the shared `linux-unpacked` dir when building a core18/core20/core22 template snap. The delete raced the other Linux targets, so a deb, rpm or AppImage built in the same run could ship without `chrome-sandbox` (no SUID sandbox fallback), and AppImage could fail with `ENOENT`. The snap still omits `chrome-sandbox`; the `mksquashfs` input list already filters it out. _[`#10327`](https://github.com/electron-userland/electron-builder/pull/10327) [`798adc4`](https://github.com/electron-userland/electron-builder/commit/798adc41f80469bd036cc1b0c566e0489fbc83d7)_ — `app-builder-lib`

## electron-updater@7.0.0-alpha.10

### Patch Changes

- Fix(updater): make GitHubProvider pick the highest eligible release for alpha/beta channel clients instead of the first feed entry, so a stable hotfix published after a pre-release no longer hides that newer pre-release (or offers a downgrade) (#10287) _[`#10289`](https://github.com/electron-userland/electron-builder/pull/10289) [`a1ad1a5`](https://github.com/electron-userland/electron-builder/commit/a1ad1a5c2f1147d7e9242c0f3067464cad76e026)_
- Fix: handle a deferred native macOS update download only once _[`#10116`](https://github.com/electron-userland/electron-builder/pull/10116) [`10c4b54`](https://github.com/electron-userland/electron-builder/commit/10c4b5433dce8c325adabe3630b244919d5bc0a2)_
- Fix: stop retry backoff immediately when cancelled _[`#10126`](https://github.com/electron-userland/electron-builder/pull/10126) [`68aa2ff`](https://github.com/electron-userland/electron-builder/commit/68aa2ff1d5bc713819cd98bfb34c890fbe03a93a)_ — `builder-util-runtime`
- Fix: reject missing and path-valued cached update file names _[`#10115`](https://github.com/electron-userland/electron-builder/pull/10115) [`4ca053b`](https://github.com/electron-userland/electron-builder/commit/4ca053bb8a84735b4d807239c6cbebe59ebe4365)_
- Fix: handle multipart headers split across download chunks _[`#10117`](https://github.com/electron-userland/electron-builder/pull/10117) [`dde668d`](https://github.com/electron-userland/electron-builder/commit/dde668d148c5d88b8369b447f2e791c724b8743c)_
- Fix: validate the initial update channel and allow resetting a configured channel to the default _[`#10112`](https://github.com/electron-userland/electron-builder/pull/10112) [`1e167b8`](https://github.com/electron-userland/electron-builder/commit/1e167b8cc73ccd7d10fcd3e2b1bf8e85befb5b06)_
- Fix(docs): repair broken links and anchors across the docs site and JSDoc, and export the `SnapOptions24`, `SnapOptionsLegacy`, `SnapOptionsCustom` and `RemoteBuildOptions` types from `app-builder-lib` so their API reference pages are generated _[`#10305`](https://github.com/electron-userland/electron-builder/pull/10305) [`2fdbcae`](https://github.com/electron-userland/electron-builder/commit/2fdbcae5b136c486d3afa3e564d032b5a79dae05)_ — `electron-updater`, `builder-util-runtime`
- Feat(builder-util): `log.limit({ key, max, scope })` / `log.once(key, scope)` emit a keyed message at most N times (per process, or per scope object), replacing hand-rolled "already warned" flags; electron-updater counts once-per-updater warnings internally without changing the injectable `Logger` interface. Both share one limiter (`wrap()` on any `{ info, warn, error, debug? }` logger, including `console`), and its `LogLevel`, `LogLimitOptions`, `LoggerLike` and `LimitedLogger` types are now exported from builder-util-runtime (builder-util re-exports them) _[`#10302`](https://github.com/electron-userland/electron-builder/pull/10302) [`5cbbc8d`](https://github.com/electron-userland/electron-builder/commit/5cbbc8de8e0fb585cfa97e80644e8a29ab7d8ff4)_ — `electron-updater`, `builder-util-runtime`
- Refactor: once-only build and updater warnings use `log.once` / `log.limit` (and the updater's per-instance counter) instead of hand-rolled flags and sets; a concurrently resolved NSIS ProgID notice can no longer print twice _[`#10303`](https://github.com/electron-userland/electron-builder/pull/10303) [`6fe881e`](https://github.com/electron-userland/electron-builder/commit/6fe881ea4db4a92c8fbac7d435607d0ccebe2775)_
- Docs: document `files[].isAdminRightsRequired` as an intentionally unsigned launch hint in signed update manifests. It only selects how the hash-verified installer is launched (directly or via `elevate.exe`), so publishers can correct it in `latest.yml` without re-signing. _[`#10318`](https://github.com/electron-userland/electron-builder/pull/10318) [`434f6e9`](https://github.com/electron-userland/electron-builder/commit/434f6e98b017c14176be9aaf06891f09624c88fc)_ — `electron-updater`, `builder-util-runtime`
- Feat!: nest `files`, `extraResources` and `extraFiles` under `fileOptions` _[`#10319`](https://github.com/electron-userland/electron-builder/pull/10319) [`8f55928`](https://github.com/electron-userland/electron-builder/commit/8f5592839b6b2752754c19b8b7190ec86f55ef94)_ — `builder-util-runtime`

  The three file-copy lists live in a `fileOptions?: FilesBuildOptions | null` property at the configuration root and in every platform section (`mac`, `mas`, `masDev`, `win`, `linux`), the same way `directories` groups the build directories: `fileOptions.files`, `mac.fileOptions.extraResources`, and so on. `PlatformSpecificBuildOptions` does not extend `FilesBuildOptions`, and the TypeScript types and the JSON schema only have `fileOptions`.

  Flat `files` / `extraResources` / `extraFiles` keys in a config file, an `extends` parent, a `-c.files=…` override or the `config` object passed to `build()` are applied as their `fileOptions` counterparts before the configuration is validated, logging one warning per process that names the keys found and where they belong. When a flat key and its `fileOptions` counterpart are set on the same object, `fileOptions` wins and the build warns about the conflict. A CLI override or a parent config's flat key is merged with `fileOptions`. A `fileOptions` that is not an object (for example a list of globs written directly under it) fails the build with a message showing the nested form.

  Code that reads `files`, `extraResources` or `extraFiles` from the loaded configuration (for example a hook reading `context.packager.config.files`, or `buildResult.configuration.extraResources`) gets the `fileOptions` value, with a warning per key: the loaded configuration and its platform sections forward these reads through non-enumerable properties, which stay out of the effective config, `JSON.stringify` and `Object.keys`. Assigning them throws a configuration error naming the `fileOptions` property to set instead.

  `deepAssign` (builder-util-runtime) copies only enumerable own properties, so the forwarding properties are never copied into merged options.

  `electron-builder migrate-schema` (static and JS/TS configs) moves flat keys under `fileOptions` at the root and per platform. A flat key also set under `fileOptions` is removed with a warning, since the build ignores it.

  See https://www.electron.build/docs/migration/v27-breaking-changes#file-options-fileoptions



# [27.0.0-alpha.10](https://github.com/electron-userland/electron-builder/compare/electron-builder@27.0.0-alpha.9...electron-builder@27.0.0-alpha.10) (2026-10-08)

## electron-builder@27.0.0-alpha.10

### Major Changes

- Feat(security)!: signed update manifests (Ed25519) are required by default, with trust lists and multi-signature manifests _[`#9877`](https://github.com/electron-userland/electron-builder/pull/9877) [`d45536f`](https://github.com/electron-userland/electron-builder/commit/d45536f74e63e5c19dd4a590238521f6315812f5)_ — `electron-builder`, `app-builder-lib`, `builder-util`, `builder-util-runtime`, `dmg-builder` · updated in [`#10255`](https://github.com/electron-userland/electron-builder/pull/10255)

  BREAKING CHANGE: signing auto-update manifests is now REQUIRED by default. A build with a publish policy
  (`--publish`) that includes a target writing auto-update metadata (`latest*.yml`: NSIS, AppImage, deb/rpm/pacman,
  macOS zip/dmg, AppX with `electronUpdaterAware`) fails when no Ed25519 signing key resolves. The check runs at build
  start, before anything is packed or uploaded, so no artifact of that build is published; a build of only targets
  that write no update info (snap, flatpak, MSI/MSIX, portable, mas/pkg, plain archives) needs no key. Third-party
  targets declare update info with the new `Target.writesUpdateInfo` getter; one that does not is still checked, but
  only when its own artifact is created. The error names `electron-builder create-update-key` and the
  `ELECTRON_BUILDER_UPDATE_SIGN_KEY` / `ELECTRON_BUILDER_UPDATE_SIGN_KEY_FILE` environment variables
  (`updateManifest.signingKey` / `signingKeyFile` work too). A build without a publish policy only warns, so local
  builds are unaffected. To keep publishing unsigned manifests, set `updateManifest: false` - the only opt-out; every
  build that emits a manifest then logs a warning, and `false` also short-circuits the signing-key environment
  variables, so a leftover CI secret cannot re-enable signing behind the opt-out. `updateManifest: null` is not an
  opt-out. A platform block may be `false` on its own and shadows a root signing config for that platform, while a
  platform `null` still falls back to the root. `publishAutoUpdate: false` waives the requirement only when every
  publish provider sets it (no manifest is emitted then); a single provider that still emits a manifest keeps it
  enforced. A `publicKey` with no private key does not satisfy it. Because installs that carry a public key are
  fail-closed, do not switch to `updateManifest: false` after shipping signed manifests - those installs would refuse
  every further update. `getAppUpdatePublishConfiguration` (exported for third-party targets) can now throw for this
  reason. See the v27 breaking changes guide.

  Ed25519 signing of auto-update manifests (`latest*.yml`). Each manifest is signed over its integrity-critical fields
  with the keys from `updateManifest.signingKey`/`signingKeyFile` or the `ELECTRON_BUILDER_UPDATE_SIGN_KEY`/
  `ELECTRON_BUILDER_UPDATE_SIGN_KEY_FILE` env vars, and the matching public keys are embedded into `app-update.yml`
  (both resolved from the same keys on the platform packager, so signing and embedding cannot disagree).
  electron-updater verifies the signature before downloading and refuses to update on tamper/missing-signature
  (fail-closed). Installs built before a public key existed keep skipping verification with a one-time warning. New
  CLI: `electron-builder create-update-key` (prints the public key and its key id).

  Key rotation without a flag day: an install trusts a **list** of public keys (`updateManifestPublicKey` is a
  string or an array; `updateManifest.publicKey`, `signingKey` and `signingKeyFile` accept arrays, a PEM value may
  hold several concatenated keys, and `ELECTRON_BUILDER_UPDATE_SIGN_KEY_FILE` accepts several paths joined with
  the OS path delimiter), and a manifest may carry **several signatures** (`signatures: [{ keyId, signature }]`,
  one per signing key, next to the legacy `signature` of the first key). A manifest is accepted when any trusted
  key validates any of its signatures, so a release signed with `[old, new]` verifies on installs that trust
  either. `AppUpdater.updateManifestPublicKey` accepts a string or an array. A build-time warning flags an
  explicit `publicKey` list that contains none of the signing keys.

  `app-update.yml` (the embedded feed and trust list) now follows the targets that write update info: each packaged
  app embeds the first manifest-receiving provider of the publish settings of its manifest-emitting targets
  (NSIS/NSIS web, AppX with `electronUpdaterAware`, macOS dmg/zip, AppImage, deb/rpm/pacman), resolving target, then
  platform, then top level, instead of the platform/top-level `publish` only. A build with only `nsis.publish`
  therefore ships that feed and the key verifying its signed manifests, where it used to ship no `app-update.yml`
  (or, with a GitHub `repository`, a GitHub feed while the manifests went elsewhere). With no such target (snap-only,
  `publish: null` or `publishAutoUpdate: false` on the target) the platform/top-level settings apply as before,
  including the GitHub fallback. AppImage and deb/rpm/pacman honor `appImage.publish`/`deb.publish` etc. for the file
  they write. When two targets built from the same app (e.g. `dmg` and `zip`, or `nsis` and an updater-aware `appx`)
  resolve different feeds (first providers that differ in more than upload-only options such as `publishAutoUpdate`
  or `timeout`), a publishing build fails at build start with an `InvalidConfigurationError`; a build without a
  publish policy warns that publishing will fail and writes no `app-update.yml` for that app. Configure `publish`
  once at the platform level, or give those targets the same first provider. `getAppUpdatePublishConfiguration` now
  honors the target-specific options passed to it. A provider with `publishAutoUpdate: false` is no longer embedded
  as the feed when a later provider receives the manifest (e.g. `[{ provider: "s3", publishAutoUpdate: false },
  "github"]` now embeds GitHub instead of an S3 feed that never gets a `latest*.yml`).

  Gating of the Linux package-manager signature-bypass flags landed separately as
  `AppUpdater.allowUnverifiedLinuxPackages` (#9990).
- Feat!: a code-signed Windows build that writes `app-update.yml` (an `nsis`, `nsis-web` or `electronUpdaterAware` `appx` target with a publish configuration, including one inferred from a GitHub `repository`) now fails with an `InvalidConfigurationError` when its publisher name cannot be determined: any custom `win.sign.sign` hook without `win.sign.publisherName` (its publisher name is never derived from a certificate, not even one in the config — `certificateFile`, `certificateSubjectName`, `certificateSha1`, `cscLink` — or from `WIN_CSC_LINK` / `CSC_LINK`, because the hook may sign with another one), or a certificate without a Common Name (including a certificate-store subject, which no longer yields an undefined publisher name). Set `win.sign.publisherName` to the subject of the signing certificate (copy it from a binary your hook already signed), or set `win.verifyUpdateCodeSignature: false` only if your updates are not Authenticode-signed or you don't use electron-updater. Error and warning messages now name `win.sign.publisherName` instead of the removed `win.publisherName`. _[`#10264`](https://github.com/electron-userland/electron-builder/pull/10264) [`c8ca1ac`](https://github.com/electron-userland/electron-builder/commit/c8ca1ac573f2160cf1c15a9e8c028b60960a94df)_ — `app-builder-lib`
- Feat!: electron-builder sets `isAdminRightsRequired` in the update info of every per-machine `nsis` and `nsis-web` build (`perMachine: true`), including assisted installers (`oneClick: false`) that don't set `packElevateHelper` and builds with `differentialPackage: false`, and writes it into the file entry of the installer for `nsis-web` builds too, so their updates are started with `elevate.exe` directly and, like other per-machine updates, are not installed automatically at launch with `autoInstallEvent: "onNextLaunch"` (call `installPendingUpdateIfAvailable()`) _[`#10264`](https://github.com/electron-userland/electron-builder/pull/10264) [`c8ca1ac`](https://github.com/electron-userland/electron-builder/commit/c8ca1ac573f2160cf1c15a9e8c028b60960a94df)_ — `app-builder-lib`
- Feat!: NSIS web-installer updates are rejected unless `disableWebInstaller` is `false` (the v27 grace period is removed; cached and install-on-next-launch web updates re-verify the web package), and the nsis-web installer verifies `--package-file` and versioned package downloads against its built-in SHA-512 hashes (opt out with `nsisWeb.allowUnverifiedAppPackage`). Set `disableWebInstaller` before the app is ready: a pending install-on-next-launch web update is checked against it at app `ready` _[`#10264`](https://github.com/electron-userland/electron-builder/pull/10264) [`c8ca1ac`](https://github.com/electron-userland/electron-builder/commit/c8ca1ac573f2160cf1c15a9e8c028b60960a94df)_ — `app-builder-lib`
- Feat!: the nsis-web installer verifies and installs its own copy of a local app package. A package passed via `--package-file` (electron-updater does this for updates) or found next to the installer is first copied into the installer's own temporary directory; the checksum is computed on that copy and that copy is what is extracted. With `nsisWeb.allowUnverifiedAppPackage` a package passed via `--package-file` is still copied, but not verified. The local package file is now left in place (the installer's copy is moved into the app's update cache instead), and the installation is aborted (exit code `2`) if a `--package-file` package cannot be copied; a package found next to the installer that cannot be copied is ignored and the package is downloaded, as when its checksum doesn't match. electron-updater removes the package it passed via `--package-file` from its `pending` cache directory at startup once the app runs the version of that update (`update-info.json` records the version of a web installer update for this); the package of an update that is not installed yet, or whose install failed, is kept. _[`#10264`](https://github.com/electron-userland/electron-builder/pull/10264) [`c8ca1ac`](https://github.com/electron-userland/electron-builder/commit/c8ca1ac573f2160cf1c15a9e8c028b60960a94df)_ — `app-builder-lib`
- Feat!: remove `customNsisBinary` / `customNsisResources` in favour of `toolsets.nsis` and `installerDebugLogging`; hint `--config` in `migrate-schema` _[`#10276`](https://github.com/electron-userland/electron-builder/pull/10276) [`a5eff4b`](https://github.com/electron-userland/electron-builder/commit/a5eff4b2179b949f72f791e7ff2406a30f077795)_ — `electron-builder`, `app-builder-lib`

  v27 had stopped using a custom NSIS bundle set via `nsis.customNsisBinary` (also on `nsisWeb` / `portable`) or `customNsisResources` and silently built with the default NSIS. Both keys and the exported `CustomNsisBinary` type are now removed, and a config that sets them fails the build with a message naming the replacement:

  - a custom NSIS build moves to `toolsets.nsis: { url, checksum, version }`. The url and the v26 base64 SHA-512 checksum work as before (see https://www.electron.build/docs/toolsets#custom-toolset-checksum), but the bundle must contain the NSIS plugins (`plugins/` or `windows/Plugins/`), which v26 read from a separate resources bundle
  - `customNsisBinary.debugLogging` becomes `nsis.installerDebugLogging` (also on `nsisWeb`). It needs a log-enabled NSIS (`makensis` and stubs compiled with `NSIS_CONFIG_LOG=yes`), which the bundled `toolsets.nsis` versions are not, so setting it without a custom `toolsets.nsis` now fails with a configuration error instead of a `LogSet` error from `makensis`

  `electron-builder migrate-schema` (static and JS/TS configs) moves `debugLogging` to `installerDebugLogging` (dropping it, with a warning, for `portable`, where it had no effect) and removes a `customNsisBinary` that sets nothing else. It leaves a custom bundle in place and warns, without printing its url or checksum, because the bundle itself has to change.

  Any custom toolset (`toolsets.<name>: { url, checksum }`) with a checksum that is neither a SHA-256 hex value nor a base64 SHA-512 (for example a `sha256:` prefixed value) now fails with a configuration error linking to https://www.electron.build/docs/toolsets#custom-toolset-checksum before anything is downloaded, instead of a generic checksum mismatch afterwards. An uppercase hex value is lowercased.

  When `migrate-schema` finds no config, its error now lists every auto-detected file name (including `electron-builder.mjs`) and says that a config file with another name needs `--config <path>`.

### Minor Changes

- Feat: add `writeEffectiveConfig` to control writing `builder-effective-config.yaml`. Before, the file was only written for local interactive builds, so CI steps could not read the resolved configuration (e.g. the detected `electronVersion`). Set `true` to always write it or `false` to never write it; the default is unchanged. _[`#10260`](https://github.com/electron-userland/electron-builder/pull/10260) [`5f2f906`](https://github.com/electron-userland/electron-builder/commit/5f2f9065a6bd28842cbef786f41753641ad747ee)_ — `app-builder-lib`
- Feat(nsis): self-identify install method via `resources/package-type` so nsis-web installs default `disableWebInstaller` to `false` _[`#9979`](https://github.com/electron-userland/electron-builder/pull/9979) [`7a0abca`](https://github.com/electron-userland/electron-builder/commit/7a0abca14439514fc817da609a169b9973c38864)_ — `app-builder-lib` · updated in [`#10264`](https://github.com/electron-userland/electron-builder/pull/10264)

  NSIS installers now write a `resources/package-type` marker (`nsis` or `nsis-web`) at install time, mirroring the existing Linux `package-type` mechanism. electron-updater's `NsisUpdater` reads this marker and, for `nsis-web` installs, pre-seeds `disableWebInstaller = false` so web-installer auto-updates keep working without the app wiring the flag by hand.

  This is a default only: a value the app sets (`autoUpdater.disableWebInstaller = …`) still wins, and a plain `nsis` marker, or no marker, leaves the default (`true`), so web-installer updates are rejected with `ERR_UPDATER_WEB_INSTALLER_DISABLED`. The marker is written by the installer script — the only build artifact that differs between `nsis` and `nsis-web` (the app payload is byte-identical, since both targets share one app archive). Only go-forward installs carry the marker; existing deployments are unaffected.
- Fix: `nativeModules.buildDependenciesFromSource` no longer skips the native-dependency rebuild when the target platform differs from the host (which shipped the host's binary). Native modules cannot be cross-compiled from source, so such targets are now rebuilt with prebuilt binaries for the target and a warning is logged. feat: after packing (per slice for macOS universal, before the merge), every `.node` addon in `app.asar`, `app.asar.unpacked` or `app` is identified from its ELF / Mach-O / PE header and compared with the target platform/arch; a mismatch fails the build with the file, detected and expected target. Other mismatched native files (`.so`, `.dylib`, `.dll`, `.exe`) only warn, and files declared for another platform (`package.json` `os`/`cpu`, `prebuilds/<platform>-<arch>/` paths) are skipped. New opt-out option `nativeModules.verifyNativeBinaries?: boolean | "warn" | null` (`"warn"` logs only, `false` skips). _[`#10265`](https://github.com/electron-userland/electron-builder/pull/10265) [`0966275`](https://github.com/electron-userland/electron-builder/commit/0966275eda68f3f27e6e179ad2d2c7645790a2e2)_ — `app-builder-lib`
- Feat(toolsets): accept a base64 SHA-512 checksum for custom toolsets and verify local `file://` archives _[`#10283`](https://github.com/electron-userland/electron-builder/pull/10283) [`02bf5b0`](https://github.com/electron-userland/electron-builder/commit/02bf5b09790e4ff36b7b639437ef765a7d185e73)_ — `app-builder-lib`

  `toolsets.<name>.checksum` now accepts the base64-encoded SHA-512 of the archive (88 characters, e.g. `openssl dgst -sha512 -binary <archive> | openssl base64 -A`) as well as the SHA-256 hex. v26 used base64 SHA-512 for all toolset checksums, so a v26 value carries over unchanged. v27 defaults to SHA-256 hex because toolset downloads moved to the official `@electron/get` package, whose checksum verification (`sumchecker`) only supports SHA-256 hex, so a SHA-512 download is verified by electron-builder before it is cached or extracted, and a corrupted download is deleted. A local `file://` archive is now verified against its checksum before it is extracted; on a mismatch the build fails with a configuration error naming the file and both checksums, and the file is left in place. Prefixed values (`sha256:…`, `sha512-…`) and a hex-encoded SHA-512 are still rejected before anything is downloaded. See https://www.electron.build/docs/toolsets#custom-toolset-checksum
- Feat(blockmap): chunk the stored `resources/app.asar` region with finer content-defined blocks (4/8/16 KiB) than the rest of the artifact. With `nsis.differentialPackage: "store-asar"`, the asar sits uncompressed in the package and in the signed installer, so its byte range is now chunked on its own parameters instead of the 8/16/32 KiB default used everywhere else — a one-line app-code change costs 5–17% fewer bytes on the wire (measured on a ~32 MB asar). The blockmap format is unchanged and every shipped electron-updater reads it exactly as before; when the asar bytes cannot be located in the package the build logs a warning and falls back to default chunking rather than failing. _[`#10235`](https://github.com/electron-userland/electron-builder/pull/10235) [`e75e896`](https://github.com/electron-userland/electron-builder/commit/e75e896b93e28b1dd21a704a2f48439e09c05a10)_ — `app-builder-lib`

  Note for apps already shipping `"store-asar"` (available since 26.x via #10201 and 27.0.0-alpha.9): the block boundaries inside the asar region change once. The first differential update from an installer built without this change to one built with it re-downloads close to the whole asar; updates between installers built with it get the smaller deltas.

### Patch Changes

- Chore: replace ESLint and Prettier with oxlint and oxfmt _[`#10240`](https://github.com/electron-userland/electron-builder/pull/10240) [`a578e53`](https://github.com/electron-userland/electron-builder/commit/a578e53441ede7f6fb3e9d69292dc135ef37ed17)_ — `electron-builder`, `app-builder-lib`, `builder-util`, `electron-publish`
- Fix: preserve sibling paths in diagnostic path logging _[`#10152`](https://github.com/electron-userland/electron-builder/pull/10152) [`7619d08`](https://github.com/electron-userland/electron-builder/commit/7619d08a1c02049b0dd40e043346e5263c0a3e50)_ — `builder-util`
- Perf: make module downward search linear _[`#10149`](https://github.com/electron-userland/electron-builder/pull/10149) [`bd7786f`](https://github.com/electron-userland/electron-builder/commit/bd7786f24b3b9eeb026931a2c0af9aad928afe7a)_ — `app-builder-lib`
- Fix: resolve retina backgrounds by terminal extension _[`#10143`](https://github.com/electron-userland/electron-builder/pull/10143) [`63de366`](https://github.com/electron-userland/electron-builder/commit/63de366290b074ce163070a3399a648062bcc0ad)_ — `dmg-builder`
- Fix(nsis): warn when `differentialPackage: "store-asar"` finds no `resources/app.asar` (e.g. `asar: false`) instead of silently compressing the package normally _[`#10246`](https://github.com/electron-userland/electron-builder/pull/10246) [`1b0225e`](https://github.com/electron-userland/electron-builder/commit/1b0225e22436c578533ad280b64eab7c41947a48)_ — `app-builder-lib`
- Fix(mac): sign with the unique certificate hash, and keep MAS `ElectronTeamID` automation working _[`#10238`](https://github.com/electron-userland/electron-builder/pull/10238) [`56d2d74`](https://github.com/electron-userland/electron-builder/commit/56d2d746123efa1edd4caa6871fadfedec261438)_ — `app-builder-lib`

  `codesign --sign` was given the certificate's common name, which fails with `ambiguous (matches "X" and "X" ...)` when the keychain holds more than one valid certificate with that name. It is now given the certificate's SHA-1 hash, which is unique.

  `@electron/osx-sign` parses the Team ID out of the identity *name* to fill in `ElectronTeamID` for sandboxed (MAS) apps, so electron-builder now writes that key into the app's `Info.plist` itself before signing — the same value from the same source — instead of relying on the identity string carrying it. A custom signer replaces osx-sign entirely, so it keeps receiving the bare hash and its `Info.plist` is left untouched.

  Also fixes `savePlistFile` destroying `<data>` and `<date>` values, which it rewrote as a `<dict>` of byte integers and an empty `<dict>` respectively.
- Fix(nsis): keep installer extraction in sync with the payload format when `useZip` is set (ignored with a warning for differential-aware builds and for `nsis-web`, which always use 7z), and only share an app package between targets (e.g. nsis + portable) whose packaging settings match _[`#10248`](https://github.com/electron-userland/electron-builder/pull/10248) [`6312a4d`](https://github.com/electron-userland/electron-builder/commit/6312a4d47d8fc20371ba3be8f6063ac1b581dd77)_ — `app-builder-lib`
- Fix: encode Bitbucket delete filenames _[`#10150`](https://github.com/electron-userland/electron-builder/pull/10150) [`2f6d7d1`](https://github.com/electron-userland/electron-builder/commit/2f6d7d1c4bd8965909cf2e2fabbed95dc7c78d80)_ — `electron-publish`
- Refactor: replace deprecated recursive rmdir _[`#10146`](https://github.com/electron-userland/electron-builder/pull/10146) [`ecde932`](https://github.com/electron-userland/electron-builder/commit/ecde93298dbf7ba0063d4733584aa07910e8d718)_ — `app-builder-lib`
- Fix: preserve repeated debug logger key segments _[`#10130`](https://github.com/electron-userland/electron-builder/pull/10130) [`4bc95cc`](https://github.com/electron-userland/electron-builder/commit/4bc95cce39b2862e798365dc4687443e64f001a1)_ — `builder-util`
- Chore(deps): update dependency undici to v7.29.1 [security] _[`#10259`](https://github.com/electron-userland/electron-builder/pull/10259) [`2b3417b`](https://github.com/electron-userland/electron-builder/commit/2b3417bd76bcfeb539a835205e1507eb554a7b86)_ — `app-builder-lib`
- Fix(migrate-schema): print advisories, for JS/TS configs as well as JSON, YAML, TOML and package.json ones, for `nsis.perMachine` / `nsisWeb.perMachine` (per-machine NSIS updates) and a custom `win.sign.sign` hook without `win.sign.publisherName` (whatever certificate the config names); the `nsis-web` advisory now says that web-installer updates are rejected unless `autoUpdater.disableWebInstaller` is `false` and when to set `nsisWeb.allowUnverifiedAppPackage`, and target names with an `:arch` suffix (e.g. `nsis-web:ia32`) are detected _[`#10264`](https://github.com/electron-userland/electron-builder/pull/10264) [`c8ca1ac`](https://github.com/electron-userland/electron-builder/commit/c8ca1ac573f2160cf1c15a9e8c028b60960a94df)_
- Fix(nsis): a silent nsis-web installer run exits with code 2 when the app package cannot be downloaded, instead of waiting on the retry prompt. A cancelled package download, an app package that cannot be extracted, and a running app that cannot be closed (or that the user chose not to close) now also end an NSIS installer with exit code 2 explicitly, like its other aborts _[`#10264`](https://github.com/electron-userland/electron-builder/pull/10264) [`c8ca1ac`](https://github.com/electron-userland/electron-builder/commit/c8ca1ac573f2160cf1c15a9e8c028b60960a94df)_ — `app-builder-lib`
- Fix: merge the update info of a target into `latest*.yml` with `deepAssign` _[`#10264`](https://github.com/electron-userland/electron-builder/pull/10264) [`c8ca1ac`](https://github.com/electron-userland/electron-builder/commit/c8ca1ac573f2160cf1c15a9e8c028b60960a94df)_ — `app-builder-lib`
- Fix(nsis): the nsis-web installer copies, verifies and, if needed, downloads its app package before it removes the installed version, so a refused package, a `--package-file` package that cannot be copied, or a failed or cancelled download leaves the installed version in place. Because the download can take a while, a run that isn't an update (`--updated`) then checks again for the running app, with the same prompt as at the start (Cancel aborts with exit code 2), before the old uninstaller would close it without asking _[`#10264`](https://github.com/electron-userland/electron-builder/pull/10264) [`c8ca1ac`](https://github.com/electron-userland/electron-builder/commit/c8ca1ac573f2160cf1c15a9e8c028b60960a94df)_ — `app-builder-lib`
- Fix: point the `PUBLISH_FOR_PULL_REQUEST` and `CSC_FOR_PULL_REQUEST` warnings at the current CircleCI page on secrets in forked pull request builds. The previous link returned 404. _[`#10268`](https://github.com/electron-userland/electron-builder/pull/10268) [`79f0062`](https://github.com/electron-userland/electron-builder/commit/79f0062e2746fcb20cd116149795ac07ce8f1b65)_ — `app-builder-lib`
- Fix: `HttpExecutor.removeCrossOriginSensitiveHeaders` copies the headers with `deepAssign`, which ignores `__proto__`, `constructor` and `prototype` keys _[`#10270`](https://github.com/electron-userland/electron-builder/pull/10270) [`ec9135d`](https://github.com/electron-userland/electron-builder/commit/ec9135d0626879479ffa4235006f06b14375cc43)_ — `builder-util-runtime`
- Fix(migrate-schema): print an advisory, for JS/TS configs as well as JSON, YAML, TOML and package.json ones, for a `generic` publish `url` with a query string: electron-updater sends the feed query and the credential headers only to downloads on the feed's origin. The build prints the same warning once per feed (naming the query parameters, not their values) when it writes such a feed to `app-update.yml`, so it does not depend on `migrate-schema` having been run _[`#10270`](https://github.com/electron-userland/electron-builder/pull/10270) [`ec9135d`](https://github.com/electron-userland/electron-builder/commit/ec9135d0626879479ffa4235006f06b14375cc43)_ — `electron-builder`, `app-builder-lib`
- Fix: handle EPIPE on child stdin in `spawnAndWrite` / `spawnAndWriteWithOutput` when the process exits before all input is written _[`#10275`](https://github.com/electron-userland/electron-builder/pull/10275) [`6e84132`](https://github.com/electron-userland/electron-builder/commit/6e841322856c4d3aca91ae0783aa38f61fe21a40)_ — `builder-util`
- Fix(nsis): apply the uninstaller icon patch when extracting the uninstaller without running the installer, verify the NSIS integrity check before shipping it, and use this extraction on every host (running the installer is now only a fallback) _[`#10262`](https://github.com/electron-userland/electron-builder/pull/10262) [`ba65cf6`](https://github.com/electron-userland/electron-builder/commit/ba65cf6db5648581677d77bfe4a06403f0a6f2cd)_ — `app-builder-lib`
- Fix(pnpm-collector): read the app's own package.json from its directory so an app named like one of its dependencies no longer loses production dependencies from the asar _[`#10278`](https://github.com/electron-userland/electron-builder/pull/10278) [`581e6f5`](https://github.com/electron-userland/electron-builder/commit/581e6f55cd1e11dca7ea7743e18c7c72f687698d)_ — `app-builder-lib`
- Fix: reject a collected node_modules tree unless every declared production dependency is present or reported as legitimately absent, so a partial tree falls back to traversal _[`#10281`](https://github.com/electron-userland/electron-builder/pull/10281) [`f63691e`](https://github.com/electron-userland/electron-builder/commit/f63691e78c396fb83606e520dada1687ab3ef2ae)_ — `app-builder-lib`
- Fix: encode GitHub upload artifact names _[`#10139`](https://github.com/electron-userland/electron-builder/pull/10139) [`871e622`](https://github.com/electron-userland/electron-builder/commit/871e622e56f8fc77682eb17bba37341ac9f31188)_ — `electron-publish`

## electron-updater@7.0.0-alpha.9

### Major Changes

- Feat(updater): add `verifyUpdateFile` to `AppUpdater`, and rename the NSIS Authenticode verification interface _[`#10239`](https://github.com/electron-userland/electron-builder/pull/10239) [`317fc9e`](https://github.com/electron-userland/electron-builder/commit/317fc9e7a820c55005179d3c648b36204efd1288)_

  `AppUpdater.verifyUpdateFile` lets an app run its own verification of an update file before that file is allowed to become installable. The default implementation is a stub that immediately succeeds. It runs on every path that can lead to an install — right after a fresh download (while the file still sits under a temporary name, so an unverified file is never executable under its real name), when an update downloaded by an earlier session is reused from the cache, and before an install-on-next-launch spawns the cached installer. On failure the file is deleted and an `ERR_UPDATER_INVALID_UPDATE_FILE` error is emitted. Assigning `null` restores the default.

  The NSIS Authenticode verification interface now returns an unambiguous result object instead of the `null`-means-success / `string`-means-error convention:

  ```ts
  type VerifyUpdateFileResult = { response: "success" } | { response: "failure"; message: string }
  ```

  BREAKING CHANGE: `NsisUpdater.verifyUpdateCodeSignature` is deprecated in favour of `verifyUpdateFileAuthenticodeSignature`, which differs in return type. The old name is kept as a compatibility shim that translates in both directions and shall be removed in electron-builder v28.

  ```ts
  // Before
  autoUpdater.verifyUpdateCodeSignature = async (publisherNames, path) => (isValid ? null : "why it failed")

  // After
  autoUpdater.verifyUpdateFileAuthenticodeSignature = async (publisherNames, path) =>
    isValid ? { response: "success" } : { response: "failure", message: "why it failed" }
  ```

  BREAKING CHANGE: the protected `NsisUpdater._verifyUpdateCodeSignature` member is renamed to `_verifyUpdateFileAuthenticodeSignature` and takes the new return type. A deprecated accessor under the old name forwards to it, so a subclass that **assigns** `this._verifyUpdateCodeSignature` keeps working; a subclass that **redeclares** it as a class field shadows the accessor and must be migrated.

  BREAKING CHANGE: the protected `BaseUpdater.verifyInstallerSignatureOnLaunch` returns `Promise<VerifyUpdateFileResult>` instead of `Promise<string | null>`. An override that resolves `null` to mean "verified" now reports every install-on-next-launch as unsigned; return `{ response: "success" }` instead. (This member was introduced earlier in the same v27 pre-release cycle, so only apps on a 7.0.0-alpha are affected.)
- Feat(updater): default `disableWebInstaller` to `true` _[`#9979`](https://github.com/electron-userland/electron-builder/pull/9979) [`7a0abca`](https://github.com/electron-userland/electron-builder/commit/7a0abca14439514fc817da609a169b9973c38864)_ — updated in [`#10264`](https://github.com/electron-userland/electron-builder/pull/10264)

  BREAKING CHANGE: `AppUpdater.disableWebInstaller` now defaults to `true`. NSIS web-installer packages are no longer loaded unless you opt in, because their payload is fetched from a manifest-supplied URL that may not undergo signature verification.

  A web-installer update is rejected with `ERR_UPDATER_WEB_INSTALLER_DISABLED` unless `disableWebInstaller` is `false`. Installs made by an `nsis-web` installer built with electron-builder v27+ opt in automatically through the `resources/package-type` marker. If you publish and rely on an NSIS web installer for other installs, set `autoUpdater.disableWebInstaller = false` in your main process.
- Feat!: NSIS web-installer updates are rejected unless `disableWebInstaller` is `false` (the v27 grace period is removed; cached and install-on-next-launch web updates re-verify the web package), and the nsis-web installer verifies `--package-file` and versioned package downloads against its built-in SHA-512 hashes (opt out with `nsisWeb.allowUnverifiedAppPackage`). Set `disableWebInstaller` before the app is ready: a pending install-on-next-launch web update is checked against it at app `ready` _[`#10264`](https://github.com/electron-userland/electron-builder/pull/10264) [`c8ca1ac`](https://github.com/electron-userland/electron-builder/commit/c8ca1ac573f2160cf1c15a9e8c028b60960a94df)_
- Feat!: electron-updater sends update-feed credentials only to downloads on the feed's origin. With the generic, s3, spaces, r2, keygen, bitbucket, github and gitlab providers, a download on another origin than the feed (scheme, host or port) — an absolute `files[].url` or `packages.<arch>.path` in `latest*.yml`, a GitLab release asset link, and the blockmaps and differential range requests derived from them — is requested without the credential headers from `requestHeaders` / `addAuthHeader` (headers such as `Authorization`, the same set that is removed on a cross-origin redirect) and without the feed URL's query string. Such a URL keeps its own query string, so pre-signed URLs work. With every provider, including custom ones, a URL that electron-updater resolves against the feed URL (such as a `files[].url` or a blockmap) gets the feed query only on the feed's origin; as on redirects, an `http` → `https` upgrade of the feed host on the default ports keeps the headers and the query. Downloads on the feed origin are unchanged, and the old blockmap from an app-set `previousBlockmapBaseUrlOverride` keeps the credentials on that origin. If your `latest*.yml` points downloads at another origin that needs these credentials, serve the files from the feed origin or use pre-signed URLs. The NSIS web-package differential download now uses the same per-download headers as other downloads. A custom provider that does not extend a built-in one must declare `Provider.feedBaseUrl` — its feed URL (the credential headers then only go to that origin) or `null` (the request headers go to every download URL) — when the download headers include a credential header: if it does not, `downloadUpdate()` fails with `ERR_UPDATER_FEED_BASE_URL_NOT_DECLARED` before any download request. The first download that loses the credential headers, and the first that does not get the feed query, each log a warning once per updater, naming the headers, the query parameters and the origins (never their values), with a link to the migration guide; `ERR_UPDATER_FEED_BASE_URL_NOT_DECLARED` links it too. New APIs: `Provider.feedBaseUrl` (`undefined`, not declared, by default), `HttpExecutor.sensitiveHeaderNames`, `HttpExecutor.removeCrossOriginSensitiveHeaders` and `HttpExecutor.isCrossOrigin`. _[`#10270`](https://github.com/electron-userland/electron-builder/pull/10270) [`ec9135d`](https://github.com/electron-userland/electron-builder/commit/ec9135d0626879479ffa4235006f06b14375cc43)_ — `electron-updater`, `builder-util-runtime`

### Minor Changes

- Feat(security)!: signed update manifests (Ed25519) are required by default, with trust lists and multi-signature manifests _[`#9877`](https://github.com/electron-userland/electron-builder/pull/9877) [`d45536f`](https://github.com/electron-userland/electron-builder/commit/d45536f74e63e5c19dd4a590238521f6315812f5)_ — `electron-updater`, `builder-util-runtime` · updated in [`#10255`](https://github.com/electron-userland/electron-builder/pull/10255)

  BREAKING CHANGE: signing auto-update manifests is now REQUIRED by default. A build with a publish policy
  (`--publish`) that includes a target writing auto-update metadata (`latest*.yml`: NSIS, AppImage, deb/rpm/pacman,
  macOS zip/dmg, AppX with `electronUpdaterAware`) fails when no Ed25519 signing key resolves. The check runs at build
  start, before anything is packed or uploaded, so no artifact of that build is published; a build of only targets
  that write no update info (snap, flatpak, MSI/MSIX, portable, mas/pkg, plain archives) needs no key. Third-party
  targets declare update info with the new `Target.writesUpdateInfo` getter; one that does not is still checked, but
  only when its own artifact is created. The error names `electron-builder create-update-key` and the
  `ELECTRON_BUILDER_UPDATE_SIGN_KEY` / `ELECTRON_BUILDER_UPDATE_SIGN_KEY_FILE` environment variables
  (`updateManifest.signingKey` / `signingKeyFile` work too). A build without a publish policy only warns, so local
  builds are unaffected. To keep publishing unsigned manifests, set `updateManifest: false` - the only opt-out; every
  build that emits a manifest then logs a warning, and `false` also short-circuits the signing-key environment
  variables, so a leftover CI secret cannot re-enable signing behind the opt-out. `updateManifest: null` is not an
  opt-out. A platform block may be `false` on its own and shadows a root signing config for that platform, while a
  platform `null` still falls back to the root. `publishAutoUpdate: false` waives the requirement only when every
  publish provider sets it (no manifest is emitted then); a single provider that still emits a manifest keeps it
  enforced. A `publicKey` with no private key does not satisfy it. Because installs that carry a public key are
  fail-closed, do not switch to `updateManifest: false` after shipping signed manifests - those installs would refuse
  every further update. `getAppUpdatePublishConfiguration` (exported for third-party targets) can now throw for this
  reason. See the v27 breaking changes guide.

  Ed25519 signing of auto-update manifests (`latest*.yml`). Each manifest is signed over its integrity-critical fields
  with the keys from `updateManifest.signingKey`/`signingKeyFile` or the `ELECTRON_BUILDER_UPDATE_SIGN_KEY`/
  `ELECTRON_BUILDER_UPDATE_SIGN_KEY_FILE` env vars, and the matching public keys are embedded into `app-update.yml`
  (both resolved from the same keys on the platform packager, so signing and embedding cannot disagree).
  electron-updater verifies the signature before downloading and refuses to update on tamper/missing-signature
  (fail-closed). Installs built before a public key existed keep skipping verification with a one-time warning. New
  CLI: `electron-builder create-update-key` (prints the public key and its key id).

  Key rotation without a flag day: an install trusts a **list** of public keys (`updateManifestPublicKey` is a
  string or an array; `updateManifest.publicKey`, `signingKey` and `signingKeyFile` accept arrays, a PEM value may
  hold several concatenated keys, and `ELECTRON_BUILDER_UPDATE_SIGN_KEY_FILE` accepts several paths joined with
  the OS path delimiter), and a manifest may carry **several signatures** (`signatures: [{ keyId, signature }]`,
  one per signing key, next to the legacy `signature` of the first key). A manifest is accepted when any trusted
  key validates any of its signatures, so a release signed with `[old, new]` verifies on installs that trust
  either. `AppUpdater.updateManifestPublicKey` accepts a string or an array. A build-time warning flags an
  explicit `publicKey` list that contains none of the signing keys.

  `app-update.yml` (the embedded feed and trust list) now follows the targets that write update info: each packaged
  app embeds the first manifest-receiving provider of the publish settings of its manifest-emitting targets
  (NSIS/NSIS web, AppX with `electronUpdaterAware`, macOS dmg/zip, AppImage, deb/rpm/pacman), resolving target, then
  platform, then top level, instead of the platform/top-level `publish` only. A build with only `nsis.publish`
  therefore ships that feed and the key verifying its signed manifests, where it used to ship no `app-update.yml`
  (or, with a GitHub `repository`, a GitHub feed while the manifests went elsewhere). With no such target (snap-only,
  `publish: null` or `publishAutoUpdate: false` on the target) the platform/top-level settings apply as before,
  including the GitHub fallback. AppImage and deb/rpm/pacman honor `appImage.publish`/`deb.publish` etc. for the file
  they write. When two targets built from the same app (e.g. `dmg` and `zip`, or `nsis` and an updater-aware `appx`)
  resolve different feeds (first providers that differ in more than upload-only options such as `publishAutoUpdate`
  or `timeout`), a publishing build fails at build start with an `InvalidConfigurationError`; a build without a
  publish policy warns that publishing will fail and writes no `app-update.yml` for that app. Configure `publish`
  once at the platform level, or give those targets the same first provider. `getAppUpdatePublishConfiguration` now
  honors the target-specific options passed to it. A provider with `publishAutoUpdate: false` is no longer embedded
  as the feed when a later provider receives the manifest (e.g. `[{ provider: "s3", publishAutoUpdate: false },
  "github"]` now embeds GitHub instead of an S3 feed that never gets a `latest*.yml`).

  Gating of the Linux package-manager signature-bypass flags landed separately as
  `AppUpdater.allowUnverifiedLinuxPackages` (#9990).
- Feat(nsis): self-identify install method via `resources/package-type` so nsis-web installs default `disableWebInstaller` to `false` _[`#9979`](https://github.com/electron-userland/electron-builder/pull/9979) [`7a0abca`](https://github.com/electron-userland/electron-builder/commit/7a0abca14439514fc817da609a169b9973c38864)_ — updated in [`#10264`](https://github.com/electron-userland/electron-builder/pull/10264)

  NSIS installers now write a `resources/package-type` marker (`nsis` or `nsis-web`) at install time, mirroring the existing Linux `package-type` mechanism. electron-updater's `NsisUpdater` reads this marker and, for `nsis-web` installs, pre-seeds `disableWebInstaller = false` so web-installer auto-updates keep working without the app wiring the flag by hand.

  This is a default only: a value the app sets (`autoUpdater.disableWebInstaller = …`) still wins, and a plain `nsis` marker, or no marker, leaves the default (`true`), so web-installer updates are rejected with `ERR_UPDATER_WEB_INSTALLER_DISABLED`. The marker is written by the installer script — the only build artifact that differs between `nsis` and `nsis-web` (the app payload is byte-identical, since both targets share one app archive). Only go-forward installs carry the marker; existing deployments are unaffected.
- Feat(updater): optional `files[].blockMapUrl` in `latest*.yml` names a file's blockmap URL (e.g. a separately pre-signed one) instead of `${url}.blockmap` with the file URL's query string. A relative value resolves like `url` (against the feed URL); an absolute URL is used as-is, with its own host and query string. It gets the feed query and credential headers only on the feed's origin. With a `blockMapUrl`, the old blockmap is not derived from the new file's URL: it comes from the local cache, else from `previousBlockmapBaseUrlOverride`, else that update is downloaded in full (which caches the new blockmap). The manifest signature covers `blockMapUrl` when present, as an extra field on the file record, so manifests without it canonicalize and verify exactly as before; an electron-updater without this change refuses a signed manifest that has one. electron-builder does not write it. The private GitHub and GitLab providers, which resolve files from the release assets, ignore it. _[`#10270`](https://github.com/electron-userland/electron-builder/pull/10270) [`ec9135d`](https://github.com/electron-userland/electron-builder/commit/ec9135d0626879479ffa4235006f06b14375cc43)_ — `electron-updater`, `builder-util-runtime`

### Patch Changes

- Chore: replace ESLint and Prettier with oxlint and oxfmt _[`#10240`](https://github.com/electron-userland/electron-builder/pull/10240) [`a578e53`](https://github.com/electron-userland/electron-builder/commit/a578e53441ede7f6fb3e9d69292dc135ef37ed17)_
- Fix: report accurate differential download progress deltas _[`#10118`](https://github.com/electron-userland/electron-builder/pull/10118) [`58e5d2e`](https://github.com/electron-userland/electron-builder/commit/58e5d2e2b26cc7665f39e7f19e93c59259d5ee76)_
- Fix: reject traversal segments as update cache filenames _[`#10127`](https://github.com/electron-userland/electron-builder/pull/10127) [`e832c81`](https://github.com/electron-userland/electron-builder/commit/e832c8135b2e42ec06919434b678f777ef986ff1)_
- Fix: handle background download rejections from `checkForUpdatesAndNotify` _[`#10113`](https://github.com/electron-userland/electron-builder/pull/10113) [`c10345f`](https://github.com/electron-userland/electron-builder/commit/c10345f7c016cb1ebaa3cf954a55e61df56d50a4)_
- Feat!: a code-signed Windows build that writes `app-update.yml` (an `nsis`, `nsis-web` or `electronUpdaterAware` `appx` target with a publish configuration, including one inferred from a GitHub `repository`) now fails with an `InvalidConfigurationError` when its publisher name cannot be determined: any custom `win.sign.sign` hook without `win.sign.publisherName` (its publisher name is never derived from a certificate, not even one in the config — `certificateFile`, `certificateSubjectName`, `certificateSha1`, `cscLink` — or from `WIN_CSC_LINK` / `CSC_LINK`, because the hook may sign with another one), or a certificate without a Common Name (including a certificate-store subject, which no longer yields an undefined publisher name). Set `win.sign.publisherName` to the subject of the signing certificate (copy it from a binary your hook already signed), or set `win.verifyUpdateCodeSignature: false` only if your updates are not Authenticode-signed or you don't use electron-updater. Error and warning messages now name `win.sign.publisherName` instead of the removed `win.publisherName`. _[`#10264`](https://github.com/electron-userland/electron-builder/pull/10264) [`c8ca1ac`](https://github.com/electron-userland/electron-builder/commit/c8ca1ac573f2160cf1c15a9e8c028b60960a94df)_
- Fix(updater): pass the web installer package to `verifyUpdateFile` as `packageFilePath` when a pending web update is installed on next launch _[`#10264`](https://github.com/electron-userland/electron-builder/pull/10264) [`c8ca1ac`](https://github.com/electron-userland/electron-builder/commit/c8ca1ac573f2160cf1c15a9e8c028b60960a94df)_
- Fix(updater): pass the NSIS install directory (`installDirectory`, `/D=`) as the last installer argument, after `--package-file` _[`#10264`](https://github.com/electron-userland/electron-builder/pull/10264) [`c8ca1ac`](https://github.com/electron-userland/electron-builder/commit/c8ca1ac573f2160cf1c15a9e8c028b60960a94df)_
- Fix(updater): the warning about `disableWebInstaller` set to `false` for a full-installer update is logged only when the app set it; for the default of an install made by an nsis-web installer an info line says that web-installer updates need `disableWebInstaller = false` after that update _[`#10264`](https://github.com/electron-userland/electron-builder/pull/10264) [`c8ca1ac`](https://github.com/electron-userland/electron-builder/commit/c8ca1ac573f2160cf1c15a9e8c028b60960a94df)_
- Feat!: the nsis-web installer verifies and installs its own copy of a local app package. A package passed via `--package-file` (electron-updater does this for updates) or found next to the installer is first copied into the installer's own temporary directory; the checksum is computed on that copy and that copy is what is extracted. With `nsisWeb.allowUnverifiedAppPackage` a package passed via `--package-file` is still copied, but not verified. The local package file is now left in place (the installer's copy is moved into the app's update cache instead), and the installation is aborted (exit code `2`) if a `--package-file` package cannot be copied; a package found next to the installer that cannot be copied is ignored and the package is downloaded, as when its checksum doesn't match. electron-updater removes the package it passed via `--package-file` from its `pending` cache directory at startup once the app runs the version of that update (`update-info.json` records the version of a web installer update for this); the package of an update that is not installed yet, or whose install failed, is kept. _[`#10264`](https://github.com/electron-userland/electron-builder/pull/10264) [`c8ca1ac`](https://github.com/electron-userland/electron-builder/commit/c8ca1ac573f2160cf1c15a9e8c028b60960a94df)_
- Fix: `HttpExecutor.removeCrossOriginSensitiveHeaders` copies the headers with `deepAssign`, which ignores `__proto__`, `constructor` and `prototype` keys _[`#10270`](https://github.com/electron-userland/electron-builder/pull/10270) [`ec9135d`](https://github.com/electron-userland/electron-builder/commit/ec9135d0626879479ffa4235006f06b14375cc43)_ — `builder-util-runtime`



# [27.0.0-alpha.9](https://github.com/electron-userland/electron-builder/compare/electron-builder@27.0.0-alpha.8...electron-builder@27.0.0-alpha.9) (2026-09-25)

## electron-builder@27.0.0-alpha.9

### Major Changes

- Feat(squirrel-windows)!: inline installer logic; remove electron-winstaller dependency and its vendored binaries _[`#9830`](https://github.com/electron-userland/electron-builder/pull/9830) [`0fdbba6`](https://github.com/electron-userland/electron-builder/commit/0fdbba62d48fe6dcd2fcce5b3e5ac028a96417c9)_ — `app-builder-lib`, `electron-builder-squirrel-windows`

  BREAKING: the `squirrelWindows.customSquirrelVendorDir` option has been removed. Supply a custom Squirrel vendor bundle with the `toolsets.squirrel` config (a `ToolsetCustom` object) instead — it goes through the same rcedit/WiX provisioning as the default bundle.
- Fix(nsis): correct the `customInstallMode` macro guard casing in `multiUserUi.nsh`. The guard previously checked `!ifmacrodef customInstallmode` (lowercase `m`) while the documentation and the adjacent `!insertmacro customInstallMode` call use `customInstallMode`; it now checks `customInstallMode`, matching the documented macro name. Applications that define the macro with the documented casing now have it reliably applied on the install-mode page of assisted multi-user installers. Applications that defined the macro under the exact lowercase name `customInstallmode` relied on undocumented behavior — rename the definition in your custom NSIS scripts (e.g. `build/installer.nsh`) to `customInstallMode`. _[`#10161`](https://github.com/electron-userland/electron-builder/pull/10161) [`66eb52c`](https://github.com/electron-userland/electron-builder/commit/66eb52cd85f975c04f6cfe1cfc89c15fd98cd07d)_ — `app-builder-lib`
- Feat(mac)!: stop granting `com.apple.security.cs.allow-unsigned-executable-memory` and `com.apple.security.cs.disable-library-validation` by default; nested binaries now use `@electron/osx-sign`'s Chromium-derived per-file defaults, MAS builds fall back to its sandboxed defaults, ad-hoc builds get a dedicated entitlements file, and a post-sign check warns about foreign-signed binaries in `app.asar.unpacked` _[`#10181`](https://github.com/electron-userland/electron-builder/pull/10181) [`f02576d`](https://github.com/electron-userland/electron-builder/commit/f02576d7759ffa510d1189abc6e9b904e91864db)_ — `app-builder-lib`

### Minor Changes

- Feat(toolsets)!: add `toolsets.wine: "system"` and make it what `"latest"` resolves to _[`#10184`](https://github.com/electron-userland/electron-builder/pull/10184) [`49cb865`](https://github.com/electron-userland/electron-builder/commit/49cb86582f04e914bd1a234299465e01c7ff68a6)_ — `app-builder-lib`

  `"system"` runs Windows tools with the host `wine` on `PATH`, restoring the capability of the `USE_SYSTEM_WINE` env var removed in v27. The host-wine branch already existed but was reachable only on Linux, so macOS had no way to opt out of the downloaded bundle: `ToolsetCustom` requires the directory to contain a prebuilt `wine-home` prefix, which a real Wine installation does not have.

  **Behaviour change:** `"latest"` — the default — now resolves to `"system"` rather than the `"1.0.1"` bundle, so building a Windows target on macOS requires Wine to be installed (`brew install --cask wine-stable`). The published `wine@1.0.1` bundles ship no PE builtins (`lib/wine/<arch>-windows` is deleted at package time), so they cannot execute any Windows binary; `toolsets.wine: "1.0.1"` still resolves and downloads for anyone pinning it explicitly. Linux already defaulted to the host Wine.

  fix(msi): only emit `Icon="…"` on shortcuts and ProgIds when the app has an icon

  The MSI template declares `<Icon Id="…"/>` only when `iconPath` is set, but `MsiTarget` referenced that id unconditionally, so building an MSI for an app without an icon failed in `light.exe` with `LGHT0094: The identifier 'Icon:<Product>Icon.exe' could not be found`.
- Feat: v27 upgrade guardrails: make every breaking change self-announcing _[`#10182`](https://github.com/electron-userland/electron-builder/pull/10182) [`318f6fb`](https://github.com/electron-userland/electron-builder/commit/318f6fb93f9a6f92231320aa876db9e66bd78b6a)_ — `electron-builder`, `app-builder-lib`, `electron-publish`
- Feat(nsis): more flexible custom script includes (#9112) _[`#10161`](https://github.com/electron-userland/electron-builder/pull/10161) [`66eb52c`](https://github.com/electron-userland/electron-builder/commit/66eb52cd85f975c04f6cfe1cfc89c15fd98cd07d)_ — `app-builder-lib`

  - `nsis.include` (and `nsisWeb.include`) now also accepts an array of paths — every entry is resolved relative to the build resources directory first, then the project directory, and all scripts are included in order.
  - The build resources directory is now always registered via `!addincludedir`, so custom scripts can `!include` sibling files by name even when the main include is auto-discovered.
  - The portable target now honors an explicitly set `portable.include` (string or array). It still does **not** auto-discover `build/installer.nsh`, so existing portable builds are unaffected.
  - Both `build/x86-unicode` and `build/x86-ansi` user plugin directories are now registered (each when it exists) instead of only the one matching the `unicode` option, matching the documented behavior.
  - Fixed the `!ifmacrodef customInstallmode` case mismatch in `multiUserUi.nsh` to match the documented `customInstallMode` macro name (NSIS macro-name matching is case-insensitive, so this is a consistency fix).
- Feat(nsis): `differentialPackage: "store-asar"` — store `resources/app.asar` uncompressed (7-Zip `Copy`) in the differential-aware app package so a small app-code change costs a proportionally small differential download instead of re-downloading the entire recompressed asar (measured on a ~32 MB asar: 0.2% instead of 100% for a one-line change). `nsis.differentialPackage` is widened to `boolean | "compressed" | "store-asar"`: `false` disables differential support as before, `"store-asar"` opts into the stored asar, and everything else (`true`, `"compressed"`, unset) keeps today's fully compressed differential package. Backed by a generic `ArchiveOptions.storedPaths` in `archive()`. _[`#10186`](https://github.com/electron-userland/electron-builder/pull/10186) [`c53a27f`](https://github.com/electron-userland/electron-builder/commit/c53a27fdab0a92fd05cb5d095935da90318ba87e)_ — `app-builder-lib`
- Feat(dmg): allow "position" as a dmg.contents type3 _[`#10183`](https://github.com/electron-userland/electron-builder/pull/10183) [`e331645`](https://github.com/electron-userland/electron-builder/commit/e3316455022434d9153dd7f61c6e853068715482)_ — `app-builder-lib`, `dmg-builder`
- Feat(security): signed update manifests (Ed25519) with trust lists and multi-signature manifests _[`#9877`](https://github.com/electron-userland/electron-builder/pull/9877) [`d45536f`](https://github.com/electron-userland/electron-builder/commit/d45536f74e63e5c19dd4a590238521f6315812f5)_ — `electron-builder`, `app-builder-lib`, `builder-util`, `builder-util-runtime`

  Optional Ed25519 signing of auto-update manifests (`latest*.yml`). When signing keys are configured
  (`updateManifest.signingKey`/`signingKeyFile` in config, or `ELECTRON_BUILDER_UPDATE_SIGN_KEY`/`ELECTRON_BUILDER_UPDATE_SIGN_KEY_FILE`
  env vars), each manifest is signed over its integrity-critical fields and the matching public keys are
  embedded into `app-update.yml` (both resolved from the same keys on the platform packager, so signing and
  embedding cannot disagree). electron-updater verifies the signature before downloading and refuses to
  update on tamper/missing-signature (fail-closed). Opt-in: when no public key is configured, verification is
  skipped with a one-time warning. New CLI: `electron-builder create-update-key` (prints the public key and its key id).

  Key rotation without a flag day: an install trusts a **list** of public keys (`updateManifestPublicKey` is a
  string or an array; `updateManifest.publicKey`, `signingKey` and `signingKeyFile` accept arrays, a PEM value may
  hold several concatenated keys, and `ELECTRON_BUILDER_UPDATE_SIGN_KEY_FILE` accepts several paths joined with
  the OS path delimiter), and a manifest may carry **several signatures** (`signatures: [{ keyId, signature }]`,
  one per signing key, next to the legacy `signature` of the first key). A manifest is accepted when any trusted
  key validates any of its signatures, so a release signed with `[old, new]` verifies on installs that trust
  either. `AppUpdater.updateManifestPublicKey` accepts a string or an array. A build-time warning flags an
  explicit `publicKey` list that contains none of the signing keys.

  Gating of the Linux package-manager signature-bypass flags landed separately as
  `AppUpdater.allowUnverifiedLinuxPackages` (#9990).
- Feat(migrate-schema): cover every v27 breaking config change _[`#10241`](https://github.com/electron-userland/electron-builder/pull/10241) [`6ebe0ac`](https://github.com/electron-userland/electron-builder/commit/6ebe0ac5077a5f41adb3a4e87c8f1a958ace16b1)_ — `electron-builder`, `app-builder-lib`

  `electron-builder migrate-schema` (static and JS/TS configs) now also rewrites the v26 shapes it previously left behind, which failed v27 schema validation on the next build:

  - platform-level `mac`/`mas`/`masDev`/`win`/`linux` `asarUnpack` → `<platform>.asar.unpack`, merging the root ASAR options in because a platform-level `asar` replaces the root one in v27; root ASAR keys that have no effect under `asar: false` are removed
  - `toolsets.*: null` entries are removed and the retired `toolsets.appimage: "1.0.2"` pin becomes `"1.0.3"`
  - `nativeRebuilder: "legacy"`, `electronDownload.force`, and v26 `null` ("unset") values on `mac.type` / `provisioningProfile` / `binaries` / `signIgnore` / `singleArchFiles` / `x64ArchFiles` are dropped instead of carried into keys that reject them; a hand-renamed `electronGet` still in the v26 shape is reshaped
  - GitHub publish entries are migrated in every section (e.g. `nsis.publish`), a non-empty `tagNamePrefix` next to `vPrefixedTagName` is kept (it won in v26), and an empty `tagNamePrefix` — ignored by v26 — becomes `"v"` with a warning so existing tag names do not change
  - `win.signAndEditExecutable: false` also maps to `win.sign: false` (it skipped signing in v26), and `win.signtoolOptions` / `win.azureSignOptions` under disabled signing are dropped with a warning instead of producing an invalid config
  - `snap` options the `snapcraft.core24` shape does not support are dropped with a warning

  It warns about `squirrelWindows.customSquirrelVendorDir` (not mechanically migratable) and prints an advisory for `mac`/`mas`/`masDev` configs that rely on the tightened default entitlements. The build-time legacy-config guard now also names `squirrelWindows.customSquirrelVendorDir` and `electronGet.force`, and the `USE_SYSTEM_WINE` removal message points at `toolsets.wine: "system"`.

### Patch Changes

- Fix(mac): retain Electron's `LICENSE.electron.txt` and Chromium's `LICENSES.chromium.html` in the macOS `.app` bundle (`Contents/Resources`) instead of dropping them outside the bundle, matching the license files already shipped on Windows and Linux (#9407) _[`#10174`](https://github.com/electron-userland/electron-builder/pull/10174) [`de70642`](https://github.com/electron-userland/electron-builder/commit/de70642c688044e5dbbe9259b7923e6d83964a22)_ — `app-builder-lib`
- Fix: normalize Snap Store channels _[`#10155`](https://github.com/electron-userland/electron-builder/pull/10155) [`ce9ee68`](https://github.com/electron-userland/electron-builder/commit/ce9ee68da690305e326e22927126327da6644392)_ — `electron-publish`
- Fix: log dynamic import failures _[`#10154`](https://github.com/electron-userland/electron-builder/pull/10154) [`2a964ee`](https://github.com/electron-userland/electron-builder/commit/2a964eea0e43838cb62494357726f538f5cc2993)_ — `app-builder-lib`
- Fix: parse GitHub repo shorthand correctly _[`#10153`](https://github.com/electron-userland/electron-builder/pull/10153) [`f42fbf6`](https://github.com/electron-userland/electron-builder/commit/f42fbf659bf0d3a9fc3a5fa5f269deb3431a5fda)_ — `app-builder-lib`
- Fix: stop oversized in-memory downloads at the configured limit _[`#10123`](https://github.com/electron-userland/electron-builder/pull/10123) [`6ab9a8c`](https://github.com/electron-userland/electron-builder/commit/6ab9a8c5fbed759e0c9e26064208c422c612b200)_ — `builder-util-runtime`
- Fix(pnpm): bundle the transitive dependencies of a `link:`ed package. A located package is now resolved to its real directory before its own dependencies are searched for — in an isolated pnpm store those are siblings inside `.pnpm/<name>@<ver>/node_modules/`, reachable only from the link target — and a package that cannot locate itself by name (a workspace directory such as `packages/builder-util-runtime`) now has its dependencies read straight from that directory instead of contributing none. Previously an app whose `electron-updater` came from a local checkout shipped an asar missing `universalify`, `jsonfile` and `argparse`, and died at startup with `Cannot find module 'universalify'`. Dependencies that cannot be resolved are now reported in the collector log summary rather than skipped silently. _[`#10185`](https://github.com/electron-userland/electron-builder/pull/10185) [`125cde9`](https://github.com/electron-userland/electron-builder/commit/125cde9acaf70f355345519f2a528342a2bd0dff)_ — `app-builder-lib`
- Ensure arch is passed to blockmap path macro expansion _[`#10075`](https://github.com/electron-userland/electron-builder/pull/10075) [`6be2795`](https://github.com/electron-userland/electron-builder/commit/6be279576bf22a6f7521b146f89fd7501839bc94)_ — `app-builder-lib`, `dmg-builder`
- Fix: resolve the pnpm workspace root by walking up for `pnpm-workspace.yaml` instead of running `pnpm --workspace-root exec pwd`. `pwd` is POSIX-only, so on Windows the root silently resolved to `undefined`, `@electron/rebuild` searched only the app directory, and cross-architecture builds (e.g. `--x64 --arm64`) shipped transitive native modules such as `keytar` for the wrong architecture. When a workspace root is located but the package manager cannot be re-detected there, the located root is now kept and a warning is logged instead of dropping it. _[`#10188`](https://github.com/electron-userland/electron-builder/pull/10188) [`99b6c7f`](https://github.com/electron-userland/electron-builder/commit/99b6c7f1efe761bbd3d0582e158a8f1705f652a0)_ — `app-builder-lib`
- Fix: suppress the macOS 26 "Installer would like to access data from other apps" prompt when building `pkg` installers. macOS 26's Installer probes the current-user-home install domain while parsing the deprecated `<domains>` element — even when that domain is disabled — which makes Installer.app request `kTCCServiceSystemPolicyAppData` as soon as the user leaves the Introduction pane. `rootVolumeOnly="true"` is now added to `<options>` when both `allowAnywhere` and `allowCurrentUserHome` are `false`; the install domains reported by `installer -volinfo` / `-dominfo` are unchanged, and `<domains>` is still emitted verbatim. _[`#10193`](https://github.com/electron-userland/electron-builder/pull/10193) [`94814ed`](https://github.com/electron-userland/electron-builder/commit/94814ed3dfdb131fd45160f0b8dc618dd1a501d8)_ — `app-builder-lib`
- Fix: clean up publish SIGINT listeners _[`#10147`](https://github.com/electron-userland/electron-builder/pull/10147) [`28b0c20`](https://github.com/electron-userland/electron-builder/commit/28b0c20f6b61c3519a30f6510d31ac09e5922e6f)_
- Fix: detach DMGs after mount parsing failures _[`#10151`](https://github.com/electron-userland/electron-builder/pull/10151) [`206b2a6`](https://github.com/electron-userland/electron-builder/commit/206b2a66569a593772d0e79d7f6ff7a81e2833a3)_ — `dmg-builder`
- Fix: resolve pnpm dependencies omitted from the `pnpm list --json` output by their declared range. Since pnpm 10.29.3 a repeated subtree is printed once and every later occurrence is a childless entry flagged `deduped: true`; the node-module collector recovered such an entry's dependencies by package name only, so when two versions of one package were installed the nested, version-conflicted copy was wired to the wrong version and its whole closure vanished from the packaged `node_modules` (the #8493 regression, e.g. `es5-ext@0.10.64` with `esniff`, `event-emitter` and `next-tick@1.1.0` dropped while the app pins `es5-ext@0.10.53`). The collector now resolves an omitted dependency against the dependent's declared range from its real store directory and takes the exact `name@version` entry, keeping the name-only match only as a fallback for `link:` dependencies, so version-conflicted transitive dependencies are no longer dropped with pnpm >= 10.29.3, 11 and 12. _[`#10200`](https://github.com/electron-userland/electron-builder/pull/10200) [`83cf98f`](https://github.com/electron-userland/electron-builder/commit/83cf98fb6a63282f284409a6c47bede2a68e16f9)_ — `app-builder-lib`
- Fix: select the ARM64 application package in Windows ARM64 web installers, including ARM64-only and combined x64/ARM64 builds. Keep download and adjacent-package selection consistent. _[`#10196`](https://github.com/electron-userland/electron-builder/pull/10196) [`e68f9ce`](https://github.com/electron-userland/electron-builder/commit/e68f9ce400f6ade26ce871947b045172c0a6bf2e)_ — `app-builder-lib`
- Add internal `afterPackTestHook` packager option (test-only) that skips target builds once the app directory is assembled. _[`#10202`](https://github.com/electron-userland/electron-builder/pull/10202) [`7935fd5`](https://github.com/electron-userland/electron-builder/commit/7935fd536e31705cdd9a923cd36c68122130d614)_ — `app-builder-lib`
- Extract the nsis-web `APP_PACKAGE_URL` define resolution into an internal `configureWebInstallerAppPackageUrl` helper (no behaviour change) so it can be unit-tested without packaging. _[`#10205`](https://github.com/electron-userland/electron-builder/pull/10205) [`77dff15`](https://github.com/electron-userland/electron-builder/commit/77dff159e835124accd647c6fa326f5340f38df6)_ — `app-builder-lib`
- Fix(node-module-collector): report empty package-manager output clearly and fall back to node_modules traversal when a collector throws (#10208) _[`#10210`](https://github.com/electron-userland/electron-builder/pull/10210) [`e87e86e`](https://github.com/electron-userland/electron-builder/commit/e87e86ea650d4368849ff4a918332310bb5c8200)_ — `app-builder-lib`
- Chore(deps): update dependency toml to v4 [security] _[`#10175`](https://github.com/electron-userland/electron-builder/pull/10175) [`7f5014d`](https://github.com/electron-userland/electron-builder/commit/7f5014ddfd89f5eae83b433727cf6fb6addf1e5f)_ — `app-builder-lib`
- Fix: evaluate the node_modules directory filter lazily and only once per directory instead of a synchronous `lstat` per file; await async `onNodeModuleFile` hook results instead of treating the pending Promise as truthy (#10169) _[`#10178`](https://github.com/electron-userland/electron-builder/pull/10178) [`92ef45a`](https://github.com/electron-userland/electron-builder/commit/92ef45a4010dac25ca12e008a446754bca16e2de)_ — `app-builder-lib`
- Fix(snap): stop generating duplicate desktop entries for core24 snaps. Keep the generated `snap/gui` entry and its configured `desktopName`. _[`#10176`](https://github.com/electron-userland/electron-builder/pull/10176) [`5f6c32a`](https://github.com/electron-userland/electron-builder/commit/5f6c32afec92c4c24c74094c84771740d30c7687)_ — `app-builder-lib`
- Fix(flatpak): don't let `linux.files` corrupt the flatpak `files` option. `FlatpakTarget`'s `files` option (`[string, string][]` copy tuples) is merged with the shared `linux.files` option (a `string[]` of glob include/exclude patterns for general app packaging) via `getOptionsForTarget`'s `deepAssign`, which concatenates array properties instead of replacing them — so setting `linux.files` (the common case) silently corrupted the flatpak-specific `files` list. `@malept/flatpak-bundler` then destructured each entry as `[src, dest]`; for a plain glob string this iterates its characters instead, producing a bogus path and crashing the build with `ENOENT: no such file or directory, stat '<project-root>/*'`. The merged list is now filtered down to actual `[string, string]` tuples before being passed to `flatpak-bundler`. _[`#10209`](https://github.com/electron-userland/electron-builder/pull/10209) [`7b0f29b`](https://github.com/electron-userland/electron-builder/commit/7b0f29b07e7a7d193920b7336eb18d5cd1cc7d5b)_ — `app-builder-lib`
- Fix(flatpak): read `flatpak.files` from the flatpak config directly so that a single-string or FileSet `linux.files` no longer throws in FlatpakTarget _[`#10227`](https://github.com/electron-userland/electron-builder/pull/10227) [`8278a19`](https://github.com/electron-userland/electron-builder/commit/8278a1914869c46e4e00a37007143adbb30c818b)_ — `app-builder-lib`
- Fix: restore console logger after `electron/asar` failures _[`#10136`](https://github.com/electron-userland/electron-builder/pull/10136) [`e0ada9d`](https://github.com/electron-userland/electron-builder/commit/e0ada9d69c706cafd34150f70e13687c0676b6e8)_ — `app-builder-lib`
- Perf: deduplicate concurrent module cache lookups _[`#10148`](https://github.com/electron-userland/electron-builder/pull/10148) [`0097e04`](https://github.com/electron-userland/electron-builder/commit/0097e04c190ea45d4fbfbd991b93b0de88f088e4)_ — `app-builder-lib`
- Chore(deps): update form-data to 4.0.6 _[`#9973`](https://github.com/electron-userland/electron-builder/pull/9973) [`b370bdb`](https://github.com/electron-userland/electron-builder/commit/b370bdb621eeb78a25fc6a9aefa3088f1ebe3077)_ — `electron-publish`
- Chore(node-module-collector): remove unused `pnpm config list` hoisted detection from the base collector _[`#10232`](https://github.com/electron-userland/electron-builder/pull/10232) [`d5dcfa8`](https://github.com/electron-userland/electron-builder/commit/d5dcfa8be858a221dba415e8d6fe8c8c2a12e5bf)_ — `app-builder-lib`
- Chore(deps): update resedit to v3 _[`#9967`](https://github.com/electron-userland/electron-builder/pull/9967) [`06e0c23`](https://github.com/electron-userland/electron-builder/commit/06e0c23f0dbfe6ff6a250f6727037e5d5a75541e)_ — `app-builder-lib`
- Fix(pnpm-collector): find nested dependencies under the workspace root when the app is a package in a pnpm hoisted (`nodeLinker: hoisted`) workspace, instead of packaging an out-of-range hoisted copy _[`#10234`](https://github.com/electron-userland/electron-builder/pull/10234) [`a787a5a`](https://github.com/electron-userland/electron-builder/commit/a787a5a5544474c02557394958501b24f8bd4519)_ — `app-builder-lib`

## electron-updater@7.0.0-alpha.8

### Major Changes

- Refactor(updater): `downloadUpdate()` and `UpdateCheckResult.downloadPromise` resolve with a `DownloadExecutorResult` object instead of a positional `Array<string>` _[`#10164`](https://github.com/electron-userland/electron-builder/pull/10164) [`0d47ef5`](https://github.com/electron-userland/electron-builder/commit/0d47ef5c4dda24939e5a6b02927440bdc2da1cd1)_

  BREAKING CHANGE: the promise returned by `AppUpdater.downloadUpdate()` (and `UpdateCheckResult.downloadPromise` when `autoDownload` is enabled) now resolves with `{ updateFile, packageFile? }` instead of `[updateFile]` / `[updateFile, packageFile]`. The array shape depended on element order to tell the installer apart from the optional NSIS web-installer package; the new `DownloadExecutorResult` type (exported from `electron-updater`) names both files. `UpdateDownloadedEvent` additionally gains an optional `packageFile` field for web installers.

  ```ts
  // Before (v6)
  const files = await autoUpdater.downloadUpdate()
  const installer = files[0]
  const webInstallerPackage = files[1] // only for NSIS web installers

  // After (v7)
  const { updateFile, packageFile } = await autoUpdater.downloadUpdate()
  ```

  The same applies to the result of `checkForUpdates()`:

  ```ts
  // Before (v6)
  const result = await autoUpdater.checkForUpdates()
  const [installer] = (await result?.downloadPromise) ?? []

  // After (v7)
  const result = await autoUpdater.checkForUpdates()
  const download = await result?.downloadPromise
  const installer = download?.updateFile
  ```

  The underlying cache-consistency fix from #10098 already produced this object internally; this change stops converting it back to an array at the public API boundary.

### Minor Changes

- Feat(updater): improve PowerShell invocation reliability for Windows code-signature verification _[`#9764`](https://github.com/electron-userland/electron-builder/pull/9764) [`df1bce3`](https://github.com/electron-userland/electron-builder/commit/df1bce3eb032194c970c605286ab9b11655469dd)_
- Feat: v27 upgrade guardrails: make every breaking change self-announcing _[`#10182`](https://github.com/electron-userland/electron-builder/pull/10182) [`318f6fb`](https://github.com/electron-userland/electron-builder/commit/318f6fb93f9a6f92231320aa876db9e66bd78b6a)_
- Feat(security): signed update manifests (Ed25519) with trust lists and multi-signature manifests _[`#9877`](https://github.com/electron-userland/electron-builder/pull/9877) [`d45536f`](https://github.com/electron-userland/electron-builder/commit/d45536f74e63e5c19dd4a590238521f6315812f5)_ — `electron-updater`, `builder-util-runtime`

  Optional Ed25519 signing of auto-update manifests (`latest*.yml`). When signing keys are configured
  (`updateManifest.signingKey`/`signingKeyFile` in config, or `ELECTRON_BUILDER_UPDATE_SIGN_KEY`/`ELECTRON_BUILDER_UPDATE_SIGN_KEY_FILE`
  env vars), each manifest is signed over its integrity-critical fields and the matching public keys are
  embedded into `app-update.yml` (both resolved from the same keys on the platform packager, so signing and
  embedding cannot disagree). electron-updater verifies the signature before downloading and refuses to
  update on tamper/missing-signature (fail-closed). Opt-in: when no public key is configured, verification is
  skipped with a one-time warning. New CLI: `electron-builder create-update-key` (prints the public key and its key id).

  Key rotation without a flag day: an install trusts a **list** of public keys (`updateManifestPublicKey` is a
  string or an array; `updateManifest.publicKey`, `signingKey` and `signingKeyFile` accept arrays, a PEM value may
  hold several concatenated keys, and `ELECTRON_BUILDER_UPDATE_SIGN_KEY_FILE` accepts several paths joined with
  the OS path delimiter), and a manifest may carry **several signatures** (`signatures: [{ keyId, signature }]`,
  one per signing key, next to the legacy `signature` of the first key). A manifest is accepted when any trusted
  key validates any of its signatures, so a release signed with `[old, new]` verifies on installs that trust
  either. `AppUpdater.updateManifestPublicKey` accepts a string or an array. A build-time warning flags an
  explicit `publicKey` list that contains none of the signing keys.

  Gating of the Linux package-manager signature-bypass flags landed separately as
  `AppUpdater.allowUnverifiedLinuxPackages` (#9990).

### Patch Changes

- Fix: strip `PSModulePath` from the PowerShell child environment case-insensitively during Windows code-signature verification. Windows environment variable names are case-insensitive but JS object keys are not, so a differently-cased key (e.g. `PSMODULEPATH`) could previously survive into the spawned PowerShell process. _[`#10159`](https://github.com/electron-userland/electron-builder/pull/10159) [`61bd5f6`](https://github.com/electron-userland/electron-builder/commit/61bd5f6044ff8c09f44d443b956a96e0aba105b2)_
- Fix: keep the cached blockmap consistent with the cached installer. A download round that did not produce a new blockmap (e.g. the differential download was skipped because the cached installer was evicted) now removes the cached `current.blockmap` instead of leaving a stale one next to the freshly cached file, which poisoned the next differential download and surfaced as a generic sha512 checksum mismatch before falling back to a full download (#10097). Leftover pending blockmaps from previous update rounds are also cleared before a fresh download. sha512-mismatch logging now distinguishes a differential download that failed against stale/corrupt cached inputs (including whether the old blockmap came from the local cache or the server) from a genuine checksum failure of a fully downloaded file. _[`#10098`](https://github.com/electron-userland/electron-builder/pull/10098) [`9306160`](https://github.com/electron-userland/electron-builder/commit/93061602d9ee89d824834cef0b06c75353fa6a4a)_
- Fix: stop oversized in-memory downloads at the configured limit _[`#10123`](https://github.com/electron-userland/electron-builder/pull/10123) [`6ab9a8c`](https://github.com/electron-userland/electron-builder/commit/6ab9a8c5fbed759e0c9e26064208c422c612b200)_ — `builder-util-runtime`
- Fix: preserve fractional staged rollout percentages _[`#10114`](https://github.com/electron-userland/electron-builder/pull/10114) [`23bccfb`](https://github.com/electron-userland/electron-builder/commit/23bccfb6accd2eb082633d592d15486e81c89374)_
- Fix: make multi-range differential downloads work on real servers. Three independent defects made `downloadUpdate` fall back to a full download with `Response ends without calling any handlers`: _[`#10192`](https://github.com/electron-userland/electron-builder/pull/10192) [`8e22767`](https://github.com/electron-userland/electron-builder/commit/8e227679fe34befde8fa31f6b811b86c79f010d5)_

  - `DataSplitter` only recognised CRLF. Some CDNs answer `multipart/byteranges` with bare LF line endings, so no part was ever split and the whole response accumulated in memory. Header lists now end at whichever of `\r\n\r\n` / `\n\n` comes first, and the `<EOL>--boundary` separator size follows the line ending the server actually uses.
  - A header-list terminator split across two chunks was never found: only the new chunk was searched, the buffered bytes never were, so the parser locked onto the next part's header instead. Only the last few bytes of an unfinished header list are now carried over and searched together with the next chunk, instead of accumulating the whole list.
  - The 10s watchdog armed when a batch response ends was never disarmed after that batch succeeded. With more than 1000 operations (several range requests) it failed the whole download whenever a later batch took longer than the grace period.



# [27.0.0-alpha.8](https://github.com/electron-userland/electron-builder/compare/electron-builder@27.0.0-alpha.7...electron-builder@27.0.0-alpha.8) (2026-09-01)

## electron-builder@27.0.0-alpha.8

### Major Changes

- Fix(app-builder-lib): expand lower channels when the channel name has a suffix _[`#9998`](https://github.com/electron-userland/electron-builder/pull/9998) [`e2077cd`](https://github.com/electron-userland/electron-builder/commit/e2077cd8f7b0fb143ecd6c9574460a92a001ae46)_ — `app-builder-lib`

  With `generateUpdatesFilesForAllChannels` enabled, the extra `alpha`/`beta` update files were only written when the channel was exactly `alpha`, `beta`, or `latest`. A per-arch feed configured as `channel: "${channel}-${arch}"` resolves to something like `beta-arm64`, which hit the default branch, so `alpha-arm64.yml` was never written and arm64 pre-release users stopped getting promoted. The base channel is now read off the front of the name and the suffix is reattached to the expanded channels, so `beta-arm64` yields `beta-arm64` and `alpha-arm64`, and `latest-arm64` yields all three.

  Breaking: a suffixed `beta-*`/`latest-*` channel now publishes 2–3 update files instead of 1, so a `latest-x64` publish overwrites `beta-x64.yml`/`alpha-x64.yml` in the same bucket. Turn off `generateUpdatesFilesForAllChannels` if you relied on suffixed channels staying single-file.
- Fix(linux): remove `http-parser` from the default pacman `depends` list. The package no longer exists in the official Arch Linux repositories (it is AUR-only since Node.js switched to llhttp), so packages built with the default configuration failed to install on stock Arch Linux and Manjaro with an unresolvable dependency — while `ldd` shows Electron apps have no runtime dependency on it (#9429). Every remaining entry in the default pacman list was verified to still resolve from the official Arch repositories (`libappindicator-gtk3` resolves via the `provides` of the official `libappindicator` package in `extra`), so no other entry was removed. _[`#10109`](https://github.com/electron-userland/electron-builder/pull/10109) [`64c2398`](https://github.com/electron-userland/electron-builder/commit/64c2398b4e749b0695e3efe4071c2b884bff4ba4)_ — `app-builder-lib`

  feat(linux): support the `"default"` keyword in `depends` for the fpm targets (`deb`, `rpm`, `pacman`), mirroring the snap target's `plugs`/`stagePackages`/`buildPackages` convention. `"default"` expands in place to the target's default depends list, so extras can be appended without repeating the defaults — e.g. `["default", "http-parser"]` restores `http-parser` on top of the defaults. The final list is deduplicated.

### Minor Changes

- Fix: return a descriptive result instead of a bare boolean from the signing chain, unified across the platform packagers as a single exported type. `SigningResult` (`"signed" | "signed:custom" | "skipped:no-certificate" | "skipped:filtered" | "skipped:disabled" | "skipped:unsupported"`, failures are still thrown) is now what `PlatformPackager.signApp` and the Windows/macOS signing paths report; sign managers' single sign attempts resolve to the `SignFileResult` subset (`"signed" | "signed:custom" | "skipped:no-certificate"`), and `WinPackager.signIf` extends it with `"skipped:filtered"` (excluded via `signExts`) and `"skipped:disabled"` (`sign: false`/`sign: null`), so callers and logs can distinguish why a file was not signed. The `isSignResultSigned` type guard tells the signed variants apart from the skips. Follow-up to #10082: _[`#10104`](https://github.com/electron-userland/electron-builder/pull/10104) [`5ce1625`](https://github.com/electron-userland/electron-builder/commit/5ce1625642794f1f7bf8cf9fe51dc73fc39451ad)_ — `app-builder-lib`

  - The unconditional `Signing <file>...` log line is removed — the sign managers already log `signing` with certificate details right before executing, so unsigned builds no longer look like they are signing.
  - The skip message now states the actual reason at info level (`signing skipped reason=no code signing certificate configured`) instead of a debug-level "no signing configuration found".
  - A file signed by a custom `win.sign` hook is now logged as ``signed with custom `sign` hook`` instead of being misattributed to `signtool.exe`.
  - `MacPackager.sign` reports the same type explicitly instead of a bare true/false (`"skipped:unsupported"` on non-mac hosts and pull-request CI guard, `"skipped:disabled"` for `sign`/`identity: null`, `"skipped:no-certificate"` when no identity is found, `"signed:custom"` for a custom `mac.sign` hook), and `MacTargetHelper.handleNullIdentity` returns `"skipped:disabled"` instead of `false`.
  - **Behavior change**: `WinPackager.signApp` and `MacPackager.signApp` previously discarded the per-file results and returned `true` unconditionally, so the `afterSign` hook fired even for fully unsigned builds. `signApp` now reports the combined real result (a signed result wins) — for unsigned builds, `afterSign` is skipped and the standard `skipping "afterSign" hook as no signing occurred, perhaps you intended "afterPack"?` warning is logged, matching the documented gating in `doSignAfterPack` and the mas/mas-dev behavior (#10071). Builds that relied on `afterSign` firing without any signing should move that logic to `afterPack`.

### Patch Changes

- Fix NSIS installer hang when the user's PowerShell profile contains interactive commands: run powershell.exe with -NoProfile -NonInteractive in allowOnlyOneInstallerInstance checks _[`#10051`](https://github.com/electron-userland/electron-builder/pull/10051) [`4070ce7`](https://github.com/electron-userland/electron-builder/commit/4070ce731159ede8239b8129fa9f177e2193b1ad)_ — `app-builder-lib`
- Fix(nsis): detect and close app instances running from the previous per-user/per-machine install location, not only the new `$INSTDIR`, so a `perMachine` install over a running per-user installation no longer fails. The path match now also requires a trailing backslash so sibling directories with the same prefix are no longer matched, and a failure to uninstall the previous version now reports the real uninstaller error instead of the misleading "cannot be closed" dialog. _[`#10024`](https://github.com/electron-userland/electron-builder/pull/10024) [`8e95ad0`](https://github.com/electron-userland/electron-builder/commit/8e95ad0e00c866c8389ae295ac802ebd9954d2ca)_ — `app-builder-lib`
- Fix: emit `afterSign` hook for `mas`/`mas-dev` builds again. The MAS flow packs with `sign: false` and codesigns separately, which skipped the only `emitAfterSign` call site — the hook now fires after codesigning and before the installer `.pkg` is created, and the standard "skipping afterSign" warning is logged when signing does not occur (#9997) _[`#10071`](https://github.com/electron-userland/electron-builder/pull/10071) [`1d7b489`](https://github.com/electron-userland/electron-builder/commit/1d7b4890f32fef6e02215ae5137626a84d8259d9)_ — `app-builder-lib`
- Fix(mac): bump linux-tools-mac toolset to 1.0.1, rebuilt on macOS 15 runners so its gtar/lzip/ar binaries run on macOS 15+ instead of requiring macOS 26; also download custom `toolsets.*.url` bundles from the configured URL as-is instead of appending the filename again (fixes #10084) _[`#10100`](https://github.com/electron-userland/electron-builder/pull/10100) [`f7e400b`](https://github.com/electron-userland/electron-builder/commit/f7e400ba6766165cce896b53fc55142bb48597d8)_ — `app-builder-lib`
- Only log a file as 'signed' when signing actually succeeded _[`#10082`](https://github.com/electron-userland/electron-builder/pull/10082) [`4f84c6e`](https://github.com/electron-userland/electron-builder/commit/4f84c6e972e443d155cf80bbc849443060f120be)_ — `app-builder-lib`
- Fix(nsis): a silent auto-update no longer hangs forever on an invisible dialog when the old version's uninstall fails. The uninstall-failure `MessageBox` (and the other silent-mode-reachable `MessageBox`es in the NSIS templates) now carry a `/SD IDOK` silent default, so in silent installs the dialog auto-selects OK and the installer exits with its failure exit code instead of blocking on a dialog nobody can see. _[`#10034`](https://github.com/electron-userland/electron-builder/pull/10034) [`4b455f7`](https://github.com/electron-userland/electron-builder/commit/4b455f7577c5a7112c7c00bfcb9cb26e3259a87f)_ — `app-builder-lib`
- Added slnx to default file exclusions _[`#9969`](https://github.com/electron-userland/electron-builder/pull/9969) [`4273546`](https://github.com/electron-userland/electron-builder/commit/427354611fe82b3106d0645a1e25e2de95330fdc)_ — `app-builder-lib`
- Fix: actually retry transient Electron/toolset download failures. The download retry predicate only matched builder-util-runtime's `HttpError` and errors with a top-level `code`, but `@electron/get` v5 throws its own `HTTPError` (fetch `Response` on `.response`, no `.code`) and undici wraps socket errors in `TypeError: fetch failed` with the code on `error.cause.code` — so GitHub 503s and connection resets failed immediately with zero retries. Downloads now retry with backoff on HTTP 5xx/429 and on transient network codes (ECONNRESET, ETIMEDOUT, ECONNREFUSED, EAI_AGAIN, EPIPE, UND_ERR_SOCKET, UND_ERR_CONNECT_TIMEOUT) _[`#10105`](https://github.com/electron-userland/electron-builder/pull/10105) [`c5c4ea1`](https://github.com/electron-userland/electron-builder/commit/c5c4ea138cfe5e17f7d80c0ba1a26bb99799861d)_ — `app-builder-lib`
- Fix(mac): pass the temporary keychain's own password to `security set-key-partition-list -k` instead of the certificate's import password. The import password is only valid for `security import -P`; `set-key-partition-list` authenticates against the keychain itself, so on macOS versions that verify the password, `CSC_LINK`-based signing failed with `SecKeychainUnlock: The user name or passphrase you entered is not correct` (see #10066). _[`#10101`](https://github.com/electron-userland/electron-builder/pull/10101) [`7abb30e`](https://github.com/electron-userland/electron-builder/commit/7abb30e393326676237862163a115c96e2f0e80d)_ — `app-builder-lib`
- Fix: update the 7-Zip toolset to `7zip@1.0.1`, which ships correct per-arch Windows binaries. `7zip@1.0.0` bundled the 32-bit `7za.exe` for every Windows arch, capping 7-Zip's memory at 1.75 GiB and breaking LZMA2 multithreading on win-x64/win-arm64 hosts (electron-userland/electron-builder-binaries#222). Checksums for all platform bundles are updated to the new release assets. _[`#10103`](https://github.com/electron-userland/electron-builder/pull/10103) [`44a10d4`](https://github.com/electron-userland/electron-builder/commit/44a10d43c486fbde12c5a19b04a2ce65e017c628)_ — `app-builder-lib`
- Fix: preserve Yarn Berry registry credentials _[`#10079`](https://github.com/electron-userland/electron-builder/pull/10079) [`16559d4`](https://github.com/electron-userland/electron-builder/commit/16559d4f214b184b6edd0812db97e41ecb79ab42)_ — `app-builder-lib`
- Docs: fix broken electron.build documentation links in readmes, TSDoc comments, and error messages — point auto-update, code-signing, and multi-platform-build references at their new `/docs/features/` locations, repair the `electron.build./` domain typo, and replace anchors that no longer exist (#10107) _[`#10111`](https://github.com/electron-userland/electron-builder/pull/10111) [`cf39086`](https://github.com/electron-userland/electron-builder/commit/cf39086fbb71e34d1fef0359a026697153e6ee3b)_ — `electron-builder`, `app-builder-lib`, `builder-util-runtime`, `electron-forge-maker-appimage`, `electron-forge-maker-nsis`, `electron-forge-maker-nsis-web`, `electron-forge-maker-snap`
- Chore(deps): update dotenv and dotenv-expand _[`#9968`](https://github.com/electron-userland/electron-builder/pull/9968) [`038ea9f`](https://github.com/electron-userland/electron-builder/commit/038ea9f82c1b1967f742b012269d58c8b3cdfaf5)_ — `app-builder-lib`
- Fix: report the repository detected for `app-update.yml` at build time _[`#10081`](https://github.com/electron-userland/electron-builder/pull/10081) [`f2cfd5f`](https://github.com/electron-userland/electron-builder/commit/f2cfd5f3c147410495030e66f22dc1b336a5faec)_ — `app-builder-lib`

  When a GitHub or Bitbucket publish configuration omits `owner`/`repo`, electron-builder fills them in from the repository info (`package.json` `repository`, CI env vars, then `.git/config`) and writes the result into `app-update.yml` inside the packaged app, where it becomes the update feed for every installed copy. Until now nothing in the build output said which repository had been chosen - not even at `DEBUG=electron-builder`, which logged the pre-resolution `owner=undefined project=undefined`.

  The build now logs the resolved `provider`/`owner`/`repo` (or `slug` for Bitbucket) once per build, together with the `source` the repository was detected from. A repository taken from the `package.json` `repository` field is deliberate configuration and is reported at info level; one picked up from CI environment variables or `.git/config` is reported at warn level. Nothing about what gets written to `app-update.yml` changes, and builds that already specify `owner`/`repo` explicitly are unaffected.

## electron-updater@7.0.0-alpha.7

### Patch Changes

- Docs: fix broken electron.build documentation links in readmes, TSDoc comments, and error messages — point auto-update, code-signing, and multi-platform-build references at their new `/docs/features/` locations, repair the `electron.build./` domain typo, and replace anchors that no longer exist (#10107) _[`#10111`](https://github.com/electron-userland/electron-builder/pull/10111) [`cf39086`](https://github.com/electron-userland/electron-builder/commit/cf39086fbb71e34d1fef0359a026697153e6ee3b)_ — `electron-updater`, `builder-util-runtime`



# [27.0.0-alpha.7](https://github.com/electron-userland/electron-builder/compare/electron-builder@27.0.0-alpha.6...electron-builder@27.0.0-alpha.7) (2026-08-17)

## electron-builder@27.0.0-alpha.7

### Major Changes

- Feat: fail builds on missing production dependencies by default. When node-module collection completes and a production dependency could not be resolved (`cannot find path for dependency` / `dependency not found on disk`), the build now fails with an error listing the complete set of missing dependencies, instead of logging warnings and producing a package that breaks at runtime with `MODULE_NOT_FOUND`. Configure via the new `allowMissingDependencies?: boolean | string[] | null` option: `true` restores the previous warn-only behavior, a `string[]` allows only the listed dependency names to be missing (bare package name, or exact `name@version`), and `false`/`null`/omitted (the default) fails on any missing production dependency. Missing optional dependencies (declared in `optionalDependencies`, e.g. `fsevents` on Linux/Windows, or platform-specific packages) are always allowed and never fail the build. Migration: builds that previously "succeeded" while logging `dependency not found on disk` / `cannot find path for dependency` warnings will now fail — fix the underlying installation issue, list the affected dependency names in `allowMissingDependencies`, or set `allowMissingDependencies: true` to keep the old behavior. _[`#10073`](https://github.com/electron-userland/electron-builder/pull/10073) [`2158350`](https://github.com/electron-userland/electron-builder/commit/21583509ffdbb4a3225b7b3a40c275855d15beba)_ — `app-builder-lib`

### Minor Changes

- Feat: warn on silently skipped update signature verification and validate `publisherName` against the signing certificate at build time _[`#10056`](https://github.com/electron-userland/electron-builder/pull/10056) [`331afdd`](https://github.com/electron-userland/electron-builder/commit/331afdd30bd59aa0185f7df31b5712e62a5acfbf)_ — `app-builder-lib`

  Two guards around Windows update signature verification:

  - **electron-updater**: when `app-update.yml` exists but contains no `publisherName`, the updater used to skip signature verification (including custom `verifyUpdateCodeSignature` hooks) completely silently. It now logs a warning explaining that verification was skipped, how to fix it (sign the build so `publisherName` is derived automatically, or set `win.publisherName` explicitly), and that this fail-open behavior is deprecated: electron-builder v28 will treat a missing `publisherName` as a verification failure (fail-closed). The no-`app-update.yml` path (unpackaged/dev mode) stays silent.
  - **app-builder-lib**: when `publisherName` is explicitly configured and the subject of the local code signing certificate is known, the build now fails with a clear error if none of the configured names match the certificate (same DN-subset/CN matching semantics as the updater's verifier; any one of multiple configured names matching passes, so certificate-rotation setups keep working). This catches signing with the wrong certificate at build time instead of at update time. The check is skipped whenever the actual signing certificate's subject is not genuinely known (custom `sign` hooks, Azure Trusted Signing, PKCS#11 without an extractable certificate, x509 files without a CN), and `publisherName: null` remains a pure opt-out.
- Feat: validate `to` destinations in `extraFiles`/`extraResources` file sets. An absolute `to` path (POSIX, Windows drive-letter, or UNC) or a relative `to` that escapes the build output directory now fails the build with a clear `InvalidConfigurationError` instead of silently copying files outside the package onto the build machine. Relative hops that stay inside the build output directory (e.g. `to: "../Frameworks"` from `Contents/Resources` on macOS) keep working. The error suggests the fpm file-mapping syntax (`"deb": { "fpm": ["src=/abs/dest"] }`) for users who want absolute in-package paths on deb/rpm. _[`#10062`](https://github.com/electron-userland/electron-builder/pull/10062) [`c0b8235`](https://github.com/electron-userland/electron-builder/commit/c0b8235d7f86d90ffe7218765115b6948b180739)_ — `app-builder-lib`
- Feat: restore `mac.sign.type` (removed in #9889 without a working replacement). An explicit `sign.type` now selects development certificates (`Mac Developer` / `Apple Development`) and embeds matching development provisioning profiles on any mac build flavor; the default is still derived from the target (`mas-dev` → `development`, otherwise `distribution`). A `mas` build with `sign.type: "development"` also skips the MAS `.pkg` installer, matching v26 behavior. Docs and the `migrate-schema` `type` → `sign.type` move now match the implementation. _[`#10065`](https://github.com/electron-userland/electron-builder/pull/10065) [`0011184`](https://github.com/electron-userland/electron-builder/commit/0011184b69300a2e69fa322139e0343796620c57)_ — `app-builder-lib`

### Patch Changes

- Security hardening and a migrate-schema fix: _[`#10036`](https://github.com/electron-userland/electron-builder/pull/10036) [`b87a0b7`](https://github.com/electron-userland/electron-builder/commit/b87a0b7a533eef1711e600864f2540dc163176d7)_ — `electron-builder`, `app-builder-lib`, `builder-util`, `builder-util-runtime`

  - `builder-util` `removePassword`: redact single-letter/URI secret flags (`security … -k <password>`, `osslsigncode -key <pkcs11-uri?pin-value=…>`) and whitespace-containing secrets in debug logs, and make the `/b … /c` block-redaction regex ReDoS-safe.
  - `builder-util-runtime` `httpExecutor`: fix the non-functional `maxRedirects` guard (the redirect counter was never advanced), so a redirect loop from a malicious feed/mirror no longer hangs the updater.
  - `electron-updater` `GitLabProvider`: only forward the GitLab token to the channel-file request when its URL is same-origin as the API host, so an off-host/`http://` `direct_asset_url` in the release JSON cannot exfiltrate the token.
  - `app-builder-lib`: defense-in-depth hardening — validate `executableName` before interpolating it into the generated Flatpak launcher, contain custom-toolset extraction within the cache dir, and XML-escape MSI file-association `ext`/`description`.
  - `electron-builder` `migrate-schema`: auto-remove the removed `linux.syncDesktopName` flag.
- Feat: support fully offline (air-gapped) Electron downloads by picking up a locally seeded `SHASUMS256.txt-<version>` at the Electron cache root and passing it to `@electron/get` as inline checksums, suppressing the mandatory network fetch of `SHASUMS256.txt` that failed air-gapped builds even with a fully seeded cache (#10039) _[`#10046`](https://github.com/electron-userland/electron-builder/pull/10046) [`362a01f`](https://github.com/electron-userland/electron-builder/commit/362a01f802d4c89d4a586c1704ecd81325f7b2de)_ — `app-builder-lib`
- Fix: don't mutate shared UpdateInfo.files when applying GitHub safeArtifactName, which leaked the GitHub-safe file name into other publish providers' update metadata _[`#10013`](https://github.com/electron-userland/electron-builder/pull/10013) [`951e177`](https://github.com/electron-userland/electron-builder/commit/951e17796d98a72d0058bf629d1ca492f06e50c5)_ — `app-builder-lib`
- Fix: allow parentheses in AppImage executable, product, and license file names. Before, product names like `Zoo Design Studio (Staging)` failed AppImage builds with "productFilename contains characters that cannot be safely used in file paths" — a regression from the Go pipeline, which accepted them. After, names containing `(` and `)` build again; parentheses are legal in Linux filenames and inert inside the double-quoted bash strings of the generated AppRun launcher, while genuinely dangerous characters (`$`, backticks, quotes, slashes) remain rejected. _[`#10050`](https://github.com/electron-userland/electron-builder/pull/10050) [`f39edbb`](https://github.com/electron-userland/electron-builder/commit/f39edbbea6b349b51d3569da15377bac8e60fbfd)_ — `app-builder-lib`
- Fix: validate the resolved installed electron-updater version instead of the declared specifier, fixing false "At least electron-updater 4.0.0" errors for pnpm `catalog:`/`workspace:` specifiers _[`#10019`](https://github.com/electron-userland/electron-builder/pull/10019) [`0fdb4cb`](https://github.com/electron-userland/electron-builder/commit/0fdb4cb4fd08a2adb7a64dce2a0c347b235e8192)_ — `app-builder-lib`
- Fix: prevent infinite recursion in node module collection when a package depends on itself (e.g. `libsql@0.3.19` via `@prisma/adapter-libsql` -> `@libsql/client`), which caused npm-based builds to hang at `searching for node modules` and eventually crash with a JavaScript heap out-of-memory error (#10068) _[`#10070`](https://github.com/electron-userland/electron-builder/pull/10070) [`075efcf`](https://github.com/electron-userland/electron-builder/commit/075efcf2725a733aa25bb115801dee62e85a5594)_ — `app-builder-lib`
- Fix: don't bundle workspace node_modules when the app has no production dependencies _[`#10035`](https://github.com/electron-userland/electron-builder/pull/10035) [`f5babad`](https://github.com/electron-userland/electron-builder/commit/f5babad91b1dea5370aa7a28b727b31e6172b6a1)_ — `app-builder-lib`

  Before: packaging an app that declares zero production dependencies (e.g. everything is bundled by a JS bundler) from inside a monorepo skipped the app's own empty `node_modules`, climbed to the workspace root, and copied the entire hoisted workspace `node_modules` into `app.asar`.

  After: an app with no production dependencies (neither in its `package.json` nor added via `extraMetadata`) bundles no `node_modules` at all — the collection step is skipped with an informational log message.
- Fix: classify missing declared-optional dependencies (e.g. `fsevents` on Linux/Windows) as missing optional dependencies in the pnpm collector, instead of warning `dependency not found on disk` _[`#10073`](https://github.com/electron-userland/electron-builder/pull/10073) [`2158350`](https://github.com/electron-userland/electron-builder/commit/21583509ffdbb4a3225b7b3a40c275855d15beba)_ — `app-builder-lib`
- Fix: classic-confinement core24 snaps no longer get default plugs or a generated layout, which the snap store review rejects _[`#10060`](https://github.com/electron-userland/electron-builder/pull/10060) [`e37cb17`](https://github.com/electron-userland/electron-builder/commit/e37cb170efe643ddd5a7e28e1a7fcb3271300e97)_ — `app-builder-lib`
- Fix(mac): bump icons toolset to 1.2.3 so small ICNS sizes are written as ic04/ic05 ARGB instead of PNG-in-icp4/icp5/icp6, which macOS renders as noise at 16/32px (fixes corrupted Finder/DMG icons) _[`#10087`](https://github.com/electron-userland/electron-builder/pull/10087) [`c8d24ae`](https://github.com/electron-userland/electron-builder/commit/c8d24aea5e4c03c073a076ec6a1e22ac5b892802)_ — `app-builder-lib`
- Fix: multithread the deb payload compression. fpm's deb path pipes GNU `tar -J` exporting only `XZ_OPT=-<level>`, so `data.tar` compressed single-threaded while rpm already defaults to multithreaded `xzmt` (measured on the same 6.4 GiB tree in one run: deb 1,059 s vs rpm 171 s). Export `XZ_DEFAULTS=-T0` for the deb fpm invocation (xz parses it before `XZ_OPT`, keeping the compression level unchanged; an operator-provided `XZ_DEFAULTS` wins). _[`#10049`](https://github.com/electron-userland/electron-builder/pull/10049) [`b276f7a`](https://github.com/electron-userland/electron-builder/commit/b276f7a859b32721b0c9950484bbef8597bad8f7)_ — `app-builder-lib`

## electron-updater@7.0.0-alpha.6

### Minor Changes

- Feat: warn on silently skipped update signature verification and validate `publisherName` against the signing certificate at build time _[`#10056`](https://github.com/electron-userland/electron-builder/pull/10056) [`331afdd`](https://github.com/electron-userland/electron-builder/commit/331afdd30bd59aa0185f7df31b5712e62a5acfbf)_

  Two guards around Windows update signature verification:

  - **electron-updater**: when `app-update.yml` exists but contains no `publisherName`, the updater used to skip signature verification (including custom `verifyUpdateCodeSignature` hooks) completely silently. It now logs a warning explaining that verification was skipped, how to fix it (sign the build so `publisherName` is derived automatically, or set `win.publisherName` explicitly), and that this fail-open behavior is deprecated: electron-builder v28 will treat a missing `publisherName` as a verification failure (fail-closed). The no-`app-update.yml` path (unpackaged/dev mode) stays silent.
  - **app-builder-lib**: when `publisherName` is explicitly configured and the subject of the local code signing certificate is known, the build now fails with a clear error if none of the configured names match the certificate (same DN-subset/CN matching semantics as the updater's verifier; any one of multiple configured names matching passes, so certificate-rotation setups keep working). This catches signing with the wrong certificate at build time instead of at update time. The check is skipped whenever the actual signing certificate's subject is not genuinely known (custom `sign` hooks, Azure Trusted Signing, PKCS#11 without an extractable certificate, x509 files without a CN), and `publisherName: null` remains a pure opt-out.

### Patch Changes

- Security hardening and a migrate-schema fix: _[`#10036`](https://github.com/electron-userland/electron-builder/pull/10036) [`b87a0b7`](https://github.com/electron-userland/electron-builder/commit/b87a0b7a533eef1711e600864f2540dc163176d7)_ — `electron-updater`, `builder-util-runtime`

  - `builder-util` `removePassword`: redact single-letter/URI secret flags (`security … -k <password>`, `osslsigncode -key <pkcs11-uri?pin-value=…>`) and whitespace-containing secrets in debug logs, and make the `/b … /c` block-redaction regex ReDoS-safe.
  - `builder-util-runtime` `httpExecutor`: fix the non-functional `maxRedirects` guard (the redirect counter was never advanced), so a redirect loop from a malicious feed/mirror no longer hangs the updater.
  - `electron-updater` `GitLabProvider`: only forward the GitLab token to the channel-file request when its URL is same-origin as the API host, so an off-host/`http://` `direct_asset_url` in the release JSON cannot exfiltrate the token.
  - `app-builder-lib`: defense-in-depth hardening — validate `executableName` before interpolating it into the generated Flatpak launcher, contain custom-toolset extraction within the cache dir, and XML-escape MSI file-association `ext`/`description`.
  - `electron-builder` `migrate-schema`: auto-remove the removed `linux.syncDesktopName` flag.
- Fix: expose `./package.json` in the `exports` map so tooling (including electron-builder's installed-version check) can resolve the installed version via `require.resolve("electron-updater/package.json")` _[`#10019`](https://github.com/electron-userland/electron-builder/pull/10019) [`0fdb4cb`](https://github.com/electron-userland/electron-builder/commit/0fdb4cb4fd08a2adb7a64dce2a0c347b235e8192)_



# [27.0.0-alpha.6](https://github.com/electron-userland/electron-builder/compare/electron-builder@27.0.0-alpha.5...electron-builder@27.0.0-alpha.6) (2026-07-23)

## electron-builder@27.0.0-alpha.6

### Major Changes

- Fix(mac): keep `CFBundleName` and helper app bundle names consistent so Electron resolves helper apps on modern macOS _[`#9962`](https://github.com/electron-userland/electron-builder/pull/9962) [`e5db1a0`](https://github.com/electron-userland/electron-builder/commit/e5db1a0ba2674a1c5dc81fad9aeb107d57a245b1)_ — `app-builder-lib`

  - macOS product and executable names are no longer normalized to NFD. The `.app` bundle, the helper bundles, and `CFBundleName` now all use the product name exactly as configured, which is required for Electron's helper-app lookup (`${CFBundleName} Helper.app`).
  - macOS builds now require `productName` and `executableName` to be usable as a bundle name without any filename sanitization. A name that would otherwise be silently altered (for example one containing `/`, `\`, `:`, `*`, control characters, or trailing dots/spaces) now fails with a clear configuration error so you can choose a valid name.
- Feat(dmg): default DMG `filesystem` to APFS _[`#9978`](https://github.com/electron-userland/electron-builder/pull/9978) [`c5806fe`](https://github.com/electron-userland/electron-builder/commit/c5806fee5f4f2c4be66b50cbfaac4e6da4153db6)_ — `app-builder-lib`, `dmg-builder`

  BREAKING CHANGE: The default DMG volume filesystem changed from `HFS+` to `APFS`. APFS is the modern macOS filesystem and produces smaller, faster-to-mount images on current macOS. If you must support pre-10.13 (High Sierra) macOS, which cannot mount APFS volumes, set `dmg.filesystem: "HFS+"` explicitly.
- Feat: build-time packages (`electron`, `electron-builder`) listed in `dependencies` are now excluded from the packaged app (logged once) instead of failing the build, configurable via the new `ignoredProductionDependencies` option. BREAKING: removed the `ALLOW_ELECTRON_BUILDER_AS_PRODUCTION_DEPENDENCY` env var — `electron-builder` is excluded by default; drop a name from `ignoredProductionDependencies` to bundle it. _[`#9994`](https://github.com/electron-userland/electron-builder/pull/9994) [`0721e95`](https://github.com/electron-userland/electron-builder/commit/0721e95e844a8b09179ffc3cbdfd905e1f301f9e)_ — `electron-builder`, `app-builder-lib`
- Feat(updater): gate legacy top-level manifest `path`/`sha512` behind `electronUpdaterCompatibility` _[`#9992`](https://github.com/electron-userland/electron-builder/pull/9992) [`2c10f1f`](https://github.com/electron-userland/electron-builder/commit/2c10f1fe9c409379208aa5c0a5bc102689fb5cb6)_ — `app-builder-lib`, `builder-util-runtime`

  BREAKING CHANGE: The legacy top-level `UpdateInfo.path` / `UpdateInfo.sha512` fields are now written to `latest*.yml` only when the declared `electronUpdaterCompatibility` semver range intersects electron-updater versions `<2.16.0` (previously they were written unconditionally), mirroring how the Windows `sha2` field is gated; the legacy `latest-mac.json` is likewise emitted only when the range intersects `<2.0.0`. The default `electronUpdaterCompatibility` is now `>=2.16` (previously `>=2.15`), so none of the legacy fields are emitted by default. Both fields are now optional on the `UpdateInfo` type. Modern clients (electron-updater >=2.16) read the `files[]` array and are unaffected. If you still ship apps that embed electron-updater 1.x – 2.15, set `electronUpdaterCompatibility` to a range that includes them (e.g. `>=1.0.0`) so the legacy descriptor keeps being emitted.
- Feat!: `createTargets(..., arch: "all")` now expands to x64 + arm64 on Windows and Linux instead of x64 + ia32. Electron 44 removed Windows ia32 builds, and Linux ia32 zips already ended at Electron 19, so the old expansion produced broken or impossible builds on current Electron. Request `ia32` explicitly to keep building it on Electron <= 43. _[`#10032`](https://github.com/electron-userland/electron-builder/pull/10032) [`d56ada4`](https://github.com/electron-userland/electron-builder/commit/d56ada42fc3a4317dd83b8920abac3e07d967222)_

### Minor Changes

- Feat(win): add msix target with .msixbundle and .msixupload support, MSIX-specific manifest features (Package Integrity, Windows Services), and shared winAppUtil helper module _[`#9808`](https://github.com/electron-userland/electron-builder/pull/9808) [`d94a099`](https://github.com/electron-userland/electron-builder/commit/d94a0999a5a77636319be6ce115cea8e9394ee8d)_ — `app-builder-lib`
- Feat(migrate-schema): advise on `autoUpdater.disableWebInstaller` when an `nsis-web` target is detected _[`#9979`](https://github.com/electron-userland/electron-builder/pull/9979) [`7a0abca`](https://github.com/electron-userland/electron-builder/commit/7a0abca14439514fc817da609a169b9973c38864)_

  `electron-builder migrate-schema` now prints an advisory when the config builds an `nsis-web` target, reminding you that `AppUpdater.disableWebInstaller` defaults to `true` as of v27 and that you must set `autoUpdater.disableWebInstaller = false` in your main process to keep downloading web installers. The advisory is informational only — it surfaces on the JSON/YAML and programmatic (JS/TS) paths and never rewrites the config (`disableWebInstaller` is an electron-updater runtime setting, not a build-config key).
- Feat(nsis): self-identify install method via `resources/package-type` so nsis-web installs default `disableWebInstaller` to `false` _[`#9979`](https://github.com/electron-userland/electron-builder/pull/9979) [`7a0abca`](https://github.com/electron-userland/electron-builder/commit/7a0abca14439514fc817da609a169b9973c38864)_ — `app-builder-lib`

  NSIS installers now write a `resources/package-type` marker (`nsis` or `nsis-web`) at install time, mirroring the existing Linux `package-type` mechanism. electron-updater's `NsisUpdater` reads this marker and, for `nsis-web` installs, pre-seeds `disableWebInstaller = false` so web-installer auto-updates keep working without the app wiring the flag by hand.

  This is a default only: an explicit `autoUpdater.disableWebInstaller = …` set by the app still wins, and a plain `nsis` marker leaves the secure `?? true` default (and the v27 grace-period warning) untouched. The marker is written by the installer script — the only build artifact that differs between `nsis` and `nsis-web` (the app payload is byte-identical, since both targets share one app archive). Only go-forward installs carry the marker; existing deployments are unaffected.
- Feat(dmg): support `ULMO` (lzma-compressed) disk image format, macOS 10.15+ _[`#10018`](https://github.com/electron-userland/electron-builder/pull/10018) [`eacce87`](https://github.com/electron-userland/electron-builder/commit/eacce87a177bdc8de9bd6bc7dce03ca48b3149dd)_ — `app-builder-lib`
- Fix(publish): authenticate Bitbucket Cloud uploads with access tokens (Bearer auth) _[`#10023`](https://github.com/electron-userland/electron-builder/pull/10023) [`6d55fad`](https://github.com/electron-userland/electron-builder/commit/6d55fadaa7bdd94fdcc323f638ed54b774f86f3a)_ — `electron-publish`

  Bitbucket Cloud is deprecating app passwords (https://www.atlassian.com/blog/bitbucket/bitbucket-cloud-transitions-to-api-tokens). The Bitbucket publisher now selects the auth scheme by whether a username is set: with a username it sends HTTP Basic auth (Bitbucket username + app password, or Atlassian account email + API token); without a username it sends the token as a repository/project/workspace access token via `Authorization: Bearer`. Previously a token was always sent as Basic auth using the repo owner as the username, so access tokens could not be used.
- Feat: fail fast with a clear configuration error when building Windows ia32 or Linux armv7l against Electron >= 44, which removed those builds (electron/electron#51816). Previously such builds died with an opaque 404 while downloading the Electron zip. Downgraded to a warning when a custom `electronDist` or Electron mirror is configured, since it may still provide 32-bit builds. Use `electronVersion` <= 43.x to keep building 32-bit (supported until the v43 series reaches end-of-life in January 2027). _[`#10032`](https://github.com/electron-userland/electron-builder/pull/10032) [`d56ada4`](https://github.com/electron-userland/electron-builder/commit/d56ada42fc3a4317dd83b8920abac3e07d967222)_ — `app-builder-lib`
- Feat: add Cloudflare R2 publish provider _[`#9773`](https://github.com/electron-userland/electron-builder/pull/9773) [`a086ef3`](https://github.com/electron-userland/electron-builder/commit/a086ef37855406d0abe418ca1beeca605608b510)_ — `app-builder-lib`, `builder-util-runtime`, `electron-publish`

### Patch Changes

- Fix: ship `snapcraft` type declarations so `SnapOptions.d.ts` resolves for consumers _[`#9971`](https://github.com/electron-userland/electron-builder/pull/9971) [`d853e19`](https://github.com/electron-userland/electron-builder/commit/d853e193ff4c15ef7dec7596c771c7bff27081bf)_ — `app-builder-lib`
- Fix(nsis): pack the app archive with a filter the install-time extractor can decode so the main executable and native binaries are reliably installed on x64 and arm64 (#9983) _[`#9988`](https://github.com/electron-userland/electron-builder/pull/9988) [`50d2296`](https://github.com/electron-userland/electron-builder/commit/50d2296e001e222723977b2ca8591a69d97d64f6)_ — `app-builder-lib`
- Fix: extract `.tar.7z` snap template archives through both compression layers. Since 26.15.0, default-config snap builds packed the template's inner tar as a single file instead of its contents (`desktop-init.sh` etc.), producing snaps that built successfully but failed at launch. The toolset cache directory name for `.tar.7z` archives also changes, so caches poisoned by the broken extraction are automatically re-fetched after upgrading. _[`#10003`](https://github.com/electron-userland/electron-builder/pull/10003) [`39df92f`](https://github.com/electron-userland/electron-builder/commit/39df92fd14d9a3788add09a3963028a48eed176e)_ — `app-builder-lib`
- Fix: don't empty the locales dir when `electronLanguages` uses bare language codes (e.g. `en` now keeps `en-US.pak`), refuse to delete every locale, and warn about entries that match nothing _[`#10007`](https://github.com/electron-userland/electron-builder/pull/10007) [`40ebb23`](https://github.com/electron-userland/electron-builder/commit/40ebb232810680ea661b327f5edf04ac2f0b814b)_ — `app-builder-lib`
- Fix: cache the pending publisher promise in `PublishManager` so concurrent artifact uploads share one publisher instead of racing to create duplicate GitHub draft releases _[`#10028`](https://github.com/electron-userland/electron-builder/pull/10028) [`e0bec44`](https://github.com/electron-userland/electron-builder/commit/e0bec44e7fb8e6449ab0462bac2671117d2aafeb)_ — `app-builder-lib`
- Fix: don't warn about missing com.apple.security.cs.disable-library-validation entitlement when the effective entitlements file already grants it (ad-hoc + hardened runtime builds) _[`#10029`](https://github.com/electron-userland/electron-builder/pull/10029) [`eeabbcb`](https://github.com/electron-userland/electron-builder/commit/eeabbcb85e6eb519af8543af861d10bf2bb79aa3)_ — `app-builder-lib`

## electron-updater@7.0.0-alpha.5

### Major Changes

- Feat(updater): default `disableWebInstaller` to `true` _[`#9979`](https://github.com/electron-userland/electron-builder/pull/9979) [`7a0abca`](https://github.com/electron-userland/electron-builder/commit/7a0abca14439514fc817da609a169b9973c38864)_

  BREAKING CHANGE: `AppUpdater.disableWebInstaller` now defaults to `true`. NSIS web-installer packages are no longer loaded unless you opt in, because their payload is fetched from a manifest-supplied URL that may not undergo signature verification.

  v27 ships a one-major-version grace period so existing deployments are not broken without warning:

  - If you never set `disableWebInstaller` (the default) and a web-installer update is received, the updater logs a deprecation warning and still downloads it. In v28 this becomes an error and the download is blocked (`ERR_UPDATER_WEB_INSTALLER_DISABLED`).
  - If you explicitly set `disableWebInstaller = true`, the download throws `ERR_UPDATER_WEB_INSTALLER_DISABLED` immediately.

  If you intentionally publish and rely on an NSIS web installer, opt back in before v28 by setting `autoUpdater.disableWebInstaller = false` in your main process.
- Feat(updater): gate legacy top-level manifest `path`/`sha512` behind `electronUpdaterCompatibility` _[`#9992`](https://github.com/electron-userland/electron-builder/pull/9992) [`2c10f1f`](https://github.com/electron-userland/electron-builder/commit/2c10f1fe9c409379208aa5c0a5bc102689fb5cb6)_ — `builder-util-runtime`

  BREAKING CHANGE: The legacy top-level `UpdateInfo.path` / `UpdateInfo.sha512` fields are now written to `latest*.yml` only when the declared `electronUpdaterCompatibility` semver range intersects electron-updater versions `<2.16.0` (previously they were written unconditionally), mirroring how the Windows `sha2` field is gated; the legacy `latest-mac.json` is likewise emitted only when the range intersects `<2.0.0`. The default `electronUpdaterCompatibility` is now `>=2.16` (previously `>=2.15`), so none of the legacy fields are emitted by default. Both fields are now optional on the `UpdateInfo` type. Modern clients (electron-updater >=2.16) read the `files[]` array and are unaffected. If you still ship apps that embed electron-updater 1.x – 2.15, set `electronUpdaterCompatibility` to a range that includes them (e.g. `>=1.0.0`) so the legacy descriptor keeps being emitted.
- Feat(updater)!: install-on-next-launch mode, OS session-end guard, object-form `quitAndInstall`, and `autoInstallEvent` enum _[`#10011`](https://github.com/electron-userland/electron-builder/pull/10011) [`1798f6b`](https://github.com/electron-userland/electron-builder/commit/1798f6b67151777cedce4dab1a3778717c8feab0)_

  **BREAKING:** `quitAndInstall` now takes a single destructured options object instead of positional booleans, so v27 migrators discover the new deferred-install flag and can never swap arguments silently. Defaults are unchanged; there is no backward-compat shim.

  ```ts
  // Before (v26)
  autoUpdater.quitAndInstall(true, false)

  // After (v27)
  autoUpdater.quitAndInstall({ isSilent: true, isForceRunAfter: false })
  ```

  **BREAKING:** the `autoInstallOnAppQuit` boolean is replaced by an `autoInstallEvent: "manual" | "onQuit" | "onNextLaunch"` enum (default `"onQuit"`, which preserves prior behavior). There is no compat alias — a single boolean cannot express the three states.

  ```ts
  // Before (v26)
  autoUpdater.autoInstallOnAppQuit = false

  // After (v27)
  autoUpdater.autoInstallEvent = "manual"
  ```

  Installing an update while the app quits spawns a detached installer process; when the quit is caused by the OS session ending (shutdown/reboot/log off on Windows), the OS can kill that installer mid-install and leave the app uninstalled but not re-installed (#7807). Two mitigations, both implemented in `BaseUpdater` so NSIS, AppImage, deb, rpm and pacman targets all inherit them:

  - **Session-end guard (always on):** when the OS session is ending, the on-quit install is skipped with a warning and the downloaded update stays cached for the next quit. Detection is best-effort: `powerMonitor` `shutdown` on macOS/Linux, `BrowserWindow` `session-end` on Windows (windowless apps cannot be covered on Windows).
  - **`autoInstallEvent: "onNextLaunch"` (opt-in; default is `"onQuit"`):** any app quit persists the downloaded update as pending instead of spawning the installer. On the next launch the updater re-validates the cached installer against freshly fetched update info (checksum, code signature on Windows, and an installable-change version check — newer, or a downgrade when `allowDowngrade` is set — as a loop guard) and installs it silently, restarting the app. A single quit can be deferred via the new `quitAndInstall({ waitUntilNextLaunch: true })` option.

  The automatic install at startup is restricted to targets that install without an elevation prompt: **NSIS (per-user installs) and AppImage only**. deb/rpm/pacman always elevate via pkexec/sudo to install — an authentication dialog at app launch is not acceptable — so they keep the pending update and log why; per-machine NSIS installs (UAC) are skipped the same way. For those targets, call the new `installPendingUpdateIfAvailable()` explicitly at a moment the app controls.

  `autoInstallEvent: "onNextLaunch"` is opt-in in v27 and is planned to become the DEFAULT in v28 to resolve this class of session-end corruption once and for all. macOS is unaffected: Squirrel.Mac natively stages downloaded updates and applies them on relaunch (there `"onQuit"` and `"onNextLaunch"` behave identically).

### Minor Changes

- Feat(nsis): self-identify install method via `resources/package-type` so nsis-web installs default `disableWebInstaller` to `false` _[`#9979`](https://github.com/electron-userland/electron-builder/pull/9979) [`7a0abca`](https://github.com/electron-userland/electron-builder/commit/7a0abca14439514fc817da609a169b9973c38864)_

  NSIS installers now write a `resources/package-type` marker (`nsis` or `nsis-web`) at install time, mirroring the existing Linux `package-type` mechanism. electron-updater's `NsisUpdater` reads this marker and, for `nsis-web` installs, pre-seeds `disableWebInstaller = false` so web-installer auto-updates keep working without the app wiring the flag by hand.

  This is a default only: an explicit `autoUpdater.disableWebInstaller = …` set by the app still wins, and a plain `nsis` marker leaves the secure `?? true` default (and the v27 grace-period warning) untouched. The marker is written by the installer script — the only build artifact that differs between `nsis` and `nsis-web` (the app payload is byte-identical, since both targets share one app archive). Only go-forward installs carry the marker; existing deployments are unaffected.
- Feat(updater): add `allowUnverifiedLinuxPackages` to optionally enforce Linux package signature verification _[`#9990`](https://github.com/electron-userland/electron-builder/pull/9990) [`65f0403`](https://github.com/electron-userland/electron-builder/commit/65f04035f722199c7bbd5360f7ecbf2bf352a645)_

  Adds `AppUpdater.allowUnverifiedLinuxPackages`. Because electron-builder does not sign Linux packages, this defaults to `true`, preserving the existing behavior: `.deb`/`.rpm` auto-updates install with the package manager's signature/GPG checks bypassed where a bypass flag exists (`--allow-unauthenticated` for the apt fallback, `--allow-unsigned-rpm` for zypper, `--nogpgcheck` for dnf/yum).

  If you sign your Linux packages through your own pipeline and the target systems trust your keys, set `autoUpdater.allowUnverifiedLinuxPackages = false`. What this enforces depends on the package manager used on the target system:

  - dpkg (the default for `.deb`): no effect — dpkg performs no signature verification (a warning is logged); enforcing `.deb` signatures requires a debsig-verify/debsigs policy on the target system.
  - apt (`.deb` fallback): `--allow-unauthenticated` is omitted.
  - zypper: enforced — unsigned/untrusted packages fail to install.
  - dnf/yum: enforced via `--setopt=localpkg_gpgcheck=1` (local package files are not GPG-checked by default).
  - bare rpm (fallback): cannot be enforced via the CLI (a warning is logged) — rpm verifies signatures when present but by default does not fail the install on unsigned/untrusted packages; the `rpm -Uvh ... --nodeps` fallback command is unchanged (`--nodeps` is a dependency-resolution bypass, not a signature bypass).

  The new `allowUnverified` parameter on `DebUpdater.installWithCommandRunner` / `RpmUpdater.installWithCommandRunner` is a trailing optional argument (default `true`), so existing callers remain source- and runtime-compatible.
- Feat: add Cloudflare R2 publish provider _[`#9773`](https://github.com/electron-userland/electron-builder/pull/9773) [`a086ef3`](https://github.com/electron-userland/electron-builder/commit/a086ef37855406d0abe418ca1beeca605608b510)_ — `electron-updater`, `builder-util-runtime`

### Patch Changes

- Fix(updater): make GitHubProvider pick the newest available release if `allowPrerelease=true` but current version is stable _[`#9895`](https://github.com/electron-userland/electron-builder/pull/9895) [`1f681e1`](https://github.com/electron-userland/electron-builder/commit/1f681e18292c318f2563d7b87cc480ee290e99e2)_

  - `allowPrerelease=true` with no explicit channel and a stable current version now selects the newest valid semver release in the Atom feed (skipping unrelated non-semver tags such as other packages in a monorepo) instead of blindly taking the first feed entry (#9894).
  - When every published release is older than the installed version, the updater now reports "update not available" gracefully (and honors `allowDowngrade`) instead of throwing.
  - `allowPrerelease=false` no longer throws `ERR_UPDATER_NO_PUBLISHED_VERSIONS` when the latest release tag (from `/releases/latest`) is absent from GitHub's truncated Atom feed; it proceeds with the resolved tag.
  - Harden the release download path against path traversal: a tag containing `.`/`..` path segments is rejected with `ERR_UPDATER_INVALID_TAG`.
- Fix(updater): detect legacy hex `sha512` manifest values strictly and deprecate them for removal in v28 _[`#9990`](https://github.com/electron-userland/electron-builder/pull/9990) [`65f0403`](https://github.com/electron-userland/electron-builder/commit/65f04035f722199c7bbd5360f7ecbf2bf352a645)_ — `electron-updater`, `builder-util-runtime`

  The updater previously used a fuzzy heuristic (looking for `+`, `/`, `Z`, or `=` characters) to decide whether a manifest `sha512` was hex- or base64-encoded. It now uses a strict check: a value that is exactly 128 hexadecimal characters is treated as legacy hex; anything else is decoded as base64, which is what electron-builder has emitted since 19.x (2017). The two forms cannot collide — base64-encoded sha512 is always 88 characters ending in `==` — and a wrong pick can only fail closed with a checksum mismatch.

  Hex-encoded `sha512` values (from pre-19.x manifests or hand-rolled manifests built from raw `sha512sum` output) remain accepted in v27 but are deprecated: support will be removed in v28. Emit base64 instead, e.g. `sha512sum file.ext | cut -d' ' -f1 | xxd -r -p | base64 -w0`.

  SHA-256 (`sha2`) update checksums are unchanged here — they remain accepted in v27 under the existing v28-removal grace period.
- Fix: Reject the differential download promise instead of crashing with an uncaughtException when the multipart range response emits a network error _[`#10021`](https://github.com/electron-userland/electron-builder/pull/10021) [`5eed26b`](https://github.com/electron-userland/electron-builder/commit/5eed26b2a9cfd06a1dbe207b25a46ce2c0b05ae9)_



# [27.0.0-alpha.5](https://github.com/electron-userland/electron-builder/compare/electron-builder@27.0.0-alpha.4...electron-builder@27.0.0-alpha.5) (2026-06-20)

## electron-builder@27.0.0-alpha.5

### Major Changes

- Feat(toolsets): Adopt `"latest"` as the canonical "null"-state for every `ToolsetConfig` property, and make the toolset resolution logic resolve the unset state (`undefined` / `null` / `"latest"`) to the newest available bundle for each toolset. _[`#9939`](https://github.com/electron-userland/electron-builder/pull/9939) [`2669c2a`](https://github.com/electron-userland/electron-builder/commit/2669c2a7c7e9b6c3d8f7789362ffa5d7aac3fbf6)_ — `electron-builder`, `app-builder-lib`, `builder-util`, `electron-builder-squirrel-windows`
- Fix(nsis): Generate Windows file-association ProgIDs in a unique, Microsoft-compliant format derived from the product filename and app GUID (BREAKING: custom NSIS scripts hard-coding the previous `name`/`ext` ProgID must be updated) _[`#9241`](https://github.com/electron-userland/electron-builder/pull/9241) [`25e7b44`](https://github.com/electron-userland/electron-builder/commit/25e7b446bc752d3e0b28941bcb606a891d8f2842)_ — `app-builder-lib`
- Feat(toolsets)!: remove `USE_SYSTEM_FPM` env override; require an explicit custom toolset on Windows _[`#9958`](https://github.com/electron-userland/electron-builder/pull/9958) [`238f0f1`](https://github.com/electron-userland/electron-builder/commit/238f0f162282c996a101ff830edc210f9f25b6dc)_ — `app-builder-lib`

  - Remove the `USE_SYSTEM_FPM` environment flag — the last of the `USE_SYSTEM_*` toolset overrides. To use a non-bundled fpm, configure `toolsets.fpm` with a custom toolset pointing at the directory containing the `fpm` executable, e.g. `{ url: "file:///opt/homebrew/bin" }`.
  - A custom toolset is now honored before the platform fallback in `getFpmPath()` and `getOsslSigncodeBundle()`, so an explicit override is respected on every platform (previously it was silently ignored on Windows).
  - On Windows with no custom toolset configured, `getFpmPath()` now throws `InvalidConfigurationError` instead of resolving a bare `fpm` from `$PATH`, closing a binary-hijack vector (`getOsslSigncodeBundle()` throws as defense-in-depth on the same path).
- Feat: allow including default-excluded files (e.g. Wavefront `.obj`) by adding an explicit `files` glob such as `**/*.obj` (fixes #6126). BREAKING: removed the `disableDefaultIgnoredFiles` option — `electron-builder migrate-schema` strips it automatically; re-include specific files via `files` globs instead. _[`#9954`](https://github.com/electron-userland/electron-builder/pull/9954) [`a16fb6b`](https://github.com/electron-userland/electron-builder/commit/a16fb6bfdcf0352a6b127229b8f8254847d16df1)_ — `electron-builder`, `app-builder-lib`

### Minor Changes

- Feat(snap): support multi-arch `remote-build` via `buildFor: string[]` — one Launchpad job now produces and registers multiple snap artifacts _[`#9841`](https://github.com/electron-userland/electron-builder/pull/9841) [`ff467f9`](https://github.com/electron-userland/electron-builder/commit/ff467f93fd55f43409945402cb89389896c3dc9a)_ — `app-builder-lib`
- Feat: promote Azure Trusted Signing and Snap Core24 out of Beta _[`#9949`](https://github.com/electron-userland/electron-builder/pull/9949) [`8f4be0a`](https://github.com/electron-userland/electron-builder/commit/8f4be0a4308f68fea4f76d6c1c2c8d0035266a87)_ — `app-builder-lib`

### Patch Changes

- Docs(win): expand JSDoc for all Windows code signing options (regenerating scheme.json) and modernize the code-signing docs — correct osslsigncode vs Wine, HSM dual-signing, and the "latest" winCodeSign toolset model _[`#9949`](https://github.com/electron-userland/electron-builder/pull/9949) [`8f4be0a`](https://github.com/electron-userland/electron-builder/commit/8f4be0a4308f68fea4f76d6c1c2c8d0035266a87)_ — `app-builder-lib`
- Chore(refactor): reducing duplicate code and extracting helper functions _[`#9947`](https://github.com/electron-userland/electron-builder/pull/9947) [`8f3d9fa`](https://github.com/electron-userland/electron-builder/commit/8f3d9fa442aae342c1c5d2a4448a687de1aff8df)_ — `electron-builder`, `app-builder-lib`, `builder-util`, `builder-util-runtime`, `electron-publish`
- Fix: bundle a workspace sub-package's production dependencies into app.asar when the package manager resolves to the workspace root _[`#9951`](https://github.com/electron-userland/electron-builder/pull/9951) [`39a5fd8`](https://github.com/electron-userland/electron-builder/commit/39a5fd874aea21f1d7e8bc4e961afe2edb8b632e)_ — `app-builder-lib`
- Fix(win): flaky `appOutDir` mutation created `elevate.exe` race condition for concurrent builds that included Squirrel target _[`#9852`](https://github.com/electron-userland/electron-builder/pull/9852) [`3cc43d2`](https://github.com/electron-userland/electron-builder/commit/3cc43d2379b314eacd96e2d948af3e1c0a74e3c9)_ — `app-builder-lib`
- Docs: add a dedicated v27 breaking-changes reference page and point the invalid-config error (`schemaValidator`) and `migrate-schema` CLI output at it _[`#9955`](https://github.com/electron-userland/electron-builder/pull/9955) [`be6d996`](https://github.com/electron-userland/electron-builder/commit/be6d9963d25523d7aa74b2e532ce65cad9293d44)_ — `electron-builder`, `app-builder-lib`
- Fix(migrate-schema): stop stripping `vPrefixedTagName` from GitLab publish entries. The field is still supported on `GitlabOptions` (type, scheme, and runtime — `gitlabPublisher` honors it) and has no `tagNamePrefix` equivalent, so deleting it silently flipped GitLab release tags from `1.2.3` to `v1.2.3`. The migrator now leaves GitLab entries untouched and only converts GitHub `vPrefixedTagName` → `tagNamePrefix`. _[`#9956`](https://github.com/electron-userland/electron-builder/pull/9956) [`62d206f`](https://github.com/electron-userland/electron-builder/commit/62d206fa2c31aed01e5206eb0d51cac77da0f73a)_

## electron-updater@7.0.0-alpha.4

### Patch Changes

- Chore(refactor): reducing duplicate code and extracting helper functions _[`#9947`](https://github.com/electron-userland/electron-builder/pull/9947) [`8f3d9fa`](https://github.com/electron-userland/electron-builder/commit/8f3d9fa442aae342c1c5d2a4448a687de1aff8df)_ — `electron-updater`, `builder-util-runtime`



# [27.0.0-alpha.4](https://github.com/electron-userland/electron-builder/compare/electron-builder@27.0.0-alpha.3...electron-builder@27.0.0-alpha.4) (2026-06-18)

## electron-builder@27.0.0-alpha.4

### Major Changes

- Feat: Remove `linux.syncDesktopName` — always sync the installed `.desktop` filename _[`#9908`](https://github.com/electron-userland/electron-builder/pull/9908) [`fae5232`](https://github.com/electron-userland/electron-builder/commit/fae52329c636d3640c68ba4db5db013ccfa42bc2)_ — `app-builder-lib`

### Minor Changes

- Feat(linux): launch every Linux target (deb/rpm, AppImage, snap, flatpak) through a unified launcher entrypoint so `executableArgs` are applied consistently and the generated `.desktop` Exec key stays a plain command _[`#9922`](https://github.com/electron-userland/electron-builder/pull/9922) [`6a0f35a`](https://github.com/electron-userland/electron-builder/commit/6a0f35aa1e58a0c37794d1646927a1a881098913)_ — `app-builder-lib`
- Feat(cli): `migrate-schema` now auto-migrates programmatic JS/TS configs _[`#9941`](https://github.com/electron-userland/electron-builder/pull/9941) [`2a1c06f`](https://github.com/electron-userland/electron-builder/commit/2a1c06fa6319e3abea381f6b9e359d59a8191649)_

  `electron-builder migrate-schema` previously printed manual steps for programmatic configs (`.js`/`.cjs`/`.mjs`/`.ts`). It now rewrites them in place via an AST-located text codemod that applies the same v26→v27 transforms as static configs while preserving comments, imports, functions, and formatting. Falls back to manual steps when `typescript` is not installed or the config cannot be statically reduced to a single object literal (dynamic function bodies, spreads, computed keys).
- Introduce xml escaping for publisher, publisherDisplayName, displayName, description in appxmanifest.xml to avoid issues with xml preserverd characters _[`#9853`](https://github.com/electron-userland/electron-builder/pull/9853) [`deafee9`](https://github.com/electron-userland/electron-builder/commit/deafee9fe5f7bccbf52e73cd0c6085e767f921ce)_ — `app-builder-lib`, `builder-util`, `builder-util-runtime`

### Patch Changes

- Chore: migrate usages of mkdtemp to utilize TmpDir to unify temp directory usage _[`#9907`](https://github.com/electron-userland/electron-builder/pull/9907) [`a82943a`](https://github.com/electron-userland/electron-builder/commit/a82943ace5737252c7f62d2c6b5f7c679d753a60)_ — `app-builder-lib`
- Fix(win): serialize concurrent signtool invocations to avoid intermittent "An error occurred while attempting to load the signing certificate" _[`#9920`](https://github.com/electron-userland/electron-builder/pull/9920) [`449e8d4`](https://github.com/electron-userland/electron-builder/commit/449e8d4da781af2550684809bbac3f4acafcc92e)_ — `app-builder-lib`
- Fix(win): retry the spurious "The batch file cannot be found." cmd.exe race during dependency install (idempotent, win32-guarded — real install failures still fail fast) _[`#9929`](https://github.com/electron-userland/electron-builder/pull/9929) [`9faa8c8`](https://github.com/electron-userland/electron-builder/commit/9faa8c8198f5e612d54ebcdd0904a74b338afb33)_ — `app-builder-lib`
- Fix(nsis): preserve `$(...)` LangString references in escaped NSIS define values (e.g. `shortcutName: "$(customSN)"`) _[`#9934`](https://github.com/electron-userland/electron-builder/pull/9934) [`344d156`](https://github.com/electron-userland/electron-builder/commit/344d156dd01c3427569b3cd1a37f43b8a5ff5990)_ — `app-builder-lib`
- Fix: resolve failure modes surfaced on the Windows test shards (corepack log noise, icon-conversion memory exhaustion, and an associated signtool failure), plus a small structural cleanup of the install/collector code _[`#9935`](https://github.com/electron-userland/electron-builder/pull/9935) [`d22a6f7`](https://github.com/electron-userland/electron-builder/commit/d22a6f72dd8ddc1e945cc70719adfc373f605118)_ — `app-builder-lib`
- Fix(mac): resolve universal build failure with platform-specific single-arch dependencies (e.g. esbuild, `@esbuild/darwin-arm64`) _[`#9942`](https://github.com/electron-userland/electron-builder/pull/9942) [`b84a1f4`](https://github.com/electron-userland/electron-builder/commit/b84a1f40116287d852da4a5d7307c59b600effba)_ — `app-builder-lib`

  Node modules are now filtered by their `package.json` `cpu`/`os` constraints against the target arch/platform, so host-installed single-arch binaries are no longer copied into mismatched single-arch builds. For `universal` macOS builds, both slices are kept symmetric and any single-arch binary that can't be lipo-merged — including host binaries inside packages that declare no `cpu`/`os` (such as esbuild's `bin/esbuild`) — is automatically reported to `@electron/universal` via `singleArchFiles` (merged with `mac.universal.singleArchFiles`), with a warning listing them. This fixes builds aborting with `Detected file "…" that's the same in both x64 and arm64 builds and not covered by the x64ArchFiles rule` (#9865, #9399).
- Feat(nsis): add Hebrew (he) translations for one-click and assisted installer messages _[`#9927`](https://github.com/electron-userland/electron-builder/pull/9927) [`d21a771`](https://github.com/electron-userland/electron-builder/commit/d21a77117e4836cf8ef93b78210b67c86f053d6a)_ — `app-builder-lib`

  Also add `he_IL` to `bundledLanguages` so Hebrew strings actually reach the built installer (fixes a pre-existing bug where Hebrew was never included in the default multi-language set).

## electron-updater@7.0.0-alpha.3

### Minor Changes

- Introduce xml escaping for publisher, publisherDisplayName, displayName, description in appxmanifest.xml to avoid issues with xml preserverd characters _[`#9853`](https://github.com/electron-userland/electron-builder/pull/9853) [`deafee9`](https://github.com/electron-userland/electron-builder/commit/deafee9fe5f7bccbf52e73cd0c6085e767f921ce)_ — `builder-util-runtime`



# [27.0.0-alpha.3](https://github.com/electron-userland/electron-builder/compare/electron-builder@27.0.0-alpha.2...electron-builder@27.0.0-alpha.3) (2026-06-16)

## electron-builder@27.0.0-alpha.3

### Major Changes

- Chore: modernize macOS build config API and upgrade all `electron/____` dep updates _[`#9889`](https://github.com/electron-userland/electron-builder/pull/9889) [`4d4ba45`](https://github.com/electron-userland/electron-builder/commit/4d4ba45d334a0696df92fb71af8a4b168e7d491e)_ — `electron-builder`, `app-builder-lib`, `dmg-builder`
- Feat(win): Multi-mode Windows code signing under a unified `win.sign` key [HSM, PKCS#11, Azure Trusted Signing, Signtool] (BREAKING) _[`#9855`](https://github.com/electron-userland/electron-builder/pull/9855) [`a07139b`](https://github.com/electron-userland/electron-builder/commit/a07139b09030327aca597673dcbefd95690a5a18)_ — `app-builder-lib`
- Feat: add updated wine 11.0 to toolsets config; `USE_SYSTEM_WINE` process.env override removed - use `CustomToolset` instead _[`#9898`](https://github.com/electron-userland/electron-builder/pull/9898) [`b832369`](https://github.com/electron-userland/electron-builder/commit/b83236991f50bd40db59ea754e64d86f55a96a92)_ — `app-builder-lib`

### Minor Changes

- Fix: add retry-tolerant `ensureDir` to address recurring flaky `ENOENT … mkdir '<cache>/fpm@2.2.1/…'` during concurrent toolset downloads _[`#9899`](https://github.com/electron-userland/electron-builder/pull/9899) [`ef61dd5`](https://github.com/electron-userland/electron-builder/commit/ef61dd5f47ab0b203e76c506394bf4bc1ee9bf00)_ — `app-builder-lib`, `builder-util`

### Patch Changes

- Fix: declare the missing `electron-publish` dependency on `electron-builder`, and switch type-checking to `nodenext` module resolution so the compiler models Node's real ESM loader _[`#9885`](https://github.com/electron-userland/electron-builder/pull/9885) [`96e47b5`](https://github.com/electron-userland/electron-builder/commit/96e47b5b89b76c719b1c06cfdd62a9a17376484e)_ — `electron-builder`, `app-builder-lib`, `builder-util`, `builder-util-runtime`, `dmg-builder`, `electron-builder-squirrel-windows`, `electron-forge-maker-appimage`, `electron-forge-maker-nsis`, `electron-forge-maker-nsis-web`, `electron-forge-maker-snap`, `electron-publish`
- Fix(pnpm-collector): bundle transitive deps of `link:` packages _[`#9875`](https://github.com/electron-userland/electron-builder/pull/9875) [`091ab71`](https://github.com/electron-userland/electron-builder/commit/091ab710fc842441e513c7fbb88e6a9c1e77cc77)_ — `app-builder-lib`
- Chore: harden Windows Azure signing PowerShell invocation and add Windows signing migration notes _[`#9892`](https://github.com/electron-userland/electron-builder/pull/9892) [`6623f4e`](https://github.com/electron-userland/electron-builder/commit/6623f4e018b8f08840d99b70e809081f21706cbc)_ — `electron-builder`, `app-builder-lib`
- Fix: resolve ENOENT on electron zip extraction in Windows Docker _[`#9891`](https://github.com/electron-userland/electron-builder/pull/9891) [`319535a`](https://github.com/electron-userland/electron-builder/commit/319535ada44839149539593f1b1138dc2c5eb2c5)_ — `app-builder-lib`
- Chore(test): generate ephemeral self-signed macOS code-signing for CI tests _[`#9896`](https://github.com/electron-userland/electron-builder/pull/9896) [`6cdd01d`](https://github.com/electron-userland/electron-builder/commit/6cdd01d4c73eccc18a481c63c2531fd17e276238)_ — `app-builder-lib`
- Fix(snap): core24 now runs the app through a generated launcher script, so `executableArgs`/`forceX11` flags containing `=` or quotes build correctly, and the unused `chrome-sandbox` helper is removed automatically when launching with `--no-sandbox` _[`#9897`](https://github.com/electron-userland/electron-builder/pull/9897) [`75bb4c6`](https://github.com/electron-userland/electron-builder/commit/75bb4c6ee911219900d9a303a11c7f5cb3ad9ed0)_ — `app-builder-lib`
- Fix: Resolves open CodeQL code-scanning alerts (8 of 14) by fixing two real ReDoS vulnerabilities and clearing path-injection taint _[`#9900`](https://github.com/electron-userland/electron-builder/pull/9900) [`c976bc4`](https://github.com/electron-userland/electron-builder/commit/c976bc42e166d388e5fc38f7bf4dd20c87464de5)_ — `app-builder-lib`
- Chore(test): disable sourcemaps during Vitest runs _[`#9901`](https://github.com/electron-userland/electron-builder/pull/9901) [`594cfa1`](https://github.com/electron-userland/electron-builder/commit/594cfa1ded3ab4bcb46eac1720b9f9930ed1fbb5)_ — `builder-util`
- Fix: preserve symlinks in `zip` and `7z` archive targets on macOS and Linux via 7za `-snl` (Windows still dereferences). Restores pre-26.15 behavior after the bundled 7-Zip upgrade, which began dereferencing by default — corrupting macOS `.framework` bundles (codesign "bundle format is ambiguous", breaking Squirrel.Mac auto-update) and duplicating Linux symlink content. _[`#9902`](https://github.com/electron-userland/electron-builder/pull/9902) [`a6479f3`](https://github.com/electron-userland/electron-builder/commit/a6479f374ecfae5801b343357f286b263133f547)_ — `app-builder-lib`

## electron-updater@7.0.0-alpha.2

### Patch Changes

- Fix: declare the missing `electron-publish` dependency on `electron-builder`, and switch type-checking to `nodenext` module resolution so the compiler models Node's real ESM loader _[`#9885`](https://github.com/electron-userland/electron-builder/pull/9885) [`96e47b5`](https://github.com/electron-userland/electron-builder/commit/96e47b5b89b76c719b1c06cfdd62a9a17376484e)_ — `electron-updater`, `builder-util-runtime`



# [27.0.0-alpha.2](https://github.com/electron-userland/electron-builder/compare/electron-builder@27.0.0-alpha.1...electron-builder@27.0.0-alpha.2) (2026-06-11)

## electron-builder@27.0.0-alpha.2

### Patch Changes

- Fix: resolve runtime ESM/CJS interop for namespace imports of CJS-only packages (`sax`, `which`, `mime`) _[`#9884`](https://github.com/electron-userland/electron-builder/pull/9884) [`7674e60`](https://github.com/electron-userland/electron-builder/commit/7674e6092645df5c7ae0a31530446efe449cd3d6)_ — `app-builder-lib`, `builder-util-runtime`, `electron-publish`

## electron-updater@7.0.0-alpha.1

### Patch Changes

- Fix: resolve runtime ESM/CJS interop for namespace imports of CJS-only packages (`sax`, `which`, `mime`) _[`#9884`](https://github.com/electron-userland/electron-builder/pull/9884) [`7674e60`](https://github.com/electron-userland/electron-builder/commit/7674e6092645df5c7ae0a31530446efe449cd3d6)_ — `builder-util-runtime`



# [27.0.0-alpha.1](https://github.com/electron-userland/electron-builder/compare/electron-builder@27.0.0-alpha.0...electron-builder@27.0.0-alpha.1) (2026-06-11)

## electron-builder@27.0.0-alpha.1

### Patch Changes

- Fix: resolve `plist` and `chromium-pickle-js` imports. Add additional messaging to `migrate-schema` stdout _[`#9880`](https://github.com/electron-userland/electron-builder/pull/9880) [`b79c2b2`](https://github.com/electron-userland/electron-builder/commit/b79c2b2af3ac65f3d51da7b5045ad803d58565e0)_ — `electron-builder`, `app-builder-lib`



# [27.0.0-alpha.0](https://github.com/electron-userland/electron-builder/compare/electron-builder@26.15.3...electron-builder@27.0.0-alpha.0) (2026-06-11)

## electron-builder@27.0.0-alpha.0

### Major Changes

- Feat!: migrate to native ESM, require Node.js >=22.12.0, remove electron-compile _[`#9544`](https://github.com/electron-userland/electron-builder/pull/9544) [`a5121de`](https://github.com/electron-userland/electron-builder/commit/a5121de49582eaa8870d4c05e6ae55eff160a592)_ — `electron-builder`, `app-builder-lib`, `builder-util`, `builder-util-runtime`, `dmg-builder`, `electron-builder-squirrel-windows`, `electron-forge-maker-appimage`, `electron-forge-maker-nsis`, `electron-forge-maker-nsis-web`, `electron-forge-maker-snap`, `electron-publish`
- Chore(refactor): delete ProtonFramework, LibUiFramework, and binDownload.ts; consolidate all binary downloads into `downloadBuilderToolset`. _[`#9868`](https://github.com/electron-userland/electron-builder/pull/9868) [`f1f654e`](https://github.com/electron-userland/electron-builder/commit/f1f654ebe677db8b8933ec2eab25fcb19978c52f)_ — `app-builder-lib`, `electron-builder-squirrel-windows`
- Feat(toolsets)!: introduce `ToolsetCustom` for user-supplied bundles; remove env-var toolset overrides; split toolset modules into single-purpose files; deprecate `PlatformPackager.info` _[`#9871`](https://github.com/electron-userland/electron-builder/pull/9871) [`02a8042`](https://github.com/electron-userland/electron-builder/commit/02a80426840cda286840f25d28f1ecfce99885db)_ — `app-builder-lib`, `builder-util`
- Chore(refactor): group native-module rebuild options under `nativeModules` sub-key (BREAKING) _[`#9872`](https://github.com/electron-userland/electron-builder/pull/9872) [`cd06931`](https://github.com/electron-userland/electron-builder/commit/cd06931c7c6a8b2a9d2e28ab16c3ea45cb2526b4)_ — `app-builder-lib`
- Chore(refactor): remove deprecated `snap` config property and all remaining deprecated APIs. Hard-deletes 14 deprecated features accumulated across the codebase. No migration shims remain. (BREAKING) _[`#9873`](https://github.com/electron-userland/electron-builder/pull/9873) [`9d755c6`](https://github.com/electron-userland/electron-builder/commit/9d755c68f845d169c9b68963c9711d2e75b4800b)_ — `electron-builder`, `app-builder-lib`, `builder-util-runtime`, `electron-builder-squirrel-windows`, `electron-publish`
- Fix: disable implicit publishing by default _[`#9476`](https://github.com/electron-userland/electron-builder/pull/9476) [`5c9c503`](https://github.com/electron-userland/electron-builder/commit/5c9c503f912e6423a57ab5b89234dff9cf9133ed)_ — `app-builder-lib`

  BREAKING CHANGE: Publishing no longer happens automatically based on CI environment, git tags, or npm lifecycle events. You must now explicitly request publishing using the `--publish` CLI flag (e.g., `--publish always`, `--publish onTag`) or by setting the `publish` option in your configuration.

  This addresses security and usability concerns where unexpected auto-publishing could accidentally expose secrets or publish unfinished work.
- Chore(refactor): consolidate ASAR config under `asar?: AsarOptions | false | null` (BREAKING) _[`#9878`](https://github.com/electron-userland/electron-builder/pull/9878) [`81f4ab5`](https://github.com/electron-userland/electron-builder/commit/81f4ab56ed21fee1f913f0cb88aa2ba8f05b77fd)_ — `electron-builder`, `app-builder-lib`

### Minor Changes

- Refactor(targets,vm,codeSign,electron,util): reorganize platform-specific files into subdirectories _[`#9870`](https://github.com/electron-userland/electron-builder/pull/9870) [`62ae0b9`](https://github.com/electron-userland/electron-builder/commit/62ae0b9d7f6da34ac8811da241a8181d7661c88e)_ — `app-builder-lib`
- Feat(cli): add `migrate-schema` command for v26 → v27 config migration _[`#9873`](https://github.com/electron-userland/electron-builder/pull/9873) [`9d755c6`](https://github.com/electron-userland/electron-builder/commit/9d755c68f845d169c9b68963c9711d2e75b4800b)_

### Patch Changes

- Chore: Code quality modernization: adopt native Node.js APIs and modern TypeScript patterns across the codebase. _[`#9867`](https://github.com/electron-userland/electron-builder/pull/9867) [`f8feadb`](https://github.com/electron-userland/electron-builder/commit/f8feadb0c39934565197d69248274fd62173a94e)_ — `app-builder-lib`, `builder-util`, `builder-util-runtime`
- Chore(refactor): Extract `validateShellEmbeddable` to `builder-util/envUtil`; consolidate all boolean env-var flags into `flags.ts`. _[`#9869`](https://github.com/electron-userland/electron-builder/pull/9869) [`e59504d`](https://github.com/electron-userland/electron-builder/commit/e59504d122c245c08f70218badce057655c1c022)_ — `app-builder-lib`, `builder-util`

## electron-updater@7.0.0-alpha.0

### Major Changes

- Feat!: migrate to native ESM, require Node.js >=22.12.0, remove electron-compile _[`#9544`](https://github.com/electron-userland/electron-builder/pull/9544) [`a5121de`](https://github.com/electron-userland/electron-builder/commit/a5121de49582eaa8870d4c05e6ae55eff160a592)_ — `electron-updater`, `builder-util-runtime`
- Chore(refactor): remove deprecated `snap` config property and all remaining deprecated APIs. Hard-deletes 14 deprecated features accumulated across the codebase. No migration shims remain. (BREAKING) _[`#9873`](https://github.com/electron-userland/electron-builder/pull/9873) [`9d755c6`](https://github.com/electron-userland/electron-builder/commit/9d755c68f845d169c9b68963c9711d2e75b4800b)_ — `builder-util-runtime`

### Patch Changes

- Chore: Code quality modernization: adopt native Node.js APIs and modern TypeScript patterns across the codebase. _[`#9867`](https://github.com/electron-userland/electron-builder/pull/9867) [`f8feadb`](https://github.com/electron-userland/electron-builder/commit/f8feadb0c39934565197d69248274fd62173a94e)_ — `electron-updater`, `builder-util-runtime`



# [26.17.0](https://github.com/electron-userland/electron-builder/compare/electron-builder@26.16.1...electron-builder@26.17.0) (2026-09-25)

## electron-builder@26.17.0

### Minor Changes

- Feat(nsis): `differentialPackage: "store-asar"` — store `resources/app.asar` uncompressed (7-Zip `Copy`) in the differential-aware app package so a small app-code change costs a proportionally small differential download instead of re-downloading the entire recompressed asar (measured on a ~32 MB asar: 0.2% instead of 100% for a one-line change). `nsis.differentialPackage` is widened to `boolean | "compressed" | "store-asar"`: `false` disables differential support as before, `"store-asar"` opts into the stored asar, and everything else (`true`, `"compressed"`, unset) keeps today's fully compressed differential package. Backed by a generic `ArchiveOptions.storedPaths` in `archive()`. _[`#10201`](https://github.com/electron-userland/electron-builder/pull/10201) [`2a2dd22`](https://github.com/electron-userland/electron-builder/commit/2a2dd22c17006ec80acf4704642ca83378e5fdb1)_ — `app-builder-lib`

### Patch Changes

- Fix: resolve the pnpm workspace root by walking up for `pnpm-workspace.yaml` instead of running `pnpm --workspace-root exec pwd`. `pwd` is POSIX-only, so on Windows the root silently resolved to `undefined`, `@electron/rebuild` searched only the app directory, and cross-architecture builds (e.g. `--x64 --arm64`) shipped transitive native modules such as `keytar` for the wrong architecture. When a workspace root is located but the package manager cannot be re-detected there, the located root is now kept and a warning is logged instead of dropping it. _[`#10189`](https://github.com/electron-userland/electron-builder/pull/10189) [`59f6364`](https://github.com/electron-userland/electron-builder/commit/59f63644f80381f018c91246762caee7586ab126)_ — `app-builder-lib`
- Fix: resolve pnpm dependencies omitted from the `pnpm list --json` output by their declared range. Since pnpm 10.29.3 a repeated subtree is printed once and every later occurrence is a childless entry flagged `deduped: true`; the node-module collector recovered such an entry's dependencies by package name only, so when two versions of one package were installed the nested, version-conflicted copy was wired to the wrong version and its whole closure vanished from the packaged `node_modules` (the #8493 regression, e.g. `es5-ext@0.10.64` with `esniff`, `event-emitter` and `next-tick@1.1.0` dropped while the app pins `es5-ext@0.10.53`). The collector now resolves an omitted dependency against the dependent's declared range from its real store directory and takes the exact `name@version` entry, keeping the name-only match only as a fallback for `link:` dependencies, so version-conflicted transitive dependencies are no longer dropped with pnpm >= 10.29.3, 11 and 12. _[`#10207`](https://github.com/electron-userland/electron-builder/pull/10207) [`d4a4f50`](https://github.com/electron-userland/electron-builder/commit/d4a4f501fd136cb6f69339040ada56a0cabc74b6)_ — `app-builder-lib`
- Fix: suppress the macOS 26 "Installer would like to access data from other apps" prompt when building `pkg` installers. macOS 26's Installer probes the current-user-home install domain while parsing the deprecated `<domains>` element — even when that domain is disabled — which makes Installer.app request `kTCCServiceSystemPolicyAppData` as soon as the user leaves the Introduction pane. `rootVolumeOnly="true"` is now added to `<options>` when both `allowAnywhere` and `allowCurrentUserHome` are `false`; the install domains reported by `installer -volinfo` / `-dominfo` are unchanged, and `<domains>` is still emitted verbatim. _[`#10211`](https://github.com/electron-userland/electron-builder/pull/10211) [`613cd58`](https://github.com/electron-userland/electron-builder/commit/613cd587dfc405344989eb0452ddc9281a9164ba)_ — `app-builder-lib`
- Fix(node-module-collector): report empty package-manager output clearly and fall back to node_modules traversal when a collector throws (#10208) _[`#10213`](https://github.com/electron-userland/electron-builder/pull/10213) [`bae1c8b`](https://github.com/electron-userland/electron-builder/commit/bae1c8bcd138c7aa5f575106ca0f8ea22e7dd2a4)_ — `app-builder-lib`
- Fix(flatpak): stop `linux.files` globs from leaking into the flatpak `files` list. `getOptionsForTarget`'s `deepAssign` concatenated `linux.files` onto `flatpak.files`, and `@malept/flatpak-bundler` then crashed destructuring each glob string as a `[src, dest]` tuple (`ENOENT: no such file or directory, stat '<project-root>/*'`); `FlatpakTarget` now takes `files` from the `flatpak` config only. _[`#10229`](https://github.com/electron-userland/electron-builder/pull/10229) [`07c8344`](https://github.com/electron-userland/electron-builder/commit/07c83447d9f6915a18e66b676a378b0786357d80)_ — `app-builder-lib`
- Fix(flatpak): read `flatpak.files` from the flatpak config directly so that a single-string or FileSet `linux.files` no longer throws in FlatpakTarget _[`#10229`](https://github.com/electron-userland/electron-builder/pull/10229) [`07c8344`](https://github.com/electron-userland/electron-builder/commit/07c83447d9f6915a18e66b676a378b0786357d80)_ — `app-builder-lib`
- Fix(pnpm-collector): package the declared versions of nested dependencies with pnpm 11 and `node-linker=hoisted` by detecting the hoisted layout from disk and preferring an in-range copy over an out-of-range override, including when the app is a package in a hoisted pnpm workspace with no `node_modules` of its own (#10228) _[`#10230`](https://github.com/electron-userland/electron-builder/pull/10230) [`41a027c`](https://github.com/electron-userland/electron-builder/commit/41a027ce590dfff24e935861577fc58a16595e31)_ — `app-builder-lib`

## electron-updater@6.8.10

### Patch Changes

- Fix: keep the cached blockmap consistent with the cached installer. A download round that did not produce a new blockmap (e.g. the differential download was skipped because the cached installer was evicted) now removes the cached `current.blockmap` instead of leaving a stale one next to the freshly cached file, which poisoned the next differential download and surfaced as a generic sha512 checksum mismatch before falling back to a full download (#10097). Leftover pending blockmaps from previous update rounds are also cleared before a fresh download. sha512-mismatch logging now distinguishes a differential download that failed against stale/corrupt cached inputs (including whether the old blockmap came from the local cache or the server) from a genuine checksum failure of a fully downloaded file. _[`#10163`](https://github.com/electron-userland/electron-builder/pull/10163) [`1dfe1a9`](https://github.com/electron-userland/electron-builder/commit/1dfe1a90630efc8df06821f9797067aa20afa5c7)_
- Fix: make multi-range differential downloads work on real servers. Three independent defects made `downloadUpdate` fall back to a full download with `Response ends without calling any handlers`: _[`#10219`](https://github.com/electron-userland/electron-builder/pull/10219) [`7dd7f8a`](https://github.com/electron-userland/electron-builder/commit/7dd7f8a875c088cc5a527b85cc113bcff8a008b3)_

  - `DataSplitter` only recognised CRLF. Some CDNs answer `multipart/byteranges` with bare LF line endings, so no part was ever split and the whole response accumulated in memory. Header lists now end at whichever of `\r\n\r\n` / `\n\n` comes first, and the `<EOL>--boundary` separator size follows the line ending the server actually uses.
  - A header-list terminator split across two chunks was never found: only the new chunk was searched, the buffered bytes never were, so the parser locked onto the next part's header instead. Only the last few bytes of an unfinished header list are now carried over and searched together with the next chunk, instead of accumulating the whole list.
  - The 10s watchdog armed when a batch response ends was never disarmed after that batch succeeded. With more than 1000 operations (several range requests) it failed the whole download whenever a later batch took longer than the grace period.



# [26.16.1](https://github.com/electron-userland/electron-builder/compare/electron-builder@26.16.0...electron-builder@26.16.1) (2026-09-07)

## electron-builder@26.16.1

### Patch Changes

- Fix(win): flaky `appOutDir` mutation created `elevate.exe` race condition for concurrent builds that included Squirrel target _[`#10157`](https://github.com/electron-userland/electron-builder/pull/10157) [`d6d4125`](https://github.com/electron-userland/electron-builder/commit/d6d4125ba636ad2edcd7ddb01d74ddf75a855727)_ — `app-builder-lib`
- Fix(mac): pass the temporary keychain's own password to `security set-key-partition-list -k` instead of the certificate's import password. The import password is only valid for `security import -P`; `set-key-partition-list` authenticates against the keychain itself, so on macOS versions that verify the password, `CSC_LINK`-based signing failed with `SecKeychainUnlock: The user name or passphrase you entered is not correct` (see #10066). _[`#10172`](https://github.com/electron-userland/electron-builder/pull/10172) [`b9b2e8a`](https://github.com/electron-userland/electron-builder/commit/b9b2e8afe5bfb975c8551b19a3cf8a68e58df4a5)_ — `app-builder-lib`
- Fix(win): only log "signing with signtool.exe" when a certificate is configured and signing actually runs; report at info level when signing is skipped because no certificate is configured (#10168) _[`#10171`](https://github.com/electron-userland/electron-builder/pull/10171) [`5ae5a02`](https://github.com/electron-userland/electron-builder/commit/5ae5a02f7ce83e7f47e1bfa660b2dc7e95081d24)_ — `app-builder-lib`
- Fix(mac): retain Electron's `LICENSE.electron.txt` and Chromium's `LICENSES.chromium.html` in the macOS `.app` bundle (`Contents/Resources`) instead of dropping them outside the bundle, matching the license files already shipped on Windows and Linux (#9407) _[`#10177`](https://github.com/electron-userland/electron-builder/pull/10177) [`a4ec75f`](https://github.com/electron-userland/electron-builder/commit/a4ec75f919b839c0a4afcee3f7fa526681e128d4)_ — `app-builder-lib`
- Fix: prevent infinite recursion in node module collection when a package depends on itself (e.g. `libsql@0.3.19` via `@prisma/adapter-libsql` -> `@libsql/client`), which caused npm-based builds to hang at `searching for node modules` and eventually crash with a JavaScript heap out-of-memory error (#10068) _[`#10180`](https://github.com/electron-userland/electron-builder/pull/10180) [`7c04b35`](https://github.com/electron-userland/electron-builder/commit/7c04b358b249841e362f6f71bd20de478c3d86c4)_ — `app-builder-lib`



# [26.16.0](https://github.com/electron-userland/electron-builder/compare/electron-builder@26.15.7...electron-builder@26.16.0) (2026-08-29)

## electron-builder@26.16.0

### Minor Changes

- Feat: add `allowMissingDependencies?: boolean | string[] | null` configuration (issue #10058). When node-module collection completes and a production dependency could not be resolved (`cannot find path for dependency` / `dependency not found on disk`), the option controls whether the build fails: `true` or omitted (the v26 default) keeps today's warn-only behavior, `false`/`null` fails the build with an error listing the complete set of missing dependencies, and a `string[]` allows only the listed dependency names to be missing (bare package name, or exact `name@version`) while any other missing production dependency fails. Missing optional dependencies (e.g. `fsevents` on Linux/Windows) are always allowed. Note: electron-builder 27+ flips the default to `false` (fail-closed); the stable 26.x line keeps warn-only by default to avoid breaking existing builds. _[`#10074`](https://github.com/electron-userland/electron-builder/pull/10074) [`ec4f39b`](https://github.com/electron-userland/electron-builder/commit/ec4f39b33663f4f7a602f25330737c16af8b9cea)_ — `app-builder-lib`

### Patch Changes

- Feat: support fully offline (air-gapped) Electron downloads by picking up a locally seeded `SHASUMS256.txt-<version>` at the Electron cache root and passing it to `@electron/get` as inline checksums, suppressing the mandatory network fetch of `SHASUMS256.txt` that failed air-gapped builds even with a fully seeded cache. Also recognise a user-provided `electronDownload.checksums` so it is forwarded instead of silently dropped (#10039) _[`#10047`](https://github.com/electron-userland/electron-builder/pull/10047) [`ee1d282`](https://github.com/electron-userland/electron-builder/commit/ee1d2828600f807887135e0a5a7d01d8d5d28c30)_ — `app-builder-lib`
- Fix: accept base64-encoded SHA-512 checksums for custom toolset downloads again. `customNsisBinary`/`customNsisResources` configs using the historically documented base64 SHA-512 checksums failed on 26.15.x with `Could not parse checksum file at line 1` because the checksum was forwarded to `@electron/get`, whose sumchecker only understands SHA-256 hex. Base64 SHA-512 checksums are now verified by electron-builder itself after the download (and on archive-cache hits); SHA-256 hex checksums keep being verified by `@electron/get`. Unrecognized or mixed checksum formats now fail fast with a clear configuration error instead of a mid-download parse error. _[`#10041`](https://github.com/electron-userland/electron-builder/pull/10041) [`cc8e783`](https://github.com/electron-userland/electron-builder/commit/cc8e7833388c2e2591eb77c2ce72548a34eba9d3)_ — `app-builder-lib`
- Fix: allow parentheses in AppImage executable, product, and license file names. Before, product names like `Zoo Design Studio (Staging)` failed AppImage builds with "productFilename contains characters that cannot be safely used in file paths" — a regression from the Go pipeline, which accepted them. After, names containing `(` and `)` build again; parentheses are legal in Linux filenames and inert inside the double-quoted bash strings of the generated AppRun launcher, while genuinely dangerous characters (`$`, backticks, quotes, slashes) remain rejected. _[`#10052`](https://github.com/electron-userland/electron-builder/pull/10052) [`12add99`](https://github.com/electron-userland/electron-builder/commit/12add992b703db522c21d14f871e8517472484b4)_ — `app-builder-lib`
- Fix: classify missing declared-optional dependencies (e.g. `fsevents` on Linux/Windows) as missing optional dependencies in the pnpm collector, instead of warning `dependency not found on disk` _[`#10074`](https://github.com/electron-userland/electron-builder/pull/10074) [`ec4f39b`](https://github.com/electron-userland/electron-builder/commit/ec4f39b33663f4f7a602f25330737c16af8b9cea)_ — `app-builder-lib`
- Fix NSIS installer hang when the user's PowerShell profile contains interactive commands: run powershell.exe with -NoProfile -NonInteractive in allowOnlyOneInstallerInstance checks _[`#10053`](https://github.com/electron-userland/electron-builder/pull/10053) [`88b45b1`](https://github.com/electron-userland/electron-builder/commit/88b45b11a45066fb352d599accf074018a9a9134)_ — `app-builder-lib`
- Fix(mac): bump icons toolset to 1.2.3 so small ICNS sizes are written as ic04/ic05 ARGB instead of PNG-in-icp4/icp5/icp6, which macOS renders as noise at 16/32px (fixes corrupted Finder/DMG icons) _[`#10088`](https://github.com/electron-userland/electron-builder/pull/10088) [`92332cc`](https://github.com/electron-userland/electron-builder/commit/92332ccf69966a895f98894675d532506c8ef1ea)_ — `app-builder-lib`
- Fix(linux): bump linux-tools-mac toolset to 1.0.1 so its binaries run on macOS 15+ instead of requiring macOS 26 (fixes fpm-based deb/rpm/pacman builds on older macOS hosts) _[`#10102`](https://github.com/electron-userland/electron-builder/pull/10102) [`cc691c3`](https://github.com/electron-userland/electron-builder/commit/cc691c33de035cf2086804469a46f55150d4fa5f)_ — `app-builder-lib`
- Fix: emit `afterSign` hook for `mas`/`mas-dev` builds again. The MAS flow packs with `sign: false` and codesigns separately, which skipped the only `emitAfterSign` call site — the hook now fires after codesigning and before the installer `.pkg` is created, and the standard "skipping afterSign" warning is logged when signing does not occur (#9997) _[`#10072`](https://github.com/electron-userland/electron-builder/pull/10072) [`e3d9744`](https://github.com/electron-userland/electron-builder/commit/e3d974459cdaafe9ac141a93d2a94d26d809ce48)_ — `app-builder-lib`
- Fix `ERR_REQUIRE_ESM` when generating blockmaps on Node < 20.19 by pinning `@noble/hashes` to the dual CJS/ESM v1.8 and importing its `blake2b.js` entry. _[`#10108`](https://github.com/electron-userland/electron-builder/pull/10108) [`be75d14`](https://github.com/electron-userland/electron-builder/commit/be75d14a7ceb80c3370c75a944aed351c5768a05)_ — `app-builder-lib`
- Feat: backport escape xml for appxmanifest _[`#10099`](https://github.com/electron-userland/electron-builder/pull/10099) [`e426aca`](https://github.com/electron-userland/electron-builder/commit/e426acae9f340bb8431969ea26b5c03acf454df6)_ — `app-builder-lib`, `builder-util`



# [26.15.7](https://github.com/electron-userland/electron-builder/compare/electron-builder@26.15.6...electron-builder@26.15.7) (2026-07-12)

## electron-builder@26.15.7

### Patch Changes

- Fix: extract `.tar.7z` snap template archives through both compression layers. Since 26.15.0, default-config snap builds packed the template's inner tar as a single file instead of its contents (`desktop-init.sh` etc.), producing snaps that built successfully but failed at launch. The toolset cache directory name for `.tar.7z` archives also changes, so caches poisoned by the broken extraction are automatically re-fetched after upgrading. _[`#10004`](https://github.com/electron-userland/electron-builder/pull/10004) [`c4b0a2c`](https://github.com/electron-userland/electron-builder/commit/c4b0a2ce72b647b5fd8efc2f0070fbc35316324c)_ — `app-builder-lib`
- Fix: don't empty the locales dir when `electronLanguages` uses bare language codes (e.g. `en` now keeps `en-US.pak`), refuse to delete every locale, and warn about entries that match nothing _[`#10008`](https://github.com/electron-userland/electron-builder/pull/10008) [`f5fccba`](https://github.com/electron-userland/electron-builder/commit/f5fccbaef9340667630676601fe90cbcb8805095)_ — `app-builder-lib`



# [26.15.6](https://github.com/electron-userland/electron-builder/compare/electron-builder@26.15.5...electron-builder@26.15.6) (2026-06-26)

## electron-builder@26.15.6

### Patch Changes

- Fix: bundle a workspace sub-package's production dependencies into app.asar when the package manager resolves to the workspace root _[`#9950`](https://github.com/electron-userland/electron-builder/pull/9950) [`4f6c311`](https://github.com/electron-userland/electron-builder/commit/4f6c3115012575a713f29c4df40ac271dcf1e182)_ — `app-builder-lib`
- Fix(nsis): pack the app archive with a filter the install-time extractor can decode so the main executable and native binaries are reliably installed on x64 and arm64 (#9983) _[`#9989`](https://github.com/electron-userland/electron-builder/pull/9989) [`0907083`](https://github.com/electron-userland/electron-builder/commit/0907083713b8157b8bc76f716171a91ce4707def)_ — `app-builder-lib`



# [26.15.5](https://github.com/electron-userland/electron-builder/compare/electron-builder@26.15.4...electron-builder@26.15.5) (2026-06-19)

## electron-builder@26.15.5

### Patch Changes

- Fix(snap): core24 now runs the app through a generated launcher script, so `executableArgs`/`forceX11` flags containing `=` or quotes build correctly, and the unused `chrome-sandbox` helper is removed automatically when launching with `--no-sandbox` _[`#9937`](https://github.com/electron-userland/electron-builder/pull/9937) [`8388a59`](https://github.com/electron-userland/electron-builder/commit/8388a597721e55150ca031331e89894384e22c60)_ — `app-builder-lib`
- Fix: updating icons toolset to latest 1.2.1 for broader icns asset generation _[`#9943`](https://github.com/electron-userland/electron-builder/pull/9943) [`07f01dd`](https://github.com/electron-userland/electron-builder/commit/07f01dd289014c8bc2dfd75d5a9ea8708518bdd4)_ — `app-builder-lib`



# [26.15.4](https://github.com/electron-userland/electron-builder/compare/electron-builder@26.15.3...electron-builder@26.15.4) (2026-06-16)

## electron-builder@26.15.4

### Patch Changes

- Fix(nsis): preserve `$(...)` LangString references in escaped NSIS define values (e.g. `shortcutName: "$(customSN)"`) _[`#9917`](https://github.com/electron-userland/electron-builder/pull/9917) [`7dd41f5`](https://github.com/electron-userland/electron-builder/commit/7dd41f5e62ec2f99e1bade871d372393be5a556b)_ — `app-builder-lib`
- Fix(linux): write `executableArgs` verbatim into the `.desktop` Exec line so packaged apps (deb/rpm) still appear in the application menu _[`#9918`](https://github.com/electron-userland/electron-builder/pull/9918) [`5d8b8f8`](https://github.com/electron-userland/electron-builder/commit/5d8b8f881e0ab268f8f3ef31805f5ee0af5456a0)_ — `app-builder-lib`
- Fix: resolve ENOENT on electron zip extraction in Windows Docker _[`#9921`](https://github.com/electron-userland/electron-builder/pull/9921) [`9a10c44`](https://github.com/electron-userland/electron-builder/commit/9a10c44c4e65aa854729fb98c91c07d34ec75b70)_ — `app-builder-lib`
- Fix: preserve symlinks in `zip` and `7z` archive targets on macOS and Linux via 7za `-snl` (Windows still dereferences). Restores pre-26.15 behavior after the bundled 7-Zip upgrade, which began dereferencing by default — corrupting macOS `.framework` bundles (codesign "bundle format is ambiguous", breaking Squirrel.Mac auto-update) and duplicating Linux symlink content. _[`#9921`](https://github.com/electron-userland/electron-builder/pull/9921) [`9a10c44`](https://github.com/electron-userland/electron-builder/commit/9a10c44c4e65aa854729fb98c91c07d34ec75b70)_ — `app-builder-lib`



# [26.15.3](https://github.com/electron-userland/electron-builder/compare/electron-builder@26.15.2...electron-builder@26.15.3) (2026-06-09)

## electron-builder@26.15.3

### Patch Changes

- Fix: harden HTTP mirror validation — reject non-localhost HTTP by default, add ELECTRON_BUILDER_BINARIES_ALLOW_HTTP opt-in _[`#9856`](https://github.com/electron-userland/electron-builder/pull/9856) [`35bfdeb`](https://github.com/electron-userland/electron-builder/commit/35bfdebe47f412c3bf14bc5d1b9d833bfa1ec7d4)_ — `builder-util`
- Fix(download): persist toolset archives in a predictable cache path so repeated builds and offline environments skip the @electron/get network round-trip _[`#9861`](https://github.com/electron-userland/electron-builder/pull/9861) [`9097daf`](https://github.com/electron-userland/electron-builder/commit/9097daff78f7f9450dc7e06f6e7eea94ed1394aa)_ — `app-builder-lib`
- Fix(publish): set x-amz-content-sha256: UNSIGNED-PAYLOAD before SigV4 signing so S3 accepts streaming PutObject uploads _[`#9863`](https://github.com/electron-userland/electron-builder/pull/9863) [`818a89f`](https://github.com/electron-userland/electron-builder/commit/818a89f4c3087ed53498d781bf0bb1ca4807d03d)_ — `electron-publish`



# [26.15.2](https://github.com/electron-userland/electron-builder/compare/electron-builder@26.15.1...electron-builder@26.15.2) (2026-06-07)

## electron-builder@26.15.2

### Patch Changes

- Fix(mac): use native `zip` for macOS zip target to preserve `.framework` symlinks and fix Squirrel.Mac auto-update validation _[`#9847`](https://github.com/electron-userland/electron-builder/pull/9847) [`e25f967`](https://github.com/electron-userland/electron-builder/commit/e25f9674d594524c2d0348c8fae456527391c9ca)_ — `app-builder-lib`
- Fix: retry package install on transient network errors _[`#9850`](https://github.com/electron-userland/electron-builder/pull/9850) [`3951024`](https://github.com/electron-userland/electron-builder/commit/3951024641788af4a18f407074106b2a4196fc1f)_ — `app-builder-lib`
- Fix(icons): replace png2icons with wasm-vips Lanczos3 resampling for high-quality icon conversion _[`#9851`](https://github.com/electron-userland/electron-builder/pull/9851) [`f5ae163`](https://github.com/electron-userland/electron-builder/commit/f5ae1632a7d30db34660786c81d39fca773e9467)_ — `app-builder-lib`



# [26.15.1](https://github.com/electron-userland/electron-builder/compare/electron-builder@26.15.0...electron-builder@26.15.1) (2026-06-06)

## electron-builder@26.15.1

### Patch Changes

- Chore: `ci:validate` lint fixes, `ci:test:fetch-cache` simplification, and code cleanup _[`#9840`](https://github.com/electron-userland/electron-builder/pull/9840) [`588ff48`](https://github.com/electron-userland/electron-builder/commit/588ff4854e9c0efa13539fed14b2711a708c8c7a)_ — `app-builder-lib`, `electron-publish`
- Chore(deps): unpin and update `@electron/rebuild` package to latest `^4.0.4` _[`#9845`](https://github.com/electron-userland/electron-builder/pull/9845) [`db5d2f4`](https://github.com/electron-userland/electron-builder/commit/db5d2f4bfecf43dfb9f784f07f96666404487ba7)_ — `app-builder-lib`



# [26.15.0](https://github.com/electron-userland/electron-builder/compare/electron-builder@26.14.0...electron-builder@26.15.0) (2026-06-05)

## electron-builder@26.15.0

### Minor Changes

- Chore: replace app-builder-bin `node-dep-tree` and `rebuild-node-modules` with pure-TS equivalents; `nativeRebuilder: "legacy"` now routes to `@electron/rebuild` sequential mode _[`#9828`](https://github.com/electron-userland/electron-builder/pull/9828) [`198c10c`](https://github.com/electron-userland/electron-builder/commit/198c10c9693d1244bac80cb11af6b75ad363e5a0)_ — `electron-builder`, `app-builder-lib`, `builder-util-runtime`
- Fix(node-module-collector): invoke package managers via PowerShell `-EncodedCommand` on Windows to eliminate shell injection vectors and the Node `DEP0190` deprecation warning _[`#9827`](https://github.com/electron-userland/electron-builder/pull/9827) [`3e3ea31`](https://github.com/electron-userland/electron-builder/commit/3e3ea319002effd7b651851490ca0a4e6bfda27d)_ — `app-builder-lib`
- Chore: replace app-builder-bin `proton-native` command with pure-TS equivalents; Node.js and LaunchUI binaries are now downloaded via `downloadBuilderToolset`; `config.launchUiVersion` string is now respected _[`#9829`](https://github.com/electron-userland/electron-builder/pull/9829) [`01b8ba9`](https://github.com/electron-userland/electron-builder/commit/01b8ba979d1db44543e18d07b4ad94953deb10ea)_ — `app-builder-lib`
- Chore: replace app-builder-bin `snap` and `wine` commands with pure-TS equivalents; `executeAppBuilder` and `app-builder-bin` package fully removed from codebase; snap templates now downloaded via `downloadBuilderToolset` with pinned checksums; Wine is downloaded automatically on macOS (legacy 4.0.1 bundle by default, Wine 11 bundle available via `toolsets.wine: "1.0.1"`); on Linux with legacy config and when `USE_SYSTEM_WINE=true`, system wine is used instead _[`#9829`](https://github.com/electron-userland/electron-builder/pull/9829) [`01b8ba9`](https://github.com/electron-userland/electron-builder/commit/01b8ba979d1db44543e18d07b4ad94953deb10ea)_ — `app-builder-lib`, `builder-util`
- Feat(linux): add `linux.syncDesktopName` opt-in flag to align installed `.desktop` filename with `desktopName` and `StartupWMClass`; will become default in v27 _[`#9832`](https://github.com/electron-userland/electron-builder/pull/9832) [`8096732`](https://github.com/electron-userland/electron-builder/commit/8096732d7270ab8f20694a9a2f3821c95c0ea153)_ — `app-builder-lib`

### Patch Changes

- Fix(mac): skip signing when no certificate found; warn on ad-hoc + hardenedRuntime _[`#9822`](https://github.com/electron-userland/electron-builder/pull/9822) [`8f0621b`](https://github.com/electron-userland/electron-builder/commit/8f0621ba9d5e8445e538fa0f6869ff0a4c8d19cb)_ — `app-builder-lib`
- Fix: holistic field detection for sha256 hash redaction _[`#9834`](https://github.com/electron-userland/electron-builder/pull/9834) [`22a7532`](https://github.com/electron-userland/electron-builder/commit/22a7532bd01b9fb42cff7c58d599c7ad683569fe)_ — `builder-util`, `builder-util-runtime`, `electron-publish`
- Fix(mac/pkg): explicitly pass `--version` to pkgbuild _[`#9835`](https://github.com/electron-userland/electron-builder/pull/9835) [`2fb4078`](https://github.com/electron-userland/electron-builder/commit/2fb4078a7aabd1524121d933f41c7183c1eb8d45)_ — `app-builder-lib`

## electron-updater@6.8.9

### Minor Changes

- Chore: replace app-builder-bin `node-dep-tree` and `rebuild-node-modules` with pure-TS equivalents; `nativeRebuilder: "legacy"` now routes to `@electron/rebuild` sequential mode _[`#9828`](https://github.com/electron-userland/electron-builder/pull/9828) [`198c10c`](https://github.com/electron-userland/electron-builder/commit/198c10c9693d1244bac80cb11af6b75ad363e5a0)_ — `builder-util-runtime`

### Patch Changes

- Fix: holistic field detection for sha256 hash redaction _[`#9834`](https://github.com/electron-userland/electron-builder/pull/9834) [`22a7532`](https://github.com/electron-userland/electron-builder/commit/22a7532bd01b9fb42cff7c58d599c7ad683569fe)_ — `electron-updater`, `builder-util-runtime`



# [26.14.0](https://github.com/electron-userland/electron-builder/compare/electron-builder@26.13.1...electron-builder@26.14.0) (2026-06-02)

## electron-builder@26.14.0

### Minor Changes

- Feat: migrate blockmap and icon commands from app-builder-bin to pure TypeScript _[`#9800`](https://github.com/electron-userland/electron-builder/pull/9800) [`7a71b01`](https://github.com/electron-userland/electron-builder/commit/7a71b0136183b07e78ed6c1185c459673a77a4eb)_ — `app-builder-lib`
- Feat(dmg-builder): replace `dmg-license` post-processing with dmgbuild-native license embedding; removes deprecated `hdiutil udifrez` dependency _[`#9815`](https://github.com/electron-userland/electron-builder/pull/9815) [`f0e33f0`](https://github.com/electron-userland/electron-builder/commit/f0e33f08c46058bb9011337af1706c507d2dd733)_ — `dmg-builder`

### Patch Changes

- Fix(pnpm): properly resolve nested dependencies when `nodeLinker: hoisted` _[`#9811`](https://github.com/electron-userland/electron-builder/pull/9811) [`2be34d2`](https://github.com/electron-userland/electron-builder/commit/2be34d2b9b3903ecd616e7d098793961ebc6ee94)_ — `app-builder-lib`
- Fix(dynamic-import): use CJS resolver to reliably resolve package subpaths in pnpm projects _[`#9817`](https://github.com/electron-userland/electron-builder/pull/9817) [`370bd75`](https://github.com/electron-userland/electron-builder/commit/370bd754365ed082fdd0a2bd46ae85b8e26ef87c)_ — `app-builder-lib`
- Fix(builder-util): add timeout to `spawnAndWriteWithOutput` _[`#9820`](https://github.com/electron-userland/electron-builder/pull/9820) [`0e67339`](https://github.com/electron-userland/electron-builder/commit/0e67339e0177e4bacf57845356d27020918803b3)_ — `app-builder-lib`, `builder-util`



# [26.13.1](https://github.com/electron-userland/electron-builder/compare/electron-builder@26.13.0...electron-builder@26.13.1) (2026-06-01)

## electron-builder@26.13.1

### Patch Changes

- Fix: correct `update-alternatives --remove` path and unload AppArmor profile on removal _[`#9801`](https://github.com/electron-userland/electron-builder/pull/9801) [`b5a1ac1`](https://github.com/electron-userland/electron-builder/commit/b5a1ac1a74b854931d45ac6d4eed15f876a496d3)_ — `app-builder-lib`
- Fix(traversal): accept transitive dependencies resolved outside their declared range by package manager overrides _[`#9804`](https://github.com/electron-userland/electron-builder/pull/9804) [`c142e0f`](https://github.com/electron-userland/electron-builder/commit/c142e0f4c1f61e8800093023d30091af0674bb8a)_ — `app-builder-lib`
- Fix(win): log actionable hint when signAndEditExecutable is false so users know to use signExecutable: false to preserve icon and metadata _[`#9807`](https://github.com/electron-userland/electron-builder/pull/9807) [`e4cd2ac`](https://github.com/electron-userland/electron-builder/commit/e4cd2ac4590c87e114444ab17f4bcead7f82ee2d)_ — `app-builder-lib`
- Chore(deps): replace unmaintained @develar/schema-utils with a self-contained ajv@8 validator _[`#9803`](https://github.com/electron-userland/electron-builder/pull/9803) [`964ff9a`](https://github.com/electron-userland/electron-builder/commit/964ff9a3d5d5cb5850de3f450563b52c34aaae46)_ — `app-builder-lib`
- Fix(win): restore `getToolPath()` on `WindowsSignToolManager` and improve public API _[`#9806`](https://github.com/electron-userland/electron-builder/pull/9806) [`fd9fcb1`](https://github.com/electron-userland/electron-builder/commit/fd9fcb11e81a42b4b018d6f7a2b16a89697a2ba2)_ — `app-builder-lib`
- Fix(nsis): validate makensis stderr and installer file size after build to catch truncated output caused by low disk space _[`#9802`](https://github.com/electron-userland/electron-builder/pull/9802) [`cf2ec41`](https://github.com/electron-userland/electron-builder/commit/cf2ec4176a51a73856f05e271313a5e2ce2aaf7e)_ — `app-builder-lib`
- Chore: add comment re: non-existent swiftshader directory in newer electron versions _[`#9781`](https://github.com/electron-userland/electron-builder/pull/9781) [`bb8cb67`](https://github.com/electron-userland/electron-builder/commit/bb8cb672dfeb69f22a23ba43eaa636fe9f7d3121)_ — `app-builder-lib`
- Fix(node-module-collector): suppress expected `npm list` stderr from user-visible warnings when collecting dependencies for Yarn projects using resolutions _[`#9810`](https://github.com/electron-userland/electron-builder/pull/9810) [`478ade4`](https://github.com/electron-userland/electron-builder/commit/478ade400294af2980fca9c2eb47e9e47457943c)_ — `app-builder-lib`



# [26.13.0](https://github.com/electron-userland/electron-builder/compare/electron-builder@26.12.1...electron-builder@26.13.0) (2026-05-31)

## electron-builder@26.13.0

### Minor Changes

- Feat: add `disableAsarIntegrity` config option to skip ASAR integrity computation _[`#9786`](https://github.com/electron-userland/electron-builder/pull/9786) [`3a6c0b1`](https://github.com/electron-userland/electron-builder/commit/3a6c0b18fbd223e94bdb9651ef1c7a66b823cdfd)_ — `app-builder-lib`
- Feat: migrate app-builder-bin functions to pure JS (`certificate-info`, `ksuid`, `get-bucket-location`, `publish-s3`) _[`#9733`](https://github.com/electron-userland/electron-builder/pull/9733) [`1bc92ff`](https://github.com/electron-userland/electron-builder/commit/1bc92ff4b21003536dfe161fb679b6a76713cd38)_ — `app-builder-lib`, `builder-util`, `electron-publish`
- Fix(dmg): add support for APFS filesystem for dmg builds _[`#9616`](https://github.com/electron-userland/electron-builder/pull/9616) [`6982866`](https://github.com/electron-userland/electron-builder/commit/69828666afaa333001b7ba6fcdda23a2a8878885)_ — `app-builder-lib`, `dmg-builder`

### Patch Changes

- Fix(nsis): replace partial-match process detection with exact findstr /B match to stop false-positive "app cannot be closed" dialogs when a sibling process name contains the app name _[`#9784`](https://github.com/electron-userland/electron-builder/pull/9784) [`dd6d704`](https://github.com/electron-userland/electron-builder/commit/dd6d704ea5fc268fd60aa29861ac389fa1414969)_ — `app-builder-lib`
- Chore: prepare upgrade pathway for updating to latest `electron/____` npm packages that are ESM-only _[`#9792`](https://github.com/electron-userland/electron-builder/pull/9792) [`571d22b`](https://github.com/electron-userland/electron-builder/commit/571d22bd38fd8719aa4d3eb429ccf5598753a220)_ — `app-builder-lib`
- Chore: stabilize flaky CI tests (electron zip ENOENT, 5xx retries, snap timeouts) _[`#9795`](https://github.com/electron-userland/electron-builder/pull/9795) [`59efef1`](https://github.com/electron-userland/electron-builder/commit/59efef1a8b81ed1ead4e8004043726d2b49cf81f)_ — `app-builder-lib`, `builder-util-runtime`
- Fix(nsis-web): `appPackageUrl`: stop appending arch macro to paths with explicit URLs _[`#9655`](https://github.com/electron-userland/electron-builder/pull/9655) [`73bb547`](https://github.com/electron-userland/electron-builder/commit/73bb547b8dfc5efb40e1df734fa2f92c070552b4)_ — `app-builder-lib`
- Fix(appimage): fully migrate from app-builder-bin AppImage implementation to leverage JS-only approach _[`#9797`](https://github.com/electron-userland/electron-builder/pull/9797) [`98174e1`](https://github.com/electron-userland/electron-builder/commit/98174e147836c178034b237eb125c5cabe4fc253)_ — `app-builder-lib`
- Chore: Serialize concurrent downloads of the same artifact across vitest workers to prevent `@electron/get`'s non-atomic `putFileInCache` (remove + move) from racing with a concurrent reader. _[`#9798`](https://github.com/electron-userland/electron-builder/pull/9798) [`f3c4d88`](https://github.com/electron-userland/electron-builder/commit/f3c4d8810137f1beae592524019882cf97067f07)_ — `app-builder-lib`
- Fix(appimage): bundle FUSE2 runtime libraries for x64/ia32, matching Go implementation _[`#9799`](https://github.com/electron-userland/electron-builder/pull/9799) [`4e97804`](https://github.com/electron-userland/electron-builder/commit/4e9780454618518f1d532a1479a751368a5f7fe7)_ — `app-builder-lib`
- Fix: Use `desktopName` from `package.json` for `StartupWMClass` in Linux desktop entries _[`#9574`](https://github.com/electron-userland/electron-builder/pull/9574) [`fa2285c`](https://github.com/electron-userland/electron-builder/commit/fa2285cc563a7f068c93bc5b1b8e5d68fb6d1668)_ — `app-builder-lib`

## electron-updater@6.8.8

### Patch Changes

- Chore: stabilize flaky CI tests (electron zip ENOENT, 5xx retries, snap timeouts) _[`#9795`](https://github.com/electron-userland/electron-builder/pull/9795) [`59efef1`](https://github.com/electron-userland/electron-builder/commit/59efef1a8b81ed1ead4e8004043726d2b49cf81f)_ — `builder-util-runtime`
- Fix: harden the auto-update flow relative paths in PATH, path traversals, and environment variable intercepts _[`#9796`](https://github.com/electron-userland/electron-builder/pull/9796) [`2dc409f`](https://github.com/electron-userland/electron-builder/commit/2dc409f1e4ab1c82795ad731a50beb1296315730)_
- Chore: extracting helper function to add coverage in MacUpdater test suite _[`#9794`](https://github.com/electron-userland/electron-builder/pull/9794) [`d664ed0`](https://github.com/electron-userland/electron-builder/commit/d664ed0968e6c4010688eebe97babcfe5e43bd51)_
- Fix(updater): ensure full changelog includes only release notes up to the latest release _[`#9573`](https://github.com/electron-userland/electron-builder/pull/9573) [`ac45083`](https://github.com/electron-userland/electron-builder/commit/ac450835015b18720c5bc5de0221b4c770d0fac2)_



# [26.12.1](https://github.com/electron-userland/electron-builder/compare/electron-builder@26.12.0...electron-builder@26.12.1) (2026-05-30)

## electron-builder@26.12.1

### Patch Changes

- Fix: harden generated-file output, argument construction, and download validation _[`#9778`](https://github.com/electron-userland/electron-builder/pull/9778) [`d6a5aee`](https://github.com/electron-userland/electron-builder/commit/d6a5aee821138449dc0c082606da6a1bf5ba0798)_ — `electron-builder`, `app-builder-lib`, `builder-util`, `builder-util-runtime`, `dmg-builder`
- Fix(codeql): resolving GH CodeQL alerts _[`#9783`](https://github.com/electron-userland/electron-builder/pull/9783) [`4866737`](https://github.com/electron-userland/electron-builder/commit/4866737e4fe1f0cca210d318b9ce440f8e978a63)_ — `app-builder-lib`, `builder-util`, `builder-util-runtime`, `electron-builder-squirrel-windows`
- Chore: provide better error messaging when electron version in devDependencies or electronVersion property are not pinned _[`#9785`](https://github.com/electron-userland/electron-builder/pull/9785) [`f9ecb3c`](https://github.com/electron-userland/electron-builder/commit/f9ecb3c3f985ec999c3c8ba07e6054b0611284b6)_ — `app-builder-lib`
- Fix: properly parse and pass through `mas` configs to overwrite `mac` config when target is `mas` or `mas-dev` _[`#9567`](https://github.com/electron-userland/electron-builder/pull/9567) [`2c4cfa4`](https://github.com/electron-userland/electron-builder/commit/2c4cfa405303fe67008cce2d95a2645014e8e8e2)_ — `app-builder-lib`
- Fix: `nsisEscapeString` incorrectly converting INSTDIR runtime var to double-$$ _[`#9788`](https://github.com/electron-userland/electron-builder/pull/9788) [`3f4f773`](https://github.com/electron-userland/electron-builder/commit/3f4f773970db92d8fbac31cbc90dfaa0cd08d2f1)_ — `app-builder-lib`

## electron-updater@6.8.7

### Patch Changes

- Fix: harden generated-file output, argument construction, and download validation _[`#9778`](https://github.com/electron-userland/electron-builder/pull/9778) [`d6a5aee`](https://github.com/electron-userland/electron-builder/commit/d6a5aee821138449dc0c082606da6a1bf5ba0798)_ — `builder-util-runtime`
- Fix(codeql): resolving GH CodeQL alerts _[`#9783`](https://github.com/electron-userland/electron-builder/pull/9783) [`4866737`](https://github.com/electron-userland/electron-builder/commit/4866737e4fe1f0cca210d318b9ce440f8e978a63)_ — `builder-util-runtime`



# [26.12.0](https://github.com/electron-userland/electron-builder/compare/electron-builder@26.11.1...electron-builder@26.12.0) (2026-05-29)

## electron-builder@26.12.0

### Minor Changes

- Feat(linux): replace legacy `linux-tools-mac` toolset with v1.0.0 for macOS deb/tar builds for packaging or extracting Linux archives _[`#9767`](https://github.com/electron-userland/electron-builder/pull/9767) [`9a31b4e`](https://github.com/electron-userland/electron-builder/commit/9a31b4eac3155a9eea9bca9593fd616aa1098b73)_ — `app-builder-lib`
- Feat: adding support for core24 snapcraft and refactoring support to a new config property `snapcraft` to maintain backward compatibility _[`#9517`](https://github.com/electron-userland/electron-builder/pull/9517) [`059fffd`](https://github.com/electron-userland/electron-builder/commit/059fffd5b9aabd72e9a8b592b9b7cef4a9e063ef)_ — `app-builder-lib`, `builder-util`, `electron-publish`
- Feat(nsis): adding `nsis` toolset configuration for makensis _[`#9768`](https://github.com/electron-userland/electron-builder/pull/9768) [`2181fd0`](https://github.com/electron-userland/electron-builder/commit/2181fd02850101002fd82e463b9e0ed93d44fc7b)_ — `app-builder-lib`, `builder-util`

### Patch Changes

- Fix: add toolset lockfile for operations that leverage system utils that don't support parallelism (e.g. hdiutil, WiX, etc.) _[`#9761`](https://github.com/electron-userland/electron-builder/pull/9761) [`7955d66`](https://github.com/electron-userland/electron-builder/commit/7955d66682ac5c6c7e74d7c33221d033241294c1)_ — `app-builder-lib`, `dmg-builder`, `electron-builder-squirrel-windows`
- Chore: adding additional validations to downloads and child processes _[`#9762`](https://github.com/electron-userland/electron-builder/pull/9762) [`bfd1c1b`](https://github.com/electron-userland/electron-builder/commit/bfd1c1bb23b985b3fc44bcb4bb028fa0496d4638)_ — `app-builder-lib`, `builder-util`
- Chore(deps): update dependency minimatch to v10.2.5 [security] _[`#9601`](https://github.com/electron-userland/electron-builder/pull/9601) [`65ff591`](https://github.com/electron-userland/electron-builder/commit/65ff5915655a3ec1320815c0bf354301d51735c6)_ — `app-builder-lib`
- Fix: make update info have a deterministic ordering of files _[`#9758`](https://github.com/electron-userland/electron-builder/pull/9758) [`5dbba8c`](https://github.com/electron-userland/electron-builder/commit/5dbba8c4aa7becc357f9b5439c55641aedf2e18b)_ — `app-builder-lib`
- Fix(nsis): safely copy UserProgramFiles path _[`#9769`](https://github.com/electron-userland/electron-builder/pull/9769) [`a356198`](https://github.com/electron-userland/electron-builder/commit/a356198ec7c54c7795659342bff36d9a5162cd93)_ — `app-builder-lib`
- Fix: avoid system path on windows for cache when user is `system` OR path is `system32` _[`#9776`](https://github.com/electron-userland/electron-builder/pull/9776) [`ab6ada8`](https://github.com/electron-userland/electron-builder/commit/ab6ada8dc2ca375687a8e89fd367b34e4f7a62e5)_ — `electron-builder`, `app-builder-lib`
- Fix(node-module-collector): emit warn-level log for missing platform-specific optional packages with actionable suggestion to add them to optionalDependencies _[`#9777`](https://github.com/electron-userland/electron-builder/pull/9777) [`a4ece30`](https://github.com/electron-userland/electron-builder/commit/a4ece30c0e2b32b154503979b303c46b2ba9a5ab)_ — `app-builder-lib`
- Fix(mac): `electronLanguages` option is not correctly applied for Mac platform _[`#9779`](https://github.com/electron-userland/electron-builder/pull/9779) [`5b83914`](https://github.com/electron-userland/electron-builder/commit/5b839143bb44819609218acfe79c2dd1ea48e662)_ — `app-builder-lib`
- Chore: increase timeout and retries on toolset lockfiles _[`#9780`](https://github.com/electron-userland/electron-builder/pull/9780) [`0fd0f4f`](https://github.com/electron-userland/electron-builder/commit/0fd0f4f648d732f177354e8bff35efdebd64f62c)_ — `app-builder-lib`



# [26.11.1](https://github.com/electron-userland/electron-builder/compare/electron-builder@26.11.0...electron-builder@26.11.1) (2026-05-21)

## electron-builder@26.11.1

### Patch Changes

- Fix: allow mac entitlement files to be linked from outside the workspace _[`#9756`](https://github.com/electron-userland/electron-builder/pull/9756) [`e22295f`](https://github.com/electron-userland/electron-builder/commit/e22295f74f0e6e1059a13ee87b63f44955e0d95f)_ — `app-builder-lib`
- Fix: always pass through resolved artifact url to `electron/get` to avoid env var overrides _[`#9755`](https://github.com/electron-userland/electron-builder/pull/9755) [`35c2c7a`](https://github.com/electron-userland/electron-builder/commit/35c2c7aad9b97e227b4d3dfba3762550d8a32e1f)_ — `app-builder-lib`
- Fix: force `electron/get`'s internal `got` downloader to respect http(s) proxies _[`#9754`](https://github.com/electron-userland/electron-builder/pull/9754) [`b8c6a15`](https://github.com/electron-userland/electron-builder/commit/b8c6a1545b61d3c285f28d39100e9c7ff4e4192f)_ — `app-builder-lib`, `builder-util`
- Fix: wrap any collector path in a .bat on Windows if path has a space in it _[`#9759`](https://github.com/electron-userland/electron-builder/pull/9759) [`139ac27`](https://github.com/electron-userland/electron-builder/commit/139ac274e840ed53281807d6cc7c57fd31e91809)_ — `app-builder-lib`



# [26.11.0](https://github.com/electron-userland/electron-builder/compare/electron-builder@26.10.0...electron-builder@26.11.0) (2026-05-19)

## electron-builder@26.11.0

### Minor Changes

- Feat: migrate to `resedit` npm package from `app-builder-bin`'s usage of `rcedit.exe` _[`#9717`](https://github.com/electron-userland/electron-builder/pull/9717) [`403706b`](https://github.com/electron-userland/electron-builder/commit/403706be7efd887ce3f2fb4d86c854b733262dff)_ — `app-builder-lib`
- Feat(win): adding config property to allow disabling signing without disabling editing the executable _[`#9708`](https://github.com/electron-userland/electron-builder/pull/9708) [`3199d18`](https://github.com/electron-userland/electron-builder/commit/3199d186678cc26917b47e7ef39c7ca10ab3a89a)_ — `app-builder-lib`
- Feat: add CLI action to clear the electron-builder default cache directory (env var override intentionally ignored for security) _[`#9739`](https://github.com/electron-userland/electron-builder/pull/9739) [`0361243`](https://github.com/electron-userland/electron-builder/commit/0361243edcef6807ae81f18ae7e083c796dcab94)_ — `electron-builder`, `app-builder-lib`

### Patch Changes

- Chore: add more validations, incl. compression levels, vendor toolsets, and invalid configs _[`#9724`](https://github.com/electron-userland/electron-builder/pull/9724) [`d7a341d`](https://github.com/electron-userland/electron-builder/commit/d7a341dc5b8d4545ab861d7a49cbd313ec4b72a4)_ — `app-builder-lib`, `dmg-builder`
- Fix(mac): correctly copy `extraFiles` to `productFilename` `.app` instead of `Electron.app` _[`#9729`](https://github.com/electron-userland/electron-builder/pull/9729) [`6d3798e`](https://github.com/electron-userland/electron-builder/commit/6d3798e59b2c7149d5127ac61ec4a216c33b2bc1)_ — `app-builder-lib`
- Fix(win): recover signing queue after transient errors _[`#9657`](https://github.com/electron-userland/electron-builder/pull/9657) [`65e5318`](https://github.com/electron-userland/electron-builder/commit/65e5318c50eeefa41b61415a0917e26709bb602a)_ — `app-builder-lib`
- Perf(pnpm): memoize package resolution and skip downward search in flat virtual store. _[`#9732`](https://github.com/electron-userland/electron-builder/pull/9732) [`a2fc793`](https://github.com/electron-userland/electron-builder/commit/a2fc7932b6955744a394e24b5da5c1ce03e68067)_ — `app-builder-lib`
- Fix: improving filtering of log redactor and adding support for filtering out potentially-sensitive env vars _[`#9736`](https://github.com/electron-userland/electron-builder/pull/9736) [`56d8331`](https://github.com/electron-userland/electron-builder/commit/56d83314596803e4c3973b3c2a4eb2b838eb0edf)_ — `builder-util`
- Fix: update dmg-builder toolset for usage on older macos (decoupling from homebrew packages) _[`#9738`](https://github.com/electron-userland/electron-builder/pull/9738) [`0a46eb1`](https://github.com/electron-userland/electron-builder/commit/0a46eb1869fa8d77b2f7e8bf47376d60e7d640b2)_ — `dmg-builder`
- Fix: add cache corruption/extraction detection to prevent malformed 7z extractions _[`#9735`](https://github.com/electron-userland/electron-builder/pull/9735) [`3d2f660`](https://github.com/electron-userland/electron-builder/commit/3d2f66032675540a6ec3699496b02ba5d70214ed)_ — `app-builder-lib`
- Fix: update dmgbuild to 1.2.2 and add mac_alias test case _[`#9740`](https://github.com/electron-userland/electron-builder/pull/9740) [`26ce28c`](https://github.com/electron-userland/electron-builder/commit/26ce28c79ef42a7f80a91e9a68eba22dc4ca8150)_ — `dmg-builder`
- Fix: prevent double progress bar from displaying _[`#9743`](https://github.com/electron-userland/electron-builder/pull/9743) [`2583fd1`](https://github.com/electron-userland/electron-builder/commit/2583fd17b1ef6d752b00df7302294dc13d3dfb9d)_ — `app-builder-lib`, `electron-publish`
- Chore(docs): adding more tsdoc to target configuration \_\_\_\_Options _[`#9741`](https://github.com/electron-userland/electron-builder/pull/9741) [`02ca7cf`](https://github.com/electron-userland/electron-builder/commit/02ca7cf360c16f460008f9c5dc15f38e1ae88e2b)_ — `app-builder-lib`
- Fix(appimage): fix compression mapping and add per-target squashfs algorithm overrides _[`#9730`](https://github.com/electron-userland/electron-builder/pull/9730) [`8a98647`](https://github.com/electron-userland/electron-builder/commit/8a98647f79c19fff7e7f5347d0a1ff80db18520e)_ — `app-builder-lib`, `builder-util`
- Chore(docs): documentation updates and docusaurus migration _[`#9744`](https://github.com/electron-userland/electron-builder/pull/9744) [`d846315`](https://github.com/electron-userland/electron-builder/commit/d84631587d816a1aa0bff57680bab0f865d7a84f)_ — `electron-builder`, `app-builder-lib`, `builder-util`, `builder-util-runtime`, `dmg-builder`, `electron-builder-squirrel-windows`, `electron-publish`

## electron-updater@6.8.6

### Patch Changes

- Chore(docs): documentation updates and docusaurus migration _[`#9744`](https://github.com/electron-userland/electron-builder/pull/9744) [`d846315`](https://github.com/electron-userland/electron-builder/commit/d84631587d816a1aa0bff57680bab0f865d7a84f)_ — `electron-updater`, `builder-util-runtime`



# [26.10.0](https://github.com/electron-userland/electron-builder/compare/electron-builder@26.9.1...electron-builder@26.10.0) (2026-05-11)

## electron-builder@26.10.0

### Minor Changes

- Feat: migrate `electronDownload` to use `electron/get` official package. provides much better support for mirrors _[`#8827`](https://github.com/electron-userland/electron-builder/pull/8827) [`c82bec1`](https://github.com/electron-userland/electron-builder/commit/c82bec161d07b1df8adc5cd80a495c4ff0829373)_ — `app-builder-lib`, `builder-util`

### Patch Changes

- Chore: adding hardening to resolving scripts to be within the workspace directory, utilize deepAssign helper utility, and escape command used within node module collector _[`#9712`](https://github.com/electron-userland/electron-builder/pull/9712) [`b13aa95`](https://github.com/electron-userland/electron-builder/commit/b13aa953eafa03923474217c451e2799be33d33a)_ — `app-builder-lib`
- Chore(builder-util): add engines field to package.json _[`#9671`](https://github.com/electron-userland/electron-builder/pull/9671) [`5be28a6`](https://github.com/electron-userland/electron-builder/commit/5be28a61de2aa1f344651a506044b2e897832660)_ — `builder-util`
- Chore: swap app-builder-bin binDownload logic for @electron/get implementation _[`#9718`](https://github.com/electron-userland/electron-builder/pull/9718) [`b5cef28`](https://github.com/electron-userland/electron-builder/commit/b5cef28776f6f26408135d2821185a3ff1785553)_ — `app-builder-lib`, `electron-builder-squirrel-windows`
- Fix: add support for pnpm v11 _[`#9720`](https://github.com/electron-userland/electron-builder/pull/9720) [`7751ace`](https://github.com/electron-userland/electron-builder/commit/7751acea613f1a85d1585edabd7a77bb0699af78)_ — `app-builder-lib`
- Fix(appimage): add unit tests for applauncher and util, validate env vars, and skip unexpected mime types _[`#9723`](https://github.com/electron-userland/electron-builder/pull/9723) [`bd35730`](https://github.com/electron-userland/electron-builder/commit/bd3573018f01d24e4da86e060f1201964a6d3ada)_ — `app-builder-lib`



# [26.9.1](https://github.com/electron-userland/electron-builder/compare/electron-builder@26.9.0...electron-builder@26.9.1) (2026-05-07)

## electron-builder@26.9.1

### Patch Changes

- Fix: convert file path via vm.toVmFile() in windowsSignAzureManager _[`#9676`](https://github.com/electron-userland/electron-builder/pull/9676) [`5c945b2`](https://github.com/electron-userland/electron-builder/commit/5c945b21f775b8dead1d5afb508517c43c31ef6e)_ — `app-builder-lib`
- Fix(nsis): removing windows azure trusted signing preflight checks since TrustedSigning module has its own logging _[`#9687`](https://github.com/electron-userland/electron-builder/pull/9687) [`a4f2d98`](https://github.com/electron-userland/electron-builder/commit/a4f2d98a64087a0fc822e574d033b7770697b09e)_ — `app-builder-lib`
- Fix: bundling source files when using extraMetadata.name in Yarn Berry _[`#9683`](https://github.com/electron-userland/electron-builder/pull/9683) [`9bc2626`](https://github.com/electron-userland/electron-builder/commit/9bc26260e1e1b314325227fac7c58ac6085d1fe0)_ — `app-builder-lib`
- Fix: include workspaceRoot when checking for installed dependencies in installOrRebuild to prevent infinite npm install recursion when install-app-deps runs from a workspace member's postinstall in npm workspaces _[`#9692`](https://github.com/electron-userland/electron-builder/pull/9692) [`a821ae8`](https://github.com/electron-userland/electron-builder/commit/a821ae8bff54aff563c39414e1134dfad862814a)_ — `app-builder-lib`
- Fix Windows node module collection failure when spaces are in package manager executable's path _[`#9695`](https://github.com/electron-userland/electron-builder/pull/9695) [`9967672`](https://github.com/electron-userland/electron-builder/commit/99676722552714a97c2285b170230ef941d411c0)_ — `app-builder-lib`
- Fix: properly resolve package `version --> path` within pnpm virtual store _[`#9698`](https://github.com/electron-userland/electron-builder/pull/9698) [`fb92196`](https://github.com/electron-userland/electron-builder/commit/fb921963168cf654e05e5230b2ca1280a326667c)_ — `app-builder-lib`

## electron-updater@6.8.5

### Patch Changes

- Fix(electron-updater): filter draft releases in PrivateGitHubProvider.getLatestVersionInfo _[`#9694`](https://github.com/electron-userland/electron-builder/pull/9694) [`a5d8ab9`](https://github.com/electron-userland/electron-builder/commit/a5d8ab9436dd7db0c58a08cf9594e47613c4fc8e)_
- Fix: GitLab auth token differs between fetching channel yaml & API requests _[`#9703`](https://github.com/electron-userland/electron-builder/pull/9703) [`4bcf68a`](https://github.com/electron-userland/electron-builder/commit/4bcf68abc957faae827ca50fa5c1bed3ddf7c956)_



# [26.9.0](https://github.com/electron-userland/electron-builder/compare/electron-builder@26.8.2...electron-builder@26.9.0) (2026-04-14)

## electron-builder@26.9.0

### Minor Changes

- Feat: pass release notes to GitHub/GitLab release body via `releaseBody` and `releaseName` options _[`#9581`](https://github.com/electron-userland/electron-builder/pull/9581) [`b7df0bc`](https://github.com/electron-userland/electron-builder/commit/b7df0bcef5790814fd6df187346dcec625dc681e)_ — `app-builder-lib`, `builder-util-runtime`, `electron-publish`
- Feat(nsis): detect windows version and exclude win 7 compatibility logic when not needed _[`#9564`](https://github.com/electron-userland/electron-builder/pull/9564) [`13d8535`](https://github.com/electron-userland/electron-builder/commit/13d85355b6d37bd82d5153d260ba11de71323875)_ — `app-builder-lib`
- Feat: If necessary, start with --no-sandbox _[`#9590`](https://github.com/electron-userland/electron-builder/pull/9590) [`ed422f3`](https://github.com/electron-userland/electron-builder/commit/ed422f36540a93e9bd2a19bc7a5e729bf2b033ea)_ — `app-builder-lib`

### Patch Changes

- Fix: respect electron_builder_binaries_mirror in downloadArtifact _[`#9631`](https://github.com/electron-userland/electron-builder/pull/9631) [`0c8fc41`](https://github.com/electron-userland/electron-builder/commit/0c8fc415debf0dc7e19e8ffd9c06db100ef41f11)_ — `app-builder-lib`

  downloadArtifact() was ignoring electron_builder_binaries_mirror and falling back
  to electron_mirror due to @electron/get behavior. This affected dmg-builder
  (macOS) and appimage-tools (Linux) downloads.

  - Extract getBinariesMirrorUrl() to share mirror URL resolution
  - Use the helper in both downloadArtifact() and getBinFromUrl()
  - Ensure custom mirrors are respected for all binary downloads
- Fix(appimage): use /usr/bin/env in hashbang so it works in non FHS distros _[`#9664`](https://github.com/electron-userland/electron-builder/pull/9664) [`f71b101`](https://github.com/electron-userland/electron-builder/commit/f71b101be964bdcc2b84fcf281441372105def00)_ — `app-builder-lib`
- Fix: parseNameVersion correctly splits scoped packages with link: paths _[`#9653`](https://github.com/electron-userland/electron-builder/pull/9653) [`a69928f`](https://github.com/electron-userland/electron-builder/commit/a69928f28cd33a487a3158bd5c3ad040906d3c30)_ — `app-builder-lib`
- Fix(normalizePackageData): check bd variable instead of string "bd" _[`#9669`](https://github.com/electron-userland/electron-builder/pull/9669) [`b072e92`](https://github.com/electron-userland/electron-builder/commit/b072e92bd31b84df506deaf6156cc6109c7ef0f5)_ — `app-builder-lib`
- Fix(appimage): add entry for patched appimage toolset bundle to resolve issues on Ubuntu 25.1.0 _[`#9673`](https://github.com/electron-userland/electron-builder/pull/9673) [`3958d8b`](https://github.com/electron-userland/electron-builder/commit/3958d8b6cb7b74458ea541738af6ac753d2cf83a)_ — `app-builder-lib`

## electron-updater@6.8.4

### Minor Changes

- Feat: pass release notes to GitHub/GitLab release body via `releaseBody` and `releaseName` options _[`#9581`](https://github.com/electron-userland/electron-builder/pull/9581) [`b7df0bc`](https://github.com/electron-userland/electron-builder/commit/b7df0bcef5790814fd6df187346dcec625dc681e)_ — `builder-util-runtime`



# [26.8.2](https://github.com/electron-userland/electron-builder/compare/electron-builder@26.8.1...electron-builder@26.8.2) (2026-03-04)

## electron-builder@26.8.2

### Patch Changes

- Fix: filter electronLanguages with startsWith filter for generous matching _[`#9605`](https://github.com/electron-userland/electron-builder/pull/9605) [`f2c0547`](https://github.com/electron-userland/electron-builder/commit/f2c0547d2fa63d42636713415d4100aceb443e00)_ — `app-builder-lib`
- Fix: regenerate schema to unblock CI _[`#9608`](https://github.com/electron-userland/electron-builder/pull/9608) [`4e83aeb`](https://github.com/electron-userland/electron-builder/commit/4e83aeb610aad811413bfd626656dabc081957a3)_ — `app-builder-lib`
- Fix(win): regenerate app exe if header of the asar has changed so that asar integrity properly matches _[`#9607`](https://github.com/electron-userland/electron-builder/pull/9607) [`02a9105`](https://github.com/electron-userland/electron-builder/commit/02a9105d1c4420e418d740dfa0bbbd22d5b44735)_ — `app-builder-lib`
- Fix mksquashfs ENOENT when appimage tool paths are relative _[`#9610`](https://github.com/electron-userland/electron-builder/pull/9610) [`52dc667`](https://github.com/electron-userland/electron-builder/commit/52dc6676f8fb8157e60a55df8021988bf6c48286)_ — `app-builder-lib`
- Fix(squirrel-windows): remove spurious default vendor warning _[`#9595`](https://github.com/electron-userland/electron-builder/pull/9595) [`5d4651d`](https://github.com/electron-userland/electron-builder/commit/5d4651dbb29d0730d0fb3be96de79d9348c0a99c)_ — `electron-builder-squirrel-windows`
- Fix: handle pnpm deduped dependencies correctly in node module collector _[`#9618`](https://github.com/electron-userland/electron-builder/pull/9618) [`b348df0`](https://github.com/electron-userland/electron-builder/commit/b348df0ba409fee488288ead097ac900141a6dad)_ — `app-builder-lib`



# [26.8.1](https://github.com/electron-userland/electron-builder/compare/electron-builder@26.8.0...electron-builder@26.8.1) (2026-02-16)

## electron-builder@26.8.1

### Patch Changes

- Fix: use package key when reading from dependency list instead of package `from` to not mislabel package-version strings _[`#9583`](https://github.com/electron-userland/electron-builder/pull/9583) [`dde4309`](https://github.com/electron-userland/electron-builder/commit/dde4309b9114e06d0826e8badc2cb968ceb75642)_ — `app-builder-lib`
- Chore: add logging summary to end of node collector to flag any special cases/alerts _[`#9587`](https://github.com/electron-userland/electron-builder/pull/9587) [`4edd695`](https://github.com/electron-userland/electron-builder/commit/4edd6950454d369ef8994e5a1ad64f1d0c7b7643)_ — `app-builder-lib`
- Chore: removing unused `notice` LogLevel _[`#9587`](https://github.com/electron-userland/electron-builder/pull/9587) [`4edd695`](https://github.com/electron-userland/electron-builder/commit/4edd6950454d369ef8994e5a1ad64f1d0c7b7643)_ — `builder-util`
- Fix(AppImage): fix mime type directory in AppDir _[`#9589`](https://github.com/electron-userland/electron-builder/pull/9589) [`8940ec6`](https://github.com/electron-userland/electron-builder/commit/8940ec63bac6450ed9b7c5e761954f08e6fa4242)_ — `app-builder-lib`



# [26.8.0](https://github.com/electron-userland/electron-builder/compare/electron-builder@26.7.0...electron-builder@26.8.0) (2026-02-12)

## electron-builder@26.8.0

### Minor Changes

- Feat(win): adding support for latest artifacts for win-codesign tooling to be pulled from `electron-builder-binaries` _[`#9430`](https://github.com/electron-userland/electron-builder/pull/9430) [`1b39a8e`](https://github.com/electron-userland/electron-builder/commit/1b39a8e23c019a0e61fbe1fe5e973113036d255b)_ — `electron-builder`, `app-builder-lib`
- Feat: adding support for static appimage runtime via new toolset _[`#9558`](https://github.com/electron-userland/electron-builder/pull/9558) [`c18f0eb`](https://github.com/electron-userland/electron-builder/commit/c18f0eb26bd9ba366b45e0ff9e85cdee0daba4ef)_ — `app-builder-lib`

### Patch Changes

- Refactor: simplify YarnNodeModulesCollector by extending NpmNodeModulesCollector _[`#9506`](https://github.com/electron-userland/electron-builder/pull/9506) [`1b113b7`](https://github.com/electron-userland/electron-builder/commit/1b113b758dffa346df8dce91185800293a68b6fd)_ — `app-builder-lib`
- Fix: Windows build failure due to Node.js path with spaces _[`#9566`](https://github.com/electron-userland/electron-builder/pull/9566) [`769b608`](https://github.com/electron-userland/electron-builder/commit/769b6080a7258205e2ea7cac74526765b80f7e0f)_ — `app-builder-lib`
- Chore: silence test console logging and throw more helpful error in msiWrapped targetr _[`#9572`](https://github.com/electron-userland/electron-builder/pull/9572) [`cd7c0d9`](https://github.com/electron-userland/electron-builder/commit/cd7c0d9a73cf63e2125ef5873bd0c2f392c211dc)_ — `app-builder-lib`, `builder-util`
- Chore: allow `link:` support for package detection to mirror current `file:` parsing _[`#9578`](https://github.com/electron-userland/electron-builder/pull/9578) [`9ba36f9`](https://github.com/electron-userland/electron-builder/commit/9ba36f98791bc8d2393297dbca1133d03be6260a)_ — `builder-util`

## electron-updater@6.8.3

### Patch Changes

- Chore: Remove console logs for autoupdate checks _[`#9561`](https://github.com/electron-userland/electron-builder/pull/9561) [`9c67fd3`](https://github.com/electron-userland/electron-builder/commit/9c67fd31ce982d11c82aae71263ba1f0055a77cc)_



# [26.7.0](https://github.com/electron-userland/electron-builder/compare/electron-builder@26.6.0...electron-builder@26.7.0) (2026-01-31)

## electron-builder@26.7.0

### Minor Changes

- Feat: add `size` and `shrink` options to DmgOptions for explicit DMG filesystem size control _[`#9543`](https://github.com/electron-userland/electron-builder/pull/9543) [`bfee115`](https://github.com/electron-userland/electron-builder/commit/bfee115b185fa4dcb14b0fae6ccee1adc4d4590e)_ — `app-builder-lib`, `dmg-builder`
- Adding optional config property `capabilities` to AppxOptions (#9436) _[`#9437`](https://github.com/electron-userland/electron-builder/pull/9437) [`3fa2d89`](https://github.com/electron-userland/electron-builder/commit/3fa2d894ac609d0d819d7adb80ff50bfca08039f)_ — `app-builder-lib`

### Patch Changes

- Chore(deps): update `tar` again _[`#9547`](https://github.com/electron-userland/electron-builder/pull/9547) [`64b40fe`](https://github.com/electron-userland/electron-builder/commit/64b40fe75a5464db19721e5a6dd9a6930196aaac)_ — `app-builder-lib`
- Fix(linux): after-install.tpl: Fix `stdio` redirects in `update-alternative` invocation _[`#9536`](https://github.com/electron-userland/electron-builder/pull/9536) [`ec9e2db`](https://github.com/electron-userland/electron-builder/commit/ec9e2dbbd864f0858cf0d3b719ad75a84c59f29c)_ — `app-builder-lib`
- Fix: properly detecting npm duplicate entries and correlating `_dependencies` property against any duplicated `dependencies`. (npm collector also covers yarn berry) _[`#9548`](https://github.com/electron-userland/electron-builder/pull/9548) [`aec9157`](https://github.com/electron-userland/electron-builder/commit/aec9157b5124acf9409a46461eca86cb1212831b)_ — `app-builder-lib`

## electron-updater@6.8.2

### Patch Changes

- Fix(updater): ignore releases with non-semver tags when collecting full changelog _[`#9550`](https://github.com/electron-userland/electron-builder/pull/9550) [`8aee1e6`](https://github.com/electron-userland/electron-builder/commit/8aee1e6944afae05a60d2a392743a78f818ee6de)_



# [26.6.0](https://github.com/electron-userland/electron-builder/compare/electron-builder@26.5.0...electron-builder@26.6.0) (2026-01-27)

## electron-builder@26.6.0

### Minor Changes

- Feat(flatpak): use configuration for `executableArgs` _[`#9530`](https://github.com/electron-userland/electron-builder/pull/9530) [`d56550f`](https://github.com/electron-userland/electron-builder/commit/d56550f75828ef3c097377264336794f2f65da86)_ — `app-builder-lib`

### Patch Changes

- Fix(nsis): allow $INSTDIR to be removed _[`#9520`](https://github.com/electron-userland/electron-builder/pull/9520) [`cf10da8`](https://github.com/electron-userland/electron-builder/commit/cf10da8d4988399232e5db62fe533789bdc816b2)_ — `app-builder-lib`
- Fix: pnpm collector returning zero modules _[`#9535`](https://github.com/electron-userland/electron-builder/pull/9535) [`88070e9`](https://github.com/electron-userland/electron-builder/commit/88070e95e602aa1e6985d770cb4c279fea58a4a6)_ — `app-builder-lib`
- Feat: update `dmgbuild` and migrate to portable `dmgbuild` python bundle. Fixes `badge-icon` property _[`#9516`](https://github.com/electron-userland/electron-builder/pull/9516) [`9b1dbb2`](https://github.com/electron-userland/electron-builder/commit/9b1dbb2f56662b2072662ed7432228e1c4437640)_ — `app-builder-lib`, `dmg-builder`
- Chore(deps): updating electron/rebuild, tar, and form-data to latest releases _[`#9528`](https://github.com/electron-userland/electron-builder/pull/9528) [`e46b407`](https://github.com/electron-userland/electron-builder/commit/e46b4074edf8c74849738d2dafcdb106da47e27c)_ — `app-builder-lib`, `electron-publish`



# [26.5.0](https://github.com/electron-userland/electron-builder/compare/electron-builder@26.4.1...electron-builder@26.5.0) (2026-01-19)

## electron-builder@26.5.0

### Minor Changes

- Feat: add support for dmgbuild's badge-icon configuration _[`#9513`](https://github.com/electron-userland/electron-builder/pull/9513) [`b1d6e24`](https://github.com/electron-userland/electron-builder/commit/b1d6e2417001977d12dc8365e6c5ceb5ac9d49c9)_ — `app-builder-lib`, `dmg-builder`

### Patch Changes

- Chore: running `eslint --fix` on more files _[`#9502`](https://github.com/electron-userland/electron-builder/pull/9502) [`6c20eeb`](https://github.com/electron-userland/electron-builder/commit/6c20eeb1cf9fd10980cde3c9ce0602fa6b7c6972)_ — `app-builder-lib`
- Chore: fix dmg background by updating vendor dmgbuild _[`#9512`](https://github.com/electron-userland/electron-builder/pull/9512) [`666d85a`](https://github.com/electron-userland/electron-builder/commit/666d85a8b626492c8195355d3d152f76c96bcb8f)_ — `dmg-builder`
- Chore: update tar to latest release 7.5.3 to resolve dependabot _[`#9514`](https://github.com/electron-userland/electron-builder/pull/9514) [`2c11709`](https://github.com/electron-userland/electron-builder/commit/2c11709b6a330628095ec46c51435a40b6761710)_ — `app-builder-lib`
- Fix: Windows build fails with spawn EINVAL after Node.js security fix _[`#9489`](https://github.com/electron-userland/electron-builder/pull/9489) [`3022f0f`](https://github.com/electron-userland/electron-builder/commit/3022f0f840c893d14beb82d638bedb8ed27d7ae6)_ — `app-builder-lib`

## electron-updater@6.8.1

### Patch Changes

- Chore: running `eslint --fix` on more files _[`#9502`](https://github.com/electron-userland/electron-builder/pull/9502) [`6c20eeb`](https://github.com/electron-userland/electron-builder/commit/6c20eeb1cf9fd10980cde3c9ce0602fa6b7c6972)_



# [26.4.1](https://github.com/electron-userland/electron-builder/compare/electron-builder@26.4.0...electron-builder@26.4.1) (2026-01-14)

## electron-builder@26.4.1

### Patch Changes

- Fix: post-process parent directories of unpacked files to avoid overeager unpacking _[`#9419`](https://github.com/electron-userland/electron-builder/pull/9419) [`1c94529`](https://github.com/electron-userland/electron-builder/commit/1c945290a38cc4b6070a4e756db58354aee5e683)_ — `app-builder-lib`
- Fix: pnpm "Invalid string length" errors during node module collection _[`#9470`](https://github.com/electron-userland/electron-builder/pull/9470) [`d38ae8e`](https://github.com/electron-userland/electron-builder/commit/d38ae8e666ca3769dfa091643ef816632f6e206f)_ — `app-builder-lib`
- Fix: delete default macOS appPlist keys using extendInfo when set Nullish _[`#9481`](https://github.com/electron-userland/electron-builder/pull/9481) [`cb5b9c6`](https://github.com/electron-userland/electron-builder/commit/cb5b9c6e47686b0329dbf808b36587a82db03d3b)_ — `app-builder-lib`
- Deprecate: warn about implicit publishing in CI _[`#9475`](https://github.com/electron-userland/electron-builder/pull/9475) [`ef43f42`](https://github.com/electron-userland/electron-builder/commit/ef43f42c2532ae3501071c6329f3dd058a91fd7f)_ — `app-builder-lib`
- Fix: update the `dmgbuild` hex regex for `backgroundColor` to be case insensitive _[`#9487`](https://github.com/electron-userland/electron-builder/pull/9487) [`c3af390`](https://github.com/electron-userland/electron-builder/commit/c3af390ec67becfe548a8c83f0d3ba828c28b751)_ — `dmg-builder`
- Fix: aliased packages not packaged with the correct name _[`#9492`](https://github.com/electron-userland/electron-builder/pull/9492) [`25b5dd2`](https://github.com/electron-userland/electron-builder/commit/25b5dd2b4a87554640c99ffef376af8703f69a3d)_ — `app-builder-lib`
- Chore: migrating manual Node Module collector to seperate filesystem traversal class _[`#9440`](https://github.com/electron-userland/electron-builder/pull/9440) [`97e5503`](https://github.com/electron-userland/electron-builder/commit/97e5503cecfcdfd9dddf1c4b321d52b5d5a94f83)_ — `app-builder-lib`, `builder-util`

## electron-updater@6.8.0

### Minor Changes

- Emit download-progress events when downloading with multiple range differential downloader _[`#9448`](https://github.com/electron-userland/electron-builder/pull/9448) [`3533a3e`](https://github.com/electron-userland/electron-builder/commit/3533a3eb5af01416db3ecac703d6da031b05e615)_



# [26.4.0](https://github.com/electron-userland/electron-builder/compare/electron-builder@26.3.6...electron-builder@26.4.0) (2025-12-20)

## electron-builder@26.4.0

### Minor Changes

- Feat: allow platform specific build options to override top-level publish configuration _[`#9425`](https://github.com/electron-userland/electron-builder/pull/9425) [`5f962f9`](https://github.com/electron-userland/electron-builder/commit/5f962f9cae875da1208caa96fe040b2fe9224ea7)_ — `app-builder-lib`

### Patch Changes

- Fix: disable corepack strict mode (with optional override) to allow `npm list` to work on yarn berry and bun project setups _[`#9443`](https://github.com/electron-userland/electron-builder/pull/9443) [`e70da99`](https://github.com/electron-userland/electron-builder/commit/e70da99e34c1cc913b237c5a58456bf752a378bc)_ — `app-builder-lib`
- Fix: search app directory before package directory to respect two-package.json project setups _[`#9450`](https://github.com/electron-userland/electron-builder/pull/9450) [`39ae6a7`](https://github.com/electron-userland/electron-builder/commit/39ae6a7fb7109e8ab865fd1438592440110f4b71)_ — `app-builder-lib`
- Chore: The url.parse() function has been deprecated in Node 24. Migrating to `url.URL` _[`#9417`](https://github.com/electron-userland/electron-builder/pull/9417) [`9110cb4`](https://github.com/electron-userland/electron-builder/commit/9110cb432e273d526e40f02337167544ed371605)_ — `app-builder-lib`
- Fix: add signing queue for Windows packager to avoid concurrent signing with AzureTrustedSigning _[`#9454`](https://github.com/electron-userland/electron-builder/pull/9454) [`b66832d`](https://github.com/electron-userland/electron-builder/commit/b66832d6fc633b4b12ccdffc0501c6d31b48a85e)_ — `app-builder-lib`
- Chore: cleanup logging for node module collectors by detecting non-installed optional deps _[`#9456`](https://github.com/electron-userland/electron-builder/pull/9456) [`78910a9`](https://github.com/electron-userland/electron-builder/commit/78910a913bb93c9e429bf8699338a8bf58f5d411)_ — `app-builder-lib`



# [26.3.6](https://github.com/electron-userland/electron-builder/compare/electron-builder@26.3.5...electron-builder@26.3.6) (2025-12-10)

## electron-builder@26.3.6

### Patch Changes

- Chore: retry cleanup on EBUSY errors _[`#9432`](https://github.com/electron-userland/electron-builder/pull/9432) [`693629c`](https://github.com/electron-userland/electron-builder/commit/693629c7990958ccbf60bd7d59824afc139dc1c2)_ — `app-builder-lib`
- Fix: ensure correct dependency graph extraction order and yarn berry \_dependencies support _[`#9439`](https://github.com/electron-userland/electron-builder/pull/9439) [`bdfc76b`](https://github.com/electron-userland/electron-builder/commit/bdfc76bf18cb02a38aa7b3624c9fb865c910c393)_ — `app-builder-lib`



# [26.3.5](https://github.com/electron-userland/electron-builder/compare/electron-builder@26.3.4...electron-builder@26.3.5) (2025-12-07)

## electron-builder@26.3.5

### Patch Changes

- Fix: check if custom nsis and/or nsis resources paths is not purely white space _[`#9420`](https://github.com/electron-userland/electron-builder/pull/9420) [`05e0bc7`](https://github.com/electron-userland/electron-builder/commit/05e0bc7becf4057e7f7794597a57f33d23894f4b)_ — `app-builder-lib`
- Chore(deps): unpinning semver and updating it for app-builder-lib and electron-updater _[`#9349`](https://github.com/electron-userland/electron-builder/pull/9349) [`e043df5`](https://github.com/electron-userland/electron-builder/commit/e043df57604fb029fd8f9cf7d835b8366ee71aa6)_ — `app-builder-lib`
- Fix: validate package version when traversing directories in search of a matching node module _[`#9424`](https://github.com/electron-userland/electron-builder/pull/9424) [`e3f3592`](https://github.com/electron-userland/electron-builder/commit/e3f3592cfa8043c646d1791fa7f41feb45556ea9)_ — `app-builder-lib`

## electron-updater@6.7.3

### Patch Changes

- Chore(deps): unpinning semver and updating it for app-builder-lib and electron-updater _[`#9349`](https://github.com/electron-userland/electron-builder/pull/9349) [`e043df5`](https://github.com/electron-userland/electron-builder/commit/e043df57604fb029fd8f9cf7d835b8366ee71aa6)_



# [26.3.4](https://github.com/electron-userland/electron-builder/compare/electron-builder@26.3.3...electron-builder@26.3.4) (2025-12-04)

## electron-builder@26.3.4

### Patch Changes

- Fix: only use hardlinks during unit tests to avoid breaking debian builds where /opt is on a different drive _[`#9397`](https://github.com/electron-userland/electron-builder/pull/9397) [`da1d768`](https://github.com/electron-userland/electron-builder/commit/da1d7687c6d2d2db8e319e371ba001c946bf130c)_ — `builder-util`
- Chore: resolve lint-deps issue now that ci-info isn't used _[`#9412`](https://github.com/electron-userland/electron-builder/pull/9412) [`2faee4d`](https://github.com/electron-userland/electron-builder/commit/2faee4d941d16c6f52d6c793c709a77ccfb79d0a)_ — `builder-util`
- Fix: converting all node collector logic from using promise.all to sequential awaits _[`#9414`](https://github.com/electron-userland/electron-builder/pull/9414) [`e34be3b`](https://github.com/electron-userland/electron-builder/commit/e34be3b3e8486c20cac316b4ae978ce275ea9cf7)_ — `app-builder-lib`
- Fix(pkg): support arm64-only MAS submissions by setting correct hostArchitectures in distribution XML _[`#9409`](https://github.com/electron-userland/electron-builder/pull/9409) [`b81c253`](https://github.com/electron-userland/electron-builder/commit/b81c2539c4da4630b9e955f3afa6ec76cb30447b)_ — `app-builder-lib`
- Fix: use correct types for makeUniversalApp (e.g. undefined instead of null)" _[`#9416`](https://github.com/electron-userland/electron-builder/pull/9416) [`ada111e`](https://github.com/electron-userland/electron-builder/commit/ada111ebe82d9487c27441969ab15899bafad4c9)_ — `app-builder-lib`
- Fix: use `projectRoot` instead of `workspaceRoot` for yarn_berry package manager _[`#9415`](https://github.com/electron-userland/electron-builder/pull/9415) [`4d24ebd`](https://github.com/electron-userland/electron-builder/commit/4d24ebd79ea33d8d9afa4a4bf18af90e968d0ff3)_ — `app-builder-lib`



# [26.3.3](https://github.com/electron-userland/electron-builder/compare/electron-builder@26.3.2...electron-builder@26.3.3) (2025-12-01)

## electron-builder@26.3.3

### Patch Changes

- Fix: double check yarn hoisted mode for each node module - yarn classic doesn't perma-hoist _[`#9401`](https://github.com/electron-userland/electron-builder/pull/9401) [`241c53a`](https://github.com/electron-userland/electron-builder/commit/241c53a598d9eb566de06059b4aa2f2d97d8712c)_ — `app-builder-lib`



# [26.3.2](https://github.com/electron-userland/electron-builder/compare/electron-builder@26.3.1...electron-builder@26.3.2) (2025-11-28)

## electron-builder@26.3.2

### Patch Changes

- Perf: optimize duplicate checking in asar packager using Set _[`#9386`](https://github.com/electron-userland/electron-builder/pull/9386) [`7f7113d`](https://github.com/electron-userland/electron-builder/commit/7f7113dc435a427ca4ff041fb138512ac0bdeaaa)_ — `app-builder-lib`
- Fix: returning actual path in hoisted mode for pnpm since it can still return virtual paths _[`#9392`](https://github.com/electron-userland/electron-builder/pull/9392) [`65eecac`](https://github.com/electron-userland/electron-builder/commit/65eecac1bec8fb5667621bdba4f1d2b1c75230b5)_ — `app-builder-lib`
- Fix: allow home dir when it's symlinked from /var/home _[`#9389`](https://github.com/electron-userland/electron-builder/pull/9389) [`0cd0831`](https://github.com/electron-userland/electron-builder/commit/0cd0831ec1c23b4fb4d701c10d586cb83d4ed2ed)_ — `app-builder-lib`



# [26.3.1](https://github.com/electron-userland/electron-builder/compare/electron-builder@26.3.0...electron-builder@26.3.1) (2025-11-24)

## electron-builder@26.3.1

### Patch Changes

- Fix: Use `yarn config --json` to parse yarn berry (output varies v2-4) _[`#9371`](https://github.com/electron-userland/electron-builder/pull/9371) [`2f3e7e1`](https://github.com/electron-userland/electron-builder/commit/2f3e7e1e67dd30c4987c33172ca6857ee0a2fc14)_ — `app-builder-lib`
- Fix: cleanup actool output file handle after spawn _[`#9373`](https://github.com/electron-userland/electron-builder/pull/9373) [`1607820`](https://github.com/electron-userland/electron-builder/commit/160782067f904b61d53eb28368aea58022fe1717)_ — `app-builder-lib`
- Fix: node 14 vs 15+ promisify warning on child_process.exec _[`#9374`](https://github.com/electron-userland/electron-builder/pull/9374) [`ef364d3`](https://github.com/electron-userland/electron-builder/commit/ef364d32c4fa78200249916af934b5235e04ba3e)_ — `app-builder-lib`
- Fix(dmg): use `command -v` instead of `which` for python _[`#9377`](https://github.com/electron-userland/electron-builder/pull/9377) [`82c07af`](https://github.com/electron-userland/electron-builder/commit/82c07af19f7f3447f3a693a641bad7261e6b924f)_ — `dmg-builder`
- Fix: `install-app-deps` missing `workspaceRoot` for passing `projectRootPath` into electron/rebuild _[`#9376`](https://github.com/electron-userland/electron-builder/pull/9376) [`45a1683`](https://github.com/electron-userland/electron-builder/commit/45a1683400b6525998256d83059ce7b562098eb1)_ — `electron-builder`, `app-builder-lib`
- Chore(deps): update dependency js-yaml to v4.1.1 [security] _[`#9375`](https://github.com/electron-userland/electron-builder/pull/9375) [`ed8ea12`](https://github.com/electron-userland/electron-builder/commit/ed8ea12f7c2ccf3e52079a5aa9517f1342448c52)_ — `app-builder-lib`
- Fix: properly collect node_modules when they're ESM and we're node>=16 _[`#9380`](https://github.com/electron-userland/electron-builder/pull/9380) [`ec0a851`](https://github.com/electron-userland/electron-builder/commit/ec0a85179b4508c372667f55e395d8b27c58a046)_ — `app-builder-lib`, `builder-util`, `dmg-builder`
- Fix: upgrade fpm to 1.17.0 _[`#9381`](https://github.com/electron-userland/electron-builder/pull/9381) [`6171472`](https://github.com/electron-userland/electron-builder/commit/617147281ceb53e9d40be852678131d2832abd79)_ — `app-builder-lib`



# [26.3.0](https://github.com/electron-userland/electron-builder/compare/electron-builder@26.2.0...electron-builder@26.3.0) (2025-11-18)

## electron-builder@26.3.0

### Minor Changes

- Feat: allowing negative patterns to be provided for `signExts` as signing overrides _[`#9335`](https://github.com/electron-userland/electron-builder/pull/9335) [`16c8fa1`](https://github.com/electron-userland/electron-builder/commit/16c8fa19b288770a6d24164e562a353877e59536)_ — `app-builder-lib`, `electron-builder-squirrel-windows`
- Feat: support `corepack` and `packageManager` field and add related unit tests _[`#9309`](https://github.com/electron-userland/electron-builder/pull/9309) [`b741b72`](https://github.com/electron-userland/electron-builder/commit/b741b726daeb06080ab1cf46a93d318fd89ae4e7)_ — `electron-builder`, `app-builder-lib`
- Feat: adding bun node_module collector support _[`#9357`](https://github.com/electron-userland/electron-builder/pull/9357) [`811d13d`](https://github.com/electron-userland/electron-builder/commit/811d13d730fe78ee2e721b7c537e8b3e5579a4f0)_ — `app-builder-lib`

### Patch Changes

- Fix: fix ci-info import for detecting CI _[`#9356`](https://github.com/electron-userland/electron-builder/pull/9356) [`2e0837b`](https://github.com/electron-userland/electron-builder/commit/2e0837b279156ad5b60a71d1e2733b495c192f5a)_ — `app-builder-lib`
- Fix(mac): handle `undefined` cert password with empty string fallback _[`#9359`](https://github.com/electron-userland/electron-builder/pull/9359) [`d8ad468`](https://github.com/electron-userland/electron-builder/commit/d8ad468cbf13ffb46889bbe0ba9f8c6d8ec1ac8f)_ — `app-builder-lib`
- Chore: bumping version packages of all packages to trigger Trusted Signing provedance release _[`#9362`](https://github.com/electron-userland/electron-builder/pull/9362) [`030269b`](https://github.com/electron-userland/electron-builder/commit/030269bca94b5e3621dbf8883976e1f85a1524f0)_ — `electron-builder`, `app-builder-lib`, `builder-util`, `builder-util-runtime`, `dmg-builder`, `electron-builder-squirrel-windows`, `electron-forge-maker-appimage`, `electron-forge-maker-nsis`, `electron-forge-maker-nsis-web`, `electron-forge-maker-snap`, `electron-publish`

## electron-updater@6.7.2

### Patch Changes

- Chore: bumping version packages of all packages to trigger Trusted Signing provedance release _[`#9362`](https://github.com/electron-userland/electron-builder/pull/9362) [`030269b`](https://github.com/electron-userland/electron-builder/commit/030269bca94b5e3621dbf8883976e1f85a1524f0)_ — `electron-updater`, `builder-util-runtime`



# [26.2.0](https://github.com/electron-userland/electron-builder/compare/electron-builder@26.1.0...electron-builder@26.2.0) (2025-11-15)

## electron-builder@26.2.0

### Minor Changes

- Feat: Allow local nsis-resources via env var `ELECTRON_BUILDER_NSIS_RESOURCES_DIR` _[`#9333`](https://github.com/electron-userland/electron-builder/pull/9333) [`6a49f85`](https://github.com/electron-userland/electron-builder/commit/6a49f85c69a22844729033f023249975f47a28f1)_ — `app-builder-lib`
- Feat: support Icon Composer icons for macOS _[`#9279`](https://github.com/electron-userland/electron-builder/pull/9279) [`b6a34c0`](https://github.com/electron-userland/electron-builder/commit/b6a34c00c35e42dc279a55d672558ea7badc7fcd)_ — `app-builder-lib`

### Patch Changes

- Chore: updating pnpm and setting minimumReleaseAge to 1 week _[`#9300`](https://github.com/electron-userland/electron-builder/pull/9300) [`0835fbc`](https://github.com/electron-userland/electron-builder/commit/0835fbcac0a0cfb0f34355699812cc85db035ad4)_ — `app-builder-lib`
- NSIS: Fix non-utilized for Silent Flag in Uninstaller _[`#9282`](https://github.com/electron-userland/electron-builder/pull/9282) [`836a15c`](https://github.com/electron-userland/electron-builder/commit/836a15c6c70abf8582aaa63603e14f77d5fa3f89)_ — `app-builder-lib`
- Fix: revert PR https://github.com/electron-userland/electron-builder/pull/9068 due to breaking change _[`#9346`](https://github.com/electron-userland/electron-builder/pull/9346) [`d193871`](https://github.com/electron-userland/electron-builder/commit/d19387174365c85968034149be43d80a39e7335f)_ — `app-builder-lib`
- Fix: change default value of disable_wayland depending on electron version (in order to support elevtron >38) _[`#9337`](https://github.com/electron-userland/electron-builder/pull/9337) [`f4d7924`](https://github.com/electron-userland/electron-builder/commit/f4d7924a082fbb9113d52782430f82b1f0ffcb52)_ — `app-builder-lib`
- Chore: remove "beta" labels from a few features _[`#9334`](https://github.com/electron-userland/electron-builder/pull/9334) [`21623e1`](https://github.com/electron-userland/electron-builder/commit/21623e1b037e4509af04e767ca1c1458682b0eba)_ — `app-builder-lib`

## electron-updater@6.7.1

### Patch Changes

- Chore: remove "beta" labels from a few features _[`#9334`](https://github.com/electron-userland/electron-builder/pull/9334) [`21623e1`](https://github.com/electron-userland/electron-builder/commit/21623e1b037e4509af04e767ca1c1458682b0eba)_



# [26.1.0](https://github.com/electron-userland/electron-builder/compare/v26.0.20...electron-builder@26.1.0) (2025-10-11)

## electron-builder@26.1.0

### Minor Changes

- Feat: Expanding `${arch}` macro properly for `mac.binaries` in case of native node packages for unpacked files for macos `universal` target _[`#9263`](https://github.com/electron-userland/electron-builder/pull/9263) [`08773af`](https://github.com/electron-userland/electron-builder/commit/08773afadfe10911ed1dff084fefe1024c5a74d8)_ — `app-builder-lib`
- Feat: Support gitlab publisher _[`#9209`](https://github.com/electron-userland/electron-builder/pull/9209) [`6fd391d`](https://github.com/electron-userland/electron-builder/commit/6fd391d9e8390c00c8b0674d8ac3a5b7b6f0f19f)_ — `app-builder-lib`, `builder-util-runtime`, `electron-publish`

### Patch Changes

- Fix: enhance package manager detection to support Yarn Berry (#9261) _[`#9262`](https://github.com/electron-userland/electron-builder/pull/9262) [`c51f962`](https://github.com/electron-userland/electron-builder/commit/c51f96272517c08a09504445fb31e61326e0c381)_ — `app-builder-lib`
- Fix: Optional dep's path cannot find in newest npm _[`#9274`](https://github.com/electron-userland/electron-builder/pull/9274) [`38c2085`](https://github.com/electron-userland/electron-builder/commit/38c2085e9a344812d32611d197d1df66d6644b45)_ — `app-builder-lib`
- Chore(deps): updating semver to 7.7.2 _[`#9301`](https://github.com/electron-userland/electron-builder/pull/9301) [`85cb4d0`](https://github.com/electron-userland/electron-builder/commit/85cb4d031a060976b2519665b98294bb3c735aa0)_ — `app-builder-lib`
- Fix: removes dynamic eval and utilizes a js helper file for trying `await import` and `require` that is then copied into the final npm package _[`#9299`](https://github.com/electron-userland/electron-builder/pull/9299) [`9f06a85`](https://github.com/electron-userland/electron-builder/commit/9f06a859f9c82b305d0a43c5b6e8c47d1c7451f1)_ — `app-builder-lib`
- Chore(deps): update electron/rebuild to resolve node-gyp dependency issue _[`#9285`](https://github.com/electron-userland/electron-builder/pull/9285) [`193abcf`](https://github.com/electron-userland/electron-builder/commit/193abcf78691b145dd1f406ac5521e88beec0a5c)_ — `app-builder-lib`
- Fix: incorrect cache name set when ELECTRON_BUILDER_CACHE env var is present _[`#9293`](https://github.com/electron-userland/electron-builder/pull/9293) [`e5f5799`](https://github.com/electron-userland/electron-builder/commit/e5f5799fbb193a7a8700fcaaf1ab9e79c9c694ce)_ — `app-builder-lib`

## electron-updater@6.7.0

### Minor Changes

- Feat: Support gitlab publisher _[`#9209`](https://github.com/electron-userland/electron-builder/pull/9209) [`6fd391d`](https://github.com/electron-userland/electron-builder/commit/6fd391d9e8390c00c8b0674d8ac3a5b7b6f0f19f)_ — `electron-updater`, `builder-util-runtime`

### Patch Changes

- Chore(deps): updating semver to 7.7.2 _[`#9301`](https://github.com/electron-userland/electron-builder/pull/9301) [`85cb4d0`](https://github.com/electron-userland/electron-builder/commit/85cb4d031a060976b2519665b98294bb3c735aa0)_



# [26.0.20](https://github.com/electron-userland/electron-builder/compare/v26.0.19...v26.0.20) (2025-08-29)

## electron-builder@26.0.20

### Minor Changes

- Fix: implement industry-standard cross-origin redirect auth handling _[`#9211`](https://github.com/electron-userland/electron-builder/pull/9211) [`7c7fd6c`](https://github.com/electron-userland/electron-builder/commit/7c7fd6ca240eda72048835f754adac92c4ab4e8c)_ — `builder-util-runtime`

  Replace hardcoded service-specific hostname checks with sophisticated cross-origin redirect detection that matches industry standards from Python requests library and Apache HttpClient.

  **Key improvements:**
  - **Case-insensitive hostname comparison** for robust origin detection
  - **HTTP→HTTPS upgrade allowance** on standard ports (80→443) for backward compatibility
  - **Proper default port handling** that treats implicit and explicit default ports as equivalent
  - **Standards-compliant cross-origin detection** following RFC specifications

  **Fixes GitHub issue #9207:** GitHub release asset downloads failing with 403 Forbidden when redirected from `api.github.com` to `release-assets.githubusercontent.com` (Azure backend) or other cloud storage services that don't accept GitHub tokens.

  The implementation now handles all cross-origin redirect scenarios while maintaining compatibility with legitimate same-origin redirects and industry-standard HTTP→HTTPS upgrades.

### Patch Changes

- Fix(yarn): check for dependencies in both projectDir and appDir during installation _[`#9219`](https://github.com/electron-userland/electron-builder/pull/9219) [`cf0ac45`](https://github.com/electron-userland/electron-builder/commit/cf0ac45db79e3e3ff1cef3ad931f7272646d1cb1)_ — `app-builder-lib`
- Fix(squirrel-windows): update loadingGif handling to prioritize user-defined option _[`#9222`](https://github.com/electron-userland/electron-builder/pull/9222) [`9997660`](https://github.com/electron-userland/electron-builder/commit/9997660e20cbdaa4ddb01d1c6078dea91097d6f0)_ — `electron-builder-squirrel-windows`
- Fix: generate stubExecutableExe and sign it for squirrel.windows using new electron-builder-binaries asset _[`#8959`](https://github.com/electron-userland/electron-builder/pull/8959) [`0ad8f91`](https://github.com/electron-userland/electron-builder/commit/0ad8f91cd5478a2063eb9e20df47797c8b42d48c)_ — `electron-builder-squirrel-windows`
- Fix: add quotation marks around variable in AppArmor profile _[`#9231`](https://github.com/electron-userland/electron-builder/pull/9231) [`f262a73`](https://github.com/electron-userland/electron-builder/commit/f262a7358dafe189b5d9bf06d7be43478ee35faa)_ — `app-builder-lib`
- Fix: scrubbing more aggressively anything in the logs that MIGHT be password affiliated (handling spaces in secrets) _[`#9182`](https://github.com/electron-userland/electron-builder/pull/9182) [`c54a060`](https://github.com/electron-userland/electron-builder/commit/c54a0609753a11d032f87e727eccbab1f6836081)_ — `builder-util`
- Fix: fix argument names mismatch in publish command to make it work _[`#9227`](https://github.com/electron-userland/electron-builder/pull/9227) [`8f0ad06`](https://github.com/electron-userland/electron-builder/commit/8f0ad06eae4716b7b753301531241166a7333058)_
- Fix(nsis): Fix file associations according to the Windows documentation _[`#9217`](https://github.com/electron-userland/electron-builder/pull/9217) [`e9251f4`](https://github.com/electron-userland/electron-builder/commit/e9251f4725f1f7c14c9792f5af8053dde1793d6a)_ — `app-builder-lib`
- Fix: support option to override `PublishPolicy` in publish command _[`#9228`](https://github.com/electron-userland/electron-builder/pull/9228) [`d031eea`](https://github.com/electron-userland/electron-builder/commit/d031eeaa7eb282e516471eed2e2a764716999b20)_
- Feat(github): Add `tagNamePrefix` option and deprecate `vPrefixedTagName` _[`#9216`](https://github.com/electron-userland/electron-builder/pull/9216) [`44b2899`](https://github.com/electron-userland/electron-builder/commit/44b28997f15314730d1bb69303a47dc26f7950d1)_ — `app-builder-lib`, `builder-util-runtime`, `electron-publish`
- Fix detect wrong package manager for two package.json structure _[`#9257`](https://github.com/electron-userland/electron-builder/pull/9257) [`b778686`](https://github.com/electron-userland/electron-builder/commit/b778686fb7f9294ec74bcb9a213a7f311a21357e)_ — `app-builder-lib`
- Fix(nsis): undefined vars when `customCheckAppRunning` is defined _[`#9245`](https://github.com/electron-userland/electron-builder/pull/9245) [`3735881`](https://github.com/electron-userland/electron-builder/commit/3735881f3259d0638d24fadc75809e5ea76114d7)_ — `app-builder-lib`
- Fix(app-builder-lib): Change dependency collection to parse from root to better handle monorepos _[`#9260`](https://github.com/electron-userland/electron-builder/pull/9260) [`49c782c`](https://github.com/electron-userland/electron-builder/commit/49c782cb838e495f60c4d284df8ab4b56b619da9)_ — `app-builder-lib`

## electron-updater@6.6.8

### Minor Changes

- Fix: implement industry-standard cross-origin redirect auth handling _[`#9211`](https://github.com/electron-userland/electron-builder/pull/9211) [`7c7fd6c`](https://github.com/electron-userland/electron-builder/commit/7c7fd6ca240eda72048835f754adac92c4ab4e8c)_ — `builder-util-runtime`

  Replace hardcoded service-specific hostname checks with sophisticated cross-origin redirect detection that matches industry standards from Python requests library and Apache HttpClient.

  **Key improvements:**
  - **Case-insensitive hostname comparison** for robust origin detection
  - **HTTP→HTTPS upgrade allowance** on standard ports (80→443) for backward compatibility
  - **Proper default port handling** that treats implicit and explicit default ports as equivalent
  - **Standards-compliant cross-origin detection** following RFC specifications

  **Fixes GitHub issue #9207:** GitHub release asset downloads failing with 403 Forbidden when redirected from `api.github.com` to `release-assets.githubusercontent.com` (Azure backend) or other cloud storage services that don't accept GitHub tokens.

  The implementation now handles all cross-origin redirect scenarios while maintaining compatibility with legitimate same-origin redirects and industry-standard HTTP→HTTPS upgrades.

### Patch Changes

- Fix(electron-updater): do not use quotes when installing update with sudo _[`#9225`](https://github.com/electron-userland/electron-builder/pull/9225) [`d27ac52`](https://github.com/electron-userland/electron-builder/commit/d27ac523bb1581f274c018952d55162315e7a9b8)_
- Feat(github): Add `tagNamePrefix` option and deprecate `vPrefixedTagName` _[`#9216`](https://github.com/electron-userland/electron-builder/pull/9216) [`44b2899`](https://github.com/electron-userland/electron-builder/commit/44b28997f15314730d1bb69303a47dc26f7950d1)_ — `builder-util-runtime`
- Fix: auto-update powershell script _[`#9232`](https://github.com/electron-userland/electron-builder/pull/9232) [`cfc4f36`](https://github.com/electron-userland/electron-builder/commit/cfc4f36a5af20fb6c61dc7dfa6202cbc0fd9f201)_
- Fix: uncaught exception during differential downloading via multipleRangDownloader _[`#9248`](https://github.com/electron-userland/electron-builder/pull/9248) [`8cbf079`](https://github.com/electron-userland/electron-builder/commit/8cbf079ec20bbc642f9b6c306e3e9141a1fcc385)_



# [26.0.19](https://github.com/electron-userland/electron-builder/compare/v26.0.18...v26.0.19) (2025-07-17)

## electron-builder@26.0.19

### Patch Changes

- Fix: change installOptions to use npm in yarn PM _[`#9197`](https://github.com/electron-userland/electron-builder/pull/9197) [`6cc5d2e`](https://github.com/electron-userland/electron-builder/commit/6cc5d2ee45250aae4a05872ae5b800a9e5cca939)_ — `app-builder-lib`
- Fix: remove `shell: true` from node_modules collector so as to prevent shell console logging from malforming the json output _[`#9177`](https://github.com/electron-userland/electron-builder/pull/9177) [`35f5f6e`](https://github.com/electron-userland/electron-builder/commit/35f5f6e55762ffc377fcd5587a8cea8753184d50)_ — `app-builder-lib`, `builder-util`, `builder-util-runtime`, `dmg-builder`
- Feat(nsis): terminate only processes running in installation folder _[`#9069`](https://github.com/electron-userland/electron-builder/pull/9069) [`c9480bc`](https://github.com/electron-userland/electron-builder/commit/c9480bc0a170cfad1cb3dfcedc7110d39b6cbd26)_ — `app-builder-lib`
- Fix(nsis): implement custom function to handle /D parameter with spaces _[`#9196`](https://github.com/electron-userland/electron-builder/pull/9196) [`21e4ea2`](https://github.com/electron-userland/electron-builder/commit/21e4ea23819a9133c9166df85e3f0ba54e5a6326)_ — `app-builder-lib`

## electron-updater@6.6.7

### Patch Changes

- Fix: remove `shell: true` from node_modules collector so as to prevent shell console logging from malforming the json output _[`#9177`](https://github.com/electron-userland/electron-builder/pull/9177) [`35f5f6e`](https://github.com/electron-userland/electron-builder/commit/35f5f6e55762ffc377fcd5587a8cea8753184d50)_ — `electron-updater`, `builder-util-runtime`
- Feat(electron-updater): add GitLab provider support _[`#9186`](https://github.com/electron-userland/electron-builder/pull/9186) [`1a6ea01`](https://github.com/electron-userland/electron-builder/commit/1a6ea016b7793c75e7586e0e14d5f26d3535c292)_ — `electron-updater`, `builder-util-runtime`



# [26.0.18](https://github.com/electron-userland/electron-builder/compare/v26.0.17...v26.0.18) (2025-07-08)

## electron-builder@26.0.18

### Patch Changes

- Fix(dmg): resolve dmg flakiness by updating dmgbuild and related python vendor files _[`#9163`](https://github.com/electron-userland/electron-builder/pull/9163) [`a2fbc8b`](https://github.com/electron-userland/electron-builder/commit/a2fbc8b6666fc58fb7cf1a6fa607695bb3d29a04)_ — `dmg-builder`
- Feat(nsis): added supports for uninstall components page _[`#9166`](https://github.com/electron-userland/electron-builder/pull/9166) [`61aa855`](https://github.com/electron-userland/electron-builder/commit/61aa8557dcab97a516ef2abd8bdadab5eb662879)_ — `app-builder-lib`
- Feat(nsis): added translation for 'closing app' _[`#9183`](https://github.com/electron-userland/electron-builder/pull/9183) [`309f1dc`](https://github.com/electron-userland/electron-builder/commit/309f1dcacb11231ac8cc2485a286f2ac63bfa085)_ — `app-builder-lib`
- Fix: upgrade fpm and corresponding portable ruby bundle to resolve build issues on macos _[`#9100`](https://github.com/electron-userland/electron-builder/pull/9100) [`e02b939`](https://github.com/electron-userland/electron-builder/commit/e02b939bc6fc13dfdad3d4c63c86bc01aad618fd)_ — `app-builder-lib`
- Feat: use jiti instead of config-file-ts for loading TypeScript config _[`#9194`](https://github.com/electron-userland/electron-builder/pull/9194) [`fc7c5a0`](https://github.com/electron-userland/electron-builder/commit/fc7c5a0d4c46d0c61f5c9f9c02412b3a3a97b423)_ — `app-builder-lib`

## electron-updater@6.6.6

### Patch Changes

- Feat(updater): Cache the new blockmap file and allow customization of the old blockmap file base URL _[`#9172`](https://github.com/electron-userland/electron-builder/pull/9172) [`cb651dd`](https://github.com/electron-userland/electron-builder/commit/cb651ddb732dd0b8614b1af25054261b978900dd)_



# [26.0.17](https://github.com/electron-userland/electron-builder/compare/v26.0.16...v26.0.17) (2025-06-15)

## electron-builder@26.0.17

### Patch Changes

- Chore: stabilize hdiutil resize by using whole number byte size _[`#9135`](https://github.com/electron-userland/electron-builder/pull/9135) [`2c36181`](https://github.com/electron-userland/electron-builder/commit/2c3618195efe97ab04f99ba70fcbbfbdbc24d20c)_ — `dmg-builder`
- Fix: don't assume commands end with .cmd on Windows by leveraging `which` package _[`#9026`](https://github.com/electron-userland/electron-builder/pull/9026) [`e56977b`](https://github.com/electron-userland/electron-builder/commit/e56977b5c6da25e4d797fd6cb40ea8ca52464fd3)_ — `app-builder-lib`
- Chore: wrapping Error in exec rejection so as to pass through error code to downstream logic _[`#9138`](https://github.com/electron-userland/electron-builder/pull/9138) [`a6be444`](https://github.com/electron-userland/electron-builder/commit/a6be444c90e59bbe92c53e94d7a5070f1399651f)_ — `builder-util`
- Chore: adding additional docs to signAndEditExecutable for windows _[`#9142`](https://github.com/electron-userland/electron-builder/pull/9142) [`3128991`](https://github.com/electron-userland/electron-builder/commit/3128991a1b0057e9a98903ff379022954da28135)_ — `app-builder-lib`, `builder-util`, `dmg-builder`
- Chore: add additional error stack trace to error message _[`#9145`](https://github.com/electron-userland/electron-builder/pull/9145) [`2d014a8`](https://github.com/electron-userland/electron-builder/commit/2d014a86050eee16e4092cfce40a1a6e9c9ee474)_ — `app-builder-lib`
- Feat(nsis): add support for more Windows Installer options _[`#9119`](https://github.com/electron-userland/electron-builder/pull/9119) [`73696c6`](https://github.com/electron-userland/electron-builder/commit/73696c6da6ea167a571af1226d6e82e94f3459b7)_ — `app-builder-lib`
- Refactor: enabling `getBin` to accept a different repo as a download source (useful for testing) _[`#9151`](https://github.com/electron-userland/electron-builder/pull/9151) [`b960d2f`](https://github.com/electron-userland/electron-builder/commit/b960d2fa3012230d8f91b4415641779846ee187a)_ — `app-builder-lib`
- Fix: electronDist when specified a path to an unpacked electron dir _[`#9157`](https://github.com/electron-userland/electron-builder/pull/9157) [`092d398`](https://github.com/electron-userland/electron-builder/commit/092d398a66057f411fe97fc3450de03bca6033d8)_ — `app-builder-lib`
- Fix: update minimatch to ^10.0.3 to fix downstream issue _[`#9162`](https://github.com/electron-userland/electron-builder/pull/9162) [`0b17b35`](https://github.com/electron-userland/electron-builder/commit/0b17b351cae84f3360cc8265fc452650c2c71ac3)_ — `app-builder-lib`



# [26.0.16](https://github.com/electron-userland/electron-builder/compare/v26.0.15...v26.0.16) (2025-06-02)

## electron-builder@26.0.16

### Patch Changes

- Fix(dmg): --force unmount dmg using hdiutil after 3sec delay when receiving error code 16 (resource is busy) _[`#9115`](https://github.com/electron-userland/electron-builder/pull/9115) [`9358b00`](https://github.com/electron-userland/electron-builder/commit/9358b00b3985dd65a2c89b65a4c097653e9aebb2)_ — `dmg-builder`
- Refactor(dmg): add human-readable log messages for hdiutil error codes and refactoring retry logic to only retry on transient error codes _[`#9118`](https://github.com/electron-userland/electron-builder/pull/9118) [`bacc6b4`](https://github.com/electron-userland/electron-builder/commit/bacc6b44cce1134d6d8ea1b605f0340a50095018)_ — `dmg-builder`
- Chore(deps): replace `is-ci` with `ci-info` _[`#9117`](https://github.com/electron-userland/electron-builder/pull/9117) [`b62737d`](https://github.com/electron-userland/electron-builder/commit/b62737d8c4528c04c78a490cc4dca8cdadbeaaac)_ — `electron-builder`, `app-builder-lib`, `builder-util`
- Fix(linux): productName should be used as the default value when executableName is not set. (#8766) _[`#9068`](https://github.com/electron-userland/electron-builder/pull/9068) [`59fdaa9`](https://github.com/electron-userland/electron-builder/commit/59fdaa9f3420f253c735690091169577112793b7)_ — `app-builder-lib`
- Test: adding helper function to packageMetadata to accept a relative file:// uri dependency _[`#9122`](https://github.com/electron-userland/electron-builder/pull/9122) [`65de856`](https://github.com/electron-userland/electron-builder/commit/65de8564f23536805b27ad36eec0b6574b682402)_ — `app-builder-lib`
- Fix: allow custom electron zip name to be provided when unpacking a provided electronDist _[`#9126`](https://github.com/electron-userland/electron-builder/pull/9126) [`9272cf3`](https://github.com/electron-userland/electron-builder/commit/9272cf33a8e3b788979010706e9c564e954a2ee7)_ — `app-builder-lib`

## electron-updater@6.6.5

### Patch Changes

- Fix: don't error out when trying to determine package manager _[`#9113`](https://github.com/electron-userland/electron-builder/pull/9113) [`8ba9be4`](https://github.com/electron-userland/electron-builder/commit/8ba9be481e3b777aa77884d265fd9b7f927a8a99)_



# [26.0.15](https://github.com/electron-userland/electron-builder/compare/v26.0.14...v26.0.15) (2025-05-04)

## electron-builder@26.0.15

### Patch Changes

- Fix(deps): update dependency @electron/osx-sign to v1.3.3 _[`#9083`](https://github.com/electron-userland/electron-builder/pull/9083) [`0ce7b90`](https://github.com/electron-userland/electron-builder/commit/0ce7b90e5eec0cf3049e2b3957b4d076fbdd615d)_ — `app-builder-lib`
- Refactor: improve resource directory handling for macOS _[`#9038`](https://github.com/electron-userland/electron-builder/pull/9038) [`d97e7eb`](https://github.com/electron-userland/electron-builder/commit/d97e7eb20d6cdf53f7fd75d51818de3cf65e011a)_ — `app-builder-lib`
- Fix(deps): update dependency @electron/universal to v2.0.2 _[`#9082`](https://github.com/electron-userland/electron-builder/pull/9082) [`6f3aec8`](https://github.com/electron-userland/electron-builder/commit/6f3aec8106be0d365e59923410c1eb55cd0328d1)_ — `app-builder-lib`
- Refactor: update package manager detection and improve type handling _[`#9067`](https://github.com/electron-userland/electron-builder/pull/9067) [`312938d`](https://github.com/electron-userland/electron-builder/commit/312938d8519a29992e75e1f544c41ca50ae591e3)_ — `app-builder-lib`

## electron-updater@6.6.4

### Patch Changes

- Fix: update regex for multipart content-type parsing in multipleRange _[`#9064`](https://github.com/electron-userland/electron-builder/pull/9064) [`444b791`](https://github.com/electron-userland/electron-builder/commit/444b791f9d2812f2a0f60481f7b25297585d9c5a)_
- Fix: allow forceDevUpdateConfig also on Linux _[`#9024`](https://github.com/electron-userland/electron-builder/pull/9024) [`e641751`](https://github.com/electron-userland/electron-builder/commit/e641751ce36cdf099d62a897c591b2763705dbff)_
- Feat: support upgrading from ARM to ARM, rather than upgrading to x64 in window and linux _[`#9059`](https://github.com/electron-userland/electron-builder/pull/9059) [`cb77508`](https://github.com/electron-userland/electron-builder/commit/cb775088427d25e9ce0489067445716d35e09997)_



# [26.0.14](https://github.com/electron-userland/electron-builder/compare/v26.0.13...v26.0.14) (2025-04-27)

## electron-builder@26.0.14

### Patch Changes

- Add customNsisResources override to nsis options _[`#9032`](https://github.com/electron-userland/electron-builder/pull/9032) [`3d65267`](https://github.com/electron-userland/electron-builder/commit/3d65267a6c53ca824f70e5b0f5d8f4ba8be38237)_ — `app-builder-lib`
- Chore(asar): use streaming API for `electron/asar` for constructing asar package _[`#8995`](https://github.com/electron-userland/electron-builder/pull/8995) [`524fb6e`](https://github.com/electron-userland/electron-builder/commit/524fb6e042446f741eaf77a8eb65485074186b96)_ — `app-builder-lib`
- Feat: add buildUniversalInstaller option to NSIS portable configuration _[`#9034`](https://github.com/electron-userland/electron-builder/pull/9034) [`80fbf5a`](https://github.com/electron-userland/electron-builder/commit/80fbf5a6d8f308415469d4ee96a954932e6f19b7)_ — `app-builder-lib`
- Chore: migrate fpm packaging from app builder _[`#9061`](https://github.com/electron-userland/electron-builder/pull/9061) [`5545e13`](https://github.com/electron-userland/electron-builder/commit/5545e1325457bf4c493166faaf533528d336e76f)_ — `app-builder-lib`



# [26.0.13](https://github.com/electron-userland/electron-builder/compare/v26.0.12...v26.0.13) (2025-04-12)

## electron-builder@26.0.13

### Patch Changes

- Fix: malformed `Files` param when using Azure Trusted Signing _[`#8987`](https://github.com/electron-userland/electron-builder/pull/8987) [`9fb2895`](https://github.com/electron-userland/electron-builder/commit/9fb2895cd008ea6fc6210078decabc15a5c0144a)_ — `app-builder-lib`
- Chore(refactor): enable parallel packaging of archs and targets with `concurrency` config prop _[`#8962`](https://github.com/electron-userland/electron-builder/pull/8962) [`106640d`](https://github.com/electron-userland/electron-builder/commit/106640dd42a3db08bfbe3a3a32fe333e93ba5c10)_ — `app-builder-lib`, `builder-util`, `dmg-builder`, `electron-builder-squirrel-windows`
- Fix(mac): allow ad-hoc identities for codesigning _[`#9007`](https://github.com/electron-userland/electron-builder/pull/9007) [`bff46ec`](https://github.com/electron-userland/electron-builder/commit/bff46ec41c4a7715cc06f7dfd6ff95f8e4bbe869)_ — `app-builder-lib`
- Chore(deps): bump @electron/rebuild to 3.7.1 _[`#9019`](https://github.com/electron-userland/electron-builder/pull/9019) [`33bd670`](https://github.com/electron-userland/electron-builder/commit/33bd67061235ae1067a8f6185d108b744388f2e3)_ — `app-builder-lib`
- Add information how to use electron-publish s3 with credentials stored in ~/.aws/config file. _[`#9018`](https://github.com/electron-userland/electron-builder/pull/9018) [`a2f7f73`](https://github.com/electron-userland/electron-builder/commit/a2f7f7350be2379c4917417c92ece5a6ab241708)_ — `app-builder-lib`, `builder-util-runtime`
- Chore(deps): updating electron/rebuild to latest 3.7.2 _[`#9022`](https://github.com/electron-userland/electron-builder/pull/9022) [`1397775`](https://github.com/electron-userland/electron-builder/commit/1397775c3bbde974468ab639866c7434960cbc81)_ — `app-builder-lib`
- Fix: remove implicit dependencies handling _[`#9010`](https://github.com/electron-userland/electron-builder/pull/9010) [`8bd1a10`](https://github.com/electron-userland/electron-builder/commit/8bd1a10a2dcdee080e3b5a0359453d5d34b3ffbf)_ — `app-builder-lib`
- Fix: dependency path is undefined _[`#9013`](https://github.com/electron-userland/electron-builder/pull/9013) [`c223866`](https://github.com/electron-userland/electron-builder/commit/c223866e366ef1aeeefec0d1a61a14b3d526f23e)_ — `electron-builder`, `app-builder-lib`

## electron-updater@6.6.3

### Patch Changes

- Add information how to use electron-publish s3 with credentials stored in ~/.aws/config file. _[`#9018`](https://github.com/electron-userland/electron-builder/pull/9018) [`a2f7f73`](https://github.com/electron-userland/electron-builder/commit/a2f7f7350be2379c4917417c92ece5a6ab241708)_ — `builder-util-runtime`
- Feat: allow overriding AppUpdater.isStagingMatch _[`#9021`](https://github.com/electron-userland/electron-builder/pull/9021) [`cf43f05`](https://github.com/electron-userland/electron-builder/commit/cf43f0567c6addaf3cefd7eadada95bd543165e1)_
- Fixed missing lowercase in extension comparison. _[`#8992`](https://github.com/electron-userland/electron-builder/pull/8992) [`1f50540`](https://github.com/electron-userland/electron-builder/commit/1f5054004468f76d316cee33ef6cc8717987b146)_



# [26.0.12](https://github.com/electron-userland/electron-builder/compare/v26.0.11...v26.0.12) (2025-03-22)

## electron-builder@26.0.12

### Patch Changes

- Fix: support `mas` packages for flipping fuses _[`#8947`](https://github.com/electron-userland/electron-builder/pull/8947) [`7ba4fea`](https://github.com/electron-userland/electron-builder/commit/7ba4fea95825650f02749949632b351c75d3019a)_ — `app-builder-lib`
- Optimize workspace package resolution in dependency tree _[`#8958`](https://github.com/electron-userland/electron-builder/pull/8958) [`81e0c47`](https://github.com/electron-userland/electron-builder/commit/81e0c472fe2691b716aba5428dedc5da1c57e773)_ — `app-builder-lib`
- Fix: pnpm collection of optional dependencies _[`#8957`](https://github.com/electron-userland/electron-builder/pull/8957) [`ad151b9`](https://github.com/electron-userland/electron-builder/commit/ad151b9dbefa746514dd15471e5ef8bf5eed1d9b)_ — `app-builder-lib`
- Chore(docs): Fix typo in `SquirrelWindowsOptions` _[`#8968`](https://github.com/electron-userland/electron-builder/pull/8968) [`2d25ec8`](https://github.com/electron-userland/electron-builder/commit/2d25ec8ca9ff6dfc634323b7592335b0631f4e47)_ — `app-builder-lib`
- Fix: Azure trust signing fails with spaces in parameters _[`#8979`](https://github.com/electron-userland/electron-builder/pull/8979) [`f24a2ce`](https://github.com/electron-userland/electron-builder/commit/f24a2ce05cfbc88b79c1d743d13c898d70be99df)_ — `app-builder-lib`



# [26.0.11](https://github.com/electron-userland/electron-builder/compare/v26.0.10...v26.0.11) (2025-03-10)

## electron-builder@26.0.11

### Patch Changes

- Chore(docs): Document that detectUpdateChannel doesn't work when publishing to github _[`#8928`](https://github.com/electron-userland/electron-builder/pull/8928) [`70d7c85`](https://github.com/electron-userland/electron-builder/commit/70d7c855360eb66b429f67a976709a52ce193a59)_ — `app-builder-lib`
- Fix: `after-install.tpl`: Detect if apparmor is enabled instead of just file-exists check _[`#8932`](https://github.com/electron-userland/electron-builder/pull/8932) [`e1ea62b`](https://github.com/electron-userland/electron-builder/commit/e1ea62b0029c4adca20196ef060948777caeac37)_ — `app-builder-lib`
- Fix: find cwd using getProjectRootPath for detecting package manager _[`#8941`](https://github.com/electron-userland/electron-builder/pull/8941) [`14b96df`](https://github.com/electron-userland/electron-builder/commit/14b96dfcbb7e4fd114169c35b50932bf5777fcf1)_ — `app-builder-lib`
- Chore(test): parallel test execution! Updates base Logger to squelch noisy/concurrent logging when VITEST env var and DEBUG=electron-builder are set. _[`#8919`](https://github.com/electron-userland/electron-builder/pull/8919) [`53a8193`](https://github.com/electron-userland/electron-builder/commit/53a81939b8c46061027ab36d8f9114c35b250a7e)_ — `builder-util`

## electron-updater@6.6.2

### Patch Changes

- Fix: re-export `CancellationToken`, `PackageFileInfo`, `ProgressInfo`, `UpdateFileInfo`, `UpdateInfo` from electron-updater _[`#8933`](https://github.com/electron-userland/electron-builder/pull/8933) [`324032c`](https://github.com/electron-userland/electron-builder/commit/324032c5ea94b983cda8a5510fcc1a3fb752a1a1)_



# [26.0.10](https://github.com/electron-userland/electron-builder/compare/v26.0.9...v26.0.10) (2025-03-03)

## electron-builder@26.0.10

### Patch Changes

- Chore: replace the plist functionality in app-builder-bin with plist _[`#8890`](https://github.com/electron-userland/electron-builder/pull/8890) [`3ce33ed`](https://github.com/electron-userland/electron-builder/commit/3ce33edbe0c809a8a3834577a8df41ba58ae9003)_ — `app-builder-lib`
- Fix: improve atomicRMDir function in NSIS uninstaller _[`#8915`](https://github.com/electron-userland/electron-builder/pull/8915) [`8903c5d`](https://github.com/electron-userland/electron-builder/commit/8903c5df046b74411f3b1fa958cef9a5955d01ef)_ — `app-builder-lib`
- Fix: fix custom publisher check and throw error if not found _[`#8926`](https://github.com/electron-userland/electron-builder/pull/8926) [`3caab3c`](https://github.com/electron-userland/electron-builder/commit/3caab3c4226a73ab458ac5a315aff160c5500b94)_ — `app-builder-lib`

## electron-updater@6.6.1

### Patch Changes

- Chore(refactor): refactoring code to reduce cyclical imports in order to migrate to rollup + vite (which have much more strict module resolutions) _[`#8913`](https://github.com/electron-userland/electron-builder/pull/8913) [`065c6a4`](https://github.com/electron-userland/electron-builder/commit/065c6a456e34e7f8c13cba483d433502b9325168)_



# [26.0.9](https://github.com/electron-userland/electron-builder/compare/v26.0.8...v26.0.9) (2025-02-26)

## electron-builder@26.0.9

### Patch Changes

- Fix: `node-linker=hoisted` fallback to utilize Npm module collector _[`#8885`](https://github.com/electron-userland/electron-builder/pull/8885) [`4cc475e`](https://github.com/electron-userland/electron-builder/commit/4cc475ed214861b99075d4639c92686803420174)_ — `app-builder-lib`
- Fix: remove Promise ability from AsyncEventEmitter as it's impossible to filter listeners by without being async _[`#8895`](https://github.com/electron-userland/electron-builder/pull/8895) [`22da644`](https://github.com/electron-userland/electron-builder/commit/22da64425182456eb4d1243138dde27c80d6adac)_ — `app-builder-lib`
- Test: adding fixtures for lockfiles to support `--frozen-lockfile` (yarn, pnpm) and `ci` (npm) _[`#8899`](https://github.com/electron-userland/electron-builder/pull/8899) [`6918431`](https://github.com/electron-userland/electron-builder/commit/6918431560c6c4621e0dccf72b461872b74462ac)_ — `app-builder-lib`
- Fix: allow publishing to Snap Store to be disabled with snap specific publish options _[`#8896`](https://github.com/electron-userland/electron-builder/pull/8896) [`67b6f71`](https://github.com/electron-userland/electron-builder/commit/67b6f71f85798dba4ce51dfb2cd012e04cd391db)_ — `app-builder-lib`
- Fix: when using osx-sign, specifically pass in identity name instead of hash _[`#8908`](https://github.com/electron-userland/electron-builder/pull/8908) [`62029b0`](https://github.com/electron-userland/electron-builder/commit/62029b08c10a6b12d8ef30bf57ae61a877f297f4)_ — `app-builder-lib`



# [26.0.8](https://github.com/electron-userland/electron-builder/compare/v26.0.7...v26.0.8) (2025-02-21)

## electron-builder@26.0.8

### Patch Changes

- Chore: refactor node module collector, extract explicit `DependencyTree`, update types to be generic and respective to `npm list` vs `pnpm list` dependency trees _[`#8872`](https://github.com/electron-userland/electron-builder/pull/8872) [`7f6c3fe`](https://github.com/electron-userland/electron-builder/commit/7f6c3fea6fea8cffa00a43413f5335097aca94b0)_ — `app-builder-lib`
- Chore: refactor node module collector to reduce recursion, extract explicit DependencyTree, update types _[`#8872`](https://github.com/electron-userland/electron-builder/pull/8872) [`7f6c3fe`](https://github.com/electron-userland/electron-builder/commit/7f6c3fea6fea8cffa00a43413f5335097aca94b0)_ — `app-builder-lib`
- Fix: allow usage of .cjs, .mjs, and type=module custom/generic publishers _[`#8868`](https://github.com/electron-userland/electron-builder/pull/8868) [`48c9f88`](https://github.com/electron-userland/electron-builder/commit/48c9f88b185cbc4a52926e6e10791bf293ecda6f)_ — `app-builder-lib`



# [26.0.7](https://github.com/electron-userland/electron-builder/compare/v26.0.6...v26.0.7) (2025-02-18)

## electron-builder@26.0.7

### Patch Changes

- Detected circular dependencies and add debug logs for nodeModulesCollector, and refactored YarnNodeModulesCollector to extend NpmNodeModulesCollector. _[`#8864`](https://github.com/electron-userland/electron-builder/pull/8864) [`3fe27d7`](https://github.com/electron-userland/electron-builder/commit/3fe27d77587a05a7d568b3b21f1df8f0a1650c92)_ — `app-builder-lib`
- Fix: validate object key before deep assigning _[`#8869`](https://github.com/electron-userland/electron-builder/pull/8869) [`c12f86f`](https://github.com/electron-userland/electron-builder/commit/c12f86f2e254809e70d1f60d89cf9b7264278083)_ — `builder-util`
- Sign the vendor directory instead of using Squirrel.Windows' signing method _[`#8855`](https://github.com/electron-userland/electron-builder/pull/8855) [`bee179b`](https://github.com/electron-userland/electron-builder/commit/bee179b3cf8163041d280ed8dc5a5ce4f27786c6)_ — `electron-builder-squirrel-windows`

## electron-updater@6.6.0

### Minor Changes

- Fix: Dispatch error in updater if `spawnSyncLog` fails _[`#8817`](https://github.com/electron-userland/electron-builder/pull/8817) [`ea3e0f5`](https://github.com/electron-userland/electron-builder/commit/ea3e0f5ff8ac9a5e01bcd11585d9f5e6a57b076e)_



# [26.0.6](https://github.com/electron-userland/electron-builder/compare/v26.0.5...v26.0.6) (2025-02-06)

## electron-builder@26.0.6

### Patch Changes

- Fix: Only update AppArmor profile if not chroot'ed _[`#8843`](https://github.com/electron-userland/electron-builder/pull/8843) [`7fc7846`](https://github.com/electron-userland/electron-builder/commit/7fc784603d580fc6dc183e02118734ea4ffeb257)_ — `app-builder-lib`
- Fix the issue of the missing ms package _[`#8851`](https://github.com/electron-userland/electron-builder/pull/8851) [`0f2c963`](https://github.com/electron-userland/electron-builder/commit/0f2c96379143e3dde960ed45bb3e1b74449540f1)_ — `app-builder-lib`



# [26.0.5](https://github.com/electron-userland/electron-builder/compare/v26.0.4...v26.0.5) (2025-02-05)

## electron-builder@26.0.5

### Patch Changes

- Delete peerDepenencies when collecting node modules _[`#8845`](https://github.com/electron-userland/electron-builder/pull/8845) [`53ee6c6`](https://github.com/electron-userland/electron-builder/commit/53ee6c6c498a4cc4e64d580c4ec6564137060eae)_ — `app-builder-lib`



# [26.0.4](https://github.com/electron-userland/electron-builder/compare/v26.0.3...v26.0.4) (2025-02-04)

## electron-builder@26.0.4

### Patch Changes

- Feat: switch app-builder-bin to node-module-collector to get all production node modules _[`#8839`](https://github.com/electron-userland/electron-builder/pull/8839) [`8b059ad`](https://github.com/electron-userland/electron-builder/commit/8b059ad3baad440acb0994b2c52f22ea0f1d987f)_ — `app-builder-lib`, `builder-util`



# [26.0.3](https://github.com/electron-userland/electron-builder/compare/v26.0.2...v26.0.3) (2025-02-04)

## electron-builder@26.0.3

### Patch Changes

- Feat(pkg): support notarizing pkg for macos archives _[`#8834`](https://github.com/electron-userland/electron-builder/pull/8834) [`6261c9a`](https://github.com/electron-userland/electron-builder/commit/6261c9a038ecd73c55ac3909825d5d3d7fa43664)_ — `app-builder-lib`
- Use electron-winstaller instead of self module _[`#8344`](https://github.com/electron-userland/electron-builder/pull/8344) [`27b2ba8`](https://github.com/electron-userland/electron-builder/commit/27b2ba8129f0e9ad102ca3120c7d7a0f9d29b8eb)_ — `app-builder-lib`, `electron-builder-squirrel-windows`



# [26.0.2](https://github.com/electron-userland/electron-builder/compare/v26.0.1...v26.0.2) (2025-02-03)

## electron-builder@26.0.2

### Patch Changes

- Feat: Allow users to pass a custom electrons headers URL via env var _[`#8785`](https://github.com/electron-userland/electron-builder/pull/8785) [`b3adf48`](https://github.com/electron-userland/electron-builder/commit/b3adf4800b4ed240bb21a6a0a6ccdd57670e5d26)_ — `app-builder-lib`
- Fix: handle yarn berry patch format in electron-updater version check _[`#8830`](https://github.com/electron-userland/electron-builder/pull/8830) [`44603f2`](https://github.com/electron-userland/electron-builder/commit/44603f2f3cc0e00e1c2c2420c7d440d587f8feca)_ — `app-builder-lib`
- Fix: upgrading TrustedSigning module and setting it as minimum version instead of required _[`#8833`](https://github.com/electron-userland/electron-builder/pull/8833) [`f5af99a`](https://github.com/electron-userland/electron-builder/commit/f5af99ac87ef585a7f7ba548d3fb92811f845ba3)_ — `app-builder-lib`
- Feat(pkg): support extra component packages (`.pkg`) for macos archives _[`#8767`](https://github.com/electron-userland/electron-builder/pull/8767) [`f45a09e`](https://github.com/electron-userland/electron-builder/commit/f45a09eeeb9d2fb5c4a45bd7bf3990c4acb3c538)_ — `app-builder-lib`

## electron-updater@6.5.0

### Minor Changes

- Feat: add `isUpdateAvailable` property to `checkForUpdates` result _[`#8829`](https://github.com/electron-userland/electron-builder/pull/8829) [`14ee2d6`](https://github.com/electron-userland/electron-builder/commit/14ee2d6be32fd6e9165381e0709e5a2e8049ece2)_
- Feat: add support for custom `isUpdateSupported` hook for validating `UpdateInfo`, with fallback to previous `minimumSystemVersion` logic _[`#8692`](https://github.com/electron-userland/electron-builder/pull/8692) [`96c5d14`](https://github.com/electron-userland/electron-builder/commit/96c5d14027d56473ae5dd843c023709a01782963)_



# [26.0.1](https://github.com/electron-userland/electron-builder/compare/v26.0.0...v26.0.1) (2025-01-30)

## electron-builder@26.0.1

### Patch Changes

- Chore: extract common `undefined | null` to reuse current (unexported) type `Nullish`. Expose `FileMatcher` instead of `@internal` flag _[`#8813`](https://github.com/electron-userland/electron-builder/pull/8813) [`0742966`](https://github.com/electron-userland/electron-builder/commit/07429661c0da2248cec5b92eb03390ae19266328)_ — `app-builder-lib`, `builder-util`, `builder-util-runtime`, `dmg-builder`
- Chore: "organize imports" + change `ObjectMap` => `Record` for non-external properties (i.e. things that don't get processed for `scheme.json`) _[`#8815`](https://github.com/electron-userland/electron-builder/pull/8815) [`8e7811d`](https://github.com/electron-userland/electron-builder/commit/8e7811d18de3acb39ce9253cf2cd9afa4e23f99c)_ — `electron-builder`, `app-builder-lib`, `builder-util`, `builder-util-runtime`, `dmg-builder`, `electron-builder-squirrel-windows`, `electron-publish`
- Chore: migrate from BluebirdPromise to vanilla Promise. use `tiny-async-pool` for setting concurrency limit _[`#8810`](https://github.com/electron-userland/electron-builder/pull/8810) [`62997b0`](https://github.com/electron-userland/electron-builder/commit/62997b087065650d263581fa17a2c0531039fcd9)_ — `app-builder-lib`, `builder-util`

## electron-updater@6.4.1

### Patch Changes

- Chore: extract common `undefined | null` to reuse current (unexported) type `Nullish`. Expose `FileMatcher` instead of `@internal` flag _[`#8813`](https://github.com/electron-userland/electron-builder/pull/8813) [`0742966`](https://github.com/electron-userland/electron-builder/commit/07429661c0da2248cec5b92eb03390ae19266328)_ — `builder-util-runtime`
- Chore: "organize imports" + change `ObjectMap` => `Record` for non-external properties (i.e. things that don't get processed for `scheme.json`) _[`#8815`](https://github.com/electron-userland/electron-builder/pull/8815) [`8e7811d`](https://github.com/electron-userland/electron-builder/commit/8e7811d18de3acb39ce9253cf2cd9afa4e23f99c)_ — `builder-util-runtime`



# [26.0.0](https://github.com/electron-userland/electron-builder/compare/electron-builder@25.1.8...v26.0.0) (2025-01-26)

## electron-builder@26.0.0

### Major Changes

- Support including node_modules in other subdirectories _[`#8562`](https://github.com/electron-userland/electron-builder/pull/8562) [`b8185d4`](https://github.com/electron-userland/electron-builder/commit/b8185d48a75e65932196700e28bf71613dd141b4)_ — `app-builder-lib`, `builder-util`
- Feat: allowing additional entries in .desktop file, such as `[Desktop Actions <actionName>]`. Requires changing configuration `desktop` property to object to be more extensible in the future _[`#8572`](https://github.com/electron-userland/electron-builder/pull/8572) [`0dbe357`](https://github.com/electron-userland/electron-builder/commit/0dbe357ac5b4f3c51d9a6e9d7bbf0b1f142b5746)_ — `app-builder-lib`
- Chore: remove deprecated fields from `winOptions` and `macOptions` _[`#8582`](https://github.com/electron-userland/electron-builder/pull/8582) [`6a9597b`](https://github.com/electron-userland/electron-builder/commit/6a9597b4d739744fd9211fc07f55bb34211c7626)_ — `app-builder-lib`

  For `winOptions` signing configuration, it has been moved to `win.signtoolOptions` in order to support `azureOptions` as a separate field and avoid bloating `win` configuration object
  For `macOptions`, notarize options has been deprecated in favor of env vars for quite some time. Env vars are much more secure
- Chore: upgrade buildpack-deps base image from `focal` to `jammy`. This also forces upgrading `python`->`python3` package and wine-stable _[`#8779`](https://github.com/electron-userland/electron-builder/pull/8779) [`74355da`](https://github.com/electron-userland/electron-builder/commit/74355da9055113b243323cdc6bb800ce722be2df)_
- Fix: removing conditional logic that would build HFS+ dmg on non-arm64 macs as HFS+ was sunset in macos 15.2 _[`#8782`](https://github.com/electron-userland/electron-builder/pull/8782) [`633490c`](https://github.com/electron-userland/electron-builder/commit/633490cb395c0af8027116b345500c58a7616964)_ — `dmg-builder`

### Minor Changes

- Feat: Implement autoupdates for pacman _[`#8394`](https://github.com/electron-userland/electron-builder/pull/8394) [`ae9221d`](https://github.com/electron-userland/electron-builder/commit/ae9221d947c2dedff7b655ddafceb9746f9f4460)_ — `app-builder-lib`
- Feat: migrate `electronDist` to be an electron-builder `Hook` _[`#8525`](https://github.com/electron-userland/electron-builder/pull/8525) [`13f55a3`](https://github.com/electron-userland/electron-builder/commit/13f55a3ef070d946f5d80dd412a557bd38c98424)_ — `app-builder-lib`
- Feat: migrate to official `electron/asar` packaging _[`#8570`](https://github.com/electron-userland/electron-builder/pull/8570) [`c848430`](https://github.com/electron-userland/electron-builder/commit/c84843053a8f9e0b6af14c6b2ed33c5f82d495b3)_ — `app-builder-lib`
- Feat: adding integration with @electron/fuses _[`#8588`](https://github.com/electron-userland/electron-builder/pull/8588) [`8434e10`](https://github.com/electron-userland/electron-builder/commit/8434e10dad0893ca11c5f3a17a70470065f96fa0)_ — `app-builder-lib`
- Feat: add support for AppArmor with template profile and configuration property _[`#8636`](https://github.com/electron-userland/electron-builder/pull/8636) [`88cc0b0`](https://github.com/electron-userland/electron-builder/commit/88cc0b06dba22139721fd1e04f6a1cf2d447edbd)_ — `app-builder-lib`
- Add `host` property to support self-hosted Keygen instances _[`#8711`](https://github.com/electron-userland/electron-builder/pull/8711) [`6f0fb8e`](https://github.com/electron-userland/electron-builder/commit/6f0fb8e44f035bcd6ff0d6f234b38c20fde066af)_ — `app-builder-lib`, `builder-util-runtime`, `electron-publish`
- Add `forcePathStyle` option to S3Options _[`#8741`](https://github.com/electron-userland/electron-builder/pull/8741) [`eacbbf5`](https://github.com/electron-userland/electron-builder/commit/eacbbf593f6ea01a92ffb41d8d28ee5e4e480ea1)_ — `builder-util`, `builder-util-runtime`, `electron-publish`
- Feat: support completely custom AppxManifest.xml _[`#8609`](https://github.com/electron-userland/electron-builder/pull/8609) [`d672b04`](https://github.com/electron-userland/electron-builder/commit/d672b04b4746170c07bc39b7b049ab0c584e7a19)_ — `app-builder-lib`
- Feat: allow disabling of building a universal windows installer _[`#8607`](https://github.com/electron-userland/electron-builder/pull/8607) [`f123628`](https://github.com/electron-userland/electron-builder/commit/f123628ce400b5e65d0e4f0966e5cc65a1f3b8a5)_ — `app-builder-lib`
- Feat: add `pwsh` detection to enable azure trusted signing within docker image _[`#8787`](https://github.com/electron-userland/electron-builder/pull/8787) [`cdf18d9`](https://github.com/electron-userland/electron-builder/commit/cdf18d9a0f65068e179e43152699c366c4c29467)_ — `app-builder-lib`

### Patch Changes

- Chore: change signing warning message to debug _[`#8566`](https://github.com/electron-userland/electron-builder/pull/8566) [`e45fecf`](https://github.com/electron-userland/electron-builder/commit/e45fecf04d1ba758ed524391a1fc161e5c57d305)_ — `app-builder-lib`
- Chore(deps): update ejs to v3.1.10 _[`#8573`](https://github.com/electron-userland/electron-builder/pull/8573) [`1fee87a`](https://github.com/electron-userland/electron-builder/commit/1fee87a20e1bca88f185967ca540d60177e13653)_ — `app-builder-lib`
- Fix: add additional default exclusions to copy logic _[`#8577`](https://github.com/electron-userland/electron-builder/pull/8577) [`e9eef0c`](https://github.com/electron-userland/electron-builder/commit/e9eef0c1c7f73a5edfe3026f044c6278641077cb)_ — `app-builder-lib`
- Chore(deps): update @electron/rebuild to v3.7.0 _[`#8575`](https://github.com/electron-userland/electron-builder/pull/8575) [`dfa35c3`](https://github.com/electron-userland/electron-builder/commit/dfa35c321f6e68c6a102ddc49aa64985fb11d396)_ — `app-builder-lib`
- Fix: packages in the workspace not being under node_modules _[`#8576`](https://github.com/electron-userland/electron-builder/pull/8576) [`3eab714`](https://github.com/electron-userland/electron-builder/commit/3eab7143d74262caace81ea05e97617d07daf336)_ — `app-builder-lib`, `builder-util`
- Revert "fix(win): use appInfo description as primary entry for FileDescription" to resolve https://github.com/electron-userland/electron-builder/issues/8599 _[`#8601`](https://github.com/electron-userland/electron-builder/pull/8601) [`215fc36`](https://github.com/electron-userland/electron-builder/commit/215fc36b5e8d243ef5bc77d31eb8e30d0e8bca9d)_ — `app-builder-lib`
- Fix: checking relative path without separator as that doesn't work on Windows _[`#8603`](https://github.com/electron-userland/electron-builder/pull/8603) [`712a8bc`](https://github.com/electron-userland/electron-builder/commit/712a8bce56331cd89df270f182fa27bf365e985b)_ — `app-builder-lib`
- Chore(deps): update app-builder-bin to 5.0.0-alpha.11 _[`#8604`](https://github.com/electron-userland/electron-builder/pull/8604) [`d4ea0d9`](https://github.com/electron-userland/electron-builder/commit/d4ea0d998d0fb3ea3a75ca8d39a69a2f3c710962)_ — `builder-util`
- Chore: refactor files for publishing to electron-publish _[`#8596`](https://github.com/electron-userland/electron-builder/pull/8596) [`e0b0e35`](https://github.com/electron-userland/electron-builder/commit/e0b0e351baecc29e08d9f7d90f4699150b229416)_ — `electron-builder`, `app-builder-lib`, `builder-util`, `dmg-builder`, `electron-builder-squirrel-windows`, `electron-publish`
- Fix: add quotes to surround file path during azure signing to handle files with spaces _[`#8606`](https://github.com/electron-userland/electron-builder/pull/8606) [`a0e635c`](https://github.com/electron-userland/electron-builder/commit/a0e635c183633c291fd2e0a0e8c9a1c6b8e085a0)_ — `app-builder-lib`
- Fix: Remove path from published binaries _[`#8631`](https://github.com/electron-userland/electron-builder/pull/8631) [`dcd91a1`](https://github.com/electron-userland/electron-builder/commit/dcd91a1f79be5bde7bb418b0eaa83d03f11d41fe)_ — `electron-publish`
- Fix: add rfc3161 timestamp entry as default for azure signing to resolve Windows Defender alert _[`#8627`](https://github.com/electron-userland/electron-builder/pull/8627) [`2a3195d`](https://github.com/electron-userland/electron-builder/commit/2a3195d99f42e9b4f70e5719525db046a327aeb7)_ — `app-builder-lib`
- Fix: only sign concurrently when using local signtool. azure can't be in parallel due to resources being locked during usage _[`#8632`](https://github.com/electron-userland/electron-builder/pull/8632) [`645e2ab`](https://github.com/electron-userland/electron-builder/commit/645e2abd5ed604fe4f4d9475cf2cedf4fe78436c)_ — `app-builder-lib`
- Chore: refactor electron dist logic to avoid unnecessary console logs _[`#8639`](https://github.com/electron-userland/electron-builder/pull/8639) [`2800662`](https://github.com/electron-userland/electron-builder/commit/28006623a1a344007e283cdc65ce1a81f42a136d)_ — `app-builder-lib`
- Fix(win): add required `publisherName` field to Azure Trusted Signing _[`#8650`](https://github.com/electron-userland/electron-builder/pull/8650) [`f84a083`](https://github.com/electron-userland/electron-builder/commit/f84a0831d1d02b782ad07d4f7feff79d96dd45ec)_ — `app-builder-lib`
- Fix: cscIKeyPassword must support empty string arguments _[`#8653`](https://github.com/electron-userland/electron-builder/pull/8653) [`796e1a0`](https://github.com/electron-userland/electron-builder/commit/796e1a072a2bbe97ced6f4be05325c704fc04b7f)_ — `app-builder-lib`
- Fix: check ResolvedFileSet src when verifying symlinks to be within project directory _[`#8654`](https://github.com/electron-userland/electron-builder/pull/8654) [`9e11358`](https://github.com/electron-userland/electron-builder/commit/9e11358fc28249675cd7ec4f7037408cc18dfa8a)_ — `app-builder-lib`
- Fix: use FileCopier for copying files and queue creation of symlinks _[`a1ee041`](https://github.com/electron-userland/electron-builder/commit/a1ee04191f12920585fea8fa648cd0c4b0ed0558)_ — `app-builder-lib`
- Chore(deps): update electron/asar to 3.2.17 _[`#8671`](https://github.com/electron-userland/electron-builder/pull/8671) [`a4505a3`](https://github.com/electron-userland/electron-builder/commit/a4505a3785c17fc1aaaeaa91ba2653787219d74a)_ — `app-builder-lib`
- Chore(mac): add back logging of identity name and hash as opposed to just hash _[`#8691`](https://github.com/electron-userland/electron-builder/pull/8691) [`5a9141f`](https://github.com/electron-userland/electron-builder/commit/5a9141f60ac6d51a4b839b73271274bef5c6ca70)_ — `app-builder-lib`
- Fix(win): corrupt asar integrity file path on crossplatform build _[`#8689`](https://github.com/electron-userland/electron-builder/pull/8689) [`1d7f87c`](https://github.com/electron-userland/electron-builder/commit/1d7f87c1028fa94c9bb80c167bb1fb87cbc84817)_ — `app-builder-lib`
- Fix(deps): update dependency cross-spawn to v7.0.5 [security] _[`#8693`](https://github.com/electron-userland/electron-builder/pull/8693) [`6a6bed4`](https://github.com/electron-userland/electron-builder/commit/6a6bed46c428b45105ada071a9cb89b5d4f93d9e)_ — `builder-util`
- Chore: migrate default recommends and default depends for fpm from app-builder-bin to JS code _[`#8637`](https://github.com/electron-userland/electron-builder/pull/8637) [`667ab2f`](https://github.com/electron-userland/electron-builder/commit/667ab2f8d5d635b5ab03cd5de06561403135a7f6)_ — `app-builder-lib`
- Fix: smart unpack for local module with dll _[`#8645`](https://github.com/electron-userland/electron-builder/pull/8645) [`f4d40f9`](https://github.com/electron-userland/electron-builder/commit/f4d40f91f1511fc55cbef7c9e7edfddaf6ab67bc)_ — `app-builder-lib`, `builder-util`
- Fix(deps): update dependency eslint to v9.16.0 [security] _[`#8717`](https://github.com/electron-userland/electron-builder/pull/8717) [`9381513`](https://github.com/electron-userland/electron-builder/commit/9381513df8c2888ebcd999283991bed64b7058e0)_
- Chore: remove stale handler for `extend-info` in electronMac plist creation _[`#8661`](https://github.com/electron-userland/electron-builder/pull/8661) [`6a294c9`](https://github.com/electron-userland/electron-builder/commit/6a294c9725f30cf1b6151363a32b9d1395b0122e)_ — `app-builder-lib`
- Fix: does not work with NPM workspaces _[`#8715`](https://github.com/electron-userland/electron-builder/pull/8715) [`4c394d5`](https://github.com/electron-userland/electron-builder/commit/4c394d54689f03bbca54a083c7e126d9c83e6ed7)_ — `app-builder-lib`
- Chore: Remove informal Russian messages in the NSIS installer _[`#8714`](https://github.com/electron-userland/electron-builder/pull/8714) [`6633450`](https://github.com/electron-userland/electron-builder/commit/66334502a50d1decb15eb3ac3bdcd197b3721036)_ — `app-builder-lib`
- Chore: Rename `vmRequired` variable to `useVmIfNotOnWin` _[`#8727`](https://github.com/electron-userland/electron-builder/pull/8727) [`7268c2e`](https://github.com/electron-userland/electron-builder/commit/7268c2eea3f4a5b5d4f88283585797ce5c41de1c)_ — `app-builder-lib`
- Fix: typo in urls in tsdoc _[`#8749`](https://github.com/electron-userland/electron-builder/pull/8749) [`ee2c6dc`](https://github.com/electron-userland/electron-builder/commit/ee2c6dc133ed31fd82ad8fdf864651494c88fcf8)_ — `app-builder-lib`
- Fix: update @electron/asar to 3.2.18 to resolve signing issue with framework symlinks _[`#8762`](https://github.com/electron-userland/electron-builder/pull/8762) [`c4f5497`](https://github.com/electron-userland/electron-builder/commit/c4f54977045ad3f6f7637004f632c37bfb41e79a)_ — `app-builder-lib`
- Fix: electron-builder fails when list of node_modules files is too big to pass in a glob _[`#8725`](https://github.com/electron-userland/electron-builder/pull/8725) [`ccbf0a5`](https://github.com/electron-userland/electron-builder/commit/ccbf0a5be38e1d8e405ed9d2bc9f3b2755548182)_ — `app-builder-lib`
- Chore(deps): upgrade cross spawn 7.0.6 _[`#8783`](https://github.com/electron-userland/electron-builder/pull/8783) [`a5558e3`](https://github.com/electron-userland/electron-builder/commit/a5558e3380fdde4806c4c29694d4fe70fd11423a)_ — `builder-util`
- Fix(mac): only fuse macOS universal builds on the combined universal package _[`#8799`](https://github.com/electron-userland/electron-builder/pull/8799) [`45a402b`](https://github.com/electron-userland/electron-builder/commit/45a402b9786bcb8e71bfc12c9498552f597653ec)_ — `app-builder-lib`
- Fix: ASAR files in extraResources are not included in integrity calculations _[`#8805`](https://github.com/electron-userland/electron-builder/pull/8805) [`c6d6b6e`](https://github.com/electron-userland/electron-builder/commit/c6d6b6e57be2c042dc586ae13f1af38a8a19af41)_ — `app-builder-lib`

## electron-updater@6.4.0

### Minor Changes

- Feat: Implement autoupdates for pacman _[`#8394`](https://github.com/electron-userland/electron-builder/pull/8394) [`ae9221d`](https://github.com/electron-userland/electron-builder/commit/ae9221d947c2dedff7b655ddafceb9746f9f4460)_
- Feat(updater): allow usage of `autoRunAppAfterInstall` on mac updater _[`#8633`](https://github.com/electron-userland/electron-builder/pull/8633) [`96f5c3e`](https://github.com/electron-userland/electron-builder/commit/96f5c3ebbd6b3b58c9c5d3e777577d49edcb6e5a)_
- Add `host` property to support self-hosted Keygen instances _[`#8711`](https://github.com/electron-userland/electron-builder/pull/8711) [`6f0fb8e`](https://github.com/electron-userland/electron-builder/commit/6f0fb8e44f035bcd6ff0d6f234b38c20fde066af)_ — `electron-updater`, `builder-util-runtime`
- Add `forcePathStyle` option to S3Options _[`#8741`](https://github.com/electron-userland/electron-builder/pull/8741) [`eacbbf5`](https://github.com/electron-userland/electron-builder/commit/eacbbf593f6ea01a92ffb41d8d28ee5e4e480ea1)_ — `builder-util-runtime`

### Patch Changes

- Fix: copyFileSync operation will block the main thread _[`#8623`](https://github.com/electron-userland/electron-builder/pull/8623) [`cfa67c0`](https://github.com/electron-userland/electron-builder/commit/cfa67c01827a44c88fb8448562dbe928ba37494f)_
- Fix: respect `disableDifferentialDownload` flag for AppImage _[`#8695`](https://github.com/electron-userland/electron-builder/pull/8695) [`819eff7`](https://github.com/electron-userland/electron-builder/commit/819eff7bf7f319275d70faf3a64a5a18a3793a7c)_
- Fix(linux): AppImage update fails when filename contains spaces _[`#8802`](https://github.com/electron-userland/electron-builder/pull/8802) [`4a68fd2`](https://github.com/electron-userland/electron-builder/commit/4a68fd2d3d529b0f854877a5415f9ccad00b61fd)_



# [26.0.0-alpha.11](https://github.com/electron-userland/electron-builder/compare/v26.0.0-alpha.10...v26.0.0-alpha.11) (2025-01-25)

## electron-builder@26.0.0-alpha.11

### Patch Changes

- Fix(mac): only fuse macOS universal builds on the combined universal package _[`#8799`](https://github.com/electron-userland/electron-builder/pull/8799) [`45a402b`](https://github.com/electron-userland/electron-builder/commit/45a402b9786bcb8e71bfc12c9498552f597653ec)_ — `app-builder-lib`
- Fix: ASAR files in extraResources are not included in integrity calculations _[`#8805`](https://github.com/electron-userland/electron-builder/pull/8805) [`c6d6b6e`](https://github.com/electron-userland/electron-builder/commit/c6d6b6e57be2c042dc586ae13f1af38a8a19af41)_ — `app-builder-lib`

## electron-updater@6.4.0-alpha.4

### Patch Changes

- Fix(linux): AppImage update fails when filename contains spaces _[`#8802`](https://github.com/electron-userland/electron-builder/pull/8802) [`4a68fd2`](https://github.com/electron-userland/electron-builder/commit/4a68fd2d3d529b0f854877a5415f9ccad00b61fd)_



# [26.0.0-alpha.10](https://github.com/electron-userland/electron-builder/compare/v26.0.0-alpha.9...v26.0.0-alpha.10) (2025-01-21)

## electron-builder@26.0.0-alpha.10

### Major Changes

- Chore: upgrade buildpack-deps base image from `focal` to `jammy`. This also forces upgrading `python`->`python3` package and wine-stable _[`#8779`](https://github.com/electron-userland/electron-builder/pull/8779) [`74355da`](https://github.com/electron-userland/electron-builder/commit/74355da9055113b243323cdc6bb800ce722be2df)_
- Fix: removing conditional logic that would build HFS+ dmg on non-arm64 macs as HFS+ was sunset in macos 15.2 _[`#8782`](https://github.com/electron-userland/electron-builder/pull/8782) [`633490c`](https://github.com/electron-userland/electron-builder/commit/633490cb395c0af8027116b345500c58a7616964)_ — `dmg-builder`

### Minor Changes

- Feat: add `pwsh` detection to enable azure trusted signing within docker image _[`#8787`](https://github.com/electron-userland/electron-builder/pull/8787) [`cdf18d9`](https://github.com/electron-userland/electron-builder/commit/cdf18d9a0f65068e179e43152699c366c4c29467)_ — `app-builder-lib`

### Patch Changes

- Chore(deps): upgrade cross spawn 7.0.6 _[`#8783`](https://github.com/electron-userland/electron-builder/pull/8783) [`a5558e3`](https://github.com/electron-userland/electron-builder/commit/a5558e3380fdde4806c4c29694d4fe70fd11423a)_ — `builder-util`



# [26.0.0-alpha.9](https://github.com/electron-userland/electron-builder/compare/v26.0.0-alpha.8...v26.0.0-alpha.9) (2025-01-15)

## electron-builder@26.0.0-alpha.9

### Major Changes

- Chore: remove deprecated fields from `winOptions` and `macOptions` _[`#8582`](https://github.com/electron-userland/electron-builder/pull/8582) [`6a9597b`](https://github.com/electron-userland/electron-builder/commit/6a9597b4d739744fd9211fc07f55bb34211c7626)_ — `app-builder-lib`

  For `winOptions` signing configuration, it has been moved to `win.signtoolOptions` in order to support `azureOptions` as a separate field and avoid bloating `win` configuration object
  For `macOptions`, notarize options has been deprecated in favor of env vars for quite some time. Env vars are much more secure

### Minor Changes

- Feat: support completely custom AppxManifest.xml _[`#8609`](https://github.com/electron-userland/electron-builder/pull/8609) [`d672b04`](https://github.com/electron-userland/electron-builder/commit/d672b04b4746170c07bc39b7b049ab0c584e7a19)_ — `app-builder-lib`
- Feat: allow disabling of building a universal windows installer _[`#8607`](https://github.com/electron-userland/electron-builder/pull/8607) [`f123628`](https://github.com/electron-userland/electron-builder/commit/f123628ce400b5e65d0e4f0966e5cc65a1f3b8a5)_ — `app-builder-lib`

### Patch Changes

- Fix: typo in urls in tsdoc _[`#8749`](https://github.com/electron-userland/electron-builder/pull/8749) [`ee2c6dc`](https://github.com/electron-userland/electron-builder/commit/ee2c6dc133ed31fd82ad8fdf864651494c88fcf8)_ — `app-builder-lib`
- Fix: update @electron/asar to 3.2.18 to resolve signing issue with framework symlinks _[`#8762`](https://github.com/electron-userland/electron-builder/pull/8762) [`c4f5497`](https://github.com/electron-userland/electron-builder/commit/c4f54977045ad3f6f7637004f632c37bfb41e79a)_ — `app-builder-lib`
- Fix: electron-builder fails when list of node_modules files is too big to pass in a glob _[`#8725`](https://github.com/electron-userland/electron-builder/pull/8725) [`ccbf0a5`](https://github.com/electron-userland/electron-builder/commit/ccbf0a5be38e1d8e405ed9d2bc9f3b2755548182)_ — `app-builder-lib`

## electron-updater@6.4.0-alpha.3

### Patch Changes

- Fix: respect `disableDifferentialDownload` flag for AppImage _[`#8695`](https://github.com/electron-userland/electron-builder/pull/8695) [`819eff7`](https://github.com/electron-userland/electron-builder/commit/819eff7bf7f319275d70faf3a64a5a18a3793a7c)_



# [26.0.0-alpha.8](https://github.com/electron-userland/electron-builder/compare/v26.0.0-alpha.7...v26.0.0-alpha.8) (2024-12-17)

## electron-builder@26.0.0-alpha.8

### Minor Changes

- Add `host` property to support self-hosted Keygen instances _[`#8711`](https://github.com/electron-userland/electron-builder/pull/8711) [`6f0fb8e`](https://github.com/electron-userland/electron-builder/commit/6f0fb8e44f035bcd6ff0d6f234b38c20fde066af)_ — `app-builder-lib`, `builder-util-runtime`, `electron-publish`
- Add `forcePathStyle` option to S3Options _[`#8741`](https://github.com/electron-userland/electron-builder/pull/8741) [`eacbbf5`](https://github.com/electron-userland/electron-builder/commit/eacbbf593f6ea01a92ffb41d8d28ee5e4e480ea1)_ — `builder-util`, `builder-util-runtime`, `electron-publish`

### Patch Changes

- Chore: remove stale handler for `extend-info` in electronMac plist creation _[`#8661`](https://github.com/electron-userland/electron-builder/pull/8661) [`6a294c9`](https://github.com/electron-userland/electron-builder/commit/6a294c9725f30cf1b6151363a32b9d1395b0122e)_ — `app-builder-lib`
- Fix: does not work with NPM workspaces _[`#8715`](https://github.com/electron-userland/electron-builder/pull/8715) [`4c394d5`](https://github.com/electron-userland/electron-builder/commit/4c394d54689f03bbca54a083c7e126d9c83e6ed7)_ — `app-builder-lib`
- Chore: Remove informal Russian messages in the NSIS installer _[`#8714`](https://github.com/electron-userland/electron-builder/pull/8714) [`6633450`](https://github.com/electron-userland/electron-builder/commit/66334502a50d1decb15eb3ac3bdcd197b3721036)_ — `app-builder-lib`
- Chore: Rename `vmRequired` variable to `useVmIfNotOnWin` _[`#8727`](https://github.com/electron-userland/electron-builder/pull/8727) [`7268c2e`](https://github.com/electron-userland/electron-builder/commit/7268c2eea3f4a5b5d4f88283585797ce5c41de1c)_ — `app-builder-lib`

## electron-updater@6.4.0-alpha.2

### Minor Changes

- Add `host` property to support self-hosted Keygen instances _[`#8711`](https://github.com/electron-userland/electron-builder/pull/8711) [`6f0fb8e`](https://github.com/electron-userland/electron-builder/commit/6f0fb8e44f035bcd6ff0d6f234b38c20fde066af)_ — `electron-updater`, `builder-util-runtime`
- Add `forcePathStyle` option to S3Options _[`#8741`](https://github.com/electron-userland/electron-builder/pull/8741) [`eacbbf5`](https://github.com/electron-userland/electron-builder/commit/eacbbf593f6ea01a92ffb41d8d28ee5e4e480ea1)_ — `builder-util-runtime`



# [26.0.0-alpha.7](https://github.com/electron-userland/electron-builder/compare/v26.0.0-alpha.6...v26.0.0-alpha.7) (2024-12-03)

## electron-builder@26.0.0-alpha.7

### Patch Changes

- Chore(mac): add back logging of identity name and hash as opposed to just hash _[`#8691`](https://github.com/electron-userland/electron-builder/pull/8691) [`5a9141f`](https://github.com/electron-userland/electron-builder/commit/5a9141f60ac6d51a4b839b73271274bef5c6ca70)_ — `app-builder-lib`
- Fix(win): corrupt asar integrity file path on crossplatform build _[`#8689`](https://github.com/electron-userland/electron-builder/pull/8689) [`1d7f87c`](https://github.com/electron-userland/electron-builder/commit/1d7f87c1028fa94c9bb80c167bb1fb87cbc84817)_ — `app-builder-lib`
- Fix(deps): update dependency cross-spawn to v7.0.5 [security] _[`#8693`](https://github.com/electron-userland/electron-builder/pull/8693) [`6a6bed4`](https://github.com/electron-userland/electron-builder/commit/6a6bed46c428b45105ada071a9cb89b5d4f93d9e)_ — `builder-util`
- Chore: migrate default recommends and default depends for fpm from app-builder-bin to JS code _[`#8637`](https://github.com/electron-userland/electron-builder/pull/8637) [`667ab2f`](https://github.com/electron-userland/electron-builder/commit/667ab2f8d5d635b5ab03cd5de06561403135a7f6)_ — `app-builder-lib`
- Fix: smart unpack for local module with dll _[`#8645`](https://github.com/electron-userland/electron-builder/pull/8645) [`f4d40f9`](https://github.com/electron-userland/electron-builder/commit/f4d40f91f1511fc55cbef7c9e7edfddaf6ab67bc)_ — `app-builder-lib`, `builder-util`
- Fix(deps): update dependency eslint to v9.16.0 [security] _[`#8717`](https://github.com/electron-userland/electron-builder/pull/8717) [`9381513`](https://github.com/electron-userland/electron-builder/commit/9381513df8c2888ebcd999283991bed64b7058e0)_



# [26.0.0-alpha.6](https://github.com/electron-userland/electron-builder/compare/v26.0.0-alpha.5...v26.0.0-alpha.6) (2024-11-07)

## electron-builder@26.0.0-alpha.6

### Minor Changes

- Feat: add support for AppArmor with template profile and configuration property _[`#8636`](https://github.com/electron-userland/electron-builder/pull/8636) [`88cc0b0`](https://github.com/electron-userland/electron-builder/commit/88cc0b06dba22139721fd1e04f6a1cf2d447edbd)_ — `app-builder-lib`

### Patch Changes

- Fix: use FileCopier for copying files and queue creation of symlinks _[`a1ee041`](https://github.com/electron-userland/electron-builder/commit/a1ee04191f12920585fea8fa648cd0c4b0ed0558)_ — `app-builder-lib`
- Chore(deps): update electron/asar to 3.2.17 _[`#8671`](https://github.com/electron-userland/electron-builder/pull/8671) [`a4505a3`](https://github.com/electron-userland/electron-builder/commit/a4505a3785c17fc1aaaeaa91ba2653787219d74a)_ — `app-builder-lib`



# [26.0.0-alpha.5](https://github.com/electron-userland/electron-builder/compare/v26.0.0-alpha.4...v26.0.0-alpha.5) (2024-11-01)

## electron-builder@26.0.0-alpha.5

### Patch Changes

- Chore: refactor electron dist logic to avoid unnecessary console logs _[`#8639`](https://github.com/electron-userland/electron-builder/pull/8639) [`2800662`](https://github.com/electron-userland/electron-builder/commit/28006623a1a344007e283cdc65ce1a81f42a136d)_ — `app-builder-lib`
- Fix(win): add required `publisherName` field to Azure Trusted Signing _[`#8650`](https://github.com/electron-userland/electron-builder/pull/8650) [`f84a083`](https://github.com/electron-userland/electron-builder/commit/f84a0831d1d02b782ad07d4f7feff79d96dd45ec)_ — `app-builder-lib`
- Fix: cscIKeyPassword must support empty string arguments _[`#8653`](https://github.com/electron-userland/electron-builder/pull/8653) [`796e1a0`](https://github.com/electron-userland/electron-builder/commit/796e1a072a2bbe97ced6f4be05325c704fc04b7f)_ — `app-builder-lib`
- Fix: check ResolvedFileSet src when verifying symlinks to be within project directory _[`#8654`](https://github.com/electron-userland/electron-builder/pull/8654) [`9e11358`](https://github.com/electron-userland/electron-builder/commit/9e11358fc28249675cd7ec4f7037408cc18dfa8a)_ — `app-builder-lib`



# [26.0.0-alpha.4](https://github.com/electron-userland/electron-builder/compare/v26.0.0-alpha.3...v26.0.0-alpha.4) (2024-10-28)

## electron-builder@26.0.0-alpha.4

### Patch Changes

- Fix: Remove path from published binaries _[`#8631`](https://github.com/electron-userland/electron-builder/pull/8631) [`dcd91a1`](https://github.com/electron-userland/electron-builder/commit/dcd91a1f79be5bde7bb418b0eaa83d03f11d41fe)_ — `electron-publish`
- Fix: add rfc3161 timestamp entry as default for azure signing to resolve Windows Defender alert _[`#8627`](https://github.com/electron-userland/electron-builder/pull/8627) [`2a3195d`](https://github.com/electron-userland/electron-builder/commit/2a3195d99f42e9b4f70e5719525db046a327aeb7)_ — `app-builder-lib`
- Fix: only sign concurrently when using local signtool. azure can't be in parallel due to resources being locked during usage _[`#8632`](https://github.com/electron-userland/electron-builder/pull/8632) [`645e2ab`](https://github.com/electron-userland/electron-builder/commit/645e2abd5ed604fe4f4d9475cf2cedf4fe78436c)_ — `app-builder-lib`

## electron-updater@6.4.0-alpha.1

### Minor Changes

- Feat(updater): allow usage of `autoRunAppAfterInstall` on mac updater _[`#8633`](https://github.com/electron-userland/electron-builder/pull/8633) [`96f5c3e`](https://github.com/electron-userland/electron-builder/commit/96f5c3ebbd6b3b58c9c5d3e777577d49edcb6e5a)_

### Patch Changes

- Fix: copyFileSync operation will block the main thread _[`#8623`](https://github.com/electron-userland/electron-builder/pull/8623) [`cfa67c0`](https://github.com/electron-userland/electron-builder/commit/cfa67c01827a44c88fb8448562dbe928ba37494f)_



# [26.0.0-alpha.3](https://github.com/electron-userland/electron-builder/compare/v26.0.0-alpha.2...v26.0.0-alpha.3) (2024-10-16)

## electron-builder@26.0.0-alpha.3

### Patch Changes

- Revert "fix(win): use appInfo description as primary entry for FileDescription" to resolve https://github.com/electron-userland/electron-builder/issues/8599 _[`#8601`](https://github.com/electron-userland/electron-builder/pull/8601) [`215fc36`](https://github.com/electron-userland/electron-builder/commit/215fc36b5e8d243ef5bc77d31eb8e30d0e8bca9d)_ — `app-builder-lib`
- Fix: checking relative path without separator as that doesn't work on Windows _[`#8603`](https://github.com/electron-userland/electron-builder/pull/8603) [`712a8bc`](https://github.com/electron-userland/electron-builder/commit/712a8bce56331cd89df270f182fa27bf365e985b)_ — `app-builder-lib`
- Chore(deps): update app-builder-bin to 5.0.0-alpha.11 _[`#8604`](https://github.com/electron-userland/electron-builder/pull/8604) [`d4ea0d9`](https://github.com/electron-userland/electron-builder/commit/d4ea0d998d0fb3ea3a75ca8d39a69a2f3c710962)_ — `builder-util`
- Chore: refactor files for publishing to electron-publish _[`#8596`](https://github.com/electron-userland/electron-builder/pull/8596) [`e0b0e35`](https://github.com/electron-userland/electron-builder/commit/e0b0e351baecc29e08d9f7d90f4699150b229416)_ — `electron-builder`, `app-builder-lib`, `builder-util`, `dmg-builder`, `electron-builder-squirrel-windows`, `electron-publish`
- Fix: add quotes to surround file path during azure signing to handle files with spaces _[`#8606`](https://github.com/electron-userland/electron-builder/pull/8606) [`a0e635c`](https://github.com/electron-userland/electron-builder/commit/a0e635c183633c291fd2e0a0e8c9a1c6b8e085a0)_ — `app-builder-lib`



# [26.0.0-alpha.2](https://github.com/electron-userland/electron-builder/compare/v26.0.0-alpha.1...v26.0.0-alpha.2) (2024-10-13)

## electron-builder@26.0.0-alpha.2

### Minor Changes

- Feat: migrate to official `electron/asar` packaging _[`#8570`](https://github.com/electron-userland/electron-builder/pull/8570) [`c848430`](https://github.com/electron-userland/electron-builder/commit/c84843053a8f9e0b6af14c6b2ed33c5f82d495b3)_ — `app-builder-lib`
- Feat: adding integration with @electron/fuses _[`#8588`](https://github.com/electron-userland/electron-builder/pull/8588) [`8434e10`](https://github.com/electron-userland/electron-builder/commit/8434e10dad0893ca11c5f3a17a70470065f96fa0)_ — `app-builder-lib`



# [26.0.0-alpha.1](https://github.com/electron-userland/electron-builder/compare/v26.0.0-alpha.0...v26.0.0-alpha.1) (2024-10-10)

## electron-builder@26.0.0-alpha.1

### Patch Changes

- Fix: add additional default exclusions to copy logic _[`#8577`](https://github.com/electron-userland/electron-builder/pull/8577) [`e9eef0c`](https://github.com/electron-userland/electron-builder/commit/e9eef0c1c7f73a5edfe3026f044c6278641077cb)_ — `app-builder-lib`
- Chore(deps): update @electron/rebuild to v3.7.0 _[`#8575`](https://github.com/electron-userland/electron-builder/pull/8575) [`dfa35c3`](https://github.com/electron-userland/electron-builder/commit/dfa35c321f6e68c6a102ddc49aa64985fb11d396)_ — `app-builder-lib`
- Fix: packages in the workspace not being under node_modules _[`#8576`](https://github.com/electron-userland/electron-builder/pull/8576) [`3eab714`](https://github.com/electron-userland/electron-builder/commit/3eab7143d74262caace81ea05e97617d07daf336)_ — `app-builder-lib`, `builder-util`



# [26.0.0-alpha.0](https://github.com/electron-userland/electron-builder/compare/electron-builder@25.1.8...v26.0.0-alpha.0) (2024-10-09)

## electron-builder@26.0.0-alpha.0

### Major Changes

- Support including node_modules in other subdirectories _[`#8562`](https://github.com/electron-userland/electron-builder/pull/8562) [`b8185d4`](https://github.com/electron-userland/electron-builder/commit/b8185d48a75e65932196700e28bf71613dd141b4)_ — `app-builder-lib`, `builder-util`
- Feat: allowing additional entries in .desktop file, such as `[Desktop Actions <actionName>]`. Requires changing configuration `desktop` property to object to be more extensible in the future _[`#8572`](https://github.com/electron-userland/electron-builder/pull/8572) [`0dbe357`](https://github.com/electron-userland/electron-builder/commit/0dbe357ac5b4f3c51d9a6e9d7bbf0b1f142b5746)_ — `app-builder-lib`

### Minor Changes

- Feat: Implement autoupdates for pacman _[`#8394`](https://github.com/electron-userland/electron-builder/pull/8394) [`ae9221d`](https://github.com/electron-userland/electron-builder/commit/ae9221d947c2dedff7b655ddafceb9746f9f4460)_ — `app-builder-lib`
- Feat: migrate `electronDist` to be an electron-builder `Hook` _[`#8525`](https://github.com/electron-userland/electron-builder/pull/8525) [`13f55a3`](https://github.com/electron-userland/electron-builder/commit/13f55a3ef070d946f5d80dd412a557bd38c98424)_ — `app-builder-lib`

### Patch Changes

- Chore: change signing warning message to debug _[`#8566`](https://github.com/electron-userland/electron-builder/pull/8566) [`e45fecf`](https://github.com/electron-userland/electron-builder/commit/e45fecf04d1ba758ed524391a1fc161e5c57d305)_ — `app-builder-lib`
- Chore(deps): update ejs to v3.1.10 _[`#8573`](https://github.com/electron-userland/electron-builder/pull/8573) [`1fee87a`](https://github.com/electron-userland/electron-builder/commit/1fee87a20e1bca88f185967ca540d60177e13653)_ — `app-builder-lib`

## electron-updater@6.4.0-alpha.0

### Minor Changes

- Feat: Implement autoupdates for pacman _[`#8394`](https://github.com/electron-userland/electron-builder/pull/8394) [`ae9221d`](https://github.com/electron-userland/electron-builder/commit/ae9221d947c2dedff7b655ddafceb9746f9f4460)_



# [25.1.8](https://github.com/electron-userland/electron-builder/compare/electron-builder@25.1.7...electron-builder@25.1.8) (2024-10-06)

## electron-builder@25.1.8

### Patch Changes

- Fix: Path does not end with the package name _[`#8560`](https://github.com/electron-userland/electron-builder/pull/8560) [`4ff778e`](https://github.com/electron-userland/electron-builder/commit/4ff778eefd9089b3b38b67156eb39e8cf57fdd83)_ — `app-builder-lib`



# [25.1.7](https://github.com/electron-userland/electron-builder/compare/v25.1.6...electron-builder@25.1.7) (2024-10-02)

## electron-builder@25.1.7

### Patch Changes

- Chore(deps): update devDependencies, including typescript _[`#8545`](https://github.com/electron-userland/electron-builder/pull/8545) [`fc3a78e`](https://github.com/electron-userland/electron-builder/commit/fc3a78e4e61f916058fca9b15fc16f076c3fabd1)_ — `electron-builder`, `app-builder-lib`, `builder-util`, `builder-util-runtime`, `dmg-builder`, `electron-builder-squirrel-windows`, `electron-forge-maker-appimage`, `electron-forge-maker-nsis`, `electron-forge-maker-nsis-web`, `electron-forge-maker-snap`, `electron-publish`
- Fix: pass in platform to electron-rebuild _[`#8537`](https://github.com/electron-userland/electron-builder/pull/8537) [`2e84f01`](https://github.com/electron-userland/electron-builder/commit/2e84f01351bcfb8f32df17c17bfeeeebb87a713f)_ — `app-builder-lib`, `dmg-builder`
- Fix the main matcher patterns for !node_modules/xxxx _[`#8547`](https://github.com/electron-userland/electron-builder/pull/8547) [`7488456`](https://github.com/electron-userland/electron-builder/commit/7488456309d80b88fbf99fb382752078dc8ddefa)_ — `app-builder-lib`
- Check if the file already starts with a UTF-8 BOM _[`#8551`](https://github.com/electron-userland/electron-builder/pull/8551) [`57cebf4`](https://github.com/electron-userland/electron-builder/commit/57cebf4dd4c722456245286d2fd795f7a5fc862c)_ — `app-builder-lib`

## electron-updater@6.3.9

### Patch Changes

- Fix: Unable to copy file for caching: ENOENT _[`#8541`](https://github.com/electron-userland/electron-builder/pull/8541) [`b6d6ea9`](https://github.com/electron-userland/electron-builder/commit/b6d6ea993fd3b368d28786c259bb50486aaac417)_
- Chore(deps): update devDependencies, including typescript _[`#8545`](https://github.com/electron-userland/electron-builder/pull/8545) [`fc3a78e`](https://github.com/electron-userland/electron-builder/commit/fc3a78e4e61f916058fca9b15fc16f076c3fabd1)_ — `electron-updater`, `builder-util-runtime`



# [25.1.6](https://github.com/electron-userland/electron-builder/compare/v25.1.5...v25.1.6) (2024-09-26)

## electron-builder@25.1.6

### Patch Changes

- Fix: always produce Release .node builds _[`#8531`](https://github.com/electron-userland/electron-builder/pull/8531) [`eaf274d`](https://github.com/electron-userland/electron-builder/commit/eaf274d447d27d27a7ad663c5642a38d66f69917)_ — `app-builder-lib`
- Fix: add `CodeSigningAccountName` as required prop in Azure Signing Options _[`#8533`](https://github.com/electron-userland/electron-builder/pull/8533) [`cc8c70f`](https://github.com/electron-userland/electron-builder/commit/cc8c70f7af5ca53b4c07b8ee32f460eabd4f9c34)_ — `app-builder-lib`
- Chore(deps): update dependency app-builder-bin to 5.0.0-alpha.10 _[`#8534`](https://github.com/electron-userland/electron-builder/pull/8534) [`097eece`](https://github.com/electron-userland/electron-builder/commit/097eeced3c82a3f19d7b80f2a23f1f7749b8af92)_ — `builder-util`



# [25.1.5](https://github.com/electron-userland/electron-builder/compare/v25.1.4...v25.1.5) (2024-09-23)

## electron-builder@25.1.5

### Patch Changes

- Fix(chore): upgrading typescript and fixing compiler errors _[`#8516`](https://github.com/electron-userland/electron-builder/pull/8516) [`d1cb6bd`](https://github.com/electron-userland/electron-builder/commit/d1cb6bdbf8111156bb16839f501bdd9e6d477338)_ — `app-builder-lib`, `builder-util`, `builder-util-runtime`, `dmg-builder`
- Fix: moving cscInfo logic into signtoolManager to distinguish the logic between custom sign, csc info, and azure signing _[`#8524`](https://github.com/electron-userland/electron-builder/pull/8524) [`62fd74d`](https://github.com/electron-userland/electron-builder/commit/62fd74dcfa13a564706141d08e5d0dea11ecf33b)_ — `app-builder-lib`

## electron-updater@6.3.8

### Patch Changes

- Fix(chore): upgrading typescript and fixing compiler errors _[`#8516`](https://github.com/electron-userland/electron-builder/pull/8516) [`d1cb6bd`](https://github.com/electron-userland/electron-builder/commit/d1cb6bdbf8111156bb16839f501bdd9e6d477338)_ — `electron-updater`, `builder-util-runtime`



# [25.1.4](https://github.com/electron-userland/electron-builder/compare/v25.1.3...v25.1.4) (2024-09-19)

## electron-builder@25.1.4

### Patch Changes

- Chore(docs): updating typedocs by extracting docs from documentation .md files _[`#8495`](https://github.com/electron-userland/electron-builder/pull/8495) [`48489d1`](https://github.com/electron-userland/electron-builder/commit/48489d187a18d7167477fe8ee1f7412035feb9ca)_ — `app-builder-lib`
- Chore(deps): update dependency https-proxy-agent to v7 _[`#8475`](https://github.com/electron-userland/electron-builder/pull/8475) [`9ab4ff9`](https://github.com/electron-userland/electron-builder/commit/9ab4ff92c0ab441a9ca422f87fbed2f3544dde5e)_ — `builder-util`
- Chore(deps): update dependency http-proxy-agent to v7 _[`#8476`](https://github.com/electron-userland/electron-builder/pull/8476) [`4cacee4`](https://github.com/electron-userland/electron-builder/commit/4cacee4d63ebfc9aacf156bd8b7faa80be1325dc)_ — `builder-util`
- Chore(docs): update more docs with proper hyperlinks _[`#8501`](https://github.com/electron-userland/electron-builder/pull/8501) [`f146b02`](https://github.com/electron-userland/electron-builder/commit/f146b02f88e38eb55a374d67078a6bfb25b55bca)_ — `app-builder-lib`
- Fix: force using `applicationId` if provided before falling back to identityName or app name _[`#8502`](https://github.com/electron-userland/electron-builder/pull/8502) [`4b2f693`](https://github.com/electron-userland/electron-builder/commit/4b2f6937793a69fe15b35022e3ccca3be66b157d)_ — `app-builder-lib`
- Fix(deps): update dependency @electron/notarize to v2.5.0 _[`#8504`](https://github.com/electron-userland/electron-builder/pull/8504) [`59f6cb0`](https://github.com/electron-userland/electron-builder/commit/59f6cb01945c27578052c0e81e588d5c8be459f8)_ — `app-builder-lib`



# [25.1.3](https://github.com/electron-userland/electron-builder/compare/v25.1.2...v25.1.3) (2024-09-17)

## electron-builder@25.1.3

### Patch Changes

- Fix: Fix issues with conflictDependency that have two or more layers _[`#8481`](https://github.com/electron-userland/electron-builder/pull/8481) [`216eaf9`](https://github.com/electron-userland/electron-builder/commit/216eaf935da870f0a1a1b14f2b852f879d467710)_ — `app-builder-lib`
- Chore(deps): update dependency app-builder-bin to 5.0.0-alpha.9 _[`#8489`](https://github.com/electron-userland/electron-builder/pull/8489) [`5e21509`](https://github.com/electron-userland/electron-builder/commit/5e21509a3f40d1a21f6f9ec9bf1d9d72c7149a21)_ — `builder-util`
- Chore: migrating to typedoc and updating/improving type+interface definitions _[`#8491`](https://github.com/electron-userland/electron-builder/pull/8491) [`178a3c4`](https://github.com/electron-userland/electron-builder/commit/178a3c40f35fa9e91a2e4942f61423effa1289e4)_ — `electron-builder`, `app-builder-lib`, `builder-util`, `builder-util-runtime`, `dmg-builder`, `electron-builder-squirrel-windows`, `electron-forge-maker-appimage`, `electron-forge-maker-nsis`, `electron-forge-maker-nsis-web`, `electron-forge-maker-snap`, `electron-publish`

## electron-updater@6.3.7

### Patch Changes

- Chore: migrating to typedoc and updating/improving type+interface definitions _[`#8491`](https://github.com/electron-userland/electron-builder/pull/8491) [`178a3c4`](https://github.com/electron-userland/electron-builder/commit/178a3c40f35fa9e91a2e4942f61423effa1289e4)_ — `electron-updater`, `builder-util-runtime`



# [25.1.2](https://github.com/electron-userland/electron-builder/compare/v25.1.0...v25.1.2) (2024-09-14)

## electron-builder@25.1.2

### Patch Changes

- Fix(deploy): redeploy all packages to sync semver ranges _[`#8486`](https://github.com/electron-userland/electron-builder/pull/8486) [`d56cd27`](https://github.com/electron-userland/electron-builder/commit/d56cd274b9d0fedb71889293164a15e51f7cc744)_ — `electron-builder`, `app-builder-lib`, `builder-util`, `builder-util-runtime`, `dmg-builder`, `electron-builder-squirrel-windows`, `electron-forge-maker-appimage`, `electron-forge-maker-nsis`, `electron-forge-maker-nsis-web`, `electron-forge-maker-snap`, `electron-publish`

## electron-updater@6.3.6

### Patch Changes

- Fix(deploy): redeploy all packages to sync semver ranges _[`#8486`](https://github.com/electron-userland/electron-builder/pull/8486) [`d56cd27`](https://github.com/electron-userland/electron-builder/commit/d56cd274b9d0fedb71889293164a15e51f7cc744)_ — `electron-updater`, `builder-util-runtime`



# [25.1.0](https://github.com/electron-userland/electron-builder/compare/v25.0.6...v25.1.0) (2024-09-13)

## electron-builder@25.1.0

### Minor Changes

- Feat: Implement Azure Trusted Signing _[`#8458`](https://github.com/electron-userland/electron-builder/pull/8458) [`d50d563`](https://github.com/electron-userland/electron-builder/commit/d50d563408c117f82863d0611311226d53ef6e8e)_ — `app-builder-lib`

### Patch Changes

- Chore: improving file path logging to be relative paths when within process.cwd() _[`#8463`](https://github.com/electron-userland/electron-builder/pull/8463) [`c081df8`](https://github.com/electron-userland/electron-builder/commit/c081df8e04494645028c4160bcc1376f029cbca5)_ — `app-builder-lib`
- Chore: update docs to include more interfaces and release configuration _[`#8467`](https://github.com/electron-userland/electron-builder/pull/8467) [`6fe8395`](https://github.com/electron-userland/electron-builder/commit/6fe83950a4195e4ff6611e3ebf91bd2e66d811dd)_ — `app-builder-lib`
- Chore: update resedit to 1.7.1 _[`#8469`](https://github.com/electron-userland/electron-builder/pull/8469) [`770b19f`](https://github.com/electron-userland/electron-builder/commit/770b19f58c5f697618baa604a686a8ade97fea2d)_ — `app-builder-lib`
- Chore(deps): update dependency @electron/notarize to v2.4.0 _[`#8472`](https://github.com/electron-userland/electron-builder/pull/8472) [`28aeb27`](https://github.com/electron-userland/electron-builder/commit/28aeb272ed24d6c3db3c61d551a7afa3794fef4d)_ — `app-builder-lib`
- Chore(deps): update dependency app-builder-bin to v5.0.0-alpha.8 _[`#8478`](https://github.com/electron-userland/electron-builder/pull/8478) [`27a8a60`](https://github.com/electron-userland/electron-builder/commit/27a8a60c86adeaf792bbd0c33f3de23400ded2d4)_ — `builder-util`
- Fix: correct native dependency tree mismatch in app-builder rebuild _[`#8450`](https://github.com/electron-userland/electron-builder/pull/8450) [`55671bd`](https://github.com/electron-userland/electron-builder/commit/55671bd2159d4da8934e7083077d9cc854dc85fb)_ — `electron-builder`, `app-builder-lib`
- Fix: resolveConfig logic ignores `.mjs` filter _[`#8482`](https://github.com/electron-userland/electron-builder/pull/8482) [`ff8059e`](https://github.com/electron-userland/electron-builder/commit/ff8059e385efbf017b9e325e4e7649b5cb6dff15)_ — `app-builder-lib`
- Fix(deploy): regenerate lockfile for test package _[`#8484`](https://github.com/electron-userland/electron-builder/pull/8484) [`3faaa72`](https://github.com/electron-userland/electron-builder/commit/3faaa72550fa15dab60112291aacb9fbe7c3d1d1)_
- Fix(deploy): attempt to install deps before calculating publish changeset _[`17310b4`](https://github.com/electron-userland/electron-builder/commit/17310b4adbf241ff0869e5681e5b34f47ab1a3fb)_



# [25.0.6](https://github.com/electron-userland/electron-builder/compare/v25.0.5...v25.0.6) (2024-09-10)

## electron-builder@25.0.6

### Patch Changes

- Fix: retry renaming update file when EBUSY error occurs due to file lock _[`#8437`](https://github.com/electron-userland/electron-builder/pull/8437) [`be625e0`](https://github.com/electron-userland/electron-builder/commit/be625e06273e56de09ed3298209858043fcd1151)_ — `builder-util`, `builder-util-runtime`
- Fix: allow usage of "module" typ config files _[`#8455`](https://github.com/electron-userland/electron-builder/pull/8455) [`5c8373d`](https://github.com/electron-userland/electron-builder/commit/5c8373d15f99ee9a4c46ed164f95bf1d4a11db28)_ — `electron-builder`, `app-builder-lib`

## electron-updater@6.3.5

### Patch Changes

- Fix: retry renaming update file when EBUSY error occurs due to file lock _[`#8437`](https://github.com/electron-userland/electron-builder/pull/8437) [`be625e0`](https://github.com/electron-userland/electron-builder/commit/be625e06273e56de09ed3298209858043fcd1151)_ — `electron-updater`, `builder-util-runtime`



# [25.0.5](https://github.com/electron-userland/electron-builder/compare/v25.0.4...v25.0.5) (2024-08-22)

## electron-builder@25.0.5

### Minor Changes

- Feat: allow `riscv64` support via custom electron dist _[`#8143`](https://github.com/electron-userland/electron-builder/pull/8143) [`b306895`](https://github.com/electron-userland/electron-builder/commit/b3068954d946be5fe2568183819a26c36d54878b)_

### Patch Changes

- Fix: Snap publish regression in pulling publish config _[`#8424`](https://github.com/electron-userland/electron-builder/pull/8424) [`8e6c171`](https://github.com/electron-userland/electron-builder/commit/8e6c17124cdc523620a66efaf871ef8d335c0f49)_ — `app-builder-lib`

## electron-updater@6.3.4

### Patch Changes

- Fix: windows signature verification special chars _[`#8409`](https://github.com/electron-userland/electron-builder/pull/8409) [`5fae1cf`](https://github.com/electron-userland/electron-builder/commit/5fae1cf3be0388c2bd95a341a0340faa839d2aa7)_
- Fix aborted event _[`#8282`](https://github.com/electron-userland/electron-builder/pull/8282) [`15ce5b4`](https://github.com/electron-userland/electron-builder/commit/15ce5b4164378f7398ff84cabe8ee97eef5cfd1b)_
- Update semver to latest _[`#8417`](https://github.com/electron-userland/electron-builder/pull/8417) [`e77de9f`](https://github.com/electron-userland/electron-builder/commit/e77de9f66184b0cfdab6f1aa9a9c95b041d99c84)_



# [25.0.4](https://github.com/electron-userland/electron-builder/compare/v25.0.3...v25.0.4) (2024-08-11)

## electron-builder@25.0.4

### Patch Changes

- Automatically place .node files into app.asar.unpack _[`#8392`](https://github.com/electron-userland/electron-builder/pull/8392) [`12c52a8`](https://github.com/electron-userland/electron-builder/commit/12c52a81420f04ec0e205dd83798c2b0b773011d)_ — `app-builder-lib`
- Fix: add disableDefaultIgnoredFiles option _[`#8398`](https://github.com/electron-userland/electron-builder/pull/8398) [`5ab2bee`](https://github.com/electron-userland/electron-builder/commit/5ab2bee1e1db77967c65d56443f0dc79de5071da)_ — `app-builder-lib`
- Fix: return parent dir for local dependency _[`#8406`](https://github.com/electron-userland/electron-builder/pull/8406) [`f7daeb9`](https://github.com/electron-userland/electron-builder/commit/f7daeb9976353f7b12c093c88b6e1136b6317880)_ — `app-builder-lib`
- Fix: broken link formatting in the docs _[`#8407`](https://github.com/electron-userland/electron-builder/pull/8407) [`6cc6b8d`](https://github.com/electron-userland/electron-builder/commit/6cc6b8deb4c7682d3c4cc9e450572dd7a135f8ae)_

## electron-updater@6.3.3

### Patch Changes

- Fix: Handle Linux deb auto update installation on applications having spaces in `artifactName`. _[`#8400`](https://github.com/electron-userland/electron-builder/pull/8400) [`9dc0b49`](https://github.com/electron-userland/electron-builder/commit/9dc0b49aea1d3bb56b42c3b1bdb6001708a34439)_
- Fix: allow custom channel in github provider _[`#8393`](https://github.com/electron-userland/electron-builder/pull/8393) [`8dabf64`](https://github.com/electron-userland/electron-builder/commit/8dabf64b8f84975cf4eb016dcd23411ab0d4bf64)_
- Fix: handle spaces for all linux package managers _[`#8403`](https://github.com/electron-userland/electron-builder/pull/8403) [`1c14820`](https://github.com/electron-userland/electron-builder/commit/1c14820b97fad802b300dd93ccd4d6a10a72360f)_



# [25.0.3](https://github.com/electron-userland/electron-builder/compare/v25.0.2...v25.0.3) (2024-07-30)

## electron-builder@25.0.3

### Patch Changes

- Delete the symlink file when the target is empty _[`#8371`](https://github.com/electron-userland/electron-builder/pull/8371) [`afd8132`](https://github.com/electron-userland/electron-builder/commit/afd813265d346b7bddba7ea63563c876f630088e)_ — `app-builder-lib`
- Fix: upgrade app-builder-bin with downgraded appimage tool _[`#8387`](https://github.com/electron-userland/electron-builder/pull/8387) [`553c737`](https://github.com/electron-userland/electron-builder/commit/553c737b2cf1ad835690f7db3c1907ae88944d15)_ — `builder-util`
- Fix the issue of being unable to sign binary files in the Windows runner on Github Actions _[`#8384`](https://github.com/electron-userland/electron-builder/pull/8384) [`f8fbdd1`](https://github.com/electron-userland/electron-builder/commit/f8fbdd122ecdc7a967f3fbeef3572dfd133cc5e3)_ — `app-builder-lib`

## electron-updater@6.3.2

### Patch Changes

- Limit concurrent downloads to 1 _[`#8378`](https://github.com/electron-userland/electron-builder/pull/8378) [`c8fe146`](https://github.com/electron-userland/electron-builder/commit/c8fe1462d529edeed0ad3fe0b7e99e8af1ca61ac)_



# [25.0.2](https://github.com/electron-userland/electron-builder/compare/v25.0.1...v25.0.2) (2024-07-23)

## electron-builder@25.0.2

### Patch Changes

- Fix: adding additional logging when importing/requiring a module in case the hook script is invalid or unable to be executed _[`#8356`](https://github.com/electron-userland/electron-builder/pull/8356) [`2541eb6`](https://github.com/electron-userland/electron-builder/commit/2541eb62a6a8338c87f3d032ff48ed154c2d3cca)_ — `app-builder-lib`
- Chore(deps): update babel monorepo _[`#8364`](https://github.com/electron-userland/electron-builder/pull/8364) [`2a0ea65`](https://github.com/electron-userland/electron-builder/commit/2a0ea65caad1067a193b72d684e7c1f95cdecce5)_ — `app-builder-lib`
- Fix: don't setuid chrome-sandbox when not required _[`#8368`](https://github.com/electron-userland/electron-builder/pull/8368) [`2acdf65`](https://github.com/electron-userland/electron-builder/commit/2acdf65d47ad4b8fb546a00833d646a5e58e5428)_ — `app-builder-lib`
- Fix: allow enabling tsc lib checking on electron-updater package _[`#8372`](https://github.com/electron-userland/electron-builder/pull/8372) [`c85b73d`](https://github.com/electron-userland/electron-builder/commit/c85b73d7c8dcefe86b0b350946af1cea951e6aae)_ — `electron-builder`, `app-builder-lib`
- Fix: checking cancellation token during pack and any retry tasks to exit early on process "cancel" _[`#8375`](https://github.com/electron-userland/electron-builder/pull/8375) [`54c1059`](https://github.com/electron-userland/electron-builder/commit/54c1059b961f7c2a493d26b7e6ef674911069cad)_ — `app-builder-lib`, `builder-util`
- Revert "chore(deps): update dependency mkdocs to <1.7 (#8350)" _[`#8366`](https://github.com/electron-userland/electron-builder/pull/8366) [`30baa4f`](https://github.com/electron-userland/electron-builder/commit/30baa4fe8ddc4c992eafadfb45a16cbd2f7907af)_

## electron-updater@6.3.1

### Patch Changes

- Fix: allow enabling tsc lib checking on electron-updater package _[`#8372`](https://github.com/electron-userland/electron-builder/pull/8372) [`c85b73d`](https://github.com/electron-userland/electron-builder/commit/c85b73d7c8dcefe86b0b350946af1cea951e6aae)_



# [25.0.1](https://github.com/electron-userland/electron-builder/compare/v25.0.0...v25.0.1) (2024-07-18)

## electron-builder@25.0.1

### Patch Changes

- Fix(deps): update dependency @electron/osx-sign to v1.3.1 _[`#8341`](https://github.com/electron-userland/electron-builder/pull/8341) [`578a7e1`](https://github.com/electron-userland/electron-builder/commit/578a7e1a0fcf2a700fe5fadcb1567c1193bd978d)_ — `app-builder-lib`
- Fix(mac): `disablePreGypCopy: true` to handle mac universal builds (fixes #8347) _[`#8352`](https://github.com/electron-userland/electron-builder/pull/8352) [`372b046`](https://github.com/electron-userland/electron-builder/commit/372b046bec23ba0390a6cdb3b4390f033796c833)_ — `app-builder-lib`
- Fix: updating app-builder dependency to resolve #8351 _[`#8353`](https://github.com/electron-userland/electron-builder/pull/8353) [`089dd63`](https://github.com/electron-userland/electron-builder/commit/089dd6396c9638910967c1968d9b8056acd952a9)_ — `builder-util`
- Fix: resolve CI flakiness due to lzma-native dependency _[`#8342`](https://github.com/electron-userland/electron-builder/pull/8342) [`60774a3`](https://github.com/electron-userland/electron-builder/commit/60774a3883d021f27ecce7a37608f025f1a80ce3)_



# [25.0.0](https://github.com/electron-userland/electron-builder/compare/v24.13.3...v25.0.0) (2024-07-14)

## electron-builder@25.0.0

### Minor Changes

- Feat: implementing electron/rebuild with config option `nativeRebuilder` default: `legacy` to support Yarn 3 (modes: `parallel` or `sequential`) _[`#8112`](https://github.com/electron-userland/electron-builder/pull/8112) [`9edfee6`](https://github.com/electron-userland/electron-builder/commit/9edfee6da2de0cfedafebceef0dbfea1a0a17644)_ — `app-builder-lib`
- Feat: support `additionalLightArgs` for msi target _[`#8120`](https://github.com/electron-userland/electron-builder/pull/8120) [`00f46e6`](https://github.com/electron-userland/electron-builder/commit/00f46e6f60a8a762a2094264c2f2473f0a6334be)_ — `app-builder-lib`
- Feat: add disableSanityCheckAsar to allow encrypted asars _[`#8123`](https://github.com/electron-userland/electron-builder/pull/8123) [`031d7d5`](https://github.com/electron-userland/electron-builder/commit/031d7d5bdf911cb6dc4b0b108f82df44f4c2b224)_ — `app-builder-lib`
- Feat: add config options for setting `MinVersion` and `MaxVersionTested` fields in appx manifest _[`#8142`](https://github.com/electron-userland/electron-builder/pull/8142) [`8160363`](https://github.com/electron-userland/electron-builder/commit/8160363ac2821242ab22e225a9038b56e4798cc6)_ — `app-builder-lib`
- Feat: export Packager sub-classes from main electron-builder types _[`#8153`](https://github.com/electron-userland/electron-builder/pull/8153) [`8e36be1`](https://github.com/electron-userland/electron-builder/commit/8e36be113489c1afa6ce5ee6cdda73049bc619a6)_ — `electron-builder`, `app-builder-lib`, `dmg-builder`
- Use `APPLE_TEAM_ID` env var when using notarizing with `APPLE_ID`. _[`#8159`](https://github.com/electron-userland/electron-builder/pull/8159) [`15bffa0`](https://github.com/electron-userland/electron-builder/commit/15bffa00d429d9f333b737712fb3a13f5d26ea53)_ — `electron-builder`, `app-builder-lib`

  Deprecate legacy (`altool`) notarization API.
- Feat: add functionality to just publish artifacts _[`#8150`](https://github.com/electron-userland/electron-builder/pull/8150) [`f4e6ae2`](https://github.com/electron-userland/electron-builder/commit/f4e6ae2931cbf79670b5f2c252a91bed03d96546)_ — `electron-builder`, `app-builder-lib`
- Feat: Support for a separate Github publish token to the auto-update token _[`#8173`](https://github.com/electron-userland/electron-builder/pull/8173) [`3ae3589`](https://github.com/electron-userland/electron-builder/commit/3ae3589a63c2d915b8456d9dc81a965a1366c73b)_ — `electron-publish`
- Feat: add `afterExtract` hook to build process with the same payload interface as `beforePack` and `afterPack` _[`#8194`](https://github.com/electron-userland/electron-builder/pull/8194) [`588c5db`](https://github.com/electron-userland/electron-builder/commit/588c5db47c97e06b540bdc7f7a6de9a936a7603b)_ — `app-builder-lib`
- Feat(mac): support macos signature `additionalArguments` parameter _[`#8218`](https://github.com/electron-userland/electron-builder/pull/8218) [`22737b2`](https://github.com/electron-userland/electron-builder/commit/22737b2b2db5a10785b1ed3fd05fd9d237fcd731)_ — `app-builder-lib`
- Feat: update app-builder-bin to 5.0-alpha release _[`#8190`](https://github.com/electron-userland/electron-builder/pull/8190) [`503da26`](https://github.com/electron-userland/electron-builder/commit/503da26f1ef71bff19bd173bdce4052c48ddc5cc)_ — `app-builder-lib`, `builder-util`

### Patch Changes

- Fix(mac): add retry mechanism in mac code signing for `electron/osx-sign`. _[`#8101`](https://github.com/electron-userland/electron-builder/pull/8101) [`9bcede8`](https://github.com/electron-userland/electron-builder/commit/9bcede88f2083d41266e48dfa712adc2d223bd7f)_ — `app-builder-lib`
- Chore: entering alpha release stage _[`#8110`](https://github.com/electron-userland/electron-builder/pull/8110) [`fa7982f`](https://github.com/electron-userland/electron-builder/commit/fa7982f19feddcb9479ff83af8db1974aea1f8d6)_ — `electron-builder`, `app-builder-lib`, `builder-util`, `builder-util-runtime`, `dmg-builder`, `electron-builder-squirrel-windows`, `electron-forge-maker-appimage`, `electron-forge-maker-nsis`, `electron-forge-maker-nsis-web`, `electron-forge-maker-snap`, `electron-publish`
- Feat: add `minimumSystemVersion` in electron updater _[`#8108`](https://github.com/electron-userland/electron-builder/pull/8108) [`3d4cc7a`](https://github.com/electron-userland/electron-builder/commit/3d4cc7ae01c4f6154d6ea59726578b1ff99b9daf)_ — `builder-util`, `builder-util-runtime`
- Chore(deps): update dependency typescript-json-schema to v0.63.0 _[`#8119`](https://github.com/electron-userland/electron-builder/pull/8119) [`5277354`](https://github.com/electron-userland/electron-builder/commit/5277354c2363e66f101e306716c669a4606152bd)_ — `app-builder-lib`
- Fix: move `disableSanityCheckPackage` to within `checkFileInPackage` to not bypass non-asar usage _[`#8124`](https://github.com/electron-userland/electron-builder/pull/8124) [`e029258`](https://github.com/electron-userland/electron-builder/commit/e02925818258954747188a5eb2ece5047452b89a)_ — `app-builder-lib`
- Fix(win): use appInfo description as primary entry for FileDescription _[`#8125`](https://github.com/electron-userland/electron-builder/pull/8125) [`c6c9d59`](https://github.com/electron-userland/electron-builder/commit/c6c9d59e4cc8444ab847a14bf64364b065a384ee)_ — `app-builder-lib`
- Chore(docs): update Bitbucket Options token doc _[`#8126`](https://github.com/electron-userland/electron-builder/pull/8126) [`445911a`](https://github.com/electron-userland/electron-builder/commit/445911a75f9efd6fe61e586ebed6a210d0efcd41)_ — `app-builder-lib`, `builder-util-runtime`
- Fix: order files within asar for smaller incremental updates _[`#8128`](https://github.com/electron-userland/electron-builder/pull/8128) [`555dc90`](https://github.com/electron-userland/electron-builder/commit/555dc909a97cbaab5bc5df6cdf6f1176dff1e604)_ — `app-builder-lib`
- Fix: unstable hdiutil retry mechanism _[`#8135`](https://github.com/electron-userland/electron-builder/pull/8135) [`c2392de`](https://github.com/electron-userland/electron-builder/commit/c2392de71a8f7abc092a00452eac63dd24b34e88)_ — `electron-builder`, `app-builder-lib`, `builder-util`, `dmg-builder`, `electron-builder-squirrel-windows`, `electron-publish`
- Fix: replace SYSTEMROOT with $SYSDIR _[`#8133`](https://github.com/electron-userland/electron-builder/pull/8133) [`44b0446`](https://github.com/electron-userland/electron-builder/commit/44b04463bf581b4c013586c9010733b518a802a4)_ — `app-builder-lib`
- Fix: update autoupdate docs to describe module-based support. set nativeRebuilder default value to use electron/rebuild _[`#8140`](https://github.com/electron-userland/electron-builder/pull/8140) [`99a6150`](https://github.com/electron-userland/electron-builder/commit/99a6150ea02c91a7e7e657c667328eb734e29b8f)_ — `app-builder-lib`
- Should not chmod for 7za when process.env.USE_SYSTEM_7ZA is true _[`#8152`](https://github.com/electron-userland/electron-builder/pull/8152) [`a999da4`](https://github.com/electron-userland/electron-builder/commit/a999da48480b5024d97c3028a655bb33b00fc3bc)_ — `builder-util`
- Fix: Treat cscLink empty string same as null _[`#8185`](https://github.com/electron-userland/electron-builder/pull/8185) [`5e41c5e`](https://github.com/electron-userland/electron-builder/commit/5e41c5e8e440f7c6d139fc0e311efa46bc2846c3)_ — `app-builder-lib`
- Feat(linux): add music mac to linux category _[`#8182`](https://github.com/electron-userland/electron-builder/pull/8182) [`b43490a`](https://github.com/electron-userland/electron-builder/commit/b43490a274722aba398594bcf0156d1b3687e0d2)_ — `app-builder-lib`
- Chore: update read-config-file dependency _[`#8216`](https://github.com/electron-userland/electron-builder/pull/8216) [`0885236`](https://github.com/electron-userland/electron-builder/commit/088523652934b87419c15c068459627dcf9a0535)_ — `app-builder-lib`
- Fix(docs): update autoupdate docs noting that channels work with Github _[`#8227`](https://github.com/electron-userland/electron-builder/pull/8227) [`48c5953`](https://github.com/electron-userland/electron-builder/commit/48c59535f84cd16fb2e44d71f6b75c25c739b993)_ — `electron-builder`, `app-builder-lib`, `dmg-builder`, `electron-builder-squirrel-windows`, `electron-forge-maker-appimage`, `electron-forge-maker-nsis`, `electron-forge-maker-nsis-web`, `electron-forge-maker-snap`
- Write asar integrity resource on windows _[`#8245`](https://github.com/electron-userland/electron-builder/pull/8245) [`13e0e0d`](https://github.com/electron-userland/electron-builder/commit/13e0e0d2a272e6111024a28e1c3619dd1769366c)_ — `app-builder-lib`
- Refactored to resolve circular dependency, eliminating warnings from tools such as Rollup _[`#8251`](https://github.com/electron-userland/electron-builder/pull/8251) [`140e2f0`](https://github.com/electron-userland/electron-builder/commit/140e2f0eb0df79c2a46e35024e96d0563355fc89)_ — `builder-util-runtime`
- Feat(appx): Update identityName for windows 10 _[`#8206`](https://github.com/electron-userland/electron-builder/pull/8206) [`51111a8`](https://github.com/electron-userland/electron-builder/commit/51111a87a541ccf826dcd11393b4b3a0e83ca368)_ — `app-builder-lib`
- Fix: @electron/remote wrongly into Windows app.asar _[`#8254`](https://github.com/electron-userland/electron-builder/pull/8254) [`dc5d7c8`](https://github.com/electron-userland/electron-builder/commit/dc5d7c8dafd4aca7192d05b2978c3e66f30e38f3)_ — `app-builder-lib`
- Fix: update @electron/notarize to latest version _[`#8271`](https://github.com/electron-userland/electron-builder/pull/8271) [`3b99eb3`](https://github.com/electron-userland/electron-builder/commit/3b99eb394f41dc336c1290cf29fb7ce90a3bf6a3)_ — `app-builder-lib`
- Fix: don't log ignored error when requiring custom publisher _[`#8267`](https://github.com/electron-userland/electron-builder/pull/8267) [`9d55973`](https://github.com/electron-userland/electron-builder/commit/9d55973879a045111c986ddb27b37f3c1fb5a0c0)_ — `app-builder-lib`
- Update app-builder to v5.0.0-alpha.4 _[`#8274`](https://github.com/electron-userland/electron-builder/pull/8274) [`88bbbdb`](https://github.com/electron-userland/electron-builder/commit/88bbbdbe81936df1701f26138170e0f337c4f0d4)_ — `builder-util`
- Fix: resolve CI/CD docs generation issue and update schema _[`#8281`](https://github.com/electron-userland/electron-builder/pull/8281) [`9a0b3c6`](https://github.com/electron-userland/electron-builder/commit/9a0b3c6e0201ba32c26b2f96e2e9abf7af2ef666)_ — `app-builder-lib`
- Fix Folder's named "constructor" not being included in asar _[`#8286`](https://github.com/electron-userland/electron-builder/pull/8286) [`4a4023c`](https://github.com/electron-userland/electron-builder/commit/4a4023c3661b9e190e526965b894f90bdcea87ab)_ — `app-builder-lib`
- Fix: add MemoLazy to fix codeSigningInfo not responding to changed args _[`#8291`](https://github.com/electron-userland/electron-builder/pull/8291) [`ad668ae`](https://github.com/electron-userland/electron-builder/commit/ad668ae14ef60fb91dd74aa71562f2fd68fbaa48)_ — `app-builder-lib`, `builder-util-runtime`
- Chore: update pnpm to 9.4.0 _[`#8304`](https://github.com/electron-userland/electron-builder/pull/8304) [`1ac86c9`](https://github.com/electron-userland/electron-builder/commit/1ac86c9ea277a89611d415eb7f2ef70441b0eb28)_ — `electron-builder`, `app-builder-lib`, `builder-util`, `builder-util-runtime`, `dmg-builder`, `electron-builder-squirrel-windows`, `electron-forge-maker-appimage`, `electron-forge-maker-nsis`, `electron-forge-maker-nsis-web`, `electron-forge-maker-snap`, `electron-publish`
- Change license file's encode to utf8 with BOM _[`#8314`](https://github.com/electron-userland/electron-builder/pull/8314) [`1337f15`](https://github.com/electron-userland/electron-builder/commit/1337f158c93d4c83ebaefb20833811fd90f05f16)_ — `app-builder-lib`
- Update binary checking _[`#8310`](https://github.com/electron-userland/electron-builder/pull/8310) [`145ecb6`](https://github.com/electron-userland/electron-builder/commit/145ecb66baabd39ca523ebbba26ef484384fe8e7)_ — `app-builder-lib`
- Import builder-util from root instead of out _[`#8330`](https://github.com/electron-userland/electron-builder/pull/8330) [`db1894d`](https://github.com/electron-userland/electron-builder/commit/db1894d78a0bbf8377a787a25dddc17af22a4667)_ — `builder-util`
- Chore(deps): update dependency typescript to v5.5.3 _[`#8323`](https://github.com/electron-userland/electron-builder/pull/8323) [`fa3275c`](https://github.com/electron-userland/electron-builder/commit/fa3275c05b334f59453d04551fffa24bfa558e48)_ — `app-builder-lib`
- Fix(deps): update dependency minimatch to v10 _[`#8327`](https://github.com/electron-userland/electron-builder/pull/8327) [`f9eae65`](https://github.com/electron-userland/electron-builder/commit/f9eae653985f332ead7545490c73aa27d90c35cd)_ — `app-builder-lib`
- Fix(deps): update dependency read-config-file to v6.4.0 _[`#8324`](https://github.com/electron-userland/electron-builder/pull/8324) [`1f1f92c`](https://github.com/electron-userland/electron-builder/commit/1f1f92c978acfde789abd740086be2e6398fe5e6)_
- Fix(deploy): using `pnpm publish` cmd line arg to force `next` tag _[`#8285`](https://github.com/electron-userland/electron-builder/pull/8285) [`81da7c1`](https://github.com/electron-userland/electron-builder/commit/81da7c1491e2b3ff2f7b476f8128183f57074ff5)_
- Fix(docs): fix typo in default glob pattern _[`#8256`](https://github.com/electron-userland/electron-builder/pull/8256) [`14942b7`](https://github.com/electron-userland/electron-builder/commit/14942b70a5da79a5e36e330f64de66ec501b4ac6)_
- Fix(deps): update dependency ejs to v3.1.10 [security] _[`#8192`](https://github.com/electron-userland/electron-builder/pull/8192) [`77f9774`](https://github.com/electron-userland/electron-builder/commit/77f977435c99247d5db395895618b150f5006e8f)_
- Fix(deps): update dependency tar to v6.2.1 [security] _[`#8171`](https://github.com/electron-userland/electron-builder/pull/8171) [`393f140`](https://github.com/electron-userland/electron-builder/commit/393f140459dc4a7d6008750dc48de83c8e8d33a7)_
- Fix: disable broken test, needs further debugging. It's broken on all previous versions of electron-builder, seems MacOS related _[`ac6d887`](https://github.com/electron-userland/electron-builder/commit/ac6d8875463cba89c02a35baf347a1c2f76697e9)_
- Fix: disable broken test, needs further debugging. It's broken on all previous versions of electron-builder, seems MacOS related _[`01a9c08`](https://github.com/electron-userland/electron-builder/commit/01a9c08f2ddbd8d1b96c58089771a93fd695c753)_
- Fix: disable broken test, needs further debugging. It's broken on all previous versions of electron-builder, seems MacOS related _[`dbd1fc5`](https://github.com/electron-userland/electron-builder/commit/dbd1fc5510dca1da90a199fb34407573e464dba3)_
- Fix(appx): Update `identityName` validation for windows 10 _[`#8203`](https://github.com/electron-userland/electron-builder/pull/8203) [`66d6d6c`](https://github.com/electron-userland/electron-builder/commit/66d6d6c73776b8a62ec30d569bf68c0f1eb83ce2)_
- Fix(docs/multi-platform-build.md): broken link of build.sh _[`#8193`](https://github.com/electron-userland/electron-builder/pull/8193) [`3a2ccdd`](https://github.com/electron-userland/electron-builder/commit/3a2ccdd9483afa3134198b3ef56ba6163b2aaec9)_
- Fix(deps): update dependency @electron/universal to v2 _[`#8115`](https://github.com/electron-userland/electron-builder/pull/8115) [`f8602aa`](https://github.com/electron-userland/electron-builder/commit/f8602aa222ad8b85eb0b91a11f359580203ba024)_
- Fix(deps): update dependency @electron/notarize to v2.3.0 _[`#8114`](https://github.com/electron-userland/electron-builder/pull/8114) [`0e8e7f6`](https://github.com/electron-userland/electron-builder/commit/0e8e7f6524f0f00b28348fc47c57db8f801692b1)_

## electron-updater@6.3.0

### Minor Changes

- Feat: adding differential downloader for updates on macOS _[`#8095`](https://github.com/electron-userland/electron-builder/pull/8095) [`53cec79`](https://github.com/electron-userland/electron-builder/commit/53cec79bdc3f56c9371bdfb7901e97650d9ac4bc)_

### Patch Changes

- Fix(mac): revert autoupdate for mac differential _[`#8091`](https://github.com/electron-userland/electron-builder/pull/8091) [`e2a181d`](https://github.com/electron-userland/electron-builder/commit/e2a181d9fe3fbdd84690359e275daaef24584729)_
- Chore: entering alpha release stage _[`#8110`](https://github.com/electron-userland/electron-builder/pull/8110) [`fa7982f`](https://github.com/electron-userland/electron-builder/commit/fa7982f19feddcb9479ff83af8db1974aea1f8d6)_ — `electron-updater`, `builder-util-runtime`
- Feat: add `minimumSystemVersion` in electron updater _[`#8108`](https://github.com/electron-userland/electron-builder/pull/8108) [`3d4cc7a`](https://github.com/electron-userland/electron-builder/commit/3d4cc7ae01c4f6154d6ea59726578b1ff99b9daf)_ — `electron-updater`, `builder-util-runtime`
- Chore(docs): update Bitbucket Options token doc _[`#8126`](https://github.com/electron-userland/electron-builder/pull/8126) [`445911a`](https://github.com/electron-userland/electron-builder/commit/445911a75f9efd6fe61e586ebed6a210d0efcd41)_ — `builder-util-runtime`
- Fix: unstable hdiutil retry mechanism _[`#8135`](https://github.com/electron-userland/electron-builder/pull/8135) [`c2392de`](https://github.com/electron-userland/electron-builder/commit/c2392de71a8f7abc092a00452eac63dd24b34e88)_
- Fix(docs): update autoupdate docs noting that channels work with Github _[`#8227`](https://github.com/electron-userland/electron-builder/pull/8227) [`48c5953`](https://github.com/electron-userland/electron-builder/commit/48c59535f84cd16fb2e44d71f6b75c25c739b993)_
- Refactored to resolve circular dependency, eliminating warnings from tools such as Rollup _[`#8251`](https://github.com/electron-userland/electron-builder/pull/8251) [`140e2f0`](https://github.com/electron-userland/electron-builder/commit/140e2f0eb0df79c2a46e35024e96d0563355fc89)_ — `builder-util-runtime`
- Fix: verify LiteralPath of update file during windows signature verification _[`#8295`](https://github.com/electron-userland/electron-builder/pull/8295) [`ac2e6a2`](https://github.com/electron-userland/electron-builder/commit/ac2e6a25aa491c1ef5167a552c19fc2085cd427f)_
- Fix: add MemoLazy to fix codeSigningInfo not responding to changed args _[`#8291`](https://github.com/electron-userland/electron-builder/pull/8291) [`ad668ae`](https://github.com/electron-userland/electron-builder/commit/ad668ae14ef60fb91dd74aa71562f2fd68fbaa48)_ — `builder-util-runtime`
- Chore: update pnpm to 9.4.0 _[`#8304`](https://github.com/electron-userland/electron-builder/pull/8304) [`1ac86c9`](https://github.com/electron-userland/electron-builder/commit/1ac86c9ea277a89611d415eb7f2ef70441b0eb28)_ — `electron-updater`, `builder-util-runtime`
- Fix(rpm-updater): stop uninstalling app before update _[`#8311`](https://github.com/electron-userland/electron-builder/pull/8311) [`35a0784`](https://github.com/electron-userland/electron-builder/commit/35a0784eb4cffc2fcbf33ec58fefbacf8e8e5125)_
- Chore(deps): update dependency typescript to v5.5.3 _[`#8323`](https://github.com/electron-userland/electron-builder/pull/8323) [`fa3275c`](https://github.com/electron-userland/electron-builder/commit/fa3275c05b334f59453d04551fffa24bfa558e48)_



# [24.13.3](https://github.com/electron-userland/electron-builder/compare/v24.13.2...v24.13.3) (2024-03-02)

## electron-builder@24.13.3

### Patch Changes

- Fix(msi): build emulated arm64 MSI installers as stopgap until electron-builder-binaries wix version is updated _[`#8086`](https://github.com/electron-userland/electron-builder/pull/8086) [`e6f1beb`](https://github.com/electron-userland/electron-builder/commit/e6f1bebd96cbc54f7455cd9bd48bb1eadc5648f5)_ — `app-builder-lib`
- Fix(deb): soft symlink instead of hardlink to handle when /opt is on a separate partition _[`#8067`](https://github.com/electron-userland/electron-builder/pull/8067) [`18340ee`](https://github.com/electron-userland/electron-builder/commit/18340eef6d8e9ee6efbf528508bac7972168bedb)_ — `app-builder-lib`
- Fix(mac): sign NSIS on mac _[`#8090`](https://github.com/electron-userland/electron-builder/pull/8090) [`2c147ad`](https://github.com/electron-userland/electron-builder/commit/2c147addb09385008cf661c952e7ce390a254d8e)_ — `app-builder-lib`

## electron-updater@6.2.0

### Minor Changes

- Feat: adding differential downloader for updates on macOS _[`#7709`](https://github.com/electron-userland/electron-builder/pull/7709) [`79df542`](https://github.com/electron-userland/electron-builder/commit/79df54238621fbe48ba20444129950ba2dc49983)_



# [24.13.2](https://github.com/electron-userland/electron-builder/compare/v24.13.1...v24.13.2) (2024-02-22)

## electron-builder@24.13.2

### Patch Changes

- Fix: execute %SYSTEMROOT% cmd.exe directly during NSIS installer _[`#8059`](https://github.com/electron-userland/electron-builder/pull/8059) [`8f4acff`](https://github.com/electron-userland/electron-builder/commit/8f4acff3c2d45c1cb07779bb3fe79644408ee387)_ — `app-builder-lib`
- Fix(mac): only skip notarization step when `notarize` is explicitly false _[`#8065`](https://github.com/electron-userland/electron-builder/pull/8065) [`5681777`](https://github.com/electron-userland/electron-builder/commit/5681777a808d49756f3a95d18cc589218be44878)_ — `app-builder-lib`
- Fix: use `pathToFileUrl` for hooks for Windows ES module support _[`#8069`](https://github.com/electron-userland/electron-builder/pull/8069) [`538dd86`](https://github.com/electron-userland/electron-builder/commit/538dd86bf52f0091dbb1120bdd30f56dfdbd5747)_ — `app-builder-lib`
- Fix(pkg): provide `BundlePreInstallScriptPath` and/or `BundlePostInstallScriptPath` when a pre/postinstall script is provided to pkg installer _[`#8071`](https://github.com/electron-userland/electron-builder/pull/8071) [`eb296c9`](https://github.com/electron-userland/electron-builder/commit/eb296c9b2afd77db799eadd472f9ec22f6fc4354)_ — `app-builder-lib`



# [24.13.1](https://github.com/electron-userland/electron-builder/compare/v24.13.0...v24.13.1) (2024-02-17)

## electron-builder@24.13.1

### Patch Changes

- Chore: upgrading connected dependencies (typescript requires higher eslint version) _[`#8057`](https://github.com/electron-userland/electron-builder/pull/8057) [`ccbb80d`](https://github.com/electron-userland/electron-builder/commit/ccbb80dea4b6146ea2d2186193a1f307096e4d1e)_ — `app-builder-lib`, `builder-util`, `builder-util-runtime`, `dmg-builder`, `electron-builder-squirrel-windows`, `electron-publish`
- Fix: add dmg-builder and squirrel-windows to peer dependency for pnpm _[`#8052`](https://github.com/electron-userland/electron-builder/pull/8052) [`6a4f605`](https://github.com/electron-userland/electron-builder/commit/6a4f605f9ae1a1de02a8260ffe054f74fbd097a5)_ — `app-builder-lib`

## electron-updater@6.1.9

### Patch Changes

- Fix: auto-update powershell script requires reset of `PSModulePath` _[`#8051`](https://github.com/electron-userland/electron-builder/pull/8051) [`48603ba`](https://github.com/electron-userland/electron-builder/commit/48603ba09dc7103849a2975799c19068fd08fc07)_
- Chore: upgrading connected dependencies (typescript requires higher eslint version) _[`#8057`](https://github.com/electron-userland/electron-builder/pull/8057) [`ccbb80d`](https://github.com/electron-userland/electron-builder/commit/ccbb80dea4b6146ea2d2186193a1f307096e4d1e)_ — `electron-updater`, `builder-util-runtime`



# [24.13.0](https://github.com/electron-userland/electron-builder/compare/v24.12.0...v24.13.0) (2024-02-09)

## electron-builder@24.13.0

### Minor Changes

- Feat: allow `onNodeModuleFile` to return a boolean to force include the package to be copied _[`#8043`](https://github.com/electron-userland/electron-builder/pull/8043) [`bb4a8c0`](https://github.com/electron-userland/electron-builder/commit/bb4a8c09318045938bfff5a0d1db8f17f0fa4e8c)_ — `app-builder-lib`

### Patch Changes

- Fix: use CI_COMMIT_TAG instead of CI_BUILD_TAG for Gitlab CI _[`#8010`](https://github.com/electron-userland/electron-builder/pull/8010) [`f5340b7`](https://github.com/electron-userland/electron-builder/commit/f5340b732dc0a303743a2a924750e9861e3a345f)_ — `electron-publish`
- Fix(mac): Update mac notarize keychain env var to be optional _[`#8022`](https://github.com/electron-userland/electron-builder/pull/8022) [`9d1d150`](https://github.com/electron-userland/electron-builder/commit/9d1d150896a763d3630418bf5be8fd3a070c0c40)_ — `app-builder-lib`
- Fix(mac): merge `fileAssociations` with existing `CFBundleDocumentTypes` if defined in `mac.extendInfo` _[`#8035`](https://github.com/electron-userland/electron-builder/pull/8035) [`94677f3`](https://github.com/electron-userland/electron-builder/commit/94677f3d70866582635c717b042194f0c75bbf01)_ — `app-builder-lib`
- Attempt dynamically importing hook as a module if package.json `type=module`, if fail, fallback to default `require` _[`#8042`](https://github.com/electron-userland/electron-builder/pull/8042) [`63a0044`](https://github.com/electron-userland/electron-builder/commit/63a00443cf4bae9d7406f7e879ea607632da08b8)_ — `app-builder-lib`
- Fix(deps): update dependency @electron/universal to v1.5.1 _[`#8030`](https://github.com/electron-userland/electron-builder/pull/8030) [`db3b18e`](https://github.com/electron-userland/electron-builder/commit/db3b18e799a6579bbc36c41b3125a062ebf075ec)_
- Fix(deps): update dependency @electron/notarize to v2.2.1 _[`#8029`](https://github.com/electron-userland/electron-builder/pull/8029) [`2248134`](https://github.com/electron-userland/electron-builder/commit/2248134068e035ec76fe696385bb467a94dd384d)_



# [24.12.0](https://github.com/electron-userland/electron-builder/compare/v24.11.0...v24.12.0) (2024-01-25)

## electron-builder@24.12.0

### Minor Changes

- Mac: Support for a custom 'sign' action _[`#8002`](https://github.com/electron-userland/electron-builder/pull/8002) [`adf97dc`](https://github.com/electron-userland/electron-builder/commit/adf97dccd0146288ab482a261b749d67a458868a)_ — `electron-builder`, `app-builder-lib`

### Patch Changes

- Use ~ as pre-release separator for deb targets _[`#7978`](https://github.com/electron-userland/electron-builder/pull/7978) [`2773410`](https://github.com/electron-userland/electron-builder/commit/277341000a87abaa65a7985854c06e88ed5938b9)_ — `app-builder-lib`
- Use full path to macOS signing utilities _[`#7998`](https://github.com/electron-userland/electron-builder/pull/7998) [`61dfe7f`](https://github.com/electron-userland/electron-builder/commit/61dfe7fbaa592785353348a16abd1525dcbfaf28)_ — `app-builder-lib`



# [24.11.0](https://github.com/electron-userland/electron-builder/compare/v24.10.0...v24.11.0) (2024-01-09)

## electron-builder@24.11.0

### Minor Changes

- Feat(nsis): add NsisOption to specify selectPerMachineByDefault _[`#7967`](https://github.com/electron-userland/electron-builder/pull/7967) [`28e5b5d`](https://github.com/electron-userland/electron-builder/commit/28e5b5ddb6bb2d77ef6847fc0c93e62c97174156)_ — `app-builder-lib`

### Patch Changes

- Fix: notarization with an apple API key _[`#7951`](https://github.com/electron-userland/electron-builder/pull/7951) [`869c7e4`](https://github.com/electron-userland/electron-builder/commit/869c7e4652a5d5a3562e25723d6cedd622ab657b)_ — `app-builder-lib`
- Fix(win): product file name is too long causes the find process exe to fail _[`#7955`](https://github.com/electron-userland/electron-builder/pull/7955) [`88e61bc`](https://github.com/electron-userland/electron-builder/commit/88e61bc410fae8c0bea0b2029ee1347864af98ac)_ — `app-builder-lib`
- Feat(archive): skip archive when destination file is already up to date _[`#7971`](https://github.com/electron-userland/electron-builder/pull/7971) [`8803852`](https://github.com/electron-userland/electron-builder/commit/8803852c7aadf56771f537dc33ffd51c14830f50)_ — `app-builder-lib`
- Fix(docs/configuration): broken links _[`#7949`](https://github.com/electron-userland/electron-builder/pull/7949) [`98624c9`](https://github.com/electron-userland/electron-builder/commit/98624c93ae5063886e82eaa81f67317d5e79f26c)_
- Fix: update unit test snapshot to account for new package dependency files _[`#7968`](https://github.com/electron-userland/electron-builder/pull/7968) [`9335c59`](https://github.com/electron-userland/electron-builder/commit/9335c59e224b3cba57cba8822995a88f5349a927)_

## electron-updater@6.1.8

### Patch Changes

- Feat(nsis): add option to disable differential download _[`#7950`](https://github.com/electron-userland/electron-builder/pull/7950) [`03c9451`](https://github.com/electron-userland/electron-builder/commit/03c94516ef3b1b31b2f5b7bcdb9c6d3753d36b8d)_



# [24.10.0](https://github.com/electron-userland/electron-builder/compare/v24.9.4...v24.10.0) (2023-12-13)

## electron-builder@24.10.0

### Minor Changes

- Feat: Enable ESM support for hooks by using dynamic `import()` when `package.json` is set to type `module`. _[`#7936`](https://github.com/electron-userland/electron-builder/pull/7936) [`664a09c`](https://github.com/electron-userland/electron-builder/commit/664a09c4471f46a5b88be0b8e26f24b1a0b2bcc1)_ — `app-builder-lib`
- Feat(snap): Use core20 as default base _[`#7902`](https://github.com/electron-userland/electron-builder/pull/7902) [`843d501`](https://github.com/electron-userland/electron-builder/commit/843d5017f0303cf6d5a71564aad73dd15ca75d88)_ — `app-builder-lib`

### Patch Changes

- Adding `-debug` to `hdiutil detach` for when it fails and attempts a force detach _[`#7933`](https://github.com/electron-userland/electron-builder/pull/7933) [`0f0e942`](https://github.com/electron-userland/electron-builder/commit/0f0e942a45d52faed9ff2bd6dd0198e79c8e183d)_ — `dmg-builder`



# [24.9.4](https://github.com/electron-userland/electron-builder/compare/v24.9.3...v24.9.4) (2023-12-08)

## electron-builder@24.9.4

### Patch Changes

- Chore(docs): Update docs to include `msi-wrapped` target _[`#7915`](https://github.com/electron-userland/electron-builder/pull/7915) [`8b91d31`](https://github.com/electron-userland/electron-builder/commit/8b91d315727bfbac2ec2c2109f12aa92cf6f6c15)_ — `app-builder-lib`
- Fix: pull `resultOutputPath` from `CustomWindowsSignTaskConfiguration` (fixes: #7910) _[`#7919`](https://github.com/electron-userland/electron-builder/pull/7919) [`4e930a7`](https://github.com/electron-userland/electron-builder/commit/4e930a74d7c2e9b53d47e37997b444da95680a24)_ — `app-builder-lib`
- Fix macOS app signature when the name contains NFD-normalized characters _[`#7929`](https://github.com/electron-userland/electron-builder/pull/7929) [`0f43989`](https://github.com/electron-userland/electron-builder/commit/0f439890229431f02c7f86d5bf523e940e217657)_ — `app-builder-lib`
- Allowing `test.js` in compiled asar to allow testing mechanisms like Playwright _[`#7931`](https://github.com/electron-userland/electron-builder/pull/7931) [`f7aacab`](https://github.com/electron-userland/electron-builder/commit/f7aacabd9cc1b98e365134004aafa31566c7d801)_ — `app-builder-lib`
- Chore: consolidating usages of `7zip-bin` to builder-util-runtime so as to execute `chmod` logic _always_ _[`#7930`](https://github.com/electron-userland/electron-builder/pull/7930) [`e4d6be8`](https://github.com/electron-userland/electron-builder/commit/e4d6be81d80ce9de0c95288d4418bbb80f7902af)_ — `app-builder-lib`, `builder-util`, `electron-builder-squirrel-windows`



# [24.9.3](https://github.com/electron-userland/electron-builder/compare/v24.9.2...v24.9.3) (2023-11-29)

## electron-builder@24.9.3

### Patch Changes

- Fix dmg build when productName or executableName contains Unicode _[`#7905`](https://github.com/electron-userland/electron-builder/pull/7905) [`d1347a0`](https://github.com/electron-userland/electron-builder/commit/d1347a06e5bd14f7811a543d2e8929b2ca3cdc39)_ — `dmg-builder`
- Fix: pass publish options to snap publisher _[`#7908`](https://github.com/electron-userland/electron-builder/pull/7908) [`9fc5157`](https://github.com/electron-userland/electron-builder/commit/9fc5157879bfa380a78003ff13cdbc26b5e8fd23)_ — `electron-builder`, `app-builder-lib`, `dmg-builder`, `electron-builder-squirrel-windows`, `electron-forge-maker-appimage`, `electron-forge-maker-nsis`, `electron-forge-maker-nsis-web`, `electron-forge-maker-snap`



# [24.9.2](https://github.com/electron-userland/electron-builder/compare/v24.9.1...v24.9.2) (2023-11-28)

## electron-builder@24.9.2

### Patch Changes

- Fix notary with pure api key auth _[`#7896`](https://github.com/electron-userland/electron-builder/pull/7896) [`65817e0`](https://github.com/electron-userland/electron-builder/commit/65817e0edc43a2e6707fab835b0bbe680bd0b1e4)_ — `app-builder-lib`
- Fix macOS app with exectuableName different from productName _[`#7900`](https://github.com/electron-userland/electron-builder/pull/7900) [`3b3a698`](https://github.com/electron-userland/electron-builder/commit/3b3a69895f0caa3870219bc0bec7420de81a07ed)_ — `app-builder-lib`
- Fix codesign and DMG layout when productName or executableName contains Unicode _[`#7901`](https://github.com/electron-userland/electron-builder/pull/7901) [`f83f05f`](https://github.com/electron-userland/electron-builder/commit/f83f05f6f24a36b96d0e0c7786e1a12e5c762389)_ — `app-builder-lib`



# [24.9.1](https://github.com/electron-userland/electron-builder/compare/v24.9.0...v24.9.1) (2023-11-19)

## electron-builder@24.9.1

### Patch Changes

- Fix(mac): pass in correct notarize options _[`#7886`](https://github.com/electron-userland/electron-builder/pull/7886) [`d7e39f0`](https://github.com/electron-userland/electron-builder/commit/d7e39f05c55287ea32fd0f978ecb41078931d6b6)_ — `app-builder-lib`
- Docs: update notarization docs in schema _[`#7885`](https://github.com/electron-userland/electron-builder/pull/7885) [`3c26627`](https://github.com/electron-userland/electron-builder/commit/3c26627182a660b6f22c1fa8eb22c714f014783f)_ — `app-builder-lib`
- Fix: mac notarization issue checking password _[`#7884`](https://github.com/electron-userland/electron-builder/pull/7884) [`6fa8a27`](https://github.com/electron-userland/electron-builder/commit/6fa8a27f9dd406c289f608c664c93b6ed9d1a9ee)_ — `app-builder-lib`



# [24.9.0](https://github.com/electron-userland/electron-builder/compare/v24.8.1...v24.9.0) (2023-11-15)

## electron-builder@24.9.0

### Minor Changes

- Feat: allow api key and keychain to be provided for mac notarization _[`#7861`](https://github.com/electron-userland/electron-builder/pull/7861) [`906ffb1`](https://github.com/electron-userland/electron-builder/commit/906ffb1fcebe6aef4dc6c6a3fab10aa7d9378c3f)_ — `app-builder-lib`

### Patch Changes

- Fix: flatpak build fails due to too large icons _[`#7875`](https://github.com/electron-userland/electron-builder/pull/7875) [`9883ab6`](https://github.com/electron-userland/electron-builder/commit/9883ab60687b67c858b16f09eea6f8af76cf01b0)_ — `app-builder-lib`
- Fix: temporarily skip flaky test from transient dependency _[`3f6757b`](https://github.com/electron-userland/electron-builder/commit/3f6757b41720c0740886325431c18be81a23ebbf)_



# [24.8.1](https://github.com/electron-userland/electron-builder/compare/v24.8.0...v24.8.1) (2023-11-05)

## electron-builder@24.8.1

### Patch Changes

- Fix: don't notarize mas builds _[`#7838`](https://github.com/electron-userland/electron-builder/pull/7838) [`87eae1c`](https://github.com/electron-userland/electron-builder/commit/87eae1cc2f85f034f1543840b20d56e89a23c0df)_ — `app-builder-lib`
- Fix: update @types/node for compat with newest @types/node _[`#7806`](https://github.com/electron-userland/electron-builder/pull/7806) [`db424e8`](https://github.com/electron-userland/electron-builder/commit/db424e8e876e6ac1985668bf78bd52a02824dd7f)_ — `builder-util`, `builder-util-runtime`
- Fix: compat with newest @types/node _[`#7806`](https://github.com/electron-userland/electron-builder/pull/7806) [`db424e8`](https://github.com/electron-userland/electron-builder/commit/db424e8e876e6ac1985668bf78bd52a02824dd7f)_ — `builder-util`, `builder-util-runtime`
- Fix(deps): Update 7zip-bin to support Windows on ARM _[`#7829`](https://github.com/electron-userland/electron-builder/pull/7829) [`1af7447`](https://github.com/electron-userland/electron-builder/commit/1af7447edf47303de03ca2924727c78118161c60)_ — `electron-builder`, `app-builder-lib`, `builder-util`, `electron-builder-squirrel-windows`

## electron-updater@6.1.7

### Patch Changes

- Fix: update @types/node for compat with newest @types/node _[`#7806`](https://github.com/electron-userland/electron-builder/pull/7806) [`db424e8`](https://github.com/electron-userland/electron-builder/commit/db424e8e876e6ac1985668bf78bd52a02824dd7f)_ — `builder-util-runtime`
- Fix: compat with newest @types/node _[`#7806`](https://github.com/electron-userland/electron-builder/pull/7806) [`db424e8`](https://github.com/electron-userland/electron-builder/commit/db424e8e876e6ac1985668bf78bd52a02824dd7f)_ — `builder-util-runtime`



# [24.8.0](https://github.com/electron-userland/electron-builder/compare/v24.7.0...v24.8.0) (2023-10-19)

## electron-builder@24.8.0

### Minor Changes

- Fix: support executableName in main config _[`#7828`](https://github.com/electron-userland/electron-builder/pull/7828) [`7c7db83`](https://github.com/electron-userland/electron-builder/commit/7c7db837bdf650228594a30114975f1581c37130)_ — `app-builder-lib`

### Patch Changes

- Fix: run nsis and portable builds sequentially. fixes #7791 _[`#7798`](https://github.com/electron-userland/electron-builder/pull/7798) [`526e075`](https://github.com/electron-userland/electron-builder/commit/526e075edddf908b9688e108a18fbb76e6f047be)_ — `app-builder-lib`
- Minor addition to docs for snap. add snap recommended core22 option. _[`#7813`](https://github.com/electron-userland/electron-builder/pull/7813) [`f2a1f1e`](https://github.com/electron-userland/electron-builder/commit/f2a1f1ee9a1387eb183b9f3b0dfcca29c7891bd1)_ — `app-builder-lib`
- Minor addition to docs for snap publishing. add snapcraft link to local and cd auth options _[`#7814`](https://github.com/electron-userland/electron-builder/pull/7814) [`549d07b`](https://github.com/electron-userland/electron-builder/commit/549d07b0a04b8686cf4998dc102edad390ddd09a)_ — `app-builder-lib`, `builder-util-runtime`
- Fix(nsis): display product names with an `&` properly _[`#7831`](https://github.com/electron-userland/electron-builder/pull/7831) [`6e41480`](https://github.com/electron-userland/electron-builder/commit/6e41480e6221693f6fec46ae813d513935e05f66)_ — `app-builder-lib`

## electron-updater@6.1.6

### Patch Changes

- Minor addition to docs for snap publishing. add snapcraft link to local and cd auth options _[`#7814`](https://github.com/electron-userland/electron-builder/pull/7814) [`549d07b`](https://github.com/electron-userland/electron-builder/commit/549d07b0a04b8686cf4998dc102edad390ddd09a)_ — `builder-util-runtime`



# [24.7.0](https://github.com/electron-userland/electron-builder/compare/v24.6.5...v24.7.0) (2023-09-26)

## electron-builder@24.7.0

### Minor Changes

- Feat: add customUnWelcomePage macro for NSIS installers _[`#7790`](https://github.com/electron-userland/electron-builder/pull/7790) [`1a412f4`](https://github.com/electron-userland/electron-builder/commit/1a412f4d07304fcd0404ac04b5085ffd394db6cf)_ — `app-builder-lib`

### Patch Changes

- Fix: exclude electron-builder.env from app to avoid packaging env secrets _[`#7792`](https://github.com/electron-userland/electron-builder/pull/7792) [`84906bc`](https://github.com/electron-userland/electron-builder/commit/84906bc899c1b6ad2a9ec9bb9a249849e05133b5)_ — `app-builder-lib`
- Fix: expand macro for ${version}/.icon-ico/ dir on Window's installers _[`#7763`](https://github.com/electron-userland/electron-builder/pull/7763) [`0cb1913`](https://github.com/electron-userland/electron-builder/commit/0cb1913272c0cf24603233e2033d8fc3f33cb26d)_ — `app-builder-lib`
- Fix: Extract `NotarizeNotaryOptions` and `NotarizeLegacyOptions` to explicitly define required vars _[`#7797`](https://github.com/electron-userland/electron-builder/pull/7797) [`efd48dc`](https://github.com/electron-userland/electron-builder/commit/efd48dc07bdc12894e1494136448176dc8a6c4bb)_ — `app-builder-lib`



# [24.6.5](https://github.com/electron-userland/electron-builder/compare/v24.6.4...v24.6.5) (2023-09-18)

## electron-builder@24.6.5

### Patch Changes

- Fix(mac): fix errors using native modules that require rebuild when both mas and mac targets are specified _[`#7744`](https://github.com/electron-userland/electron-builder/pull/7744) [`4fc7a3c`](https://github.com/electron-userland/electron-builder/commit/4fc7a3c3b857380bcbdd2a10e26989e3b1af50a2)_ — `app-builder-lib`
- Fix(mac): Validate the usage boundary of iconTextSize (#7769) _[`#7780`](https://github.com/electron-userland/electron-builder/pull/7780) [`a8b1f15`](https://github.com/electron-userland/electron-builder/commit/a8b1f1592e14710977b036313c8a2cb551a29064)_ — `dmg-builder`

## electron-updater@6.1.5

### Patch Changes

- Fix: When error code is ENOENT, try to use electron.shell.openPath to run installer on Windows _[`#7767`](https://github.com/electron-userland/electron-builder/pull/7767) [`21f3069`](https://github.com/electron-userland/electron-builder/commit/21f3069cb6dcad30959af4bfd8f3014133a3dfde)_



# [24.6.4](https://github.com/electron-userland/electron-builder/compare/v24.6.3...v24.6.4) (2023-08-23)

## electron-builder@24.6.4

### Patch Changes

- Chore(deps): updating @electron notarize, osx-sign, and universal packages and pinning versions _[`#7707`](https://github.com/electron-userland/electron-builder/pull/7707) [`4517d97`](https://github.com/electron-userland/electron-builder/commit/4517d97f48d822f446c48937df4b542a638fcab6)_ — `app-builder-lib`
- Fix: Only schedule upload for unique files after `afterAllArtifactBuild` _[`#7715`](https://github.com/electron-userland/electron-builder/pull/7715) [`66bef0f`](https://github.com/electron-userland/electron-builder/commit/66bef0f7f1a0371ff924d29ed5453f9b3222c1ab)_ — `app-builder-lib`
- Chore: updating @electron/osx-sign to latest version to handle preAutoEntitlements _[`#7736`](https://github.com/electron-userland/electron-builder/pull/7736) [`445b7f5`](https://github.com/electron-userland/electron-builder/commit/445b7f5d066781f3938fd6bcaca1d9a12f5b0eeb)_ — `app-builder-lib`
- Fix(docs): typos in CONTRIBUTING.md _[`#7691`](https://github.com/electron-userland/electron-builder/pull/7691) [`6bcea7f`](https://github.com/electron-userland/electron-builder/commit/6bcea7f8a449daf9af09095b93bee71e22682488)_
- Fix: adding `IMAGE_VERSION` arg for docker `node` image so that it force rebuilds when pnpm is updated on any date _[`#7690`](https://github.com/electron-userland/electron-builder/pull/7690) [`47c1fd7`](https://github.com/electron-userland/electron-builder/commit/47c1fd71080f8079f97f6513dd037a5a617f3809)_



# [24.6.3](https://github.com/electron-userland/electron-builder/compare/v24.6.2...v24.6.3) (2023-07-24)

## electron-builder@24.6.3

### Patch Changes

- Fix: allow explicit configuration on what additional files to sign. Do not sign .node files by default _[`#7685`](https://github.com/electron-userland/electron-builder/pull/7685) [`78448af`](https://github.com/electron-userland/electron-builder/commit/78448af062e2ce70c1eb590c05cce01919933e26)_ — `app-builder-lib`



# [24.6.2](https://github.com/electron-userland/electron-builder/compare/v24.6.1...v24.6.2) (2023-07-20)

## electron-builder@24.6.2

### Patch Changes

- Fix: add back missing `createLazyProductionDeps` that was missed during revert _[`#7679`](https://github.com/electron-userland/electron-builder/pull/7679) [`f5d23ef`](https://github.com/electron-userland/electron-builder/commit/f5d23ef4edce6096759a3e25dfe453366ab72da2)_ — `electron-builder`, `app-builder-lib`

## electron-updater@6.1.4

### Patch Changes

- Fix: check null for `isCustomChannel` in GitHubProvider.ts _[`#7666`](https://github.com/electron-userland/electron-builder/pull/7666) [`441da40`](https://github.com/electron-userland/electron-builder/commit/441da40d814d90154ed9b120684e7c1a7d919c52)_



# [24.6.1](https://github.com/electron-userland/electron-builder/compare/v24.6.0...v24.6.1) (2023-07-18)

## electron-builder@24.6.1

### Patch Changes

- Fix: reverting migration to electron-rebuild to resolve native prebuilt modules issue _[`#7668`](https://github.com/electron-userland/electron-builder/pull/7668) [`9cfd35d`](https://github.com/electron-userland/electron-builder/commit/9cfd35d5ad320255d88be67530ce5fe6e832f862)_ — `electron-builder`, `app-builder-lib`
- Fix: updating simple-update-notifier version to resolve vulnerability _[`#7673`](https://github.com/electron-userland/electron-builder/pull/7673) [`355e356`](https://github.com/electron-userland/electron-builder/commit/355e35654510daded399ea31ed0bcd37effde935)_



# [24.6.0](https://github.com/electron-userland/electron-builder/compare/v24.5.2...v24.6.0) (2023-07-18)

## electron-builder@24.6.0

### Minor Changes

- Feat: Added support for overriding ‘preAutoEntitlements’ for electron/osx-sign _[`#7642`](https://github.com/electron-userland/electron-builder/pull/7642) [`2717282`](https://github.com/electron-userland/electron-builder/commit/2717282cbff0dc0b6dee7e5af1fa0ecfcff1d5bf)_ — `app-builder-lib`

### Patch Changes

- Fix: use nullish coalescing operator for hardenedRuntime default value _[`#7643`](https://github.com/electron-userland/electron-builder/pull/7643) [`5fec686`](https://github.com/electron-userland/electron-builder/commit/5fec686412b23614bf17f76d03fecc66c220ac99)_ — `app-builder-lib`
- Fix: re-enable changeDir step for assisted, perMachine installs _[`#7648`](https://github.com/electron-userland/electron-builder/pull/7648) [`84ed3ff`](https://github.com/electron-userland/electron-builder/commit/84ed3ff123b5ae92cd3350d64677434f9b397b76)_ — `app-builder-lib`



# [24.5.2](https://github.com/electron-userland/electron-builder/compare/v24.5.1...v24.5.2) (2023-06-27)

## electron-builder@24.5.2

### Patch Changes

- Fix(linux): make semver pre-release versions valid for `"pacman"` and `"rpm"` target _[`#7630`](https://github.com/electron-userland/electron-builder/pull/7630) [`37db080`](https://github.com/electron-userland/electron-builder/commit/37db080ffabf546132d278ff69532b0558ad0a41)_ — `app-builder-lib`

## electron-updater@6.1.3

### Patch Changes

- Fix: trigger `app.relaunch()` if `isForceRunAfter = true` for (beta) deb and rpm updaters _[`#7637`](https://github.com/electron-userland/electron-builder/pull/7637) [`b3dfe64`](https://github.com/electron-userland/electron-builder/commit/b3dfe64b22dc51375861f6b8a3517ff9ab562aaf)_
- Fix: change typed-emitter to tiny-typed-emitter to remove rxjs dependency _[`#7633`](https://github.com/electron-userland/electron-builder/pull/7633) [`531a630`](https://github.com/electron-userland/electron-builder/commit/531a6309283ea1b2b262817a170e2c030735f8b6)_



# [24.5.1](https://github.com/electron-userland/electron-builder/compare/v24.5.0...v24.5.1) (2023-06-25)

## electron-builder@24.5.1

### Patch Changes

- Fix(mac): use Identity `hash` instead of `name` if it exists _[`#7622`](https://github.com/electron-userland/electron-builder/pull/7622) [`4652416`](https://github.com/electron-userland/electron-builder/commit/46524169cefbfa18e342d7fa19e79e710aae848e)_ — `app-builder-lib`
- Fix: use electron/rebuild Rebuilder directly for cross-platform builds _[`#7629`](https://github.com/electron-userland/electron-builder/pull/7629) [`285aa76`](https://github.com/electron-userland/electron-builder/commit/285aa766c2675448689f2e465b6fa2b2acacdbc6)_ — `electron-builder`, `app-builder-lib`
- Fix: resolve unstable unit test that is on latest mac _[`#7626`](https://github.com/electron-userland/electron-builder/pull/7626) [`16d1430`](https://github.com/electron-userland/electron-builder/commit/16d1430b6c3721f3a258a02b70897a9b2af25c28)_

## electron-updater@6.1.2

### Patch Changes

- Fix: removing stdio from spawnSync to fix crash on rpm/deb updaters _[`#7628`](https://github.com/electron-userland/electron-builder/pull/7628) [`98f535e`](https://github.com/electron-userland/electron-builder/commit/98f535e1f80b7f84dc3c2f135a4a5ea8cd142f31)_



# [24.5.0](https://github.com/electron-userland/electron-builder/compare/v24.4.0...v24.5.0) (2023-06-16)

## electron-builder@24.5.0

### Minor Changes

- Added env variable for 7z filter _[`#7609`](https://github.com/electron-userland/electron-builder/pull/7609) [`99f49cf`](https://github.com/electron-userland/electron-builder/commit/99f49cf7a86afa33d35652ffc6329fefed2e5f75)_ — `app-builder-lib`

### Patch Changes

- Fix(nsis): Ensure application name sub-folder on fresh installs. _[`#7552`](https://github.com/electron-userland/electron-builder/pull/7552) [`e3fc9b5`](https://github.com/electron-userland/electron-builder/commit/e3fc9b544cc8c6728ffd77a45408d6e0e87dbb46)_ — `app-builder-lib`
- Fix(mac): wrap hdiutil detach in retry w/ backoff _[`#7600`](https://github.com/electron-userland/electron-builder/pull/7600) [`4dce371`](https://github.com/electron-userland/electron-builder/commit/4dce3718abd75b8d0e29f37f6ba0ee1e76353c65)_ — `builder-util`, `dmg-builder`
- Fix: Allow building MAS and dmg targets with different appId _[`#7603`](https://github.com/electron-userland/electron-builder/pull/7603) [`f464e3e`](https://github.com/electron-userland/electron-builder/commit/f464e3ee6b8a6330a9be2961afaaec150777f91c)_ — `app-builder-lib`

## electron-updater@6.1.1

### Patch Changes

- Fix: default file name of `update.${fileExtension}` for downloaded files in private repositories. _[`#7597`](https://github.com/electron-userland/electron-builder/pull/7597) [`cd15e16`](https://github.com/electron-userland/electron-builder/commit/cd15e161031e180200ab772f01198a5b68fa42fe)_



# [24.4.0](https://github.com/electron-userland/electron-builder/compare/v24.3.0...v24.4.0) (2023-05-09)

## electron-builder@24.4.0

### Minor Changes

- Add ability to specify recommended deb dependencies _[`#7558`](https://github.com/electron-userland/electron-builder/pull/7558) [`54c8537`](https://github.com/electron-userland/electron-builder/commit/54c85374790f7a8e0dc520a20c716b4afe69be20)_ — `app-builder-lib`

### Patch Changes

- Fix missing @types dependencies for output d.ts files _[`#7568`](https://github.com/electron-userland/electron-builder/pull/7568) [`c9d20db`](https://github.com/electron-userland/electron-builder/commit/c9d20db964cce991dab137ec0105d40d8eacd95c)_ — `app-builder-lib`, `builder-util`, `electron-publish`
- When using the msiWrapped target, allow the nsis target to be capitalized in the configuration file _[`#7529`](https://github.com/electron-userland/electron-builder/pull/7529) [`60eb555`](https://github.com/electron-userland/electron-builder/commit/60eb55584d82cc72d6d546e1a51198d3e4b91ad3)_ — `electron-builder`, `app-builder-lib`



# [24.3.0](https://github.com/electron-userland/electron-builder/compare/v24.2.1...v24.3.0) (2023-04-25)

## electron-builder@24.3.0

### Minor Changes

- Display "Space required" text for NSIS installer _[`#7531`](https://github.com/electron-userland/electron-builder/pull/7531) [`0db9c66`](https://github.com/electron-userland/electron-builder/commit/0db9c66f0fff9a482d34aeaafaf11f542b786bf8)_ — `app-builder-lib`, `builder-util`

### Patch Changes

- Chore: Update `@electron/rebuild` _[`#7560`](https://github.com/electron-userland/electron-builder/pull/7560) [`592570b`](https://github.com/electron-userland/electron-builder/commit/592570b72e7fc5caab6352805eadf149c637c420)_ — `app-builder-lib`
- Update link to fpm docs _[`#7557`](https://github.com/electron-userland/electron-builder/pull/7557) [`22bc937`](https://github.com/electron-userland/electron-builder/commit/22bc93707ca9af1b6be487f91589813e392726a2)_ — `app-builder-lib`

## electron-updater@6.1.0

### Minor Changes

- Feat: nsis install method - exposed as public to avoid quit the app for the install _[`#7533`](https://github.com/electron-userland/electron-builder/pull/7533) [`4786d41`](https://github.com/electron-userland/electron-builder/commit/4786d41575c638137c7016c905d089ab74bf5e28)_

### Patch Changes

- Fix differential downloads when the server compresses the blockmap file HTTP response _[`#7544`](https://github.com/electron-userland/electron-builder/pull/7544) [`dab3aeb`](https://github.com/electron-userland/electron-builder/commit/dab3aeba2240ead4300c8fdb35e3d9c16b04a23d)_ — `electron-updater`, `builder-util-runtime`



# [24.2.1](https://github.com/electron-userland/electron-builder/compare/v24.2.0...v24.2.1) (2023-04-13)

## electron-builder@24.2.1

### Patch Changes

- Use `update-alternatives` when available. _[`#7501`](https://github.com/electron-userland/electron-builder/pull/7501) [`e83dc81`](https://github.com/electron-userland/electron-builder/commit/e83dc814725f543c6b51721fdbfee83158d35084)_ — `app-builder-lib`

  ## What is changing?
  Test for `update-alternatives` in DEB based installations and use this whenever possible.
  In this way, middleware and downstream projects and users can specify binaries of their
  own priority that would override this programs' configured executable.

  ## Why is this changing?
  Personally, I don't want apps running as myself or a privileged user in my system.
  For this. I have a shell that is executed to drop permissions first, then execute the
  selected software.
  Electron apps don't conform to this since they link directly rather than using a linking
  system.

  This change is to ensure that system is used before resorting to direct links.

  ## How should this be consumed?
  Simply update as normal and this package will switch to using update-alternatives.
  This will allow middleware and end-users to better control the active executable.
- Update `@electron/rebuild` to version `^3.2.11` and account for the new folder structure of the package. _[`#7541`](https://github.com/electron-userland/electron-builder/pull/7541) [`a4888ac`](https://github.com/electron-userland/electron-builder/commit/a4888ac490e4e5d3783858d27acd487b2b8444fd)_ — `app-builder-lib`

## electron-updater@6.0.4

### Patch Changes

- Fix: handle errors on responses in differential download (#2398) _[`#7542`](https://github.com/electron-userland/electron-builder/pull/7542) [`9123e31`](https://github.com/electron-userland/electron-builder/commit/9123e31eb792211da717804e5a5b8029fe694d5f)_



# [24.2.0](https://github.com/electron-userland/electron-builder/compare/v24.1.3...v24.2.0) (2023-04-06)

## electron-builder@24.2.0

### Minor Changes

- Feat: Moved `electronLanguages` to global config to support win/linux _[`#7516`](https://github.com/electron-userland/electron-builder/pull/7516) [`1533501`](https://github.com/electron-userland/electron-builder/commit/1533501f999b364b656cdaa2048a1a7fd5e7c361)_ — `app-builder-lib`

## electron-updater@6.0.3

### Patch Changes

- Fixed error handling when launching updater (fixes NSIS updates when isAdminRightsRequired is incorrectly set to false) _[`#7524`](https://github.com/electron-userland/electron-builder/pull/7524) [`1a13480`](https://github.com/electron-userland/electron-builder/commit/1a13480036a2219007f866c64beea45292bc2946)_



# [24.1.3](https://github.com/electron-userland/electron-builder/compare/v24.1.2...v24.1.3) (2023-04-04)

## electron-builder@24.1.3

### Patch Changes

- Fix: "Can't reconcile two non-macho files" due to `disablePreGypCopy` functionality in new electron/rebuild integration _[`#7519`](https://github.com/electron-userland/electron-builder/pull/7519) [`abf3703`](https://github.com/electron-userland/electron-builder/commit/abf370395f45e4005f12131c532325a1e3232309)_ — `electron-builder`, `app-builder-lib`



# [24.1.2](https://github.com/electron-userland/electron-builder/compare/v24.1.1...v24.1.2) (2023-03-29)

## electron-builder@24.1.2

### Patch Changes

- Removed DefinitelyTyped dependencies from production dependencies list _[`#7508`](https://github.com/electron-userland/electron-builder/pull/7508) [`d4c90b6`](https://github.com/electron-userland/electron-builder/commit/d4c90b676aa22c745de4129f98453b97f264805c)_ — `electron-builder`, `builder-util`, `electron-publish`
- Fix: utilizing frameworkInfo as primary manner of fetching electron version for installation. (fixes: #7494) _[`#7511`](https://github.com/electron-userland/electron-builder/pull/7511) [`16283cc`](https://github.com/electron-userland/electron-builder/commit/16283ccaf5788b1a60c28f6d1424f72eebecea46)_ — `electron-builder`, `app-builder-lib`

## electron-updater@6.0.2

### Patch Changes

- Fix: NsisUpdater - only resolving true if pid !== undefined _[`#7503`](https://github.com/electron-userland/electron-builder/pull/7503) [`a2ab1ff`](https://github.com/electron-userland/electron-builder/commit/a2ab1ff36dbe99a9c9d22bde15e83482eb5be340)_
- Removed DefinitelyTyped dependencies from production dependencies list _[`#7508`](https://github.com/electron-userland/electron-builder/pull/7508) [`d4c90b6`](https://github.com/electron-userland/electron-builder/commit/d4c90b676aa22c745de4129f98453b97f264805c)_



# [24.1.1](https://github.com/electron-userland/electron-builder/compare/v24.1.0...v24.1.1) (2023-03-24)

## electron-builder@24.1.1

### Patch Changes

- Fix: removing ffmpeg dependency due to dependency vulnerability _[`#7495`](https://github.com/electron-userland/electron-builder/pull/7495) [`91f86ae`](https://github.com/electron-userland/electron-builder/commit/91f86aed093a78cd43e60126ebd48fa88ce7727a)_ — `app-builder-lib`



# [24.1.0](https://github.com/electron-userland/electron-builder/compare/v24.0.0...v24.1.0) (2023-03-22)

## electron-builder@24.1.0

### Minor Changes

- Feat: Adding new `downloadAlternateFFmpeg` option to download non-proprietary ffmpeg library _[`#7477`](https://github.com/electron-userland/electron-builder/pull/7477) [`1dd26cc`](https://github.com/electron-userland/electron-builder/commit/1dd26cc646c1a9708ff880920319bdaad17d20ba)_ — `app-builder-lib`

### Patch Changes

- Fix(arm64): use RPM architecture `aarch64` in name _[`#7466`](https://github.com/electron-userland/electron-builder/pull/7466) [`1342f87`](https://github.com/electron-userland/electron-builder/commit/1342f872f98229cf6c31069253fcf0f435bfd9df)_ — `builder-util`
- Fix: updating SignOptions to leverage `optionsForFile` for entitlements _[`#7491`](https://github.com/electron-userland/electron-builder/pull/7491) [`c1deace`](https://github.com/electron-userland/electron-builder/commit/c1deace1de707faacb02ae49cfaa59d60ab6ac06)_ — `app-builder-lib`
- Fix: missing quote syntax error in nsis uninstaller _[`2a6662e`](https://github.com/electron-userland/electron-builder/commit/2a6662eb9fe5473bc348828a96311978b7c42855)_ — `app-builder-lib`
- Fix: missing quote syntax error in nsis uninstaller _[`#7490`](https://github.com/electron-userland/electron-builder/pull/7490) [`278a3df`](https://github.com/electron-userland/electron-builder/commit/278a3df3c738dbe0d2240f338e901774b7d578c5)_



# [24.0.0](https://github.com/electron-userland/electron-builder/compare/v23.6.0...v24.0.0) (2023-03-04)

## electron-builder@24.0.0

### Major Changes

- Fix: Migrate to electron-rebuild for handling native dependencies _[`#7196`](https://github.com/electron-userland/electron-builder/pull/7196) [`5616f23`](https://github.com/electron-userland/electron-builder/commit/5616f23ce3d03a4e71c7b7bd515ec958b1631b8b)_ — `electron-builder`, `app-builder-lib`
- Extending `linux` executableArgs option to be utilized for Snap target _[`#7198`](https://github.com/electron-userland/electron-builder/pull/7198) [`a2ce9a7`](https://github.com/electron-userland/electron-builder/commit/a2ce9a77c04868e9c01ad76b10955499f1f42eb3)_ — `app-builder-lib`
- Add base option for snapcraft _[`#7320`](https://github.com/electron-userland/electron-builder/pull/7320) [`2852cb5`](https://github.com/electron-userland/electron-builder/commit/2852cb56a337709f8b7f0bcbf92b034ec8a07e7f)_ — `app-builder-lib`
- Remove spctl check from Mac notarization step _[`#7361`](https://github.com/electron-userland/electron-builder/pull/7361) [`f9f23be`](https://github.com/electron-userland/electron-builder/commit/f9f23bef64efd429f6dfd1ec81f2d73927f63a8e)_ — `app-builder-lib`
- Remove extra adapter field if core22 is set as base for snapcraft _[`#7378`](https://github.com/electron-userland/electron-builder/pull/7378) [`db69a18`](https://github.com/electron-userland/electron-builder/commit/db69a1875d219310b3050b35cdc46c20ec45cc04)_ — `app-builder-lib`
- Fix(BREAKING): Execute `afterSign` hook only when signing is completed, otherwise skip _[`#7388`](https://github.com/electron-userland/electron-builder/pull/7388) [`1cb8f50`](https://github.com/electron-userland/electron-builder/commit/1cb8f50c3551b398e20b798aba0c60bb34860b49)_ — `app-builder-lib`
- Fix: Execute `afterSign` hook only when signing is complete (i.e. if the signing step wasn't explicitly skipped) (BREAKING) _[`#7311`](https://github.com/electron-userland/electron-builder/pull/7311) [`fd93fce`](https://github.com/electron-userland/electron-builder/commit/fd93fce96f476c09af3379d964bf9092bd20787e)_

### Minor Changes

- Feat: enabling typescript config files (i.e. electron-builder.ts) _[`#7180`](https://github.com/electron-userland/electron-builder/pull/7180) [`edb28c0`](https://github.com/electron-userland/electron-builder/commit/edb28c093ab251470e9f1579cd58b4f2ed89e21d)_ — `electron-builder`, `app-builder-lib`
- Feat(nsis): add ShutdownBlockReasonCreate for blocking Windowns Shutdown alert/prompt _[`#7251`](https://github.com/electron-userland/electron-builder/pull/7251) [`45a0f82`](https://github.com/electron-userland/electron-builder/commit/45a0f82ac3a14fedfb03880fb43d525a51cec864)_ — `app-builder-lib`
- Feat: Introducing deb and rpm auto-updates as beta feature _[`#7060`](https://github.com/electron-userland/electron-builder/pull/7060) [`1d13001`](https://github.com/electron-userland/electron-builder/commit/1d130012737e77b57c8923fcc0e6ad2cbc5da0e8)_ — `app-builder-lib`
- Feat: integrating @electron/notarize into mac signing flow _[`#7310`](https://github.com/electron-userland/electron-builder/pull/7310) [`00d0dbc`](https://github.com/electron-userland/electron-builder/commit/00d0dbc2d74fbac3e9ce7a046427c1e1d9a11301)_ — `app-builder-lib`
- Added the accelerate option to handle accelerated s3 buckets _[`#7314`](https://github.com/electron-userland/electron-builder/pull/7314) [`cc1ddab`](https://github.com/electron-userland/electron-builder/commit/cc1ddabd45f239ee06fde9b2d1534467908791fa)_ — `app-builder-lib`, `builder-util-runtime`
- Update MacOS signOptions on macPackager _[`#7351`](https://github.com/electron-userland/electron-builder/pull/7351) [`1e8dad8`](https://github.com/electron-userland/electron-builder/commit/1e8dad8bc58f53780c9fac3b0c48e248a8b5467c)_ — `app-builder-lib`
- Feat: optional vendor information in releaseInfo _[`#7373`](https://github.com/electron-userland/electron-builder/pull/7373) [`9700c75`](https://github.com/electron-userland/electron-builder/commit/9700c75331e7d8de4efd257d8774b8c2a422538b)_ — `app-builder-lib`
- Feat: Support mjs files for lifecycle operations _[`#7442`](https://github.com/electron-userland/electron-builder/pull/7442) [`37d6db3`](https://github.com/electron-userland/electron-builder/commit/37d6db389e76c61462cb3578ec4abece1a07d0c2)_

### Patch Changes

- Docs: Warn users not to disable zip for macos if using auto-update _[`#7188`](https://github.com/electron-userland/electron-builder/pull/7188) [`3816d4f`](https://github.com/electron-userland/electron-builder/commit/3816d4f30371345def83a0667d67648790259605)_ — `app-builder-lib`
- Allow non-semver version formats on Windows _[`#7174`](https://github.com/electron-userland/electron-builder/pull/7174) [`0f9865d`](https://github.com/electron-userland/electron-builder/commit/0f9865dc0775f9d80d3bd64cf3e2131be3ae9acb)_ — `app-builder-lib`
- Chore(dep): upgrading typescript and eslint dependencies _[`#7214`](https://github.com/electron-userland/electron-builder/pull/7214) [`53327d5`](https://github.com/electron-userland/electron-builder/commit/53327d51101b83641ece9f497577c3ac93d3e91d)_ — `electron-builder`, `app-builder-lib`, `builder-util`, `builder-util-runtime`, `dmg-builder`, `electron-builder-squirrel-windows`
- Fix: Using electron-rebuild for finding project root for native node addons to correctly handle monorepo setups _[`#7215`](https://github.com/electron-userland/electron-builder/pull/7215) [`0d3b87f`](https://github.com/electron-userland/electron-builder/commit/0d3b87f7b89eb2e8f43613acec0e7e057bca88ab)_ — `app-builder-lib`
- Chore(deps): Updating dependencies and fixing `pnpm audit` with dependency overrides _[`#7213`](https://github.com/electron-userland/electron-builder/pull/7213) [`1786367`](https://github.com/electron-userland/electron-builder/commit/1786367194272dff90e63d0a43f3ad5c3cc151f0)_ — `electron-builder`, `app-builder-lib`, `builder-util`, `dmg-builder`, `electron-builder-squirrel-windows`, `electron-publish`
- Fix: get CI tag in GitHub Actions _[`#7231`](https://github.com/electron-userland/electron-builder/pull/7231) [`c21e3b3`](https://github.com/electron-userland/electron-builder/commit/c21e3b37e0dd064c12dbd38065a548441d7c5a9e)_ — `electron-publish`
- Fixes a bug where signtool might not be used in a windows VM _[`#7275`](https://github.com/electron-userland/electron-builder/pull/7275) [`5668dc2`](https://github.com/electron-userland/electron-builder/commit/5668dc204b83ae0c1edf79a4998f41292007d230)_ — `app-builder-lib`
- Fix(app-builder-lib): export missing TS types _[`#7297`](https://github.com/electron-userland/electron-builder/pull/7297) [`9ce7448`](https://github.com/electron-userland/electron-builder/commit/9ce74482ef0f4abc1206dc96dca559eb9f03d50c)_ — `app-builder-lib`
- Chore: Update dependencies per audit/outdated _[`#7306`](https://github.com/electron-userland/electron-builder/pull/7306) [`01c6791`](https://github.com/electron-userland/electron-builder/commit/01c679107435c6afd0b2de8c44d3f140d20c5577)_ — `electron-builder`, `app-builder-lib`, `builder-util`, `builder-util-runtime`, `dmg-builder`, `electron-builder-squirrel-windows`, `electron-forge-maker-appimage`, `electron-forge-maker-nsis`, `electron-forge-maker-nsis-web`, `electron-forge-maker-snap`, `electron-publish`
- Fix: Ensure parent directories of symlinks are created when copied directory only contains symlinks _[`#7327`](https://github.com/electron-userland/electron-builder/pull/7327) [`973a004`](https://github.com/electron-userland/electron-builder/commit/973a0048b46b8367864241a903453f927c158304)_ — `app-builder-lib`
- Fix: add missing html extension for multi language license files in nsis target _[`#7339`](https://github.com/electron-userland/electron-builder/pull/7339) [`8f94978`](https://github.com/electron-userland/electron-builder/commit/8f94978c41d63e9fb4aa70a1df67f25804fdaf84)_ — `app-builder-lib`
- Fix: re-add `--identifier` to mac pkg build to address issue #7348 _[`#7352`](https://github.com/electron-userland/electron-builder/pull/7352) [`c08db0a`](https://github.com/electron-userland/electron-builder/commit/c08db0a92b5e251229a424c1c00559086d860dde)_ — `app-builder-lib`
- Docs: replaced 'access token' with 'app password' from BitbucketOptions _[`#7362`](https://github.com/electron-userland/electron-builder/pull/7362) [`93930cf`](https://github.com/electron-userland/electron-builder/commit/93930cf0b04b60896835e1d9feeab20722cd1b98)_ — `app-builder-lib`, `builder-util`, `builder-util-runtime`
- Fix: Allow MAS builds to be unsigned if `identity: null` is explicitly passed _[`#7382`](https://github.com/electron-userland/electron-builder/pull/7382) [`bb37687`](https://github.com/electron-userland/electron-builder/commit/bb37687540aa254bce6a92a86c56b606cc16f2be)_ — `app-builder-lib`
- Fix: MAS builds should respect arch suffix per `defaultArch` config _[`#7383`](https://github.com/electron-userland/electron-builder/pull/7383) [`e5748b3`](https://github.com/electron-userland/electron-builder/commit/e5748b3df35676cf6e411c6c47fc4fc56e0a26f2)_ — `app-builder-lib`
- Fix: reset `GYP_MSVS_VERSION` for multi-arch builds before `beforePack` _[`#7387`](https://github.com/electron-userland/electron-builder/pull/7387) [`aeffe08`](https://github.com/electron-userland/electron-builder/commit/aeffe080e07f11057134947e09021cd9d6712935)_ — `app-builder-lib`
- Feat: Allow for NSIS windows installer to be wrapped in an MSI _[`#7407`](https://github.com/electron-userland/electron-builder/pull/7407) [`a338730`](https://github.com/electron-userland/electron-builder/commit/a3387309f0297cb824926bd7fa5cb653da9f24ca)_ — `app-builder-lib`
- Fix: enable signing of .node modules in order to support WDAC _[`45c07e3`](https://github.com/electron-userland/electron-builder/commit/45c07e3e063e89a6f8a82e8ae5ef7a2453ff161a)_ — `app-builder-lib`
- Fix: report the correct status result when `doSign` exits early from macPackager and winPackager. Updated function definition to return `Promise<boolean>` to properly flag intellisense _[`#7432`](https://github.com/electron-userland/electron-builder/pull/7432) [`4d3fdfc`](https://github.com/electron-userland/electron-builder/commit/4d3fdfcfe5c6b75cdb8fa8e89f6169c986949bcb)_ — `app-builder-lib`, `builder-util`
- Fix packager: return success status from doSign function calls _[`#7431`](https://github.com/electron-userland/electron-builder/pull/7431) [`eb842f7`](https://github.com/electron-userland/electron-builder/commit/eb842f7faee3a261635fb3e59230e09c98840e40)_ — `app-builder-lib`
- Fix(packager): return success status from doSign function calls _[`48747ac`](https://github.com/electron-userland/electron-builder/commit/48747ac9e1fe08f84b2335a8263eebc8f4c35561)_
- Revert "feat: Support mjs files for lifecycle operations" _[`#7461`](https://github.com/electron-userland/electron-builder/pull/7461) [`0f9da20`](https://github.com/electron-userland/electron-builder/commit/0f9da20dbf8a229242ad9247ca89ef90241512f5)_
- Fix: Removing file size from BuildTest smart unpack _[`#7456`](https://github.com/electron-userland/electron-builder/pull/7456) [`25dc0bb`](https://github.com/electron-userland/electron-builder/commit/25dc0bbb19637add4c47be88934f70b0e84a122e)_
- Fix: update docs for updated electron API _[`b7a53d0`](https://github.com/electron-userland/electron-builder/commit/b7a53d0f69f1350b47cef118b1ef4aaf9885f88f)_
- Fix: enable signing of .node modules in order to support WDAC _[`#7421`](https://github.com/electron-userland/electron-builder/pull/7421) [`d1e0c34`](https://github.com/electron-userland/electron-builder/commit/d1e0c348283b5f099217aa247f9af24c77a3e415)_
- Fix(docs): PlatformSpecificBuildOptions.md broken link _[`#7405`](https://github.com/electron-userland/electron-builder/pull/7405) [`ece7f88`](https://github.com/electron-userland/electron-builder/commit/ece7f889f93921894cbbcb02b924dc90d793be7c)_
- Fix: incorrect html comment in issue_template.md _[`#7386`](https://github.com/electron-userland/electron-builder/pull/7386) [`d07b98a`](https://github.com/electron-userland/electron-builder/commit/d07b98accba0c1afea12d18e850fde02dcf8ea51)_

## electron-updater@6.0.0

### Major Changes

- Fix: use appropriate `electron-updater` cache directory on macOS _[`#7032`](https://github.com/electron-userland/electron-builder/pull/7032) [`caa32e0`](https://github.com/electron-userland/electron-builder/commit/caa32e0708ba4347dd37e93174fce1d2c5660160)_

### Minor Changes

- Feat: Introducing deb and rpm auto-updates as beta feature _[`#7060`](https://github.com/electron-userland/electron-builder/pull/7060) [`1d13001`](https://github.com/electron-userland/electron-builder/commit/1d130012737e77b57c8923fcc0e6ad2cbc5da0e8)_
- Added the accelerate option to handle accelerated s3 buckets _[`#7314`](https://github.com/electron-userland/electron-builder/pull/7314) [`cc1ddab`](https://github.com/electron-userland/electron-builder/commit/cc1ddabd45f239ee06fde9b2d1534467908791fa)_ — `builder-util-runtime`
- Feat: Provide a custom verify function interface to enable nsis signature verification alternatives instead of powershell _[`#7337`](https://github.com/electron-userland/electron-builder/pull/7337) [`9c0c422`](https://github.com/electron-userland/electron-builder/commit/9c0c422834369f42b311b5d9ecd301f8b50bccfa)_

### Patch Changes

- Chore(dep): upgrading typescript and eslint dependencies _[`#7214`](https://github.com/electron-userland/electron-builder/pull/7214) [`53327d5`](https://github.com/electron-userland/electron-builder/commit/53327d51101b83641ece9f497577c3ac93d3e91d)_ — `builder-util-runtime`
- Chore(deps): Updating dependencies and fixing `pnpm audit` with dependency overrides _[`#7213`](https://github.com/electron-userland/electron-builder/pull/7213) [`1786367`](https://github.com/electron-userland/electron-builder/commit/1786367194272dff90e63d0a43f3ad5c3cc151f0)_
- Fix: support powershell constrained language mode _[`#7230`](https://github.com/electron-userland/electron-builder/pull/7230) [`346af1d`](https://github.com/electron-userland/electron-builder/commit/346af1d470ebbf12733a9619a2389bcfdf452bc6)_
- Chore: Update dependencies per audit/outdated _[`#7306`](https://github.com/electron-userland/electron-builder/pull/7306) [`01c6791`](https://github.com/electron-userland/electron-builder/commit/01c679107435c6afd0b2de8c44d3f140d20c5577)_ — `electron-updater`, `builder-util-runtime`
- Docs: replaced 'access token' with 'app password' from BitbucketOptions _[`#7362`](https://github.com/electron-userland/electron-builder/pull/7362) [`93930cf`](https://github.com/electron-userland/electron-builder/commit/93930cf0b04b60896835e1d9feeab20722cd1b98)_ — `builder-util-runtime`
- Fix: add reject in handleError in Windows `verifySignature` function _[`#7380`](https://github.com/electron-userland/electron-builder/pull/7380) [`7862e38`](https://github.com/electron-userland/electron-builder/commit/7862e388a2049ccbe1e01a5624c6a8a5f2942d54)_
- Fix: inherit stdio for updated processes (#7393) _[`#7394`](https://github.com/electron-userland/electron-builder/pull/7394) [`1bbcfb3`](https://github.com/electron-userland/electron-builder/commit/1bbcfb3dc5f36b0803c69e9170db16ded52a0043)_



# [23.6.0](https://github.com/electron-userland/electron-builder/compare/v23.5.1...v23.6.0) (2022-10-03)


### Features

* add option for quitAndInstall for non-silent update without restart ([#7136](https://github.com/electron-userland/electron-builder/issues/7136)) ([4d989a8](https://github.com/electron-userland/electron-builder/commit/4d989a8a52bf7baac22742769abcc795ce193fbd))
* add Github Actions environment variable to isPullRequest method ([#7152](https://github.com/electron-userland/electron-builder/issues/7152)) ([4583273](https://github.com/electron-userland/electron-builder/commit/4583273ebe5cabfd1c14f647dc9edb7bff3c3bf3))
* add nsis option `removeDefaultUninstallWelcomePage` to remove the default uninstall welcome page ([#7141](https://github.com/electron-userland/electron-builder/issues/7141)) ([d71a579](https://github.com/electron-userland/electron-builder/commit/d71a5790a94cd56b6e033b656b4892ec31f14b9d))


### Bug Fixes

* **ci:** GitHub Workflows security hardening ([#7156](https://github.com/electron-userland/electron-builder/issues/7156)) ([50d126e](https://github.com/electron-userland/electron-builder/commit/50d126e43de83e4bb4e6e2c700ddca6a4dbef569))
* formatting of Code in the MacOS PKG docs ([#7142](https://github.com/electron-userland/electron-builder/issues/7142)) ([9338097](https://github.com/electron-userland/electron-builder/commit/9338097a9f6754dee8d87185154eaa7d9cffdec8))



# [23.5.1](https://github.com/electron-userland/electron-builder/compare/v23.5.0...v23.5.1) (2022-09-08)


### Bug Fixes

* **docs:** typo of docs/generated/NsisOptions.md ([#7120](https://github.com/electron-userland/electron-builder/issues/7120)) ([740c411](https://github.com/electron-userland/electron-builder/commit/740c41146f875feaa730d18f8353b11416dab1e0))
* strip extra fields out that are not allowed when creating snap.yaml (#7104) ([#7110](https://github.com/electron-userland/electron-builder/issues/7110)) ([0a7025e](https://github.com/electron-userland/electron-builder/commit/0a7025e5184e3333d077db1f7e782d6a768ecdea))
* allow CSC_LINK to have a mime-type prefix before extracting it to a p12 ([#7119](https://github.com/electron-userland/electron-builder/issues/7119)) ([323618f](https://github.com/electron-userland/electron-builder/commit/323618f79108a8bb829dc1e84e933ace90940010))
* Revert "feat: Upgrade to Ubuntu 22.04 and python 3.10" ([#7109](https://github.com/electron-userland/electron-builder/issues/7109)) ([7d606af](https://github.com/electron-userland/electron-builder/commit/7d606aff59c964dc0af93c0f235abb0f3e258dea))


### Features

* Allow the AppUpdater to be forced into dev mode, allowing it to be activated when the app is not packaged ([#7117](https://github.com/electron-userland/electron-builder/issues/7117)) ([0c52841](https://github.com/electron-userland/electron-builder/commit/0c528411fb8a7de23e974f44e36c5e69bd3bb167))



# [23.5.0](https://github.com/electron-userland/electron-builder/compare/v23.4.0...v23.5.0) (2022-08-31)


### Bug Fixes

* close file stream when error in httpExecutor ([#7094](https://github.com/electron-userland/electron-builder/issues/7094)) ([1023a93](https://github.com/electron-userland/electron-builder/commit/1023a93e92eaa26bf33b52edda5b22e56ed1ec18))
* improve `downloadUpdate` typing to match the doc ([#7099](https://github.com/electron-userland/electron-builder/issues/7099)) ([cd21b09](https://github.com/electron-userland/electron-builder/commit/cd21b0918843fe1269ddaf8dde099c8faeb54b80))
* Invalid code signing for MAS build due to ordering of certificate check (#7040) ([#7089](https://github.com/electron-userland/electron-builder/issues/7089)) ([a1d86fd](https://github.com/electron-userland/electron-builder/commit/a1d86fd75bbc7b252403c16966430a2e3562205d))
* allow user to define explicit `buildNumber` in config, useful for fpm `--iteration` flag ([#7075](https://github.com/electron-userland/electron-builder/issues/7075)) ([8166267](https://github.com/electron-userland/electron-builder/commit/8166267d487cd26b154e28cf60d89102a487a353))
* replace update-notifier with simple-update notifier due to dependency vulnerability ([#7078](https://github.com/electron-userland/electron-builder/issues/7078)) ([48cbb12](https://github.com/electron-userland/electron-builder/commit/48cbb120dc11994889f4aa61c8431531ce274006))
* updating integration test for prerelease flag ([#7072](https://github.com/electron-userland/electron-builder/issues/7072)) ([f205998](https://github.com/electron-userland/electron-builder/commit/f205998999ff615c9ea63184520a1efbbff5a785))



# [23.4.0](https://github.com/electron-userland/electron-builder/compare/v23.3.3...v23.4.0) (2022-08-12)


### Features

* Adding timeout to publisher config for api requests and uploads ([#7028](https://github.com/electron-userland/electron-builder/issues/7028)) ([e7179b5](https://github.com/electron-userland/electron-builder/commit/e7179b57bdba192acfdb439c03099e6629e98f6a))



## [23.3.3](https://github.com/electron-userland/electron-builder/compare/v23.3.2...v23.3.3) (2022-07-26)


### Bug Fixes

* Duplicate values during deep assign of extra files ([#7019](https://github.com/electron-userland/electron-builder/issues/7019)) ([98d3a63](https://github.com/electron-userland/electron-builder/commit/98d3a6361d500e85e443ee292529c27f0b4a0b59))



## [23.3.2](https://github.com/electron-userland/electron-builder/compare/v23.3.1...v23.3.2) (2022-07-18)


### Bug Fixes

* **electron-updater:** fix backward compatibility for GitHub provider without channels ([#6998](https://github.com/electron-userland/electron-builder/issues/6998)) ([d6115bc](https://github.com/electron-userland/electron-builder/commit/d6115bc5d066d6eee2638015be0c804b31ffcc18))
* Wrap the nsProcess include in a !ifndef ([#6996](https://github.com/electron-userland/electron-builder/issues/6996)) ([5301525](https://github.com/electron-userland/electron-builder/commit/53015253939f450468a6d8e0405697ea70c2a138))



# [23.3.1](https://github.com/electron-userland/electron-builder/compare/v23.3.0...v23.3.1) (2022-07-08)


### Bug Fixes

* add product scope to keygen publisher ([#6990](https://github.com/electron-userland/electron-builder/issues/6990)) ([c3407a2](https://github.com/electron-userland/electron-builder/commit/c3407a202d4dc1599b2cb90a7ff3d56e8e32309e))
* parallel release creation with keygen publisher ([#6989](https://github.com/electron-userland/electron-builder/issues/6989)) ([7ad5101](https://github.com/electron-userland/electron-builder/commit/7ad5101b4a72df411b76cc500a6a0dca85bf6540))


### Features

* Add installDir property for NsisUpdater ([#6907](https://github.com/electron-userland/electron-builder/issues/6907)) ([e7f2867](https://github.com/electron-userland/electron-builder/commit/e7f286776643823f9c906738aade1d71eb1bdd9c))



# [23.3.0](https://github.com/electron-userland/electron-builder/compare/v23.2.0...v23.3.0) (2022-07-04)


### Bug Fixes

* automatically regenerate schema if any config option changes in app-builder-lib ([51f5d49](https://github.com/electron-userland/electron-builder/commit/51f5d4915c4aa69f3253a41e1d7b4ab9f2328732))
* regenerating docs and schema ([f70abf1](https://github.com/electron-userland/electron-builder/commit/f70abf1628223e1cc0d687471ad36b4a2ee66ebe))
* Optionally remove DISABLE_WAYLAND for snaps via allowNativeWayland option ([#6961](https://github.com/electron-userland/electron-builder/issues/6961)) ([4c867aa](https://github.com/electron-userland/electron-builder/commit/4c867aa017a7ce2bf88138634b6d1e9a3bf34854))
* regenerating schema to account for electron-universal options `x64ArchFiles` ([#6983](https://github.com/electron-userland/electron-builder/issues/6983)) ([adeaa34](https://github.com/electron-userland/electron-builder/commit/adeaa347c03b8947b0812ecef23398c0822646bb))
* nsis-web target set APP_PACKAGE_URL_IS_INCOMPLETE when specifying appPackageUrl ([#6964](https://github.com/electron-userland/electron-builder/issues/6964)) ([b0e1b6f](https://github.com/electron-userland/electron-builder/commit/b0e1b6f8af95bc371c0bc91df65965f3f60f3a87))
* **nsis:** fix typo in German installer message ([#6960](https://github.com/electron-userland/electron-builder/issues/6960)) ([6e90c84](https://github.com/electron-userland/electron-builder/commit/6e90c8459111ec046b91f8ae5da1990af0bbe942))
* **mas:** Allow signing with "3rd Party Mac Developer Application" ([#6970](https://github.com/electron-userland/electron-builder/issues/6970)) ([28c07b4](https://github.com/electron-userland/electron-builder/commit/28c07b4392161732ee221dbb3f3a3633899cfa33))
* add product scope to keygen provider ([#6975](https://github.com/electron-userland/electron-builder/issues/6975)) ([8279d05](https://github.com/electron-userland/electron-builder/commit/8279d053d520e7506d84bf9710972b998e70b752))
* prevent infinite looping of overwriteArtifact during Github publishing ([#6958](https://github.com/electron-userland/electron-builder/issues/6958)) ([8ffd9d4](https://github.com/electron-userland/electron-builder/commit/8ffd9d42d89634be76fd4554f659f2b2512f2081))
* **mac:** allow Mac Developer certs for non Mac App Store builds ([#6956](https://github.com/electron-userland/electron-builder/issues/6956)) ([4e90504](https://github.com/electron-userland/electron-builder/commit/4e905046e632b396735b78618fbc01331448f088))


### Features

* upgrade keygen integration to v1.1 ([#6941](https://github.com/electron-userland/electron-builder/issues/6941)) ([14503ce](https://github.com/electron-userland/electron-builder/commit/14503ceb99c1a31c54a261a1ae60a34980f36a50))



# [23.2.0](https://github.com/electron-userland/electron-builder/compare/v23.1.0...v23.2.0) (2022-06-17)


### Features

* Upgrade docker images to Ubuntu 22.04 and python 3.10 ([#6922](https://github.com/electron-userland/electron-builder/issues/6922)) ([03cc9b9](https://github.com/electron-userland/electron-builder/commit/03cc9b96e0be07ef3450e3992eafcb7fe903a853))
* electron/universal has a new minimatch option 'x64ArchFiles' ([#6913](https://github.com/electron-userland/electron-builder/issues/6913)) ([f3a56ef](https://github.com/electron-userland/electron-builder/commit/f3a56ef6f8132e0a7cc18ec58d1d6103683916dd))


### Bug Fixes

* pin Keygen.io integration to v1.0 ([#6909](https://github.com/electron-userland/electron-builder/issues/6909)) ([0b6db59](https://github.com/electron-userland/electron-builder/commit/0b6db59ec10dfe05903f29d6790972f55746bef7))



# [23.1.0](https://github.com/electron-userland/electron-builder/compare/v23.0.9...v23.1.0) (2022-05-29)


### Bug Fixes

* moving typed-emitter from devDependency to dependencies ([#6889](https://github.com/electron-userland/electron-builder/issues/6889)) ([869ec27](https://github.com/electron-userland/electron-builder/commit/869ec27fd1d99b9913875cb4d7ae7c733c1f3e25))
* **msi:** manually escape XML special characters when building project.wxs XML ([#6878](https://github.com/electron-userland/electron-builder/issues/6878)) ([2ece89a](https://github.com/electron-userland/electron-builder/commit/2ece89a08e7fb74a11ba3d0f5980b2a57c8b34ad))
* **nsis:** new translations for various strings in nsis messages template ([#6827](https://github.com/electron-userland/electron-builder/issues/6827)) ([fa72861](https://github.com/electron-userland/electron-builder/commit/fa72861f6cd2de97d191f1b2bbfddc6edf48ab6d))


### Features

* add afterPack call after macOS universal package is created ([#6887](https://github.com/electron-userland/electron-builder/issues/6887)) ([4d590d3](https://github.com/electron-userland/electron-builder/commit/4d590d302f6c3baacf9dabf338904fef337960a6))



## [23.0.9](https://github.com/electron-userland/electron-builder/compare/v23.0.8...v23.0.9) (2022-05-08)


### Bug Fixes

* Add "arm" as an alias for armv7l as process.arch outputs arm on armv7l hosts ([#6845](https://github.com/electron-userland/electron-builder/issues/6845)) ([d3452b0](https://github.com/electron-userland/electron-builder/commit/d3452b0427cb45035f6ed7f1266691db4accd5c4))
* Merge arrays from same config key in cascading electron-builder configs, such as `files` ([#6841](https://github.com/electron-userland/electron-builder/issues/6841)) ([9dc13ba](https://github.com/electron-userland/electron-builder/commit/9dc13ba2c1e7a852d3f743833f1bde17b62f1806))
* set github release name to match the app version ([#6840](https://github.com/electron-userland/electron-builder/issues/6840)) ([e9ba750](https://github.com/electron-userland/electron-builder/commit/e9ba75005dda39f03c04e37a5d46a1bbe634c189))
* rendering extended node_modules in jsdoc ([#6843](https://github.com/electron-userland/electron-builder/issues/6843)) ([481a7ed](https://github.com/electron-userland/electron-builder/commit/481a7ed2b77e7e1b448f27e58fedeac53b107ffc))
* Unable to find latest version on GitHub ([#6822](https://github.com/electron-userland/electron-builder/issues/6822)) ([bfe29a5](https://github.com/electron-userland/electron-builder/commit/bfe29a5e991c2719032877bd7225b15b6b836221))
* incompatible Windows sign tool in end user environment. ([#6817](https://github.com/electron-userland/electron-builder/issues/6817)) ([2860d13](https://github.com/electron-userland/electron-builder/commit/2860d132fc837813627e6508e05b18ed5e5dedfc))
* Lock wine version to v6 in docker image ([#6816](https://github.com/electron-userland/electron-builder/issues/6816)) ([8f57a90](https://github.com/electron-userland/electron-builder/commit/8f57a90c885254bf442e7eea5b8f450bd400eac4))



## [23.0.8](https://github.com/electron-userland/electron-builder/compare/v23.0.7...v23.0.8) (2022-04-23)


### Bug Fixes

* github provider prerelease check incorrectly casts undefined to String. Fixes #6809 ([#6810](https://github.com/electron-userland/electron-builder/issues/6810)) ([817e68b](https://github.com/electron-userland/electron-builder/commit/817e68ba54f4fa60fec789fcfcfb527473a610fc))



# [23.0.7](https://github.com/electron-userland/electron-builder/compare/v23.0.6...v23.0.7) (2022-04-21)


### Bug Fixes

* **nsis:** Decide to use elevate.exe for installer when update using nsis packElevateHelper option in electron-builder config ([#6787](https://github.com/electron-userland/electron-builder/issues/6787)) ([eb456a8](https://github.com/electron-userland/electron-builder/commit/eb456a87b0603dcc0e6d777c2b8e1c2e7b64d3a6))
* **nsis:** cleanup temporary 7z folder ([#6793](https://github.com/electron-userland/electron-builder/issues/6793)) ([85a3e55](https://github.com/electron-userland/electron-builder/commit/85a3e5595e64346514dd7f5fade42e3632a18ee0))


### Features

* Use tar instead of 7zip to preserve file permissions in tar.gz packages ([#6791](https://github.com/electron-userland/electron-builder/issues/6791)) ([95910f8](https://github.com/electron-userland/electron-builder/commit/95910f87195f501eadda95c52cfa8e1816d211b6))



## [23.0.6](https://github.com/electron-userland/electron-builder/compare/v23.0.4...v23.0.6) (2022-04-13)


### Bug Fixes

* **dmg-builder:** exec python fail on Macos12.3 ([#6789](https://github.com/electron-userland/electron-builder/issues/6789)) ([76f3a1d](https://github.com/electron-userland/electron-builder/commit/76f3a1d102be04c0517a08826b8b1337478f766d))
* **app-builder-lib:** Overriding OutgoingHttpHeaders schema props ([#6775](https://github.com/electron-userland/electron-builder/issues/6775)) ([e9a87a7](https://github.com/electron-userland/electron-builder/commit/e9a87a738ceb2b9e14cbc85b4c62e11edab3d0cf))
* **nsis:** Update zh-tw translation ([#6773](https://github.com/electron-userland/electron-builder/issues/6773)) ([5a0bab1](https://github.com/electron-userland/electron-builder/commit/5a0bab115f4ede3f21e23e847c0d2dd7ecc99b16))



## [23.0.4](https://github.com/electron-userland/electron-builder/compare/v23.0.3...v23.0.4) (2022-04-09)


### Bug Fixes

* **app-builder-lib:** change slash to backslash in NSIS's APP_PACKAGE_NAME ([#6772](https://github.com/electron-userland/electron-builder/issues/6772)) ([e861352](https://github.com/electron-userland/electron-builder/commit/e86135236908961b1269708ca645a66c7ff19287))
* **nsis:** specify full path to system's find ([#6771](https://github.com/electron-userland/electron-builder/issues/6771)) ([e6c2a62](https://github.com/electron-userland/electron-builder/commit/e6c2a629839184d4f9d3fa99b580d8c96911ea65))
* Updater "Error: Could not connect to the server." in macOS ([#6743](https://github.com/electron-userland/electron-builder/issues/6743)) ([27f18aa](https://github.com/electron-userland/electron-builder/commit/27f18aa1d890f3a82e856f4834b8387066fb697f))
* **app-builder-lib:** bump @electron/universal to 1.2.1 ([#6750](https://github.com/electron-userland/electron-builder/issues/6750)) ([370f84b](https://github.com/electron-userland/electron-builder/commit/370f84bb2f32f28c374b63e1c795e4850f971274))



## [23.0.3](https://github.com/electron-userland/electron-builder/compare/v23.0.2...v23.0.3) (2022-03-20)


### Bug Fixes

* Change DEBUG_LOGGING env var for nsis installers as part of `customNsisBinary` config ([#6729](https://github.com/electron-userland/electron-builder/issues/6729)) ([0a30846](https://github.com/electron-userland/electron-builder/commit/0a308469f269dc5294f29f2c422d9936175c0880))
* **docs:** link to SquirrelWindowsOptions in configuration ([#6724](https://github.com/electron-userland/electron-builder/issues/6724)) ([4eaab19](https://github.com/electron-userland/electron-builder/commit/4eaab1936429ac69dafcc7cfbf53caa85c241a11))



## [23.0.2](https://github.com/electron-userland/electron-builder/compare/v23.0.1...v23.0.2) (2022-03-05)


### Bug Fixes

* **win:** Include swiftshader in signing directories for windows ([#6682](https://github.com/electron-userland/electron-builder/issues/6682)) ([e6312cb](https://github.com/electron-userland/electron-builder/commit/e6312cb54e5d957289d5c07b506491fcaea9e334))
* **app-builder-lib:** export missing TS types ([#6692](https://github.com/electron-userland/electron-builder/issues/6692)) ([93181a7](https://github.com/electron-userland/electron-builder/commit/93181a78f2893ea4929aea8878343336931b3a04))
* Reactivating bitbucket integration test for nsis updater ([#6680](https://github.com/electron-userland/electron-builder/issues/6680)) ([6fcd477](https://github.com/electron-userland/electron-builder/commit/6fcd47767af8a95ab018fe0d8a07d2c53a72067d))



## [23.0.1](https://github.com/electron-userland/electron-builder/compare/v23.0.0...v23.0.1) (2022-02-24)


### Bug Fixes

* **dmg-builder:** the "import" unbound issue for python 2/3 ([#6672](https://github.com/electron-userland/electron-builder/issues/6672)) ([3a4b64a](https://github.com/electron-userland/electron-builder/commit/3a4b64abb58f01e8a80e496b6c4681455b2434ca))
* signing of user-defined binaries on mac when resolved as relative path ([#6660](https://github.com/electron-userland/electron-builder/issues/6660)) ([4c6d154](https://github.com/electron-userland/electron-builder/commit/4c6d1546d4942aa9d9a93b7309e8ed279f6378d2))



# [23.0.0](https://github.com/electron-userland/electron-builder/compare/v22.14.13...v23.0.0) (2022-02-19)


### Bug Fixes

* **packager:** wait for artifactCreated completion event before starting an upload ([#6625](https://github.com/electron-userland/electron-builder/issues/6625)) ([c561af8](https://github.com/electron-userland/electron-builder/commit/c561af810d5de52bec57709cbaebca2ac92c55fc))
* **updater:** Remove checks for app-update.yml when auto-updates are not supported ([#6616](https://github.com/electron-userland/electron-builder/issues/6616)) ([86e6d15](https://github.com/electron-userland/electron-builder/commit/86e6d1509f9b9c76c559e9c3a12b7a1595fe3ac4))
* **dmg-builder:** Support python 3 since python 2 was removed from MacOS 12.3 ([#6617](https://github.com/electron-userland/electron-builder/issues/6617)) ([2def112](https://github.com/electron-userland/electron-builder/commit/2def112bc1ac42046b921206825871b82ebf0955))
* **docs:** Fixing formatting of code groups and previews ([#6601](https://github.com/electron-userland/electron-builder/issues/6601)) ([b01d522](https://github.com/electron-userland/electron-builder/commit/b01d5225631115f6f301cb113b044fd10ebb5256))
* **updater:** Support Electron 11 and below (Node < 14) ([#6594](https://github.com/electron-userland/electron-builder/issues/6594)) ([edc4b03](https://github.com/electron-userland/electron-builder/commit/edc4b030703ee3929b31608a496798635169f5b1))
* **win/mac:** Small security fixes for electron-updater ([#6589](https://github.com/electron-userland/electron-builder/issues/6589)) ([633ee5d](https://github.com/electron-userland/electron-builder/commit/633ee5dc292174ed1486c53af93320f20cf02169))
* fixes for server auth for MacUpdater ([#6587](https://github.com/electron-userland/electron-builder/issues/6587)) ([8746f91](https://github.com/electron-userland/electron-builder/commit/8746f910d136fb9b531e688d0a646eeb9528adc6))
* Update certificate validation on Windows to check full DN ([#6576](https://github.com/electron-userland/electron-builder/issues/6576)) ([53467c7](https://github.com/electron-userland/electron-builder/commit/53467c724dacc11fc270cebaba22f8cf84dff24f))
* Allow disabling of webinstaller files to avoid confusion with actual installers ([#6575](https://github.com/electron-userland/electron-builder/issues/6575)) ([5e381c5](https://github.com/electron-userland/electron-builder/commit/5e381c556d12ce185bb7ea720380509c1ddc5cf7))
* **electron-publish:** socket hang up error 422 issues in github publish ([#6563](https://github.com/electron-userland/electron-builder/issues/6563)) ([39da9ed](https://github.com/electron-userland/electron-builder/commit/39da9edd2df5c147ef2d868f022484a8b2e0466a))
* **nsis:** use revertible+atomic rmdir on update and add user-confirmed retry loop ([#6551](https://github.com/electron-userland/electron-builder/issues/6551)) ([7b2a5e1](https://github.com/electron-userland/electron-builder/commit/7b2a5e1f19921e9da4aaaea8c01c78740f29f9dd))
* **NSIS:** prevent partial overwrites during `Nsis7z::Extract` ([#6547](https://github.com/electron-userland/electron-builder/issues/6547)) ([bea51d6](https://github.com/electron-userland/electron-builder/commit/bea51d6a8bb828d9b34734908f13b667aa55b0e9))
* skip unstable installer tests to unblock master CI pipeline ([#6544](https://github.com/electron-userland/electron-builder/issues/6544)) ([5648e05](https://github.com/electron-userland/electron-builder/commit/5648e05a9efa61f81e788ecf538a617df9f65fe1))
* Stub CircleCI config since we can't disable it from dashboard ([#6543](https://github.com/electron-userland/electron-builder/issues/6543)) ([22fb8c6](https://github.com/electron-userland/electron-builder/commit/22fb8c63ac196c61c6b449e6e5e95d91117f8894))


### Features

* **updater:** Add Channel Support for Github with PreRelease (#6505) (#1722) ([#4988](https://github.com/electron-userland/electron-builder/issues/4988)) ([1de0adb](https://github.com/electron-userland/electron-builder/commit/1de0adbd615b3b3d26faeb6a449f522355b36041))
* use `mergeASARs` API by @electron/universal ([#6578](https://github.com/electron-userland/electron-builder/issues/6578)) ([81132a8](https://github.com/electron-userland/electron-builder/commit/81132a857b24bfdb01fc44eba75fc89fa2885545))



## [22.14.13](https://github.com/electron-userland/electron-builder/compare/v22.14.12...v22.14.13) (2022-01-11)


### Bug Fixes

* **docs:** Update link for "Desktop File" ([#6532](https://github.com/electron-userland/electron-builder/issues/6532)) ([cd79c53](https://github.com/electron-userland/electron-builder/commit/cd79c53828759cf19cd361a48ef6fd57fff0e2f1))
* use junction in windows to solve Error: EPERM: operation not per… ([#6529](https://github.com/electron-userland/electron-builder/issues/6529)) ([f7b3869](https://github.com/electron-userland/electron-builder/commit/f7b386986ec30f7e4cd3e3f68e078a773940a51c))



## [22.14.12](https://github.com/electron-userland/electron-builder/compare/v22.14.11...v22.14.12) (2022-01-02)


### Bug Fixes

* add warning to macCodeSign when skipping code signing on M1 macOS device ([#6522](https://github.com/electron-userland/electron-builder/issues/6522)) ([8730027](https://github.com/electron-userland/electron-builder/commit/87300278d24e8304caa4b053b883843a2447dab2))
* specify protocol as https to complete proxy support fix ([#6516](https://github.com/electron-userland/electron-builder/issues/6516)) ([344bb23](https://github.com/electron-userland/electron-builder/commit/344bb232d71e608b881a04fc98dca0858e42ddfc))



## [22.14.11](https://github.com/electron-userland/electron-builder/compare/v22.14.10...v22.14.11) (2021-12-21)


### Bug Fixes

* **nsis:** Ignore other users processes during per-user installation ([#6472](https://github.com/electron-userland/electron-builder/issues/6472)) ([e3d06af](https://github.com/electron-userland/electron-builder/commit/e3d06afae1236d44e4b6e670b453b260b1f74d84))



## [22.14.10](https://github.com/electron-userland/electron-builder/compare/v22.14.9...v22.14.10) (2021-11-30)


### Bug Fixes

* **app-builder-lib:** channel alternation for github is not working ([#6449](https://github.com/electron-userland/electron-builder/issues/6449)) ([df7a425](https://github.com/electron-userland/electron-builder/commit/df7a4255d219aea7a1236fd5693f7c13460099ad))
* **mac:** use `uname -a` to get arch before testing 'process.arch' on mac silicon ([#6381](https://github.com/electron-userland/electron-builder/issues/6381)) ([828fcd3](https://github.com/electron-userland/electron-builder/commit/828fcd378c2df28763893ef68f92d5b1a72fead3))



## [22.14.9](https://github.com/electron-userland/electron-builder/compare/v22.14.8...v22.14.9) (2021-11-29)


### Bug Fixes

* **nsis:** per-machine installs must properly elevate during silent install/updates ([#6450](https://github.com/electron-userland/electron-builder/issues/6450)) ([661a652](https://github.com/electron-userland/electron-builder/commit/661a6522520e9ea59549cb7e18986fcfb58e873a))



# [22.14.8](https://github.com/electron-userland/electron-builder/compare/v22.14.7...v22.14.8) (2021-11-26)


### Bug Fixes

* Downgrading nsis to v3.0.4.1 since v3.0.4.2 throws false virus positives (#6334) ([#6447](https://github.com/electron-userland/electron-builder/issues/6447)) ([d20bcf0](https://github.com/electron-userland/electron-builder/commit/d20bcf0cea4e4cb49aab08f820131a2d6b083a2c))


### Features

* make `--no-sandbox` optional for building with AppImage ([#6429](https://github.com/electron-userland/electron-builder/issues/6429)) ([e95afc1](https://github.com/electron-userland/electron-builder/commit/e95afc1ab8c1a09fc8c9496084fc9f49b185469e))



## [22.14.7](https://github.com/electron-userland/electron-builder/compare/v22.14.6...v22.14.7) (2021-11-11)


### Bug Fixes

* **builder-util:** enable proxy handling in NodeHttpExecutor (#6410) (#6286) ([#5906](https://github.com/electron-userland/electron-builder/issues/5906)) ([04a8435](https://github.com/electron-userland/electron-builder/commit/04a84352b2b3fbb3c54533a8428bfd103df0af21))



## [22.14.6](https://github.com/electron-userland/electron-builder/compare/v22.14.5...v22.14.6) (2021-11-08)


### Bug Fixes

* rerunning test-linux to update snapshot for upstream dep that now uses additional depedencies ([#6403](https://github.com/electron-userland/electron-builder/issues/6403)) ([434d388](https://github.com/electron-userland/electron-builder/commit/434d3887cb651ef93ce214dc7b8edeab6a298096))
* quitAndInstall not working on macOS with autoInstallOnAppQuit=false ([#6390](https://github.com/electron-userland/electron-builder/issues/6390)) ([a5e8073](https://github.com/electron-userland/electron-builder/commit/a5e8073e21b1ff791905cdb4ab011a724533d8c1))
* **linux:** mutually exclusive exec command args ([#6384](https://github.com/electron-userland/electron-builder/issues/6384)) ([5468c18](https://github.com/electron-userland/electron-builder/commit/5468c188f30f65352ca651e1f5fa9f8915c48c6b))
* latest node-gyp with old Electron versions ([#6402](https://github.com/electron-userland/electron-builder/issues/6402)) ([f41d5f3](https://github.com/electron-userland/electron-builder/commit/f41d5f397ade8f6199d56bb4275b05a0a0e65bca))



## [22.14.5](https://github.com/electron-userland/electron-builder/compare/v22.14.4...v22.14.5) (2021-10-12)


### Bug Fixes

* SnapStoreOptions required properties (#6327) ([#6333](https://github.com/electron-userland/electron-builder/issues/6333)) ([54ee4e7](https://github.com/electron-userland/electron-builder/commit/54ee4e72c5db859b9a00104179786567a0e977ff))



## [22.14.4](https://github.com/electron-userland/electron-builder/compare/v22.14.3...v22.14.4) (2021-10-04)


### Bug Fixes

* **app-builder-lib:** macOS packager uses static icon name ([#6308](https://github.com/electron-userland/electron-builder/issues/6308)) ([fce1a1f](https://github.com/electron-userland/electron-builder/commit/fce1a1fab66e3f5cd741a4cecc4af8377aea9dd8))
* Update assistedMessages.yml with korean entries ([#6309](https://github.com/electron-userland/electron-builder/issues/6309)) ([e29a6b8](https://github.com/electron-userland/electron-builder/commit/e29a6b8b36695a2ed9d2f9a57e4c1c74587d1b16))
* **publish:** Bitbucket publish can have username different from owner ([#6293](https://github.com/electron-userland/electron-builder/issues/6293)) ([8ebfc96](https://github.com/electron-userland/electron-builder/commit/8ebfc96276bffe0bc1ad394c5ae6843976e01709))
* add appCannotBeClosed text for zh_CN ([#6287](https://github.com/electron-userland/electron-builder/issues/6287)) ([10b4727](https://github.com/electron-userland/electron-builder/commit/10b47273c32c32df17dfb910feb4a7704c83da91))



## [22.14.3](https://github.com/electron-userland/electron-builder/compare/v22.14.2...v22.14.3) (2021-09-25)


### Bug Fixes

* **msi:** fix broken shortcut icon when using msi target, adding msi option `iconId` ([#6247](https://github.com/electron-userland/electron-builder/issues/6247)) ([a9ec90d](https://github.com/electron-userland/electron-builder/commit/a9ec90d539fdbb5786692629275b1a89bfd7aec4))



# [22.14.2](https://github.com/electron-userland/electron-builder/compare/v22.13.1...v22.14.2) (2021-09-10)


### Bug Fixes

* dmg-license-dependency ([#6248](https://github.com/electron-userland/electron-builder/issues/6248)) ([f359035](https://github.com/electron-userland/electron-builder/commit/f3590355c61dab05a6c92c5951aae8e59503d693))
* dmg-license optional dependency ([#6244](https://github.com/electron-userland/electron-builder/issues/6244)) ([8ccb2da](https://github.com/electron-userland/electron-builder/commit/8ccb2da5d4c641b971f6a7403d3b2e3a3b844a05))
* Add support for nested file extensions (such as `.dmg.blockmap`) to Keygen publisher ([#6234](https://github.com/electron-userland/electron-builder/issues/6234)) ([369f1fa](https://github.com/electron-userland/electron-builder/commit/369f1fa793c28d8743e19ef07ce6eb091c191fb0))
* **deploy:** Update package.json script name ([e22fc16](https://github.com/electron-userland/electron-builder/commit/e22fc16cd196ab0f3cc7b2f9bdaae237e64121a8))
* **deploy:** Removing schema generation since it doesn't compile during release ([7e28c11](https://github.com/electron-userland/electron-builder/commit/7e28c11ec894c9ce7664a2ea3bfdb3e96f09d983))
* (mac) Fix intel mac upgrade flow when both x64 and arm64 published ([#6212](https://github.com/electron-userland/electron-builder/issues/6212)) ([0c21cd6](https://github.com/electron-userland/electron-builder/commit/0c21cd69663a7eebe0687eaba9eea851cc2fea9e))


### Features

* adding Bitbucket publisher and autoupdater ([#6228](https://github.com/electron-userland/electron-builder/issues/6228)) ([a945321](https://github.com/electron-userland/electron-builder/commit/a94532164709a545c0f6551fdc336dbc5377bda8))



## [22.13.1](https://github.com/electron-userland/electron-builder/compare/v22.13.0...v22.13.1) (2021-08-26)


### Bug Fixes

* Support Windows 11 in VMs ([#6185](https://github.com/electron-userland/electron-builder/issues/6185)) ([f6a3053](https://github.com/electron-userland/electron-builder/commit/f6a3053563bd50dc77010d2910086c81acdf613e))
* Adding snapStore to AllPublishOptions for generating Configuration schema ([#6193](https://github.com/electron-userland/electron-builder/issues/6193)) ([7f933d0](https://github.com/electron-userland/electron-builder/commit/7f933d0004a0a5f808a2a1c71dca7362cab2728e))



# [22.13.0](https://github.com/electron-userland/electron-builder/compare/v22.12.1...v22.13.0) (2021-08-24)


### Features

* add `beforePack` hook ([#6176](https://github.com/electron-userland/electron-builder/issues/6176)) ([6f42f64](https://github.com/electron-userland/electron-builder/commit/6f42f646c9d36405c9d69ca45dda51baabdec4bd))
* Adding Keygen as an official publisher/updater for electron-builder ([#6167](https://github.com/electron-userland/electron-builder/issues/6167)) ([f45110c](https://github.com/electron-userland/electron-builder/commit/f45110cbf66572d5748d21fc24dc26cabd06f35f))



## [22.12.1](https://github.com/electron-userland/electron-builder/compare/v22.12.0...v22.12.1) (2021-08-22)


### Bug Fixes

* workaround vite replacing process.env in updater ([#6160](https://github.com/electron-userland/electron-builder/issues/6160)) ([a3c72b2](https://github.com/electron-userland/electron-builder/commit/a3c72b2481ebaacfd717a7c492c119bcb9b7fc36))
* **windows:** detect node path correctly on windows with cross-spawn (#6069) ([#6172](https://github.com/electron-userland/electron-builder/issues/6172)) ([6c945bd](https://github.com/electron-userland/electron-builder/commit/6c945bd59749d3fdd91f50ea4131ee22e82f72a2))
* **deploy:** remove zulip release message ([695f89a](https://github.com/electron-userland/electron-builder/commit/695f89a7b18e100c15ac47f837ae10ee600710ac))
* replace deprecated --cache-min option ([#6165](https://github.com/electron-userland/electron-builder/issues/6165)) ([c02ccbb](https://github.com/electron-userland/electron-builder/commit/c02ccbb9739a6fb2840625a825f6be33136567f0))
* **electron-updater:** `null` object error when MacUpdater logs server port before it is listening ([#6149](https://github.com/electron-userland/electron-builder/issues/6149)) ([ca0e845](https://github.com/electron-userland/electron-builder/commit/ca0e8454b876c9fa0c95dbadf2461419e3a8b697))
* console log data for electron-updater blockmaps are far too large ([#6143](https://github.com/electron-userland/electron-builder/issues/6143)) ([ae363e5](https://github.com/electron-userland/electron-builder/commit/ae363e51957d0abfc7d848f51aa23c7e5faf5f33))
* **electron-updater:** fix import errors ([#6140](https://github.com/electron-userland/electron-builder/issues/6140)) ([a3f2cd1](https://github.com/electron-userland/electron-builder/commit/a3f2cd1565771c8ce6c5a4b40d1c88316a75dff3))



# [22.12.0](https://github.com/electron-userland/electron-builder/compare/v22.11.11...v22.12.0) (2021-08-09)


### Bug Fixes

* **electron-updater:** search 'arm64' in name and url to fix updates from Github private repos ([1580ea6](https://github.com/electron-userland/electron-builder/commit/1580ea691c4b82ea80c6420d806bc4bfaef5fd38))
* **electron-updater:** small cleanup and add more debug logging for MacUpdater to investigate #6120 ([#6122](https://github.com/electron-userland/electron-builder/issues/6122)) ([ae81dfa](https://github.com/electron-userland/electron-builder/commit/ae81dfae519435355fc079c76fc16ac25216bf38))
* **electron-updater:** use tag name instead of version when resolving GitHub files ([#6117](https://github.com/electron-userland/electron-builder/issues/6117)) ([dcf03a6](https://github.com/electron-userland/electron-builder/commit/dcf03a67a8a0d4cec4422cda0aa2585f7f54a384))
* **nsis:** should close app when `Silent` and `ONE_CLICK` ([#6100](https://github.com/electron-userland/electron-builder/issues/6100)) ([baf640d](https://github.com/electron-userland/electron-builder/commit/baf640da459dc667240e6015deaf11adb2155063))


### Features

* allow custom makensis and nsis logging ([#6024](https://github.com/electron-userland/electron-builder/issues/6024)) ([a99a7c8](https://github.com/electron-userland/electron-builder/commit/a99a7c87ffd7ffaaa5fae1a17f731a59aac60581))
* **portable:** Adding support for unique dir on each portable app launch ([#6093](https://github.com/electron-userland/electron-builder/issues/6093)) ([f8e16db](https://github.com/electron-userland/electron-builder/commit/f8e16db5393f663724e9c03ceab87698a252c934))



# [22.11.11](https://github.com/electron-userland/electron-builder/compare/v22.11.9...v22.11.11) (2021-07-28)


### Bug Fixes

* **deploy:** Fixing zulip send message action ([41d5cae](https://github.com/electron-userland/electron-builder/commit/41d5cae325cba3031bc25148b1ff5927bc441913))
* linking CLI `version` output with package.json ([#6097](https://github.com/electron-userland/electron-builder/issues/6097)) ([a4eae34](https://github.com/electron-userland/electron-builder/commit/a4eae34f38444e0f30cf94af869e9e84c406a469))
* **docs:** minor grammar/formatting fixes ([#6107](https://github.com/electron-userland/electron-builder/issues/6107)) ([b9b275f](https://github.com/electron-userland/electron-builder/commit/b9b275fff0763faf110a8dcb3c8313963710bbeb))
* **mac:** signing cert filter incorrectly selects certificates (#6094) (#6101) ([#6105](https://github.com/electron-userland/electron-builder/issues/6105)) ([4a177dc](https://github.com/electron-userland/electron-builder/commit/4a177dc01c9119443426f1eb500afb836fd4f381))
* remove @electron-builder/test from changeset ([e101e8d](https://github.com/electron-userland/electron-builder/commit/e101e8d190d7e3046222e88c32a62d727dadd808))
* **win:** Windows update fails for custom paths that require admin rights ([#6073](https://github.com/electron-userland/electron-builder/issues/6073)) ([45fc0a0](https://github.com/electron-userland/electron-builder/commit/45fc0a003abc58969bb3a5d6ab1e3b61a9ad1a8d))
* any "node_module/____" glob pattern selects far too many node dependencies ([#6080](https://github.com/electron-userland/electron-builder/issues/6080)) ([72ffc25](https://github.com/electron-userland/electron-builder/commit/72ffc25063fc6d8f67e941ed7fc3b5991efb5448))
* using regex to determine yarn version to account for newer releases of yarn (i.e. yarn 3). fixes: #6069 ([#6071](https://github.com/electron-userland/electron-builder/issues/6071)) ([1e19aba](https://github.com/electron-userland/electron-builder/commit/1e19abaecb3fd7b6ff0932b46ee129e04d1496b3))


### Features

* **mac:** Add timestamp authority server to osx-sign options ([#6074](https://github.com/electron-userland/electron-builder/issues/6074)) ([41cb248](https://github.com/electron-userland/electron-builder/commit/41cb24869381de73a9663a17ec91d2747e099cf9))



## [22.11.9](https://github.com/electron-userland/electron-builder/compare/v22.11.8...v22.11.9) (2021-07-13)


### Bug Fixes

* **deploy:** consolidating versioning commands into package.json ([6066681](https://github.com/electron-userland/electron-builder/commit/6066681077c8ba730155751b83b4550add9b0dcf))
* do not show MessageBox when app was killed (on not running) ([#6043](https://github.com/electron-userland/electron-builder/issues/6043)) ([0561674](https://github.com/electron-userland/electron-builder/commit/0561674b6c491ee1cfa0ba838f5c5d59ce205124))
* **deploy:** deactivate husky hooks for automatic versioning PR ([#6041](https://github.com/electron-userland/electron-builder/issues/6041)) ([0d4d305](https://github.com/electron-userland/electron-builder/commit/0d4d3056b440cc45a1f1a15ea4a27c688cb0e96e))
* **nsis:** generate uninstaller without elevating (#5575) ([#6013](https://github.com/electron-userland/electron-builder/issues/6013)) ([b00aea3](https://github.com/electron-userland/electron-builder/commit/b00aea32107cd379b8489f7abea493d16fe38197))
* updating electron-osx-sign ([#6021](https://github.com/electron-userland/electron-builder/issues/6021)) ([6f63092](https://github.com/electron-userland/electron-builder/commit/6f630927ca949d8bdcde06e4eafaa63ce3636d5a))
* write blockmap file for mac zip archives ([#6023](https://github.com/electron-userland/electron-builder/issues/6023)) ([0447b24](https://github.com/electron-userland/electron-builder/commit/0447b2457beb03648f1e7e841cd0a8d12d7e4aea))



**Here changelog only for previous major releases and without detailed explanations.**
To see changes for current major release, please use [GiHub releases](https://github.com/electron-userland/electron-builder/releases).

<a name=""></a>
# [19.10.0](https://github.com/electron-userland/electron-builder/compare/v19.9.1...v19.10.0) (2017-06-28)


### Bug Fixes

* 19.8.0 broke ignoring folders ([50fe277](https://github.com/electron-userland/electron-builder/commit/50fe277)), closes [#1741](https://github.com/electron-userland/electron-builder/issues/1741)


### Features

* **Squirrel.Windows:** name option ([02dd8a1](https://github.com/electron-userland/electron-builder/commit/02dd8a1)), closes [#1743](https://github.com/electron-userland/electron-builder/issues/1743)
* **nsis:** option to not create desktop shortcut ([350e241](https://github.com/electron-userland/electron-builder/commit/350e241)), closes [#1597](https://github.com/electron-userland/electron-builder/issues/1597)
* allow to use files in the output directory to be included into the app ([95c75fc](https://github.com/electron-userland/electron-builder/commit/95c75fc))
* do not force build from sources by default ([86be5d7](https://github.com/electron-userland/electron-builder/commit/86be5d7)), closes [#1703](https://github.com/electron-userland/electron-builder/issues/1703)



<a name="19.9.1"></a>
## [19.9.1](https://github.com/electron-userland/electron-builder/compare/v19.9.0...v19.9.1) (2017-06-24)


### Features

* Support setting boolean properties with --extraMetadata ([9e77231](https://github.com/electron-userland/electron-builder/commit/9e77231)), closes [#1674](https://github.com/electron-userland/electron-builder/issues/1674)



<a name="19.9.0"></a>
# [19.9.0](https://github.com/electron-userland/electron-builder/compare/v19.8.0...v19.9.0) (2017-06-24)


### Bug Fixes

* **electron-updater:** MacUpdater — set Content-Length for responses, write 200 only if request to origin server is ok ([af2f559](https://github.com/electron-userland/electron-builder/commit/af2f559)), closes [#1719](https://github.com/electron-userland/electron-builder/issues/1719)


### Features

* add channel to file macros ([6aa3809](https://github.com/electron-userland/electron-builder/commit/6aa3809)), closes [#1701](https://github.com/electron-userland/electron-builder/issues/1701)



<a name="19.8.0"></a>
# [19.8.0](https://github.com/electron-userland/electron-builder/compare/v19.7.3...v19.8.0) (2017-06-23)


### Features

* ignore dll/exe files from node_modules if target platform not windows ([945a517](https://github.com/electron-userland/electron-builder/commit/945a517)), closes [#1738](https://github.com/electron-userland/electron-builder/issues/1738)



<a name="19.7.3"></a>
## [19.7.3](https://github.com/electron-userland/electron-builder/compare/v19.7.2...v19.7.3) (2017-06-22)


### Bug Fixes

* **AppImage:** AppImage artifact name does not use `artifactName` template ([a02fbd7](https://github.com/electron-userland/electron-builder/commit/a02fbd7)), closes [#1726](https://github.com/electron-userland/electron-builder/issues/1726)



<a name="19.7.2"></a>
## [19.7.2](https://github.com/electron-userland/electron-builder/compare/v19.7.0...v19.7.2) (2017-06-22)


### Bug Fixes

* electron-builder install-app-deps does not honor build.directories.app ([6db68be](https://github.com/electron-userland/electron-builder/commit/6db68be)), closes [#1721](https://github.com/electron-userland/electron-builder/issues/1721)
* **electron-updater:** Auto update does not work on machines with Powershell version < 3 ([5e09db4](https://github.com/electron-userland/electron-builder/commit/5e09db4)), closes [#1732](https://github.com/electron-userland/electron-builder/issues/1732)
* **mac:** clean macOsVersion before gte comparison (#1733) ([7ff95ca](https://github.com/electron-userland/electron-builder/commit/7ff95ca))
* **windows:** Get-PfxCertificate hangs ([6f8b94b](https://github.com/electron-userland/electron-builder/commit/6f8b94b)), closes [#1735](https://github.com/electron-userland/electron-builder/issues/1735)


### Features

* allow to set electronDist as path to local folder with electron builds zipped ([e79a28c](https://github.com/electron-userland/electron-builder/commit/e79a28c)), closes [#1716](https://github.com/electron-userland/electron-builder/issues/1716)



<a name="19.7.0"></a>
# [19.7.0](https://github.com/electron-userland/electron-builder/compare/v19.6.3...v19.7.0) (2017-06-21)


### Bug Fixes

* **auto-updater:** do not require app-update.yml file ([c03d98f](https://github.com/electron-userland/electron-builder/commit/c03d98f))


### Features

* **deployment:** set electron-updater releaseNotes at build time ([f6a2fc8](https://github.com/electron-userland/electron-builder/commit/f6a2fc8)), closes [#1511](https://github.com/electron-userland/electron-builder/issues/1511)



<a name="19.6.3"></a>
## [19.6.3](https://github.com/electron-userland/electron-builder/compare/v19.6.2...v19.6.3) (2017-06-21)


### Bug Fixes

* Runtime error for a build on window feat. electron-compile (forge) ([89a55ee](https://github.com/electron-userland/electron-builder/commit/89a55ee)), closes [#1686](https://github.com/electron-userland/electron-builder/issues/1686)



<a name="19.6.2"></a>
## [19.6.2](https://github.com/electron-userland/electron-builder/compare/v19.6.1...v19.6.2) (2017-06-21)


### Features

* **mac:** Ignore Contents/PlugIns ([a4b76b4](https://github.com/electron-userland/electron-builder/commit/a4b76b4)), closes [#1699](https://github.com/electron-userland/electron-builder/issues/1699)



<a name="19.6.1"></a>
## [19.6.1](https://github.com/electron-userland/electron-builder/compare/v19.6.0...v19.6.1) (2017-06-20)


### Bug Fixes

* keep shortcuts only if old uninstaller app support it ([8660093](https://github.com/electron-userland/electron-builder/commit/8660093)), closes [#1704](https://github.com/electron-userland/electron-builder/issues/1704)



<a name="19.6.0"></a>
# [19.6.0](https://github.com/electron-userland/electron-builder/compare/v19.5.1...v19.6.0) (2017-06-20)


### Features

* **mac:** upgrade osslsigncode, do not require wine ([ed662e8](https://github.com/electron-userland/electron-builder/commit/ed662e8)), closes [#1713](https://github.com/electron-userland/electron-builder/issues/1713) [#1707](https://github.com/electron-userland/electron-builder/issues/1707)
* **nsis:** Add flag to force start on silent install ([f24c389](https://github.com/electron-userland/electron-builder/commit/f24c389)), closes [#1545](https://github.com/electron-userland/electron-builder/issues/1545) [#1712](https://github.com/electron-userland/electron-builder/issues/1712)



<a name="19.5.1"></a>
## [19.5.1](https://github.com/electron-userland/electron-builder/compare/v19.5.0...v19.5.1) (2017-06-18)


### Bug Fixes

* **mac:** MacOS Sierra Command failed: codesign; The specified item could not be found in the keychain ([239d16d](https://github.com/electron-userland/electron-builder/commit/239d16d)), closes [#1457](https://github.com/electron-userland/electron-builder/issues/1457)


### Features

* **mac:** resize icons for Linux using sips on macOS to avoid graphicsmagick dependency ([e5817bc](https://github.com/electron-userland/electron-builder/commit/e5817bc))



<a name="19.5.0"></a>
# [19.5.0](https://github.com/electron-userland/electron-builder/compare/v19.4.2...v19.5.0) (2017-06-17)


### Bug Fixes

* **mac:** use hash instead of identity name to sign ([ee90ff2](https://github.com/electron-userland/electron-builder/commit/ee90ff2)), closes [#1629](https://github.com/electron-userland/electron-builder/issues/1629)


### Features

* **appx:** languages ([86af4cd](https://github.com/electron-userland/electron-builder/commit/86af4cd)), closes [#1684](https://github.com/electron-userland/electron-builder/issues/1684)
* **electron-updater:** staged rollouts ([5bae61e](https://github.com/electron-userland/electron-builder/commit/5bae61e)), closes [#1639](https://github.com/electron-userland/electron-builder/issues/1639)
* **pkg:** build pkg that doesn't require admin install ([a3a23f2](https://github.com/electron-userland/electron-builder/commit/a3a23f2))



<a name="19.4.2"></a>
## [19.4.2](https://github.com/electron-userland/electron-builder/compare/v19.4.1...v19.4.2) (2017-06-16)


### Bug Fixes

* **nsis:** missed "Installing, please wait" text ([c5d3441](https://github.com/electron-userland/electron-builder/commit/c5d3441)), closes [#1630](https://github.com/electron-userland/electron-builder/issues/1630)


### Features

* **deployment:** do not publish if Pull Request — support APPVEYOR_PULL_REQUEST_NUMBER ([b0fb872](https://github.com/electron-userland/electron-builder/commit/b0fb872))



<a name="19.4.1"></a>
## [19.4.1](https://github.com/electron-userland/electron-builder/compare/v19.4.0...v19.4.1) (2017-06-16)


### Bug Fixes

* **electron-updater:** No notification in case of an error during signature verification ([a9e03ce](https://github.com/electron-userland/electron-builder/commit/a9e03ce)), closes [#1680](https://github.com/electron-userland/electron-builder/issues/1680) [#1681](https://github.com/electron-userland/electron-builder/issues/1681)


### Code Refactoring

* merge electron-builder-core into electron-builder, transform node-gyp-rebuild bin to subcommand ([a8c9ffd](https://github.com/electron-userland/electron-builder/commit/a8c9ffd))


### Features

* **appx:** Improve support for AppX assets ([666dec7](https://github.com/electron-userland/electron-builder/commit/666dec7))


### BREAKING CHANGES

* Please use `node-gyp-rebuild` as `electron-buider node-gyp-rebuild` now



<a name="19.3.0"></a>
# [19.3.0](https://github.com/electron-userland/electron-builder/compare/v19.2.7...v19.3.0) (2017-06-15)


### Features

* **nsis:** custom uninstaller display name in the control panel ([fda6ee9](https://github.com/electron-userland/electron-builder/commit/fda6ee9))
* react-cra detection, shareable config support — extends ([28f0266](https://github.com/electron-userland/electron-builder/commit/28f0266))



<a name="19.2.7"></a>
## [19.2.7](https://github.com/electron-userland/electron-builder/compare/v19.2.3...v19.2.7) (2017-06-14)


### Bug Fixes

* The zip Windows target includes the application code inside a "win-unpacked" directory ([4e6ece4](https://github.com/electron-userland/electron-builder/commit/4e6ece4)), closes [#1666](https://github.com/electron-userland/electron-builder/issues/1666)
* correctly pack cache folder for electron-compile ([419cf91](https://github.com/electron-userland/electron-builder/commit/419cf91)), closes [#1465](https://github.com/electron-userland/electron-builder/issues/1465)
* ignore node_modules without package.json ([5e24859](https://github.com/electron-userland/electron-builder/commit/5e24859)), closes [#1671](https://github.com/electron-userland/electron-builder/issues/1671)



<a name="19.2.3"></a>
## [19.2.3](https://github.com/electron-userland/electron-builder/compare/v19.2.2...v19.2.3) (2017-06-14)


### Bug Fixes

* do not copy electronDist using hard links ([c04dd20](https://github.com/electron-userland/electron-builder/commit/c04dd20)), closes [#1670](https://github.com/electron-userland/electron-builder/issues/1670)


### Features

* check that electron-builder version is not outdated for all subcommands ([d9ecfe5](https://github.com/electron-userland/electron-builder/commit/d9ecfe5))



<a name="19.2.2"></a>
## [19.2.2](https://github.com/electron-userland/electron-builder/compare/v19.1.0...v19.2.2) (2017-06-13)


### Bug Fixes

* macOS failing when there is no old icon (#1658) ([ac44fcd](https://github.com/electron-userland/electron-builder/commit/ac44fcd))
* **nsis:** Keep existing desktop/menu/taskbar shortcuts after update ([2f3d7d8](https://github.com/electron-userland/electron-builder/commit/2f3d7d8)), closes [#1653](https://github.com/electron-userland/electron-builder/issues/1653)


### Features

* install-app-deps.ts subcommand ([5e0a646](https://github.com/electron-userland/electron-builder/commit/5e0a646))



<a name="19.1.0"></a>
# [19.1.0](https://github.com/electron-userland/electron-builder/compare/v19.0.2...v19.1.0) (2017-06-12)


### Features

* electron-builder bin executable ([54ac796](https://github.com/electron-userland/electron-builder/commit/54ac796))



<a name="19.0.2"></a>
## [19.0.2](https://github.com/electron-userland/electron-builder/compare/v19.0.0...v19.0.2) (2017-06-12)


### Bug Fixes

* **electron-updater:** update sign verification error ([e713bbe](https://github.com/electron-userland/electron-builder/commit/e713bbe)), closes [#1641](https://github.com/electron-userland/electron-builder/issues/1641)
* Appx name changed ([dd0b208](https://github.com/electron-userland/electron-builder/commit/dd0b208)), closes [#1650](https://github.com/electron-userland/electron-builder/issues/1650)



<a name="19.0.0"></a>
# [19.0.0](https://github.com/electron-userland/electron-builder/compare/v18.8.0...v19.0.0) (2017-06-12)


### Features

* prune submodule package.json dependencies ([1145cb9](https://github.com/electron-userland/electron-builder/commit/1145cb9)), closes [#1539](https://github.com/electron-userland/electron-builder/issues/1539)
* **nsis:** add APP_EXECUTABLE_DIR ([8e957c8](https://github.com/electron-userland/electron-builder/commit/8e957c8)), closes [#1612](https://github.com/electron-userland/electron-builder/issues/1612)



<a name="18.8.0"></a>
# [18.8.0](https://github.com/electron-userland/electron-builder/compare/v18.7.0...v18.8.0) (2017-06-12)


### Features

* update makeappx tool, use powershell on Windows to get publisher name, allow to build appx on Windows Server 2012 R2 ([4d7e1b5](https://github.com/electron-userland/electron-builder/commit/4d7e1b5))



<a name="18.7.0"></a>
# [18.7.0](https://github.com/electron-userland/electron-builder/compare/v18.6.2...v18.7.0) (2017-06-08)


### Bug Fixes

* **electron-updater:** check for EACCES error when try to install on auto updated windows (#1636) ([9ef77b9](https://github.com/electron-userland/electron-builder/commit/9ef77b9))


### Features

* do not require "author" ([e700b78](https://github.com/electron-userland/electron-builder/commit/e700b78))
* **nsis:** Option to not pack "elevate.exe" ([69c3614](https://github.com/electron-userland/electron-builder/commit/69c3614)), closes [#1620](https://github.com/electron-userland/electron-builder/issues/1620) [#1621](https://github.com/electron-userland/electron-builder/issues/1621)


### Performance Improvements

* use fcopy ([d9a8015](https://github.com/electron-userland/electron-builder/commit/d9a8015))



<a name="18.6.2"></a>
## [18.6.2](https://github.com/electron-userland/electron-builder/compare/v18.6.0...v18.6.2) (2017-06-07)


### Bug Fixes

* install-app-deps, attempt 2 ([8715f44](https://github.com/electron-userland/electron-builder/commit/8715f44)), closes [#1626](https://github.com/electron-userland/electron-builder/issues/1626)
* **electron-updater:** isSilent is optional ([12473d0](https://github.com/electron-userland/electron-builder/commit/12473d0))



<a name="18.6.0"></a>
# [18.6.0](https://github.com/electron-userland/electron-builder/compare/v18.5.1...v18.6.0) (2017-06-06)


### Bug Fixes

* **electron-updater:** MacUpdater — close proxy server after download ([39ae0a4](https://github.com/electron-userland/electron-builder/commit/39ae0a4))
* **nsis:** Cloning packager.config to prevent override ([5b8abcb](https://github.com/electron-userland/electron-builder/commit/5b8abcb)), closes [#1340](https://github.com/electron-userland/electron-builder/issues/1340) [#1340](https://github.com/electron-userland/electron-builder/issues/1340)
* install-app-deps ([21a5be5](https://github.com/electron-userland/electron-builder/commit/21a5be5)), closes [#1626](https://github.com/electron-userland/electron-builder/issues/1626)


### Features

* grab latest electron version from github if not specified ([a826df2](https://github.com/electron-userland/electron-builder/commit/a826df2))
* **appimage:** artifactName support for AppImage ([0ea43a3](https://github.com/electron-userland/electron-builder/commit/0ea43a3)), closes [#775](https://github.com/electron-userland/electron-builder/issues/775)
* **docker:** upgrade to zesty ([da1734e](https://github.com/electron-userland/electron-builder/commit/da1734e))
* **electron-updater:** ensure that update only to the application signed with same cert ([66771d3](https://github.com/electron-userland/electron-builder/commit/66771d3)), closes [#1187](https://github.com/electron-userland/electron-builder/issues/1187)



<a name="18.5.1"></a>
## [18.5.1](https://github.com/electron-userland/electron-builder/compare/v18.5.0...v18.5.1) (2017-06-05)


### Features

* **electon-updater:** autoUpdater download-progress event is not called on macOS ([a75bac8](https://github.com/electron-userland/electron-builder/commit/a75bac8)), closes [#1167](https://github.com/electron-userland/electron-builder/issues/1167)



<a name="18.5.0"></a>
# [18.5.0](https://github.com/electron-userland/electron-builder/compare/v18.4.0...v18.5.0) (2017-06-05)


### Features

* **nsis:** Slovak(sk) translation ([09495f9](https://github.com/electron-userland/electron-builder/commit/09495f9))
* do not override HOME env on reinstall deps, use devdir for nodegyp ([ae0f668](https://github.com/electron-userland/electron-builder/commit/ae0f668))
* use base64 to encode sha512 checksum in the update info ([4451107](https://github.com/electron-userland/electron-builder/commit/4451107))
* **nsis:** Slovak(sk) translation for assisted installer ([63f019f](https://github.com/electron-userland/electron-builder/commit/63f019f)), closes [#1617](https://github.com/electron-userland/electron-builder/issues/1617)



<a name="18.4.0"></a>
# [18.4.0](https://github.com/electron-userland/electron-builder/compare/v18.3.5...v18.4.0) (2017-06-04)


### Bug Fixes

* **deployment:** latest.yml is completely empty when uploaded to S3 bucket ([4b25ca2](https://github.com/electron-userland/electron-builder/commit/4b25ca2)), closes [#1582](https://github.com/electron-userland/electron-builder/issues/1582)
* **deployment:** s3 publisher md5 integrity ([b57dc8a](https://github.com/electron-userland/electron-builder/commit/b57dc8a))
* **tar:** fix invalid sym-/hardlink targets in archive (#1614) ([b31ebff](https://github.com/electron-userland/electron-builder/commit/b31ebff)), closes [#1614](https://github.com/electron-userland/electron-builder/issues/1614)


### Features

* asar integrity (macos only for now) ([3e28ae2](https://github.com/electron-userland/electron-builder/commit/3e28ae2))
* asar integrity: add externalAllowed option ([e0d7974](https://github.com/electron-userland/electron-builder/commit/e0d7974))
* asar integrity: base64, externalAllowed ([9a7ac65](https://github.com/electron-userland/electron-builder/commit/9a7ac65))
* docker with node 8 ([df1feb5](https://github.com/electron-userland/electron-builder/commit/df1feb5))



<a name="18.3.5"></a>
## [18.3.5](https://github.com/electron-userland/electron-builder/compare/v18.3.0...v18.3.5) (2017-06-01)


### Bug Fixes

* **deployment:** check for errors ([4c71fc0](https://github.com/electron-userland/electron-builder/commit/4c71fc0))
* Identity validation option is incorrect ([97699b1](https://github.com/electron-userland/electron-builder/commit/97699b1)), closes [#1603](https://github.com/electron-userland/electron-builder/issues/1603)
* **dmg:** move hidden directories out of view ([452085b](https://github.com/electron-userland/electron-builder/commit/452085b)), closes [#1121](https://github.com/electron-userland/electron-builder/issues/1121)



<a name="18.3.0"></a>
# [18.3.0](https://github.com/electron-userland/electron-builder/compare/v18.2.1...v18.3.0) (2017-05-31)


### Bug Fixes

* more clear handling of onTagOrDraft ([817340a](https://github.com/electron-userland/electron-builder/commit/817340a))
* **deployment:** different channels for different publish providers ([81fd398](https://github.com/electron-userland/electron-builder/commit/81fd398))


### Features

* **linux:** add missing Exec variable for passing URLs as arguments ([4a87e67](https://github.com/electron-userland/electron-builder/commit/4a87e67)), closes [#1592](https://github.com/electron-userland/electron-builder/issues/1592)



<a name="18.2.1"></a>
## [18.2.1](https://github.com/electron-userland/electron-builder/compare/v18.1.1...v18.2.1) (2017-05-30)


### Bug Fixes

* trim the whole string, otherwise detection of windows-like path is not robust ([e63e8fa](https://github.com/electron-userland/electron-builder/commit/e63e8fa)), closes [#1596](https://github.com/electron-userland/electron-builder/issues/1596)


### Features

* support relative (to project dir) path in the CSC_LINK ([381e8c0](https://github.com/electron-userland/electron-builder/commit/381e8c0)), closes [#1596](https://github.com/electron-userland/electron-builder/issues/1596)



<a name="18.1.1"></a>
## [18.1.1](https://github.com/electron-userland/electron-builder/compare/v18.1.0...v18.1.1) (2017-05-30)


### Bug Fixes

* **appx:** AppX build fails ([9e9ed4f](https://github.com/electron-userland/electron-builder/commit/9e9ed4f)), closes [#1515](https://github.com/electron-userland/electron-builder/issues/1515)


### Features

* PUBLISH_FOR_PULL_REQUEST ([7d8e097](https://github.com/electron-userland/electron-builder/commit/7d8e097))



<a name="18.1.0"></a>
# [18.1.0](https://github.com/electron-userland/electron-builder/compare/v18.0.1...v18.1.0) (2017-05-27)


### Features

* remove "Space required" text for NSIS installer ([565740c](https://github.com/electron-userland/electron-builder/commit/565740c)), closes [#1566](https://github.com/electron-userland/electron-builder/issues/1566)
* **nsis:** custom uninstall application icon ([e4e5cc7](https://github.com/electron-userland/electron-builder/commit/e4e5cc7)), closes [#1585](https://github.com/electron-userland/electron-builder/issues/1585)



<a name="18.0.1"></a>
## [18.0.1](https://github.com/electron-userland/electron-builder/compare/v18.0.0...v18.0.1) (2017-05-24)


### Bug Fixes

* "status 401: Unauthorized" issue with dl.bintray.com ([52995df](https://github.com/electron-userland/electron-builder/commit/52995df)), closes [#1581](https://github.com/electron-userland/electron-builder/issues/1581)



<a name="18.0.0"></a>
# [18.0.0](https://github.com/electron-userland/electron-builder/compare/v17.10.0...v18.0.0) (2017-05-23)


### Bug Fixes

* **config:** use json5 parser for json5 build configs ([94d89eb](https://github.com/electron-userland/electron-builder/commit/94d89eb)), closes [#1569](https://github.com/electron-userland/electron-builder/issues/1569) [#1578](https://github.com/electron-userland/electron-builder/issues/1578)


### Code Refactoring

* **updater:** prepare to support private github repo, nuts and so on on macOS ([a41936b](https://github.com/electron-userland/electron-builder/commit/a41936b)), closes [#1575](https://github.com/electron-userland/electron-builder/issues/1575) [#1571](https://github.com/electron-userland/electron-builder/issues/1571) [#1577](https://github.com/electron-userland/electron-builder/issues/1577)


### Features

* **mac:** allow passing through binaries and requirements options ([a2e58c0](https://github.com/electron-userland/electron-builder/commit/a2e58c0)), closes [#1574](https://github.com/electron-userland/electron-builder/issues/1574)
* **snap:** Snap for extra after parts and build packages support (#1565) ([22b5ba5](https://github.com/electron-userland/electron-builder/commit/22b5ba5))


### BREAKING CHANGES

* **updater:** remove compatibility with very old electron-updater version (< 0.10.0)



<a name="17.10.0"></a>
# [17.10.0](https://github.com/electron-userland/electron-builder/compare/v17.9.0...v17.10.0) (2017-05-21)


### Features

* **nsis:** custom uninstall application icon ([eb181b9](https://github.com/electron-userland/electron-builder/commit/eb181b9)), closes [#1550](https://github.com/electron-userland/electron-builder/issues/1550)



<a name="17.9.0"></a>
# [17.9.0](https://github.com/electron-userland/electron-builder/compare/v17.8.0...v17.9.0) (2017-05-20)


### Bug Fixes

* electron-builder 17.5.0, 17.8.0: cannot find module 'debug' ([5835654](https://github.com/electron-userland/electron-builder/commit/5835654)), closes [#1564](https://github.com/electron-userland/electron-builder/issues/1564)


### Features

* **electron-updater:** isSilent param of quitAndInstall method #1545 ([daeefa6](https://github.com/electron-userland/electron-builder/commit/daeefa6))
* **nsis:** add korean messages for one-click installer (#1556) ([9fce636](https://github.com/electron-userland/electron-builder/commit/9fce636))



<a name="17.8.0"></a>
# [17.8.0](https://github.com/electron-userland/electron-builder/compare/v17.7.0...v17.8.0) (2017-05-15)


### Bug Fixes

* Automatic unpack detection in scoped packages unpacks the entire scope ([3558b22](https://github.com/electron-userland/electron-builder/commit/3558b22)), closes [#1540](https://github.com/electron-userland/electron-builder/issues/1540)


### Features

* **nsis:** finnish nsis lang ([c88d991](https://github.com/electron-userland/electron-builder/commit/c88d991))
* **squirrel.windows:** Update Squirrel.Windows to 1.6.0 ([c4bb492](https://github.com/electron-userland/electron-builder/commit/c4bb492)), closes [#1535](https://github.com/electron-userland/electron-builder/issues/1535)



<a name="17.7.0"></a>
# [17.7.0](https://github.com/electron-userland/electron-builder/compare/v17.6.0...v17.7.0) (2017-05-13)


### Features

* **nsis:** add ja translation for one-click installer (#1543) ([90d0da1](https://github.com/electron-userland/electron-builder/commit/90d0da1))



<a name="17.6.0"></a>
# [17.6.0](https://github.com/electron-userland/electron-builder/compare/v17.5.0...v17.6.0) (2017-05-13)


### Features

* **nsis:** NSIS - nested start menu folders ([fafc7ba](https://github.com/electron-userland/electron-builder/commit/fafc7ba)), closes [#1538](https://github.com/electron-userland/electron-builder/issues/1538)
* **nsis:** ko lang ([89a5233](https://github.com/electron-userland/electron-builder/commit/89a5233)), closes [#1504](https://github.com/electron-userland/electron-builder/issues/1504)



<a name="17.5.0"></a>
# [17.5.0](https://github.com/electron-userland/electron-builder/compare/v17.4.0...v17.5.0) (2017-05-08)


### Features

* local path to custom electron build (windows support) ([521aea6](https://github.com/electron-userland/electron-builder/commit/521aea6)), closes [#1534](https://github.com/electron-userland/electron-builder/issues/1534) [#1342](https://github.com/electron-userland/electron-builder/issues/1342)



<a name="17.4.0"></a>
# [17.4.0](https://github.com/electron-userland/electron-builder/compare/v17.3.1...v17.4.0) (2017-05-08)


### Features

* **electron-updater:** add proxy authentication support to electron-updater ([a892a5b](https://github.com/electron-userland/electron-builder/commit/a892a5b)), closes [#1530](https://github.com/electron-userland/electron-builder/issues/1530)
* **nsis:** add de, it, fr, hu, pl translations for one-click installer ([d8aa078](https://github.com/electron-userland/electron-builder/commit/d8aa078))



<a name="17.3.1"></a>
## [17.3.1](https://github.com/electron-userland/electron-builder/compare/v17.3.0...v17.3.1) (2017-05-05)


### Bug Fixes

* Make sure the documentation for this option clearly states the security implications of turning it on #1524 ([b0ce309](https://github.com/electron-userland/electron-builder/commit/b0ce309))
* Use of extraResources prevents node_modules from being included in asar ([0fbad33](https://github.com/electron-userland/electron-builder/commit/0fbad33)), closes [#867](https://github.com/electron-userland/electron-builder/issues/867)



<a name="17.3.0"></a>
# [17.3.0](https://github.com/electron-userland/electron-builder/compare/v17.2.0...v17.3.0) (2017-05-04)


### Bug Fixes

* **electron-updater:** electron-updater v1.14.* throws cannot find module 'debug' ([78d9b33](https://github.com/electron-userland/electron-builder/commit/78d9b33)), closes [#1521](https://github.com/electron-userland/electron-builder/issues/1521)


### Features

* ${buildVersion} macro in artifactName config ([23f0b37](https://github.com/electron-userland/electron-builder/commit/23f0b37)), closes [#1527](https://github.com/electron-userland/electron-builder/issues/1527)
* **mac:** allow build for pull requests / code sign artifacts ([9dbc789](https://github.com/electron-userland/electron-builder/commit/9dbc789)), closes [#1524](https://github.com/electron-userland/electron-builder/issues/1524)



<a name="17.2.0"></a>
# [17.2.0](https://github.com/electron-userland/electron-builder/compare/v17.1.2...v17.2.0) (2017-05-02)


### Features

* **forge:** support electron-forge 3.0 API ([002a714](https://github.com/electron-userland/electron-builder/commit/002a714))
* **nsis:** multi-lang one-click installer (including custom string) ([f01415a](https://github.com/electron-userland/electron-builder/commit/f01415a))



<a name="17.1.2"></a>
## [17.1.2](https://github.com/electron-userland/electron-builder/compare/v17.1.1...v17.1.2) (2017-04-26)


### Bug Fixes

* Cannot copy files from parent directory of build output ([7f00714](https://github.com/electron-userland/electron-builder/commit/7f00714)), closes [#1482](https://github.com/electron-userland/electron-builder/issues/1482)



<a name="17.1.1"></a>
## [17.1.1](https://github.com/electron-userland/electron-builder/compare/v17.1.0...v17.1.1) (2017-04-24)


### Bug Fixes

* **auto-updater:** Autoupdates to lower version with allowPrerelease=true using GitHub releases ([36fc3db](https://github.com/electron-userland/electron-builder/commit/36fc3db)), closes [#1497](https://github.com/electron-userland/electron-builder/issues/1497)
* **dmg:** license ([5a163df](https://github.com/electron-userland/electron-builder/commit/5a163df)), closes [#1491](https://github.com/electron-userland/electron-builder/issues/1491)



<a name="17.1.0"></a>
# [17.1.0](https://github.com/electron-userland/electron-builder/compare/v17.0.3...v17.1.0) (2017-04-23)


### Features

* **dmg:** dmg license ([d6f0c57](https://github.com/electron-userland/electron-builder/commit/d6f0c57)), closes [#1491](https://github.com/electron-userland/electron-builder/issues/1491)



<a name="17.0.3"></a>
## [17.0.3](https://github.com/electron-userland/electron-builder/compare/v17.0.1...v17.0.3) (2017-04-22)


### Bug Fixes

* Upload release failed. Response status: 401 Unauthorized ([257a7dd](https://github.com/electron-userland/electron-builder/commit/257a7dd)), closes [#1385](https://github.com/electron-userland/electron-builder/issues/1385)
* **electron-updater:** Incorrect comparison of version numbers (electron-updater) ([17ac619](https://github.com/electron-userland/electron-builder/commit/17ac619)), closes [#1488](https://github.com/electron-userland/electron-builder/issues/1488)


### Features

* **electron-updater:** GitHub: Allow pre-release builds to be auto updated ([f275831](https://github.com/electron-userland/electron-builder/commit/f275831)), closes [#1391](https://github.com/electron-userland/electron-builder/issues/1391)
* support additional certificate file (#1467) ([19c8ee4](https://github.com/electron-userland/electron-builder/commit/19c8ee4))



<a name="17.0.1"></a>
## [17.0.1](https://github.com/electron-userland/electron-builder/compare/v17.0.0...v17.0.1) (2017-04-16)


### Bug Fixes

* handle sync spawn error ([4351b56](https://github.com/electron-userland/electron-builder/commit/4351b56)), closes [#1460](https://github.com/electron-userland/electron-builder/issues/1460)
* handle sync spawn error ([af14809](https://github.com/electron-userland/electron-builder/commit/af14809)), closes [#1438](https://github.com/electron-userland/electron-builder/issues/1438)


### Features

* **electron-updater:** Make it possible to "auto-downgrade" the application on channel change ([a3c4a9e](https://github.com/electron-userland/electron-builder/commit/a3c4a9e)), closes [#1149](https://github.com/electron-userland/electron-builder/issues/1149)



<a name="17.0.0"></a>
# [17.0.0](https://github.com/electron-userland/electron-builder/compare/v16.8.4...v17.0.0) (2017-04-15)


### Features

* automatically set channel to version prerelease component ([831186f](https://github.com/electron-userland/electron-builder/commit/831186f)), closes [#1182](https://github.com/electron-userland/electron-builder/issues/1182)


### BREAKING CHANGES

* if app version is `0.12.1-alpha.1`, file `alpha.yml` will be generated instead of `latest.yml`



<a name="16.8.4"></a>
## [16.8.4](https://github.com/electron-userland/electron-builder/compare/v16.8.3...v16.8.4) (2017-04-15)


### Bug Fixes

* Rebuild stucks on Windows ([2c52ed2](https://github.com/electron-userland/electron-builder/commit/2c52ed2)), closes [#1472](https://github.com/electron-userland/electron-builder/issues/1472)



<a name="16.8.3"></a>
## [16.8.3](https://github.com/electron-userland/electron-builder/compare/v16.8.2...v16.8.3) (2017-04-12)


### Bug Fixes

* **rebuild:** Log stdout and stderr (#1450) ([ada9cac](https://github.com/electron-userland/electron-builder/commit/ada9cac))
* **snap:** fix appindicator icons with snap build (#1453) ([2ab769d](https://github.com/electron-userland/electron-builder/commit/2ab769d)), closes [#1453](https://github.com/electron-userland/electron-builder/issues/1453) [#1452](https://github.com/electron-userland/electron-builder/issues/1452)
* do not use scoped electron-download ([8c79f60](https://github.com/electron-userland/electron-builder/commit/8c79f60)), closes [#1458](https://github.com/electron-userland/electron-builder/issues/1458)


### Features

* **electron-updater:** Location of app-update.yml in the dev mode ([8c73f57](https://github.com/electron-userland/electron-builder/commit/8c73f57)), closes [#1254](https://github.com/electron-userland/electron-builder/issues/1254)


### Performance Improvements

* **nsis:** run tasks in parallel ([6f56905](https://github.com/electron-userland/electron-builder/commit/6f56905))



<a name="16.8.2"></a>
## [16.8.2](https://github.com/electron-userland/electron-builder/compare/v16.8.1...v16.8.2) (2017-04-09)


### Bug Fixes

* **nsis:** move generated custom messages to separate files (to avoid stdin encoding issues on Windows) ([5b83860](https://github.com/electron-userland/electron-builder/commit/5b83860)), closes [#1447](https://github.com/electron-userland/electron-builder/issues/1447)



<a name="16.8.1"></a>
## [16.8.1](https://github.com/electron-userland/electron-builder/compare/v16.8.0...v16.8.1) (2017-04-09)


### Bug Fixes

* fix incorrect rebuild target in install-app-deps ([88e52ad](https://github.com/electron-userland/electron-builder/commit/88e52ad))



<a name="16.8.0"></a>
# [16.8.0](https://github.com/electron-userland/electron-builder/compare/v16.7.1...v16.8.0) (2017-04-08)


### Bug Fixes

* **nsis:** build portable in parallel to nsis ([918a317](https://github.com/electron-userland/electron-builder/commit/918a317)), closes [#1340](https://github.com/electron-userland/electron-builder/issues/1340)


### Features

* **muon:** Rebuilding the native dependencies for muon ([3232f65](https://github.com/electron-userland/electron-builder/commit/3232f65)), closes [#1404](https://github.com/electron-userland/electron-builder/issues/1404)
* **portable:** ExecutionLevel for nsis portable ([3f8caab](https://github.com/electron-userland/electron-builder/commit/3f8caab)), closes [#1440](https://github.com/electron-userland/electron-builder/issues/1440)



<a name="16.7.1"></a>
## [16.7.1](https://github.com/electron-userland/electron-builder/compare/v16.7.0...v16.7.1) (2017-04-07)


### Bug Fixes

* **deb:** add libxss1 to depends by default ([897fcf2](https://github.com/electron-userland/electron-builder/commit/897fcf2))
* **s3:** S3-DEPLOY with parenthesis / spaces in product name broken in 1.6.2 ([26ae6ec](https://github.com/electron-userland/electron-builder/commit/26ae6ec)), closes [#1439](https://github.com/electron-userland/electron-builder/issues/1439)



<a name="16.7.0"></a>
# [16.7.0](https://github.com/electron-userland/electron-builder/compare/v16.6.2...v16.7.0) (2017-04-05)


### Bug Fixes

* **linux:** depends for deb in LinuxOptions ([d58d323](https://github.com/electron-userland/electron-builder/commit/d58d323)), closes [#1420](https://github.com/electron-userland/electron-builder/issues/1420)


### Features

* **nsis:** add --no-desktop-shortcut argument (#1432) ([e1e3832](https://github.com/electron-userland/electron-builder/commit/e1e3832))



<a name="16.6.2"></a>
## [16.6.2](https://github.com/electron-userland/electron-builder/compare/v16.6.1...v16.6.2) (2017-04-04)


### Bug Fixes

* **deployment:** S3 won't upload app files ([4149031](https://github.com/electron-userland/electron-builder/commit/4149031)), closes [#1331](https://github.com/electron-userland/electron-builder/issues/1331)



<a name="16.6.1"></a>
## [16.6.1](https://github.com/electron-userland/electron-builder/compare/v16.6.0...v16.6.1) (2017-04-01)


### Bug Fixes

* **auto-updater:** respect vPrefixedTagName for auto update ([624311b](https://github.com/electron-userland/electron-builder/commit/624311b)), closes [#1417](https://github.com/electron-userland/electron-builder/issues/1417)
* ignore files in the node_modules during read_installed ([37f84b9](https://github.com/electron-userland/electron-builder/commit/37f84b9)), closes [#1424](https://github.com/electron-userland/electron-builder/issues/1424)


### Features

* **mac:** mac build zip file name does not follow build.artifactName ([1affc61](https://github.com/electron-userland/electron-builder/commit/1affc61)), closes [#1398](https://github.com/electron-userland/electron-builder/issues/1398)
* retry code sign if failed due to network failure ([9b60518](https://github.com/electron-userland/electron-builder/commit/9b60518)), closes [#1414](https://github.com/electron-userland/electron-builder/issues/1414)



<a name="16.6.0"></a>
# [16.6.0](https://github.com/electron-userland/electron-builder/compare/v16.5.1...v16.6.0) (2017-03-29)



<a name="16.5.1"></a>
## [16.5.1](https://github.com/electron-userland/electron-builder/compare/v16.5.0...v16.5.1) (2017-03-28)


### Bug Fixes

* **nsis:** StartApp doesn't work if menuCategory used ([683d58c](https://github.com/electron-userland/electron-builder/commit/683d58c)), closes [#1151](https://github.com/electron-userland/electron-builder/issues/1151) [#1412](https://github.com/electron-userland/electron-builder/issues/1412)



<a name="16.5.0"></a>
# [16.5.0](https://github.com/electron-userland/electron-builder/compare/v16.4.2...v16.5.0) (2017-03-28)


### Features

* Enforce a proper application location ([958a7ae](https://github.com/electron-userland/electron-builder/commit/958a7ae)), closes [#1301](https://github.com/electron-userland/electron-builder/issues/1301) [#1298](https://github.com/electron-userland/electron-builder/issues/1298)
* **linux:** support any icon name ([5a2631c](https://github.com/electron-userland/electron-builder/commit/5a2631c)), closes [#1399](https://github.com/electron-userland/electron-builder/issues/1399)



<a name="16.4.2"></a>
## [16.4.2](https://github.com/electron-userland/electron-builder/compare/v16.4.1...v16.4.2) (2017-03-27)


### Bug Fixes

* Asar: false, causing exception on app startup with v16.4.0 ([7c6b4ab](https://github.com/electron-userland/electron-builder/commit/7c6b4ab)), closes [#1409](https://github.com/electron-userland/electron-builder/issues/1409)



<a name="16.4.1"></a>
## [16.4.1](https://github.com/electron-userland/electron-builder/compare/v16.4.0...v16.4.1) (2017-03-27)


### Bug Fixes

* removing devDependencies from package.json breaks levelup in electron ([0278efb](https://github.com/electron-userland/electron-builder/commit/0278efb)), closes [#1408](https://github.com/electron-userland/electron-builder/issues/1408)



<a name="16.4.0"></a>
# [16.4.0](https://github.com/electron-userland/electron-builder/compare/v16.3.0...v16.4.0) (2017-03-25)


### Bug Fixes

* ${arch} missing from app-update.yml ([77558e6](https://github.com/electron-userland/electron-builder/commit/77558e6)), closes [#1389](https://github.com/electron-userland/electron-builder/issues/1389)
* Builds fail on building .deb using packaged fpm on Travis ([037fba6](https://github.com/electron-userland/electron-builder/commit/037fba6)), closes [#1402](https://github.com/electron-userland/electron-builder/issues/1402)
* electron-updater throws "Cannot find namespace 'debug'" on TypeScript compile ([0f0de81](https://github.com/electron-userland/electron-builder/commit/0f0de81)), closes [#1405](https://github.com/electron-userland/electron-builder/issues/1405)


### Features

* electronCompile option to disable electron-compile integration ([b4462a2](https://github.com/electron-userland/electron-builder/commit/b4462a2))



<a name="16.3.0"></a>
# [16.3.0](https://github.com/electron-userland/electron-builder/compare/v16.2.1...v16.3.0) (2017-03-24)


### Bug Fixes

* compile using electron-compile not in place, but using cache ([08893e3](https://github.com/electron-userland/electron-builder/commit/08893e3)), closes [#807](https://github.com/electron-userland/electron-builder/issues/807)


### Features

* Allow to use ~/.aws/credentials file as alternative to env variables ([2e59959](https://github.com/electron-userland/electron-builder/commit/2e59959)), closes [#1320](https://github.com/electron-userland/electron-builder/issues/1320)



<a name="16.2.1"></a>
## [16.2.1](https://github.com/electron-userland/electron-builder/compare/v16.2.0...v16.2.1) (2017-03-23)


### Bug Fixes

* one file in asar archive got corrupted ([e208f53](https://github.com/electron-userland/electron-builder/commit/e208f53)), closes [#1400](https://github.com/electron-userland/electron-builder/issues/1400)
* use Muon version in the log message if pack for Muon ([4241521](https://github.com/electron-userland/electron-builder/commit/4241521))



<a name="16.2.0"></a>
# [16.2.0](https://github.com/electron-userland/electron-builder/compare/v16.1.0...v16.2.0) (2017-03-22)


### Bug Fixes

* use lowercased safe artifact name if app name is lowercased ([bfd6635](https://github.com/electron-userland/electron-builder/commit/bfd6635))


### Features

* electron-forge support ([d99a27e](https://github.com/electron-userland/electron-builder/commit/d99a27e))



<a name="16.1.0"></a>
# [16.1.0](https://github.com/electron-userland/electron-builder/compare/v16.0.1...v16.1.0) (2017-03-22)


### Bug Fixes

* Download update from public Github repo failed on Mac ([16bc53c](https://github.com/electron-userland/electron-builder/commit/16bc53c)), closes [#1388](https://github.com/electron-userland/electron-builder/issues/1388)


### Features

* muon support ([4f555da](https://github.com/electron-userland/electron-builder/commit/4f555da)), closes [#1394](https://github.com/electron-userland/electron-builder/issues/1394)
* support file transformers not only for asar ([58061ec](https://github.com/electron-userland/electron-builder/commit/58061ec))



<a name="16.0.1"></a>
## [16.0.1](https://github.com/electron-userland/electron-builder/compare/v16.0.0...v16.0.1) (2017-03-21)


### Bug Fixes

* detect electron-compile in the dev deps ([0b8bff4](https://github.com/electron-userland/electron-builder/commit/0b8bff4))



<a name="16.0.0"></a>
# [16.0.0](https://github.com/electron-userland/electron-builder/compare/v15.6.3...v16.0.0) (2017-03-21)


### Bug Fixes

* S3 urls on mac ([55ebed1](https://github.com/electron-userland/electron-builder/commit/55ebed1)), closes [#1386](https://github.com/electron-userland/electron-builder/issues/1386)


### Features

* electron-compile support ([0b9b1fd](https://github.com/electron-userland/electron-builder/commit/0b9b1fd)), closes [#807](https://github.com/electron-userland/electron-builder/issues/807)



<a name="15.6.3"></a>
## [15.6.3](https://github.com/electron-userland/electron-builder/compare/v15.6.1...v15.6.3) (2017-03-18)


### Bug Fixes

* **updater:** GitHub private repo for windows (#1382) ([51d6e41](https://github.com/electron-userland/electron-builder/commit/51d6e41))
* improve debuggability — print effective config if debug enabled ([927ac40](https://github.com/electron-userland/electron-builder/commit/927ac40))



<a name="15.6.1"></a>
## [15.6.1](https://github.com/electron-userland/electron-builder/compare/v15.6.0...v15.6.1) (2017-03-17)


### Bug Fixes

* S3 URLs (#1373) (#1374) ([ac75e8c](https://github.com/electron-userland/electron-builder/commit/ac75e8c)), closes [#1373](https://github.com/electron-userland/electron-builder/issues/1373)



<a name="15.6.0"></a>
# [15.6.0](https://github.com/electron-userland/electron-builder/compare/v15.5.0...v15.6.0) (2017-03-16)


### Bug Fixes

* productName with utf8 characters cause dmg icon position error ([fbf787c](https://github.com/electron-userland/electron-builder/commit/fbf787c)), closes [#1234](https://github.com/electron-userland/electron-builder/issues/1234)
* removeAuthHeader must strip auth only for AWS ([d7a6760](https://github.com/electron-userland/electron-builder/commit/d7a6760))


### Features

* Multi language support for LICENCES ([bbdc29a](https://github.com/electron-userland/electron-builder/commit/bbdc29a))



<a name="15.5.0"></a>
# [15.5.0](https://github.com/electron-userland/electron-builder/compare/v15.4.3...v15.5.0) (2017-03-15)


### Bug Fixes

* **updater:** github private repo ([fb24e26](https://github.com/electron-userland/electron-builder/commit/fb24e26)), closes [#1370](https://github.com/electron-userland/electron-builder/issues/1370)


### Features

* private GitHub provider ([ce1df10](https://github.com/electron-userland/electron-builder/commit/ce1df10)), closes [#1266](https://github.com/electron-userland/electron-builder/issues/1266)
* **nsis:** do not prompt user to close app before installing on update ([e5682a0](https://github.com/electron-userland/electron-builder/commit/e5682a0)), closes [#1368](https://github.com/electron-userland/electron-builder/issues/1368)



<a name="15.4.3"></a>
## [15.4.3](https://github.com/electron-userland/electron-builder/compare/v15.4.2...v15.4.3) (2017-03-13)


### Bug Fixes

* --ia32 parameter not working as expected anymore ([c37bd00](https://github.com/electron-userland/electron-builder/commit/c37bd00)), closes [#1348](https://github.com/electron-userland/electron-builder/issues/1348)



<a name="15.4.2"></a>
## [15.4.2](https://github.com/electron-userland/electron-builder/compare/v15.4.1...v15.4.2) (2017-03-13)


### Bug Fixes

* artifactName for portable ([8f6247a](https://github.com/electron-userland/electron-builder/commit/8f6247a)), closes [#1340](https://github.com/electron-userland/electron-builder/issues/1340)



<a name="15.4.1"></a>
## [15.4.1](https://github.com/electron-userland/electron-builder/compare/v15.4.0...v15.4.1) (2017-03-13)


### Bug Fixes

* Platform-specific build option targets ignored since 15.2.0 ([2e7b668](https://github.com/electron-userland/electron-builder/commit/2e7b668)), closes [#1355](https://github.com/electron-userland/electron-builder/issues/1355)



<a name="15.4.0"></a>
# [15.4.0](https://github.com/electron-userland/electron-builder/compare/v15.3.0...v15.4.0) (2017-03-12)


### Features

* Don't build when CI run is a pull request ([e1dda14](https://github.com/electron-userland/electron-builder/commit/e1dda14)), closes [#1354](https://github.com/electron-userland/electron-builder/issues/1354)



<a name="15.3.0"></a>
# [15.3.0](https://github.com/electron-userland/electron-builder/compare/v15.2.0...v15.3.0) (2017-03-11)


### Bug Fixes

* **AppImage:** remove nss lib ([0601352](https://github.com/electron-userland/electron-builder/commit/0601352))
* Missing peer dependency: ajv@>=5.0.3-beta.0 ([6d890ee](https://github.com/electron-userland/electron-builder/commit/6d890ee)), closes [#1344](https://github.com/electron-userland/electron-builder/issues/1344)


### Features

* **deployment:** expand macros in all publish options (#1349) ([24fdf1d](https://github.com/electron-userland/electron-builder/commit/24fdf1d))
* **nsis:** always add plugin dir to override nsis plugins ([e8d1d0d](https://github.com/electron-userland/electron-builder/commit/e8d1d0d))



<a name="15.2.0"></a>
# [15.2.0](https://github.com/electron-userland/electron-builder/compare/v15.1.1...v15.2.0) (2017-03-08)


### Bug Fixes

* **linux:** Add dependencies for supporting Electron Tray (libappindicator) & Notifications (libnotify) for more Linux targets (#1339) ([79c94bd](https://github.com/electron-userland/electron-builder/commit/79c94bd)), closes [#1338](https://github.com/electron-userland/electron-builder/issues/1338)


### Features

* Different architectures for different platforms ([f2056fa](https://github.com/electron-userland/electron-builder/commit/f2056fa)), closes [#1314](https://github.com/electron-userland/electron-builder/issues/1314)



<a name="15.1.1"></a>
## [15.1.1](https://github.com/electron-userland/electron-builder/compare/v15.1.0...v15.1.1) (2017-03-06)


### Bug Fixes

* **deployment:** disable automatic detection for S3 ([c4744af](https://github.com/electron-userland/electron-builder/commit/c4744af)), closes [#1334](https://github.com/electron-userland/electron-builder/issues/1334)



<a name="15.1.0"></a>
# [15.1.0](https://github.com/electron-userland/electron-builder/compare/v15.0.1...v15.1.0) (2017-03-06)


### Features

* How to set build_number/FileVersion manually ([3ee8a59](https://github.com/electron-userland/electron-builder/commit/3ee8a59)), closes [#1337](https://github.com/electron-userland/electron-builder/issues/1337)



<a name="15.0.1"></a>
## [15.0.1](https://github.com/electron-userland/electron-builder/compare/v15.0.0...v15.0.1) (2017-03-05)


### Bug Fixes

* writeAsarFile — use close event instead of end ([3f41497](https://github.com/electron-userland/electron-builder/commit/3f41497))



<a name="15.0.0"></a>
# [15.0.0](https://github.com/electron-userland/electron-builder/compare/v14.5.2...v15.0.0) (2017-02-28)


### Bug Fixes

* dmg/pkg in the out dir, not in the subdir mac ([0bba4fe](https://github.com/electron-userland/electron-builder/commit/0bba4fe))
* ensure that out dir exists ([8dd6cd5](https://github.com/electron-userland/electron-builder/commit/8dd6cd5))
* **auto-updater:** handle errors during emit ([ef9b5a6](https://github.com/electron-userland/electron-builder/commit/ef9b5a6)), closes [#1310](https://github.com/electron-userland/electron-builder/issues/1310)


### Features

* **deployment:** support foo/bar repo as short form of owner foo and repo bar ([9d0e1fe](https://github.com/electron-userland/electron-builder/commit/9d0e1fe)), closes [#1227](https://github.com/electron-userland/electron-builder/issues/1227)
* **electron-updater:** find installer exe in bintray artifacts not so strict ([9ac818f](https://github.com/electron-userland/electron-builder/commit/9ac818f)), closes [#1305](https://github.com/electron-userland/electron-builder/issues/1305)


### BREAKING CHANGES

* dmg/pkg in the out dir, not in the subdir mac



<a name="14.5.2"></a>
## [14.5.2](https://github.com/electron-userland/electron-builder/compare/v14.5.1...v14.5.2) (2017-02-28)


### Bug Fixes

* **dmg:** pass -ov flag to overwrite existing dmg ([f4398a7](https://github.com/electron-userland/electron-builder/commit/f4398a7)), closes [#1308](https://github.com/electron-userland/electron-builder/issues/1308)



<a name="14.5.1"></a>
## [14.5.1](https://github.com/electron-userland/electron-builder/compare/v14.5.0...v14.5.1) (2017-02-27)


### Bug Fixes

* directories.output is ignored when building .dmg for a prepackaged app ([3e2798f](https://github.com/electron-userland/electron-builder/commit/3e2798f)), closes [#1308](https://github.com/electron-userland/electron-builder/issues/1308)



<a name="14.5.0"></a>
# [14.5.0](https://github.com/electron-userland/electron-builder/compare/v14.4.2...v14.5.0) (2017-02-27)


### Features

* Allow usage of environmental variables in extraFiles and extraResources ([cfc2715](https://github.com/electron-userland/electron-builder/commit/cfc2715)), closes [#1307](https://github.com/electron-userland/electron-builder/issues/1307)



<a name="14.4.2"></a>
## [14.4.2](https://github.com/electron-userland/electron-builder/compare/v14.4.1...v14.4.2) (2017-02-26)


### Bug Fixes

* **nsis:** update metainfo for nsis-web doesn't use github safe artifact name ([965be90](https://github.com/electron-userland/electron-builder/commit/965be90)), closes [#1227](https://github.com/electron-userland/electron-builder/issues/1227)



<a name="14.4.1"></a>
## [14.4.1](https://github.com/electron-userland/electron-builder/compare/v14.4.0...v14.4.1) (2017-02-25)


### Bug Fixes

* **deployment:** Publishing always fails on circleci #1303 (#1304) ([81b7e46](https://github.com/electron-userland/electron-builder/commit/81b7e46)), closes [#1303](https://github.com/electron-userland/electron-builder/issues/1303)



<a name="14.4.0"></a>
# [14.4.0](https://github.com/electron-userland/electron-builder/compare/v14.3.0...v14.4.0) (2017-02-24)


### Bug Fixes

* Issue with extraFiles not being valid ([f137193](https://github.com/electron-userland/electron-builder/commit/f137193)), closes [#1302](https://github.com/electron-userland/electron-builder/issues/1302)


### Features

* **windows:** Portable Build ([6292855](https://github.com/electron-userland/electron-builder/commit/6292855)), closes [#1157](https://github.com/electron-userland/electron-builder/issues/1157)



<a name="14.3.0"></a>
# [14.3.0](https://github.com/electron-userland/electron-builder/compare/v14.2.0...v14.3.0) (2017-02-24)


### Bug Fixes

* **snap:** allow to set `classic` confinement ([f1d524a](https://github.com/electron-userland/electron-builder/commit/f1d524a))


### Features

* **nsis:** Add option to define custom files to be removed instead of just nuking installation directory ([09f7fde](https://github.com/electron-userland/electron-builder/commit/09f7fde))



<a name="14.2.0"></a>
# [14.2.0](https://github.com/electron-userland/electron-builder/compare/v14.1.1...v14.2.0) (2017-02-24)


### Bug Fixes

* **deployment:** warn if cannot resolve repository ([3fa6259](https://github.com/electron-userland/electron-builder/commit/3fa6259))
* **linux:** use executableName as specified and do not lowercase it ([79077bf](https://github.com/electron-userland/electron-builder/commit/79077bf)), closes [#1291](https://github.com/electron-userland/electron-builder/issues/1291)
* **nsis:** Incorrect app-update.yml for Windows 32bit ([5cfc693](https://github.com/electron-userland/electron-builder/commit/5cfc693)), closes [#1282](https://github.com/electron-userland/electron-builder/issues/1282)


### Features

* **windows:** Support passing the `sha1` of a certificate in Windows codesign ([4be81dc](https://github.com/electron-userland/electron-builder/commit/4be81dc)), closes [#1297](https://github.com/electron-userland/electron-builder/issues/1297)



<a name="14.1.1"></a>
## [14.1.1](https://github.com/electron-userland/electron-builder/compare/v14.1.0...v14.1.1) (2017-02-22)


### Bug Fixes

* Build with prepackaged app doesn't do anything for mac #1284 ([0be724d](https://github.com/electron-userland/electron-builder/commit/0be724d))



<a name="14.1.0"></a>
# [14.1.0](https://github.com/electron-userland/electron-builder/compare/v14.0.1...v14.1.0) (2017-02-22)


### Features

* **AppImage:** Fedora support ([ca7745d](https://github.com/electron-userland/electron-builder/commit/ca7745d))



<a name="14.0.1"></a>
## [14.0.1](https://github.com/electron-userland/electron-builder/compare/v14.0.0...v14.0.1) (2017-02-22)


### Features

* validate config using JSON schema ([d65f8c3](https://github.com/electron-userland/electron-builder/commit/d65f8c3)), closes [#1292](https://github.com/electron-userland/electron-builder/issues/1292) [#1290](https://github.com/electron-userland/electron-builder/issues/1290)



<a name="14.0.0"></a>
# [14.0.0](https://github.com/electron-userland/electron-builder/compare/v13.11.1...v14.0.0) (2017-02-21)


### Features

* **AppImage:** ElementaryOS and libappindicator1 support by default ([580eeaa](https://github.com/electron-userland/electron-builder/commit/580eeaa)), closes [#1082](https://github.com/electron-userland/electron-builder/issues/1082)



<a name="13.11.1"></a>
## [13.11.1](https://github.com/electron-userland/electron-builder/compare/v13.11.0...v13.11.1) (2017-02-20)


### Bug Fixes

* **mac:** dist app quit unexpectedly caused by productName ([3a1042a](https://github.com/electron-userland/electron-builder/commit/3a1042a)), closes [#1278](https://github.com/electron-userland/electron-builder/issues/1278)



<a name="13.11.0"></a>
# [13.11.0](https://github.com/electron-userland/electron-builder/compare/v13.10.1...v13.11.0) (2017-02-19)


### Features

* icon relative or to build resources, or to project ([3f3419a](https://github.com/electron-userland/electron-builder/commit/3f3419a)), closes [#1276](https://github.com/electron-userland/electron-builder/issues/1276)



<a name="13.10.1"></a>
## [13.10.1](https://github.com/electron-userland/electron-builder/compare/v13.10.0...v13.10.1) (2017-02-18)



<a name="13.10.0"></a>
# [13.10.0](https://github.com/electron-userland/electron-builder/compare/v13.9.0...v13.10.0) (2017-02-17)


### Bug Fixes

* increase maxBuffer for xorriso child process (#1274) ([bce672e](https://github.com/electron-userland/electron-builder/commit/bce672e))


### Features

* make description optional (just a warning) ([ae036c6](https://github.com/electron-userland/electron-builder/commit/ae036c6))
* **electron-updater:** abort download ([91613a9](https://github.com/electron-userland/electron-builder/commit/91613a9)), closes [#1150](https://github.com/electron-userland/electron-builder/issues/1150)
* **nsis:** NSIS Special Builds set NSIS_MAX_STRLEN flag ([498db5d](https://github.com/electron-userland/electron-builder/commit/498db5d)), closes [#1267](https://github.com/electron-userland/electron-builder/issues/1267)



<a name="13.9.0"></a>
# [13.9.0](https://github.com/electron-userland/electron-builder/compare/v13.8.2...v13.9.0) (2017-02-15)


### Features

* **snap:** snapcraft 2.26 support ([9c69ce4](https://github.com/electron-userland/electron-builder/commit/9c69ce4)), closes [#1265](https://github.com/electron-userland/electron-builder/issues/1265)
* Different icons for application/file extension with same name on macOS and Windows ([04f11f6](https://github.com/electron-userland/electron-builder/commit/04f11f6)), closes [#1268](https://github.com/electron-userland/electron-builder/issues/1268)



<a name="13.8.2"></a>
## [13.8.2](https://github.com/electron-userland/electron-builder/compare/v13.8.1...v13.8.2) (2017-02-15)


### Bug Fixes

* electron-builder.* config file resolution ([481dfa2](https://github.com/electron-userland/electron-builder/commit/481dfa2))



<a name="13.8.1"></a>
## [13.8.1](https://github.com/electron-userland/electron-builder/compare/v13.8.0...v13.8.1) (2017-02-15)


### Bug Fixes

* ${os} pattern in artifactName does not follow wiki ([38339b9](https://github.com/electron-userland/electron-builder/commit/38339b9)), closes [#1263](https://github.com/electron-userland/electron-builder/issues/1263)
* artifactName option does not work in build section ([6224060](https://github.com/electron-userland/electron-builder/commit/6224060)), closes [#1262](https://github.com/electron-userland/electron-builder/issues/1262)


### Features

* **mac:** The extra entries for `Info.plist` ([1a33a34](https://github.com/electron-userland/electron-builder/commit/1a33a34))



<a name="13.8.0"></a>
# [13.8.0](https://github.com/electron-userland/electron-builder/compare/v13.7.0...v13.8.0) (2017-02-15)


### Bug Fixes

* from as file and to as dir ([3bb2ab8](https://github.com/electron-userland/electron-builder/commit/3bb2ab8)), closes [#1245](https://github.com/electron-userland/electron-builder/issues/1245)


### Features

* **nsis:** metro sidebar, customizable sidebar ([969c0eb](https://github.com/electron-userland/electron-builder/commit/969c0eb)), closes [#1248](https://github.com/electron-userland/electron-builder/issues/1248)



<a name="13.7.0"></a>
# [13.7.0](https://github.com/electron-userland/electron-builder/compare/v13.6.0...v13.7.0) (2017-02-14)


### Bug Fixes

* **electron-updater:** fix missed path in the log messages ([8a75cbb](https://github.com/electron-userland/electron-builder/commit/8a75cbb))
* **squirrel.windows:** sign the Squirrel.Windows executableStub ([c732db2](https://github.com/electron-userland/electron-builder/commit/c732db2)), closes [#1251](https://github.com/electron-userland/electron-builder/issues/1251)


### Features

* **nsins:** create pre initialization hook in installer.nsi (#1255) ([7ed9d7a](https://github.com/electron-userland/electron-builder/commit/7ed9d7a))
* **nsis:** option to delete app data on manual uninstall ([2e1b21e](https://github.com/electron-userland/electron-builder/commit/2e1b21e)), closes [#885](https://github.com/electron-userland/electron-builder/issues/885)



<a name="13.6.0"></a>
# [13.6.0](https://github.com/electron-userland/electron-builder/compare/v13.5.0...v13.6.0) (2017-02-13)


### Bug Fixes

* Incorrect error message ([bc0952e](https://github.com/electron-userland/electron-builder/commit/bc0952e)), closes [#1236](https://github.com/electron-userland/electron-builder/issues/1236)
* **deployment:** NSIS Web Installer update info is not generated #1207 ([9f7c825](https://github.com/electron-userland/electron-builder/commit/9f7c825))
* **electron-updater:** Github Update Fails Due to Undefined ([591873a](https://github.com/electron-userland/electron-builder/commit/591873a)), closes [#1228](https://github.com/electron-userland/electron-builder/issues/1228)
* **nsis:** Custom NSIS Script !include could not find nsh file ([3fbf113](https://github.com/electron-userland/electron-builder/commit/3fbf113)), closes [#1239](https://github.com/electron-userland/electron-builder/issues/1239)


### Features

* **electron-updater:** include full GitHub request url in the error message ([a7d2992](https://github.com/electron-userland/electron-builder/commit/a7d2992))
* **linux:** assert that linux.icon is a directory ([5352b8c](https://github.com/electron-userland/electron-builder/commit/5352b8c)), closes [#1242](https://github.com/electron-userland/electron-builder/issues/1242)
* --config option ([472ef7e](https://github.com/electron-userland/electron-builder/commit/472ef7e)), closes [#1229](https://github.com/electron-userland/electron-builder/issues/1229)
* --config option ([a9f2ad8](https://github.com/electron-userland/electron-builder/commit/a9f2ad8))



<a name="13.5.0"></a>
# [13.5.0](https://github.com/electron-userland/electron-builder/compare/v13.4.0...v13.5.0) (2017-02-10)


### Features

* **nsis:** unicode option High Windows defender CPU usage when accessing NSIS installer ([0e9059c](https://github.com/electron-userland/electron-builder/commit/0e9059c)), closes [#1165](https://github.com/electron-userland/electron-builder/issues/1165)



<a name="13.4.0"></a>
# [13.4.0](https://github.com/electron-userland/electron-builder/compare/v13.3.1...v13.4.0) (2017-02-10)


### Bug Fixes

* identity = null is not respected ([3df2638](https://github.com/electron-userland/electron-builder/commit/3df2638)), closes [#1233](https://github.com/electron-userland/electron-builder/issues/1233)


### Features

* artifact file name pattern for pkg and dmg ([22746bd](https://github.com/electron-userland/electron-builder/commit/22746bd)), closes [#966](https://github.com/electron-userland/electron-builder/issues/966)
* **nsis:** NSIS Web Installer ([7041b5d](https://github.com/electron-userland/electron-builder/commit/7041b5d)), closes [#1207](https://github.com/electron-userland/electron-builder/issues/1207)



<a name="13.3.1"></a>
## [13.3.1](https://github.com/electron-userland/electron-builder/compare/v13.2.0...v13.3.1) (2017-02-09)


### Features

* **deb:** "Priority" attribute for .deb packages ([6497678](https://github.com/electron-userland/electron-builder/commit/6497678)), closes [#1088](https://github.com/electron-userland/electron-builder/issues/1088)
* **pkg:** preinstall and postinstall scripts ([2eb1298](https://github.com/electron-userland/electron-builder/commit/2eb1298)), closes [#1166](https://github.com/electron-userland/electron-builder/issues/1166)
* GitHub Enterprise support ([7cae06a](https://github.com/electron-userland/electron-builder/commit/7cae06a)), closes [#1225](https://github.com/electron-userland/electron-builder/issues/1225)
* **snap:** custom plugs ([3aed0b5](https://github.com/electron-userland/electron-builder/commit/3aed0b5)), closes [#1226](https://github.com/electron-userland/electron-builder/issues/1226)



<a name="13.2.0"></a>
# [13.2.0](https://github.com/electron-userland/electron-builder/compare/v13.1.0...v13.2.0) (2017-02-08)


### Bug Fixes

* **deployment:** log about uploading if non TTY stream ([4546b1c](https://github.com/electron-userland/electron-builder/commit/4546b1c))


### Features

* **nsis:** artifact file name pattern ([3d39fa6](https://github.com/electron-userland/electron-builder/commit/3d39fa6)), closes [#1221](https://github.com/electron-userland/electron-builder/issues/1221) [#1219](https://github.com/electron-userland/electron-builder/issues/1219)



<a name="13.1.0"></a>
# [13.1.0](https://github.com/electron-userland/electron-builder/compare/v13.0.0...v13.1.0) (2017-02-07)


### Features

* S3 AWS Publishing ([fd4fc0f](https://github.com/electron-userland/electron-builder/commit/fd4fc0f))
* cancellable and progressable publishing ([a24f12c](https://github.com/electron-userland/electron-builder/commit/a24f12c))



<a name="13.0.0"></a>
# [13.0.0](https://github.com/electron-userland/electron-builder/compare/v12.3.1...v13.0.0) (2017-02-04)


### Bug Fixes

* **nsis:** Application Icon Missing from "Remove Programs" and "Settings->Apps & Features" ([9c62be9](https://github.com/electron-userland/electron-builder/commit/9c62be9)), closes [#1108](https://github.com/electron-userland/electron-builder/issues/1108)


### Features

* Remove scripts, devDependencies and build from package.json ([ab41fcf](https://github.com/electron-userland/electron-builder/commit/ab41fcf)), closes [#1212](https://github.com/electron-userland/electron-builder/issues/1212)


### BREAKING CHANGES

* `scripts`, `devDependencies` and `build` automatically removed from package.json



<a name="12.3.1"></a>
## [12.3.1](https://github.com/electron-userland/electron-builder/compare/v12.3.0...v12.3.1) (2017-02-03)


### Bug Fixes

* macOS Auto updater using old update ([4e63640](https://github.com/electron-userland/electron-builder/commit/4e63640)), closes [#1200](https://github.com/electron-userland/electron-builder/issues/1200)
* **electron-updater:** channel & channelFile mismatch for macOS GenericProvider publishing (#1203) (#1206) ([f23daff](https://github.com/electron-userland/electron-builder/commit/f23daff))



<a name="12.3.0"></a>
# [12.3.0](https://github.com/electron-userland/electron-builder/compare/v12.2.0...v12.3.0) (2017-02-02)


### Bug Fixes

* **deployment:** Artifacts still get pushed to github releases marked as published ([3987b06](https://github.com/electron-userland/electron-builder/commit/3987b06)), closes [#1197](https://github.com/electron-userland/electron-builder/issues/1197)


### Features

* **electron-updater:** add releaseNotes and releaseName to autoUpdate ([45c93bf](https://github.com/electron-userland/electron-builder/commit/45c93bf)), closes [#1174](https://github.com/electron-userland/electron-builder/issues/1174)
* build prepackaged app.asar ([60e1406](https://github.com/electron-userland/electron-builder/commit/60e1406)), closes [#1102](https://github.com/electron-userland/electron-builder/issues/1102)



<a name="12.2.0"></a>
# [12.2.0](https://github.com/electron-userland/electron-builder/compare/v12.1.0...v12.2.0) (2017-02-01)


### Bug Fixes

* **electron-updater:** Autoupdater problem on mac if space in the URL ([e5d58e2](https://github.com/electron-userland/electron-builder/commit/e5d58e2)), closes [#1192](https://github.com/electron-userland/electron-builder/issues/1192)


### Features

* **linux:** ability to specify custom path to linux icon set ([a2f64bb](https://github.com/electron-userland/electron-builder/commit/a2f64bb)), closes [#1176](https://github.com/electron-userland/electron-builder/issues/1176)
* ${os} and ${arch} in publish.url ([6863896](https://github.com/electron-userland/electron-builder/commit/6863896)), closes [#1194](https://github.com/electron-userland/electron-builder/issues/1194)



<a name="12.1.0"></a>
# [12.1.0](https://github.com/electron-userland/electron-builder/compare/v12.0.3...v12.1.0) (2017-01-31)


### Bug Fixes

* always revalidate cache ([02a96f4](https://github.com/electron-userland/electron-builder/commit/02a96f4)), closes [#1186](https://github.com/electron-userland/electron-builder/issues/1186)


### Features

* allow `./` in the file pattern ([1152f2b](https://github.com/electron-userland/electron-builder/commit/1152f2b))
* file mappings ([55e2f0d](https://github.com/electron-userland/electron-builder/commit/55e2f0d)), closes [#1119](https://github.com/electron-userland/electron-builder/issues/1119)



<a name="12.0.3"></a>
## [12.0.3](https://github.com/electron-userland/electron-builder/compare/v12.0.2...v12.0.3) (2017-01-29)


### Features

* **nsis:** Pass --update flag to uninstaller when auto updating an application ([505a63d](https://github.com/electron-userland/electron-builder/commit/505a63d)), closes [#1162](https://github.com/electron-userland/electron-builder/issues/1162)



<a name="12.0.2"></a>
## [12.0.2](https://github.com/electron-userland/electron-builder/compare/v12.0.1...v12.0.2) (2017-01-29)


### Bug Fixes

* **deployment:** warn "A release is already published" instead of error ([5d64693](https://github.com/electron-userland/electron-builder/commit/5d64693)), closes [#1183](https://github.com/electron-userland/electron-builder/issues/1183)
* **nsis:** add `+` as safe symbol for product name ([e7e2a82](https://github.com/electron-userland/electron-builder/commit/e7e2a82))
* deepAssign error without config ([5d72c10](https://github.com/electron-userland/electron-builder/commit/5d72c10)), closes [#1177](https://github.com/electron-userland/electron-builder/issues/1177)


### Features

* **electron-updater:** add requestHeaders option ([dd1320d](https://github.com/electron-userland/electron-builder/commit/dd1320d)), closes [#1175](https://github.com/electron-userland/electron-builder/issues/1175)



<a name="12.0.1"></a>
## [12.0.1](https://github.com/electron-userland/electron-builder/compare/v12.0.0...v12.0.1) (2017-01-27)


### Bug Fixes

* **deployment:** Error on CI build when GH_TOKEN not set for external PRs ([ee32575](https://github.com/electron-userland/electron-builder/commit/ee32575)), closes [#1178](https://github.com/electron-userland/electron-builder/issues/1178)



<a name="12.0.0"></a>
# [12.0.0](https://github.com/electron-userland/electron-builder/compare/v11.7.0...v12.0.0) (2017-01-26)


### Features

* **nsis:** use productName rather than name for install path if matches /^[-_0-9a-zA-Z ]+$/ ([2539cfb](https://github.com/electron-userland/electron-builder/commit/2539cfb)), closes [#1100](https://github.com/electron-userland/electron-builder/issues/1100) [#767](https://github.com/electron-userland/electron-builder/issues/767) [#1104](https://github.com/electron-userland/electron-builder/issues/1104)


### BREAKING CHANGES

* **nsis:** installation path change



<a name="11.7.0"></a>
# [11.7.0](https://github.com/electron-userland/electron-builder/compare/v11.6.1...v11.7.0) (2017-01-26)


### Features

* **nsis:** Show welcome and finish page duing uninstall (#1173) ([aa43344](https://github.com/electron-userland/electron-builder/commit/aa43344))



<a name="11.6.1"></a>
## [11.6.1](https://github.com/electron-userland/electron-builder/compare/v11.6.0...v11.6.1) (2017-01-25)


### Bug Fixes

* Error during signing when running as Windows SYSTEM user ([688111e](https://github.com/electron-userland/electron-builder/commit/688111e)), closes [#1164](https://github.com/electron-userland/electron-builder/issues/1164)



<a name="11.6.0"></a>
# [11.6.0](https://github.com/electron-userland/electron-builder/compare/v11.5.2...v11.6.0) (2017-01-25)


### Features

* **electron-updater:** cannot use updater without administrator privileges ([7c2973d](https://github.com/electron-userland/electron-builder/commit/7c2973d)), closes [#1133](https://github.com/electron-userland/electron-builder/issues/1133)



<a name="11.5.2"></a>
## [11.5.2](https://github.com/electron-userland/electron-builder/compare/v11.5.1...v11.5.2) (2017-01-24)


### Bug Fixes

* **deployment:** another fix for "only first artifact is uploaded to GitHub" ([93b4d59](https://github.com/electron-userland/electron-builder/commit/93b4d59)), closes [#1133](https://github.com/electron-userland/electron-builder/issues/1133)
* **nsis:** Must be error if file association is set, but perMachine not ([96c8ed9](https://github.com/electron-userland/electron-builder/commit/96c8ed9)), closes [#772](https://github.com/electron-userland/electron-builder/issues/772)



<a name="11.5.1"></a>
## [11.5.1](https://github.com/electron-userland/electron-builder/compare/v11.5.0...v11.5.1) (2017-01-21)


### Bug Fixes

* Arch & pacman use i686 instead of i386 and pkg.tar.xz (#1148) ([5fe94ee](https://github.com/electron-userland/electron-builder/commit/5fe94ee))


### Features

* **deployment:** Only first artifact is uploaded to GitHub ([e3ab55b](https://github.com/electron-userland/electron-builder/commit/e3ab55b)), closes [#1133](https://github.com/electron-userland/electron-builder/issues/1133)
* **electron-updater:** NSIS autoUpdater.setFeedURL throws error ([eb6a453](https://github.com/electron-userland/electron-builder/commit/eb6a453)), closes [#1105](https://github.com/electron-userland/electron-builder/issues/1105)



<a name="11.5.0"></a>
# [11.5.0](https://github.com/electron-userland/electron-builder/compare/v11.4.4...v11.5.0) (2017-01-18)


### Bug Fixes

* make file association name optional ([248855c](https://github.com/electron-userland/electron-builder/commit/248855c)), closes [#1069](https://github.com/electron-userland/electron-builder/issues/1069)


### Features

* **electron-updater:** Port support for downloads, Protocol support for generic backend ([8d883f1](https://github.com/electron-userland/electron-builder/commit/8d883f1))



<a name="11.4.4"></a>
## [11.4.4](https://github.com/electron-userland/electron-builder/compare/v11.4.3...v11.4.4) (2017-01-17)


### Bug Fixes

* **publish:** resolve any publish configuration — not only string ([98c2c8e](https://github.com/electron-userland/electron-builder/commit/98c2c8e))



<a name="11.4.3"></a>
## [11.4.3](https://github.com/electron-userland/electron-builder/compare/v11.4.1...v11.4.3) (2017-01-16)


### Bug Fixes

* generate latest-mac.json for github in the github directory ([8670d5a](https://github.com/electron-userland/electron-builder/commit/8670d5a))
* **snap:** interface 'platform' doesn't exist ([ade922c](https://github.com/electron-userland/electron-builder/commit/ade922c)), closes [#1123](https://github.com/electron-userland/electron-builder/issues/1123)



<a name="11.4.1"></a>
## [11.4.1](https://github.com/electron-userland/electron-builder/compare/v11.4.0...v11.4.1) (2017-01-16)


### Bug Fixes

* **AppImage:** include libappindicator1 in AppImage ([df7d316](https://github.com/electron-userland/electron-builder/commit/df7d316)), closes [#1082](https://github.com/electron-userland/electron-builder/issues/1082)



<a name="11.4.0"></a>
# [11.4.0](https://github.com/electron-userland/electron-builder/compare/v11.3.0...v11.4.0) (2017-01-15)


### Bug Fixes

* **squirrel.windows:** Crash after autoupdate downloads nuget package ([d10ba78](https://github.com/electron-userland/electron-builder/commit/d10ba78)), closes [#1101](https://github.com/electron-userland/electron-builder/issues/1101)


### Features

* **electron-updater:** Electron Auto Updater MacOS support ([067d5c7](https://github.com/electron-userland/electron-builder/commit/067d5c7))
* Separate build config from package.json ([ecfdc65](https://github.com/electron-userland/electron-builder/commit/ecfdc65)), closes [#1109](https://github.com/electron-userland/electron-builder/issues/1109)



<a name="11.3.0"></a>
# [11.3.0](https://github.com/electron-userland/electron-builder/compare/v11.2.5...v11.3.0) (2017-01-14)


### Bug Fixes

* **docker:** add missing libcurl3 for osslsigncode (#1116) ([f0a553a](https://github.com/electron-userland/electron-builder/commit/f0a553a))
* **electron-updater:** Add better error handling for github releases (#1114) ([9dc5bc9](https://github.com/electron-userland/electron-builder/commit/9dc5bc9)), closes [#1112](https://github.com/electron-userland/electron-builder/issues/1112)



<a name="11.2.5"></a>
## [11.2.5](https://github.com/electron-userland/electron-builder/compare/v11.2.4...v11.2.5) (2017-01-12)


### Bug Fixes

* **codeSign:** signing with "Mac Developer" failed #1103 ([88682e8](https://github.com/electron-userland/electron-builder/commit/88682e8))



<a name="11.2.4"></a>
## [11.2.4](https://github.com/electron-userland/electron-builder/compare/v11.2.1...v11.2.4) (2017-01-11)



<a name="11.2.1"></a>
## [11.2.1](https://github.com/electron-userland/electron-builder/compare/v11.2.0...v11.2.1) (2017-01-09)


### Bug Fixes

* do not fail if cannot rebuild optional dep ([f67b7d2](https://github.com/electron-userland/electron-builder/commit/f67b7d2)), closes [#1075](https://github.com/electron-userland/electron-builder/issues/1075)



<a name="11.2.0"></a>
# [11.2.0](https://github.com/electron-userland/electron-builder/compare/v11.1.1...v11.2.0) (2017-01-08)


### Bug Fixes

* **electron-auto-updater:** uncaught SHA2 checksum mismatch exception ([cb87588](https://github.com/electron-userland/electron-builder/commit/cb87588))


### Features

* linked dirs outside of projects (e.g. linked modules) ([2364a1c](https://github.com/electron-userland/electron-builder/commit/2364a1c)), closes [#675](https://github.com/electron-userland/electron-builder/issues/675)



<a name="11.1.1"></a>
## [11.1.1](https://github.com/electron-userland/electron-builder/compare/v1.1.1...v11.1.1) (2017-01-06)


### Bug Fixes

* to preserve compatibility with old electron-auto-updater (< 0.10.0), we upload file with path specific for GitHub ([c06f3f4](https://github.com/electron-userland/electron-builder/commit/c06f3f4))



<a name="11.1.0"></a>
# [11.1.0](https://github.com/electron-userland/electron-builder/compare/v11.0.0...v11.1.0) (2017-01-05)


### Features

* **nsis:** Change installation directory when not using 'oneClick' with NSIS ([06b0103](https://github.com/electron-userland/electron-builder/commit/06b0103)), closes [#596](https://github.com/electron-userland/electron-builder/issues/596)



<a name="11.0.0"></a>
# [11.0.0](https://github.com/electron-userland/electron-builder/compare/v10.17.2...v11.0.0) (2017-01-05)


### Bug Fixes

* **electron-builder-http:** electron-auto-updater request can download so fast that the first few chunks arrive before ensureDirPromise has finished for configurePipes to run ([cb85790](https://github.com/electron-userland/electron-builder/commit/cb85790)), closes [#1081](https://github.com/electron-userland/electron-builder/issues/1081)
* electron-builder not generating "latest.yml" file ([0f1fc4d](https://github.com/electron-userland/electron-builder/commit/0f1fc4d)), closes [#925](https://github.com/electron-userland/electron-builder/issues/925)


### Code Refactoring

* extract electron-builder-squirrel-windows ([6256432](https://github.com/electron-userland/electron-builder/commit/6256432))


### Features

* add beforeBuild callback (#1085) ([35a8cdf](https://github.com/electron-userland/electron-builder/commit/35a8cdf)), closes [#982](https://github.com/electron-userland/electron-builder/issues/982)


### BREAKING CHANGES

* To use Squirrel.Windows please install `electron-builder-squirrel-windows` dependency.



<a name="10.17.2"></a>
## [10.17.2](https://github.com/electron-userland/electron-builder/compare/v10.17.0...v10.17.2) (2017-01-04)


### Bug Fixes

* Unhandled rejection SyntaxError: Unexpected token ... ([0c81bf7](https://github.com/electron-userland/electron-builder/commit/0c81bf7)), closes [#1076](https://github.com/electron-userland/electron-builder/issues/1076)
* use transformer to notify about progress ([7fa56bc](https://github.com/electron-userland/electron-builder/commit/7fa56bc)), closes [#1077](https://github.com/electron-userland/electron-builder/issues/1077)
* **dmg:** Can't locate Mac/Finder/DSStore.pm in [@INC](https://github.com/INC) ([8d0e230](https://github.com/electron-userland/electron-builder/commit/8d0e230)), closes [#1079](https://github.com/electron-userland/electron-builder/issues/1079)



<a name="10.17.0"></a>
# [10.17.0](https://github.com/electron-userland/electron-builder/compare/v10.16.0...v10.17.0) (2017-01-03)


### Bug Fixes

* asarUnpack unpacks parent directory when file is specified ([82f16d1](https://github.com/electron-userland/electron-builder/commit/82f16d1)), closes [#1071](https://github.com/electron-userland/electron-builder/issues/1071)


### Features

* **linux:** use ${macro} syntax for linux templates ([fe137fc](https://github.com/electron-userland/electron-builder/commit/fe137fc))



<a name="10.16.0"></a>
# [10.16.0](https://github.com/electron-userland/electron-builder/compare/v10.15.2...v10.16.0) (2017-01-02)


### Features

* **nsis:** allow submenu in start menu in programfiles ([e3faaf1](https://github.com/electron-userland/electron-builder/commit/e3faaf1)), closes [#1063](https://github.com/electron-userland/electron-builder/issues/1063)



<a name="10.15.2"></a>
## [10.15.2](https://github.com/electron-userland/electron-builder/compare/v10.15.1...v10.15.2) (2016-12-31)


### Bug Fixes

* **dmg:** Unable to build with custom path ([3bf8c93](https://github.com/electron-userland/electron-builder/commit/3bf8c93)), closes [#847](https://github.com/electron-userland/electron-builder/issues/847) [#1054](https://github.com/electron-userland/electron-builder/issues/1054)
* **docker:** Docker - wine - bad exe format for rcedit.exe ([920c230](https://github.com/electron-userland/electron-builder/commit/920c230))
* **electron-auto-updater:** Checking for updates from github was failing ([3401630](https://github.com/electron-userland/electron-builder/commit/3401630)), closes [#1038](https://github.com/electron-userland/electron-builder/issues/1038)


### Features

* **docker:** Install chrome & xvfb to allow for e2e testing ([43add64](https://github.com/electron-userland/electron-builder/commit/43add64))



<a name="10.15.1"></a>
## [10.15.1](https://github.com/electron-userland/electron-builder/compare/v10.15.0...v10.15.1) (2016-12-29)


### Bug Fixes

* **linux:** executable breakes if productName given ([2906227](https://github.com/electron-userland/electron-builder/commit/2906227)), closes [#1060](https://github.com/electron-userland/electron-builder/issues/1060)



<a name="10.15.0"></a>
# [10.15.0](https://github.com/electron-userland/electron-builder/compare/v10.14.0...v10.15.0) (2016-12-28)


### Features

* build in distributable format prepackaged directory ([1c59534](https://github.com/electron-userland/electron-builder/commit/1c59534))



<a name="10.14.0"></a>
# [10.14.0](https://github.com/electron-userland/electron-builder/compare/v10.13.1...v10.14.0) (2016-12-28)


### Features

* Adding download-progress event to AutoUpdater (#1042) ([b3a0be0](https://github.com/electron-userland/electron-builder/commit/b3a0be0)), closes [#958](https://github.com/electron-userland/electron-builder/issues/958)



<a name="10.13.1"></a>
## [10.13.1](https://github.com/electron-userland/electron-builder/compare/v10.13.0...v10.13.1) (2016-12-27)


### Bug Fixes

* **appimage:** Linux AppImage target doesn't reuse the launcher icon ([96895cf](https://github.com/electron-userland/electron-builder/commit/96895cf)), closes [#1003](https://github.com/electron-userland/electron-builder/issues/1003)
* **appimage:** USE_SYSTEM_XORRISO env to force usage of system xorriso ([03e43d1](https://github.com/electron-userland/electron-builder/commit/03e43d1))



<a name="10.13.0"></a>
# [10.13.0](https://github.com/electron-userland/electron-builder/compare/v10.12.0...v10.13.0) (2016-12-26)


### Bug Fixes

* **electron-auto-updater:** queue checkForUpdates ([62e0bcb](https://github.com/electron-userland/electron-builder/commit/62e0bcb)), closes [#1045](https://github.com/electron-userland/electron-builder/issues/1045)


### Features

* **snaps:** build snaps on macOs #509 ([f343def](https://github.com/electron-userland/electron-builder/commit/f343def))



<a name="10.12.0"></a>
# [10.12.0](https://github.com/electron-userland/electron-builder/compare/v10.11.0...v10.12.0) (2016-12-25)


### Bug Fixes

* **snap:** reduce deps #509 ([1fc26a5](https://github.com/electron-userland/electron-builder/commit/1fc26a5))


### Features

* **snap:** ubuntu-app-platform (disabled by default) ([a0c0d8e](https://github.com/electron-userland/electron-builder/commit/a0c0d8e))



<a name="10.11.0"></a>
# [10.11.0](https://github.com/electron-userland/electron-builder/compare/v10.10.0...v10.11.0) (2016-12-24)


### Bug Fixes

* Removing the abort trigger from httpExecutor (#1040) ([741df23](https://github.com/electron-userland/electron-builder/commit/741df23)), closes [#1039](https://github.com/electron-userland/electron-builder/issues/1039)
* sha2 checksum error is not catchable ([c10531b](https://github.com/electron-userland/electron-builder/commit/c10531b)), closes [#1010](https://github.com/electron-userland/electron-builder/issues/1010)


### Features

* Build snap packages for Linux ([a7aa979](https://github.com/electron-userland/electron-builder/commit/a7aa979)), closes [#509](https://github.com/electron-userland/electron-builder/issues/509)
* NSIS Updater API to Start Downloading ([eff85c3](https://github.com/electron-userland/electron-builder/commit/eff85c3)), closes [#972](https://github.com/electron-userland/electron-builder/issues/972)



<a name="10.10.0"></a>
# [10.10.0](https://github.com/electron-userland/electron-builder/compare/v10.9.3...v10.10.0) (2016-12-21)


### Features

* LSTypeIsPackage for file associations ([dcf3dbb](https://github.com/electron-userland/electron-builder/commit/dcf3dbb)), closes [#995](https://github.com/electron-userland/electron-builder/issues/995)



<a name="10.9.3"></a>
## [10.9.3](https://github.com/electron-userland/electron-builder/compare/v10.9.2...v10.9.3) (2016-12-21)


### Bug Fixes

* Trim suffix from wine version (#1033) ([090150c](https://github.com/electron-userland/electron-builder/commit/090150c)), closes [#1033](https://github.com/electron-userland/electron-builder/issues/1033) [#1031](https://github.com/electron-userland/electron-builder/issues/1031) [#953](https://github.com/electron-userland/electron-builder/issues/953)



<a name="10.9.2"></a>
## [10.9.2](https://github.com/electron-userland/electron-builder/compare/v10.9.1...v10.9.2) (2016-12-20)


### Bug Fixes

* Stub Executables missing in Squirrel.Windows 1.5.1 ([0ce1a3c](https://github.com/electron-userland/electron-builder/commit/0ce1a3c)), closes [#1011](https://github.com/electron-userland/electron-builder/issues/1011)



<a name="10.9.1"></a>
## [10.9.1](https://github.com/electron-userland/electron-builder/compare/v10.9.0...v10.9.1) (2016-12-20)


### Bug Fixes

* order of platform and arch npm env vars (#1029) ([f01a9f7](https://github.com/electron-userland/electron-builder/commit/f01a9f7)), closes [/github.com/electron-userland/electron-builder/issues/1027#issuecomment-268066701](https://github.com//github.com/electron-userland/electron-builder/issues/1027/issues/issuecomment-268066701)



<a name="10.9.0"></a>
# [10.9.0](https://github.com/electron-userland/electron-builder/compare/v10.8.1...v10.9.0) (2016-12-19)


### Features

* 32 bit appx  ([01604cf](https://github.com/electron-userland/electron-builder/commit/01604cf))
* **appx:** more customizable manifest fields ([cdc7219](https://github.com/electron-userland/electron-builder/commit/cdc7219))
* Set platform npm environment variable ([9249fcd](https://github.com/electron-userland/electron-builder/commit/9249fcd)), closes [#1027](https://github.com/electron-userland/electron-builder/issues/1027)
* Use Electron.Net to send http requests for auto updater ([569dd8b](https://github.com/electron-userland/electron-builder/commit/569dd8b)), closes [#959](https://github.com/electron-userland/electron-builder/issues/959) [#1024](https://github.com/electron-userland/electron-builder/issues/1024)



<a name="10.8.1"></a>
## [10.8.1](https://github.com/electron-userland/electron-builder/compare/v10.8.0...v10.8.1) (2016-12-15)


### Bug Fixes

* yarn detection ([1aaeb30](https://github.com/electron-userland/electron-builder/commit/1aaeb30))



<a name="10.8.0"></a>
# [10.8.0](https://github.com/electron-userland/electron-builder/compare/v10.7.1...v10.8.0) (2016-12-14)


### Bug Fixes

* update nsis to 3.0.1 ([f32d2dc](https://github.com/electron-userland/electron-builder/commit/f32d2dc)), closes [#850](https://github.com/electron-userland/electron-builder/issues/850)
* update nsis to 3.0.1 ([c6044a3](https://github.com/electron-userland/electron-builder/commit/c6044a3)), closes [#850](https://github.com/electron-userland/electron-builder/issues/850)


### Features

* update Squirrel.Windows to 1.5.1 ([97f6e0e](https://github.com/electron-userland/electron-builder/commit/97f6e0e))



<a name="10.7.1"></a>
## [10.7.1](https://github.com/electron-userland/electron-builder/compare/v10.7.0...v10.7.1) (2016-12-14)


### Bug Fixes

* **electron-auto-updater:** load default provider only if custom was not set ([a457d0d](https://github.com/electron-userland/electron-builder/commit/a457d0d))
* ENOENT for symlinks because directory was not created ([76de8f7](https://github.com/electron-userland/electron-builder/commit/76de8f7)), closes [#1002](https://github.com/electron-userland/electron-builder/issues/1002) [#998](https://github.com/electron-userland/electron-builder/issues/998)



<a name="10.7.0"></a>
# [10.7.0](https://github.com/electron-userland/electron-builder/compare/v10.6.1...v10.7.0) (2016-12-12)


### Features

* force application signing ([4faa3fb](https://github.com/electron-userland/electron-builder/commit/4faa3fb)), closes [#975](https://github.com/electron-userland/electron-builder/issues/975)



<a name="10.6.1"></a>
## [10.6.1](https://github.com/electron-userland/electron-builder/compare/v10.6.0...v10.6.1) (2016-12-07)


### Bug Fixes

* improve error message for case of wrongly set electron* dependencies (#986) ([4635ab0](https://github.com/electron-userland/electron-builder/commit/4635ab0))



<a name="10.6.0"></a>
# [10.6.0](https://github.com/electron-userland/electron-builder/compare/v10.5.0...v10.6.0) (2016-12-06)


### Features

* First start after update will start with a flag (#979) ([cb85297](https://github.com/electron-userland/electron-builder/commit/cb85297)), closes [#970](https://github.com/electron-userland/electron-builder/issues/970)



<a name="10.5.0"></a>
# [10.5.0](https://github.com/electron-userland/electron-builder/compare/v10.4.3...v10.5.0) (2016-12-03)


### Features

* custom NSIS installer icon (#969) ([75dd2cb](https://github.com/electron-userland/electron-builder/commit/75dd2cb)), closes [#964](https://github.com/electron-userland/electron-builder/issues/964)



<a name="10.4.3"></a>
## [10.4.3](https://github.com/electron-userland/electron-builder/compare/v10.4.2...v10.4.3) (2016-12-02)


### Bug Fixes

* use productName for FileDescription on Windows (#965) ([3b6af52](https://github.com/electron-userland/electron-builder/commit/3b6af52)), closes [#783](https://github.com/electron-userland/electron-builder/issues/783)



<a name="10.4.2"></a>
## [10.4.2](https://github.com/electron-userland/electron-builder/compare/v10.4.1...v10.4.2) (2016-12-02)


### Bug Fixes

* write remaining files to unpack (#961) ([cbf4e04](https://github.com/electron-userland/electron-builder/commit/cbf4e04))



<a name="10.4.1"></a>
## [10.4.1](https://github.com/electron-userland/electron-builder/compare/v10.4.0...v10.4.1) (2016-12-01)


### Bug Fixes

* **mac:** build.fileAssociations icon links to original file in output ([d289f4b](https://github.com/electron-userland/electron-builder/commit/d289f4b)), closes [#954](https://github.com/electron-userland/electron-builder/issues/954)



<a name="10.4.0"></a>
# [10.4.0](https://github.com/electron-userland/electron-builder/compare/v10.3.0...v10.4.0) (2016-11-30)


### Bug Fixes

* wine version processing (#955) ([da16181](https://github.com/electron-userland/electron-builder/commit/da16181))


### Features

* win code sign timestamp server option ([c2eb8c2](https://github.com/electron-userland/electron-builder/commit/c2eb8c2)), closes [#951](https://github.com/electron-userland/electron-builder/issues/951)



<a name="10.3.0"></a>
# [10.3.0](https://github.com/electron-userland/electron-builder/compare/v10.2.0...v10.3.0) (2016-11-30)


### Bug Fixes

* Not a valid Win32 application ([5d4b747](https://github.com/electron-userland/electron-builder/commit/5d4b747)), closes [#844](https://github.com/electron-userland/electron-builder/issues/844)


### Features

* ability to disable hard links on a CI server ([92af262](https://github.com/electron-userland/electron-builder/commit/92af262))
* exclude yarn-error.log and .jshintrc, remove LICENSE outside of .app ([6c90f30](https://github.com/electron-userland/electron-builder/commit/6c90f30))



<a name="10.2.0"></a>
# [10.2.0](https://github.com/electron-userland/electron-builder/compare/v10.1.0...v10.2.0) (2016-11-29)


### Features

* **nsis:** use name instead of product name as inst dir ([640fea0](https://github.com/electron-userland/electron-builder/commit/640fea0)), closes [#926](https://github.com/electron-userland/electron-builder/issues/926) [#941](https://github.com/electron-userland/electron-builder/issues/941) [#810](https://github.com/electron-userland/electron-builder/issues/810) [#928](https://github.com/electron-userland/electron-builder/issues/928)



<a name="10.1.0"></a>
# [10.1.0](https://github.com/electron-userland/electron-builder/compare/v10.0.0...v10.1.0) (2016-11-28)


### Features

* use hardlinks if possible, do not create empty dirs ([3f97b86](https://github.com/electron-userland/electron-builder/commit/3f97b86)), closes [#732](https://github.com/electron-userland/electron-builder/issues/732)



<a name="10.0.0"></a>
# [10.0.0](https://github.com/electron-userland/electron-builder/compare/v9.2.0...v10.0.0) (2016-11-26)


### Bug Fixes

* Unable to build package because of asarUnpack ([e3cfa8e](https://github.com/electron-userland/electron-builder/commit/e3cfa8e)), closes [#937](https://github.com/electron-userland/electron-builder/issues/937)


### Features

* if only ignored patterns are specified — all not ignored files is copied ([a55c573](https://github.com/electron-userland/electron-builder/commit/a55c573)), closes [#927](https://github.com/electron-userland/electron-builder/issues/927)


### BREAKING CHANGES

* asar.unpackDir, asar.unpack, asar-unpack-dir, asar-unpack were removed — please use build.asarUnpack instead



<a name="9.2.0"></a>
# [9.2.0](https://github.com/electron-userland/electron-builder/compare/v9.1.0...v9.2.0) (2016-11-25)


### Features

* **nsis:** NSIS with oneClick set to true does not relaunch the app after update ([00a8d36](https://github.com/electron-userland/electron-builder/commit/00a8d36)), closes [#884](https://github.com/electron-userland/electron-builder/issues/884)
* **windows:** Windows Store support (AppX target) ([f4d7a2e](https://github.com/electron-userland/electron-builder/commit/f4d7a2e)), closes [#782](https://github.com/electron-userland/electron-builder/issues/782)



<a name="9.1.0"></a>
# [9.1.0](https://github.com/electron-userland/electron-builder/compare/v9.0.1...v9.1.0) (2016-11-19)


### Features

* electronDownload instead of download #921 ([8463bef](https://github.com/electron-userland/electron-builder/commit/8463bef))
* rename LICENSE from electron dist to LICENSE.electron.txt ([e05cd17](https://github.com/electron-userland/electron-builder/commit/e05cd17)), closes [#916](https://github.com/electron-userland/electron-builder/issues/916)



<a name="9.0.1"></a>
## [9.0.1](https://github.com/electron-userland/electron-builder/compare/v9.0.0...v9.0.1) (2016-11-19)


### Bug Fixes

* snap support, desktop integration attempt #509 ([223a6aa](https://github.com/electron-userland/electron-builder/commit/223a6aa))



<a name="9.0.0"></a>
# [9.0.0](https://github.com/electron-userland/electron-builder/compare/v8.7.0...v9.0.0) (2016-11-19)


### Bug Fixes

* **mac:** App rejected when Mac Developer certificate is in keychain #890 ([386853a](https://github.com/electron-userland/electron-builder/commit/386853a))


### Features

* **deb:** Replace ia32 arch name with i386 in package filename ([73e54c4](https://github.com/electron-userland/electron-builder/commit/73e54c4)), closes [#915](https://github.com/electron-userland/electron-builder/issues/915)
* **linux:** lowercased linux executable ([ff7a8c3](https://github.com/electron-userland/electron-builder/commit/ff7a8c3))


### BREAKING CHANGES

* **deb:** Replace ia32 arch name with i386 in package filename
* **linux:** Linux executable name is always lowercased



<a name="8.7.0"></a>
# [8.7.0](https://github.com/electron-userland/electron-builder/compare/v8.6.0...v8.7.0) (2016-11-18)


### Features

* **linux:** Build snap packages for Linux #509 ([1bd54f7](https://github.com/electron-userland/electron-builder/commit/1bd54f7))



<a name="8.6.0"></a>
# [8.6.0](https://github.com/electron-userland/electron-builder/compare/v8.5.3...v8.6.0) (2016-11-15)


### Bug Fixes

* Auto updater "error" event does not contain error message ([7be5391](https://github.com/electron-userland/electron-builder/commit/7be5391)), closes [#900](https://github.com/electron-userland/electron-builder/issues/900)
* auto-unpacked files are not copied ([5f2a1c6](https://github.com/electron-userland/electron-builder/commit/5f2a1c6)), closes [#843](https://github.com/electron-userland/electron-builder/issues/843)


### Features

* Surround [version]-[revision] with underscores rather than dashes in filenames ([1057499](https://github.com/electron-userland/electron-builder/commit/1057499)), closes [#803](https://github.com/electron-userland/electron-builder/issues/803)


### BREAKING CHANGES

* Debian binary package naming convention is [name]_[version]-[revision]_[arch].deb



<a name="8.5.3"></a>
## [8.5.3](https://github.com/electron-userland/electron-builder/compare/v8.5.2...v8.5.3) (2016-11-13)


### Bug Fixes

* **mas:** mas app crashing after signing ([87f5ea7](https://github.com/electron-userland/electron-builder/commit/87f5ea7)), closes [#897](https://github.com/electron-userland/electron-builder/issues/897)



<a name="8.5.2"></a>
## [8.5.2](https://github.com/electron-userland/electron-builder/compare/v8.5.1...v8.5.2) (2016-11-12)


### Bug Fixes

* **nsis:** NSIS installer "CHECK_APP_RUNNING" breaks if installer has same executable file name as app ([ec3c15d](https://github.com/electron-userland/electron-builder/commit/ec3c15d)), closes [#894](https://github.com/electron-userland/electron-builder/issues/894)



<a name="8.5.1"></a>
## [8.5.1](https://github.com/electron-userland/electron-builder/compare/v8.5.0...v8.5.1) (2016-11-12)


### Bug Fixes

* regression — additionalArgs is not passed to npm rebuild ([92ad554](https://github.com/electron-userland/electron-builder/commit/92ad554))



<a name="8.5.0"></a>
# [8.5.0](https://github.com/electron-userland/electron-builder/compare/v8.4.1...v8.5.0) (2016-11-12)


### Bug Fixes

* Auto updater "error" event does not contain error message ([1b52c94](https://github.com/electron-userland/electron-builder/commit/1b52c94)), closes [#900](https://github.com/electron-userland/electron-builder/issues/900)


### Features

* **api:** Get or Specify Final Build exe or dmg file names ([f31a20d](https://github.com/electron-userland/electron-builder/commit/f31a20d)), closes [#899](https://github.com/electron-userland/electron-builder/issues/899)



<a name="8.4.1"></a>
## [8.4.1](https://github.com/electron-userland/electron-builder/compare/v8.4.0...v8.4.1) (2016-11-12)


### Bug Fixes

* Changing Icons (not updating on dist output) ([b6951ad](https://github.com/electron-userland/electron-builder/commit/b6951ad)), closes [#840](https://github.com/electron-userland/electron-builder/issues/840)



<a name="8.4.0"></a>
# [8.4.0](https://github.com/electron-userland/electron-builder/compare/v8.3.0...v8.4.0) (2016-11-12)


### Features

* more performant and reliable npm rebuild ([20026f1](https://github.com/electron-userland/electron-builder/commit/20026f1))



<a name="8.3.0"></a>
# [8.3.0](https://github.com/electron-userland/electron-builder/compare/v8.2.1...v8.3.0) (2016-11-11)


### Features

* asarUnpack ([8a8ccad](https://github.com/electron-userland/electron-builder/commit/8a8ccad))



<a name="8.2.1"></a>
## [8.2.1](https://github.com/electron-userland/electron-builder/compare/v8.2.0...v8.2.1) (2016-11-11)


### Bug Fixes

* **linux:** report "Building ..." ([ff8a436](https://github.com/electron-userland/electron-builder/commit/ff8a436))
* No error if no valid cert to sign mac app ([22f73c0](https://github.com/electron-userland/electron-builder/commit/22f73c0)), closes [#897](https://github.com/electron-userland/electron-builder/issues/897)



<a name="8.2.0"></a>
# [8.2.0](https://github.com/electron-userland/electron-builder/compare/v8.1.0...v8.2.0) (2016-11-11)


### Bug Fixes

* App rejected when Mac Developer certificate is in keychain ([9edadb5](https://github.com/electron-userland/electron-builder/commit/9edadb5)), closes [#890](https://github.com/electron-userland/electron-builder/issues/890)


### Features

* ignore *.d.ts by default, include package.json in any case ([6ce683f](https://github.com/electron-userland/electron-builder/commit/6ce683f))



<a name="8.1.0"></a>
# [8.1.0](https://github.com/electron-userland/electron-builder/compare/v8.0.0...v8.1.0) (2016-11-10)


### Bug Fixes

* flatDependencies regression ([edc39a8](https://github.com/electron-userland/electron-builder/commit/edc39a8)), closes [#895](https://github.com/electron-userland/electron-builder/issues/895)


### Features

* install-app-deps rebuilds native deps for any project structure ([6532e9f](https://github.com/electron-userland/electron-builder/commit/6532e9f))



<a name="8.0.0"></a>
# [8.0.0](https://github.com/electron-userland/electron-builder/compare/v7.26.0...v8.0.0) (2016-11-10)


### Chores

* remove "osx" name support — use "mac" instead ([aa05ac0](https://github.com/electron-userland/electron-builder/commit/aa05ac0))


### Features

* nsis target for windows by default ([1bc8d57](https://github.com/electron-userland/electron-builder/commit/1bc8d57))
* rebuild native dependencies for any project structure ([b1ea8cd](https://github.com/electron-userland/electron-builder/commit/b1ea8cd))


### BREAKING CHANGES

* "nsis" target is default now. Not "squirrel" (Squirrel.Windows)
If you have existing app, please set "build.win.target" to "squirrel".
Auto-update — please see https://github.com/electron-userland/electron-builder/wiki/Auto-Update
* remove "osx" name support — use "mac" instead
* rebuild native dependencies for any project structure



<a name="7.26.0"></a>
# [7.26.0](https://github.com/electron-userland/electron-builder/compare/v7.25.0...v7.26.0) (2016-11-09)


### Features

* Yarn Support (rebuild) ([94cc7be](https://github.com/electron-userland/electron-builder/commit/94cc7be)), closes [#861](https://github.com/electron-userland/electron-builder/issues/861)


### Performance Improvements

* dev or extra deps ([e89934d](https://github.com/electron-userland/electron-builder/commit/e89934d))
* walk dir ([525bb91](https://github.com/electron-userland/electron-builder/commit/525bb91))



<a name="7.25.0"></a>
# [7.25.0](https://github.com/electron-userland/electron-builder/compare/v7.24.2...v7.25.0) (2016-11-08)


### Features

* **nsis:** Specify install dir based on architecture (#889) ([895411f](https://github.com/electron-userland/electron-builder/commit/895411f))



<a name="7.24.2"></a>
## [7.24.2](https://github.com/electron-userland/electron-builder/compare/v7.24.1...v7.24.2) (2016-11-07)


### Bug Fixes

* Cannot use NSIS StrFunc header ([4cbdc31](https://github.com/electron-userland/electron-builder/commit/4cbdc31)), closes [#888](https://github.com/electron-userland/electron-builder/issues/888)



<a name="7.24.1"></a>
## [7.24.1](https://github.com/electron-userland/electron-builder/compare/v7.24.0...v7.24.1) (2016-11-07)


### Bug Fixes

* github as a provider — latest.yml is not published ([e920584](https://github.com/electron-userland/electron-builder/commit/e920584)), closes [#868](https://github.com/electron-userland/electron-builder/issues/868)



<a name="7.24.0"></a>
# [7.24.0](https://github.com/electron-userland/electron-builder/compare/v7.23.2...v7.24.0) (2016-11-06)


### Features

* **mac:** macOS pkg installer ([265ad20](https://github.com/electron-userland/electron-builder/commit/265ad20)), closes [#52](https://github.com/electron-userland/electron-builder/issues/52)


### Performance Improvements

* **mas:** flat on electron-builder side ([adacf1e](https://github.com/electron-userland/electron-builder/commit/adacf1e))



<a name="7.23.2"></a>
## [7.23.2](https://github.com/electron-userland/electron-builder/compare/v7.23.1...v7.23.2) (2016-11-06)


### Bug Fixes

* github as a provider — latest.yml is not generated ([9d31b42](https://github.com/electron-userland/electron-builder/commit/9d31b42)), closes [#868](https://github.com/electron-userland/electron-builder/issues/868)



<a name="7.23.1"></a>
## [7.23.1](https://github.com/electron-userland/electron-builder/compare/v7.23.0...v7.23.1) (2016-11-05)


### Bug Fixes

* typo in handling of npmArgs (#883) ([f4728c3](https://github.com/electron-userland/electron-builder/commit/f4728c3))



<a name="7.23.0"></a>
# [7.23.0](https://github.com/electron-userland/electron-builder/compare/v7.22.1...v7.23.0) (2016-11-05)


### Bug Fixes

* "contains executable code" — change log to debug ([08913b6](https://github.com/electron-userland/electron-builder/commit/08913b6)), closes [#879](https://github.com/electron-userland/electron-builder/issues/879)


### Features

* add ability to specify additional npm rebuild args (#881) ([eec5b32](https://github.com/electron-userland/electron-builder/commit/eec5b32))
* use cache dir per OS convention ([786250c](https://github.com/electron-userland/electron-builder/commit/786250c))
* use cache dir per OS convention ([20a247c](https://github.com/electron-userland/electron-builder/commit/20a247c))


### Performance Improvements

* walk dir, limit concurrency to 8 (was 32) ([540ee5e](https://github.com/electron-userland/electron-builder/commit/540ee5e))



<a name="7.22.1"></a>
## [7.22.1](https://github.com/electron-userland/electron-builder/compare/v7.22.0...v7.22.1) (2016-11-05)


### Bug Fixes

* update v8 headers URL (#878) ([3bc99e1](https://github.com/electron-userland/electron-builder/commit/3bc99e1))



<a name="7.22.0"></a>
# [7.22.0](https://github.com/electron-userland/electron-builder/compare/v7.21.0...v7.22.0) (2016-11-04)


### Features

* ignore __tests__, tests, example, examples by default ([970caf4](https://github.com/electron-userland/electron-builder/commit/970caf4)), closes [#823](https://github.com/electron-userland/electron-builder/issues/823)



<a name="7.21.0"></a>
# [7.21.0](https://github.com/electron-userland/electron-builder/compare/v7.20.0...v7.21.0) (2016-11-04)


### Bug Fixes

* do not use --no-bin-links by default due to npm bug ([7ab1ba1](https://github.com/electron-userland/electron-builder/commit/7ab1ba1)), closes [#869](https://github.com/electron-userland/electron-builder/issues/869)


### Features

* GitHub publish provider ([9e18cb1](https://github.com/electron-userland/electron-builder/commit/9e18cb1)), closes [#868](https://github.com/electron-userland/electron-builder/issues/868)



<a name="7.20.0"></a>
# [7.20.0](https://github.com/electron-userland/electron-builder/compare/v7.19.1...v7.20.0) (2016-11-03)


### Bug Fixes

* RangeError: Maximum call stack size exceeded ([c5627f8](https://github.com/electron-userland/electron-builder/commit/c5627f8)), closes [#826](https://github.com/electron-userland/electron-builder/issues/826)


### Features

* **linux:** be more restrictive with executable name ([c3136ad](https://github.com/electron-userland/electron-builder/commit/c3136ad)), closes [#806](https://github.com/electron-userland/electron-builder/issues/806)



<a name="7.19.1"></a>
## [7.19.1](https://github.com/electron-userland/electron-builder/compare/v7.19.0...v7.19.1) (2016-11-03)


### Bug Fixes

* **nsis:** machine-wide assisted NSIS installer launches application as administrator ([7ea3d62](https://github.com/electron-userland/electron-builder/commit/7ea3d62)), closes [#864](https://github.com/electron-userland/electron-builder/issues/864)



<a name="7.19.0"></a>
# [7.19.0](https://github.com/electron-userland/electron-builder/compare/v7.18.1...v7.19.0) (2016-11-03)


### Features

* rebuild with --no-bin-links option ([cf24b01](https://github.com/electron-userland/electron-builder/commit/cf24b01)), closes [#869](https://github.com/electron-userland/electron-builder/issues/869)



<a name="7.18.1"></a>
## [7.18.1](https://github.com/electron-userland/electron-builder/compare/v7.18.0...v7.18.1) (2016-11-02)


### Bug Fixes

* **AppImage:** AppImages fail to run if appimaged process is running ([224c00e](https://github.com/electron-userland/electron-builder/commit/224c00e)), closes [#827](https://github.com/electron-userland/electron-builder/issues/827)



<a name="7.18.0"></a>
# [7.18.0](https://github.com/electron-userland/electron-builder/compare/v7.17.1...v7.18.0) (2016-11-02)


### Features

* **nsis:** assisted installer — respect /allusers ([4536e91](https://github.com/electron-userland/electron-builder/commit/4536e91)), closes [#845](https://github.com/electron-userland/electron-builder/issues/845)



<a name="7.17.1"></a>
## [7.17.1](https://github.com/electron-userland/electron-builder/compare/v7.17.0...v7.17.1) (2016-11-02)


### Bug Fixes

* restore dmg.title support ([bc64791](https://github.com/electron-userland/electron-builder/commit/bc64791)), closes [#834](https://github.com/electron-userland/electron-builder/issues/834)
* **nsis:** machine-wide one-click NSIS installer launches application as administrator ([4ac12bf](https://github.com/electron-userland/electron-builder/commit/4ac12bf)), closes [#864](https://github.com/electron-userland/electron-builder/issues/864)



<a name="7.17.0"></a>
# [7.17.0](https://github.com/electron-userland/electron-builder/compare/v7.16.0...v7.17.0) (2016-11-01)


### Features

* generic publish provider ([ad3f299](https://github.com/electron-userland/electron-builder/commit/ad3f299)), closes [#529](https://github.com/electron-userland/electron-builder/issues/529)



<a name="7.16.0"></a>
# [7.16.0](https://github.com/electron-userland/electron-builder/compare/v7.15.2...v7.16.0) (2016-10-31)


### Bug Fixes

* Code Sign with Mac Developer certificates ([7ab9ca6](https://github.com/electron-userland/electron-builder/commit/7ab9ca6)), closes [#812](https://github.com/electron-userland/electron-builder/issues/812)
* attempt to fix "old version dir is empty" ([5c7c4ac](https://github.com/electron-userland/electron-builder/commit/5c7c4ac))


### Features

* **nsis-auto-updater:** auto install on quit ([a3bba92](https://github.com/electron-userland/electron-builder/commit/a3bba92))
* initial yarn support (avoid --cache-min) ([ba1cd4b](https://github.com/electron-userland/electron-builder/commit/ba1cd4b)), closes [#861](https://github.com/electron-userland/electron-builder/issues/861)
* use warning emoji instead of plain text ([772b297](https://github.com/electron-userland/electron-builder/commit/772b297))



<a name="7.15.2"></a>
## [7.15.2](https://github.com/electron-userland/electron-builder/compare/v7.15.1...v7.15.2) (2016-10-28)


### Bug Fixes

* DMG background resource must be resolved using project dir ([8d37b7e](https://github.com/electron-userland/electron-builder/commit/8d37b7e)), closes [#858](https://github.com/electron-userland/electron-builder/issues/858)
* prevent ".directories.output option ignored in package.json" ([e748369](https://github.com/electron-userland/electron-builder/commit/e748369)), closes [#852](https://github.com/electron-userland/electron-builder/issues/852)



<a name="7.15.1"></a>
## [7.15.1](https://github.com/electron-userland/electron-builder/compare/v7.15.0...v7.15.1) (2016-10-28)


### Bug Fixes

* bintray repo setting has no effect, always defaults to generic ([48051cb](https://github.com/electron-userland/electron-builder/commit/48051cb)), closes [#857](https://github.com/electron-userland/electron-builder/issues/857)



<a name="7.15.0"></a>
# [7.15.0](https://github.com/electron-userland/electron-builder/compare/v7.14.2...v7.15.0) (2016-10-27)


### Bug Fixes

* rename .app-update.json to app-update.yml #529 ([f69d202](https://github.com/electron-userland/electron-builder/commit/f69d202))
* use own copy of bluebird library (scoped) ([686dc6b](https://github.com/electron-userland/electron-builder/commit/686dc6b))
* **dmg:** do not use -quiet #854 ([74e2006](https://github.com/electron-userland/electron-builder/commit/74e2006))


### Features

*  add ability to specify bintray user ([716ebc6](https://github.com/electron-userland/electron-builder/commit/716ebc6)), closes [#848](https://github.com/electron-userland/electron-builder/issues/848)
* WIN_CSC_KEY_PASSWORD #822 ([99a5f0a](https://github.com/electron-userland/electron-builder/commit/99a5f0a))
* handle available native deps when building on non-native platforms ([81c6bdf](https://github.com/electron-userland/electron-builder/commit/81c6bdf)), closes [#842](https://github.com/electron-userland/electron-builder/issues/842)
* warn when skipping mac app signing due to unsupported platform ([7c810a7](https://github.com/electron-userland/electron-builder/commit/7c810a7)), closes [#849](https://github.com/electron-userland/electron-builder/issues/849)


### Performance Improvements

* lazy imports, get rid of tsAwaiter ([a33e004](https://github.com/electron-userland/electron-builder/commit/a33e004))



<a name="7.14.2"></a>
## [7.14.2](https://github.com/electron-userland/electron-builder/compare/v7.14.1...v7.14.2) (2016-10-18)


### Bug Fixes

* **nsis:** EULA ([a0e7131](https://github.com/electron-userland/electron-builder/commit/a0e7131)), closes [#829](https://github.com/electron-userland/electron-builder/issues/829)



<a name="7.14.1"></a>
## [7.14.1](https://github.com/electron-userland/electron-builder/compare/v7.14.0...v7.14.1) (2016-10-17)


### Bug Fixes

* **bintray:** do not require explicit publish=always (regression) #529 ([6f20e8d](https://github.com/electron-userland/electron-builder/commit/6f20e8d))



<a name="7.14.0"></a>
# [7.14.0](https://github.com/electron-userland/electron-builder/compare/v7.13.1...v7.14.0) (2016-10-17)


### Features

* Code signing for windows and mac in macOS ([d238635](https://github.com/electron-userland/electron-builder/commit/d238635)), closes [#822](https://github.com/electron-userland/electron-builder/issues/822)



<a name="7.13.1"></a>
## [7.13.1](https://github.com/electron-userland/electron-builder/compare/v7.13.0...v7.13.1) (2016-10-16)


### Bug Fixes

* **nsis:** correctly await update info writing and archive creation #529 ([b1ae7d5](https://github.com/electron-userland/electron-builder/commit/b1ae7d5))



<a name="7.13.0"></a>
# [7.13.0](https://github.com/electron-userland/electron-builder/compare/v7.12.2...v7.13.0) (2016-10-13)


### Features

* **dmg:** check appId, dmg.icon, dmg.contents.path ([36ed865](https://github.com/electron-userland/electron-builder/commit/36ed865)), closes [#821](https://github.com/electron-userland/electron-builder/issues/821)



<a name="7.12.2"></a>
## [7.12.2](https://github.com/electron-userland/electron-builder/compare/v7.12.1...v7.12.2) (2016-10-11)


### Bug Fixes

* **dmg:** Perl error when building DMG ([2f1a6e7](https://github.com/electron-userland/electron-builder/commit/2f1a6e7)), closes [#815](https://github.com/electron-userland/electron-builder/issues/815)



<a name="7.12.1"></a>
## [7.12.1](https://github.com/electron-userland/electron-builder/compare/v7.12.0...v7.12.1) (2016-10-10)


### Bug Fixes

* **squirrel.windows:** include output to error message #804 ([5762d0f](https://github.com/electron-userland/electron-builder/commit/5762d0f))



<a name="7.12.0"></a>
# [7.12.0](https://github.com/electron-userland/electron-builder/compare/v7.11.4...v7.12.0) (2016-10-10)


### Features

* bintray publisher configuration ([1a9caa8](https://github.com/electron-userland/electron-builder/commit/1a9caa8))



<a name="7.11.4"></a>
## [7.11.4](https://github.com/electron-userland/electron-builder/compare/v7.11.3...v7.11.4) (2016-10-07)


### Bug Fixes

* **dmg:** type: "file" is not required anymore for app file ([96d9206](https://github.com/electron-userland/electron-builder/commit/96d9206))



<a name="7.11.3"></a>
## [7.11.3](https://github.com/electron-userland/electron-builder/compare/v7.11.2...v7.11.3) (2016-10-07)


### Bug Fixes

* **nsis:** broken nsis ([993dac7](https://github.com/electron-userland/electron-builder/commit/993dac7)), closes [#800](https://github.com/electron-userland/electron-builder/issues/800)



<a name="7.11.2"></a>
## [7.11.2](https://github.com/electron-userland/electron-builder/compare/v7.11.1...v7.11.2) (2016-10-06)


### Bug Fixes

* make install-app-deps also handle skip build flag ([3e34110](https://github.com/electron-userland/electron-builder/commit/3e34110)), closes [#797](https://github.com/electron-userland/electron-builder/issues/797)



<a name="7.11.1"></a>
## [7.11.1](https://github.com/electron-userland/electron-builder/compare/v7.11.0...v7.11.1) (2016-10-06)


### Bug Fixes

* **mac:** Mac archive tar.* doesn't run after extraction ([a185040](https://github.com/electron-userland/electron-builder/commit/a185040)), closes [#784](https://github.com/electron-userland/electron-builder/issues/784)



<a name="7.11.0"></a>
# [7.11.0](https://github.com/electron-userland/electron-builder/compare/v7.10.3...v7.11.0) (2016-10-06)


### Features

* make a setting for --build-from-option flag ([4898eb1](https://github.com/electron-userland/electron-builder/commit/4898eb1)), closes [#787](https://github.com/electron-userland/electron-builder/issues/787) [#790](https://github.com/electron-userland/electron-builder/issues/790)



<a name="7.10.3"></a>
## [7.10.3](https://github.com/electron-userland/electron-builder/compare/v7.10.2...v7.10.3) (2016-10-05)


### Bug Fixes

* **mac:** background image isn't displayed in macOS sierra ([c16ecad](https://github.com/electron-userland/electron-builder/commit/c16ecad)), closes [#789](https://github.com/electron-userland/electron-builder/issues/789)



<a name="7.10.2"></a>
## [7.10.2](https://github.com/electron-userland/electron-builder/compare/v7.10.1...v7.10.2) (2016-10-02)


### Bug Fixes

* **deb:** Can't run generated app due to wrong permission ([c45adca](https://github.com/electron-userland/electron-builder/commit/c45adca)), closes [#786](https://github.com/electron-userland/electron-builder/issues/786)
* **nsis:** do not delete app data by default ([64937b2](https://github.com/electron-userland/electron-builder/commit/64937b2)), closes [#769](https://github.com/electron-userland/electron-builder/issues/769)



<a name="7.10.1"></a>
## [7.10.1](https://github.com/electron-userland/electron-builder/compare/v7.10.0...v7.10.1) (2016-09-30)


### Bug Fixes

* update fpm to 1.6.3 ([7a5252c](https://github.com/electron-userland/electron-builder/commit/7a5252c))



<a name="7.10.0"></a>
# [7.10.0](https://github.com/electron-userland/electron-builder/compare/v7.9.0...v7.10.0) (2016-09-25)


### Features

* Support for Electron for ARM ([6735da5](https://github.com/electron-userland/electron-builder/commit/6735da5)), closes [#778](https://github.com/electron-userland/electron-builder/issues/778)



<a name="7.9.0"></a>
# [7.9.0](https://github.com/electron-userland/electron-builder/compare/v7.8.0...v7.9.0) (2016-09-23)


### Features

* support --extraMetadata.directories ([1a310e3](https://github.com/electron-userland/electron-builder/commit/1a310e3))



<a name="7.8.0"></a>
# [7.8.0](https://github.com/electron-userland/electron-builder/compare/v7.7.0...v7.8.0) (2016-09-23)


### Features

* prune even if two-package.json structure not used ([26b8dac](https://github.com/electron-userland/electron-builder/commit/26b8dac)), closes [#770](https://github.com/electron-userland/electron-builder/issues/770)



<a name="7.7.0"></a>
# [7.7.0](https://github.com/electron-userland/electron-builder/compare/v7.6.0...v7.7.0) (2016-09-23)


### Features

* option to use appId to identify package instead of name #773 ([6f3d365](https://github.com/electron-userland/electron-builder/commit/6f3d365)), closes [#753](https://github.com/electron-userland/electron-builder/issues/753)



<a name="7.6.0"></a>
# [7.6.0](https://github.com/electron-userland/electron-builder/compare/v7.5.0...v7.6.0) (2016-09-22)


### Features

* support --extraMetadata.build.directories ([44ad719](https://github.com/electron-userland/electron-builder/commit/44ad719))



<a name="7.5.0"></a>
# [7.5.0](https://github.com/electron-userland/electron-builder/compare/v7.4.0...v7.5.0) (2016-09-21)


### Features

* **nsis:** option NSIS warnings as errors ([9762991](https://github.com/electron-userland/electron-builder/commit/9762991)), closes [#763](https://github.com/electron-userland/electron-builder/issues/763)



<a name="7.4.0"></a>
# [7.4.0](https://github.com/electron-userland/electron-builder/compare/v7.3.0...v7.4.0) (2016-09-20)


### Features

* specify path to custom Electron build (Electron.app) ([3132610](https://github.com/electron-userland/electron-builder/commit/3132610)), closes [#760](https://github.com/electron-userland/electron-builder/issues/760)



<a name="7.3.0"></a>
# [7.3.0](https://github.com/electron-userland/electron-builder/compare/v7.2.0...v7.3.0) (2016-09-19)


### Features

* support asar in package.json's `main` even when not packaging to asar during the build ([d9bc4e0](https://github.com/electron-userland/electron-builder/commit/d9bc4e0)), closes [#759](https://github.com/electron-userland/electron-builder/issues/759)



<a name="7.2.0"></a>
# [7.2.0](https://github.com/electron-userland/electron-builder/compare/v7.1.0...v7.2.0) (2016-09-19)


### Features

* ignore .gitignore,.gitattributes,.editorconfig,.idea by default ([70abaa3](https://github.com/electron-userland/electron-builder/commit/70abaa3))



<a name="7.1.0"></a>
# [7.1.0](https://github.com/electron-userland/electron-builder/compare/v7.0.1...v7.1.0) (2016-09-19)


### Bug Fixes

* **mac:** forbid "Mac Developer" cert ([32a59f7](https://github.com/electron-userland/electron-builder/commit/32a59f7))


### Features

* use iconutil on macOS to convert icns to iconset ([1ad417f](https://github.com/electron-userland/electron-builder/commit/1ad417f))



<a name="7.0.1"></a>
## [7.0.1](https://github.com/electron-userland/electron-builder/compare/v7.0.0...v7.0.1) (2016-09-18)


### Bug Fixes

* Don't throw an error if version doesn't start with `v´ ([ec8e69e](https://github.com/electron-userland/electron-builder/commit/ec8e69e)), closes [#743](https://github.com/electron-userland/electron-builder/issues/743)



<a name="7.0.0"></a>
# [7.0.0](https://github.com/electron-userland/electron-builder/compare/v6.7.7...v7.0.0) (2016-09-16)


### Bug Fixes

* **deb:** 64 bit deb release artifact filename ([84225d7](https://github.com/electron-userland/electron-builder/commit/84225d7)), closes [#747](https://github.com/electron-userland/electron-builder/issues/747)


### BREAKING CHANGES

* **deb:** x64 deb now has `amd64` arch suffix (previously was no prefix for x64).



<a name="6.7.7"></a>
## [6.7.7](https://github.com/electron-userland/electron-builder/compare/v6.7.6...v6.7.7) (2016-09-16)


### Bug Fixes

* **nsis:** handle unquoted UninstallString #735 ([77f3277](https://github.com/electron-userland/electron-builder/commit/77f3277))



<a name="6.7.6"></a>
## [6.7.6](https://github.com/electron-userland/electron-builder/compare/v6.7.5...v6.7.6) (2016-09-15)


### Bug Fixes

* **nsis:** apostrophe in product name ([63c67ef](https://github.com/electron-userland/electron-builder/commit/63c67ef)), closes [#750](https://github.com/electron-userland/electron-builder/issues/750)



<a name="6.7.5"></a>
## [6.7.5](https://github.com/electron-userland/electron-builder/compare/v6.7.4...v6.7.5) (2016-09-14)


### Bug Fixes

* **nsis:** _? must be last #735 ([517a90b](https://github.com/electron-userland/electron-builder/commit/517a90b))



<a name="6.7.4"></a>
## [6.7.4](https://github.com/electron-userland/electron-builder/compare/v6.7.3...v6.7.4) (2016-09-14)


### Bug Fixes

* **mac:** throw sign error correctly ([cca23b4](https://github.com/electron-userland/electron-builder/commit/cca23b4)), closes [#737](https://github.com/electron-userland/electron-builder/issues/737)
* **nsis:** get InstallLocation from UninstallerString if not found #735 ([431922e](https://github.com/electron-userland/electron-builder/commit/431922e))



<a name="6.7.3"></a>
## [6.7.3](https://github.com/electron-userland/electron-builder/compare/v6.7.2...v6.7.3) (2016-09-11)


### Bug Fixes

* proxy config from npm #585 ([29f6436](https://github.com/electron-userland/electron-builder/commit/29f6436))
* **nsis:** correct fix of #722 (NSIS Installer Not Working on Second Invocation) ([e35933d](https://github.com/electron-userland/electron-builder/commit/e35933d)), closes [#722](https://github.com/electron-userland/electron-builder/issues/722)



<a name="6.7.2"></a>
## [6.7.2](https://github.com/electron-userland/electron-builder/compare/v6.7.1...v6.7.2) (2016-09-11)


### Bug Fixes

* Build fails with TimeOut exception: proxy ([dd61408](https://github.com/electron-userland/electron-builder/commit/dd61408)), closes [#585](https://github.com/electron-userland/electron-builder/issues/585)



<a name="6.7.1"></a>
## [6.7.1](https://github.com/electron-userland/electron-builder/compare/v6.7.0...v6.7.1) (2016-09-10)


### Bug Fixes

* **nsis:** remove old < 6.4.1 versions ([cb538c1](https://github.com/electron-userland/electron-builder/commit/cb538c1)), closes [#735](https://github.com/electron-userland/electron-builder/issues/735)



<a name="6.7.0"></a>
# [6.7.0](https://github.com/electron-userland/electron-builder/compare/v6.6.1...v6.7.0) (2016-09-10)


### Features

* Hidden 'dotfiles' within an extraResources folder aren't copied ([7877f71](https://github.com/electron-userland/electron-builder/commit/7877f71)), closes [#733](https://github.com/electron-userland/electron-builder/issues/733)



<a name="6.6.1"></a>
## [6.6.1](https://github.com/electron-userland/electron-builder/compare/v6.6.0...v6.6.1) (2016-09-09)


### Bug Fixes

* **nsis:** no app icon in Add/Remove program ([e6c1efe](https://github.com/electron-userland/electron-builder/commit/e6c1efe)), closes [#738](https://github.com/electron-userland/electron-builder/issues/738)



<a name="6.6.0"></a>
# [6.6.0](https://github.com/electron-userland/electron-builder/compare/v6.5.2...v6.6.0) (2016-09-09)


### Features

* support CFBundleTypeRole for MacOS CFBundleURLTypes ([888581a](https://github.com/electron-userland/electron-builder/commit/888581a)), closes [#736](https://github.com/electron-userland/electron-builder/issues/736)



<a name="6.5.2"></a>
## [6.5.2](https://github.com/electron-userland/electron-builder/compare/v6.5.1...v6.5.2) (2016-09-08)


### Bug Fixes

* Version `6.3.5` makes build pass even when it fails ([a1b2b0e](https://github.com/electron-userland/electron-builder/commit/a1b2b0e)), closes [#721](https://github.com/electron-userland/electron-builder/issues/721)
* **mas:** Warning when using entitlements.mas.plist ([5031116](https://github.com/electron-userland/electron-builder/commit/5031116)), closes [#729](https://github.com/electron-userland/electron-builder/issues/729)



<a name="6.5.1"></a>
## [6.5.1](https://github.com/electron-userland/electron-builder/compare/v6.5.0...v6.5.1) (2016-09-07)


### Bug Fixes

* **nsis:** uninstaller path should be not quoted #722 ([63ee4cf](https://github.com/electron-userland/electron-builder/commit/63ee4cf))



<a name="6.5.0"></a>
# [6.5.0](https://github.com/electron-userland/electron-builder/compare/v6.4.1...v6.5.0) (2016-09-07)


### Bug Fixes

* Cleanup fail after build ([2e35205](https://github.com/electron-userland/electron-builder/commit/2e35205)), closes [#724](https://github.com/electron-userland/electron-builder/issues/724)
* **nsis:** finally — NSIS Installer Not Working on Second Invocation ([211d63f](https://github.com/electron-userland/electron-builder/commit/211d63f)), closes [#722](https://github.com/electron-userland/electron-builder/issues/722)


### Features

* **linux:** Categories desktop entry ([87616c0](https://github.com/electron-userland/electron-builder/commit/87616c0)), closes [#727](https://github.com/electron-userland/electron-builder/issues/727) [#641](https://github.com/electron-userland/electron-builder/issues/641)



<a name="6.4.1"></a>
## [6.4.1](https://github.com/electron-userland/electron-builder/compare/v6.4.0...v6.4.1) (2016-09-04)


### Bug Fixes

* NSIS Installer Not Working on Second Invocation ([0f1869b](https://github.com/electron-userland/electron-builder/commit/0f1869b))
* NSIS Installer Not Working on Second Invocation #722 ([1b90ec6](https://github.com/electron-userland/electron-builder/commit/1b90ec6))



<a name="6.4.0"></a>
# [6.4.0](https://github.com/electron-userland/electron-builder/compare/v6.3.5...v6.4.0) (2016-09-02)


### Features

* bintray publisher ([138e8e2](https://github.com/electron-userland/electron-builder/commit/138e8e2)), closes [#577](https://github.com/electron-userland/electron-builder/issues/577)



<a name="6.3.5"></a>
## [6.3.5](https://github.com/electron-userland/electron-builder/compare/v6.3.4...v6.3.5) (2016-09-02)


### Bug Fixes

* incorrect log message "ci detected" ([eb827ea](https://github.com/electron-userland/electron-builder/commit/eb827ea))



<a name="6.3.4"></a>
## [6.3.4](https://github.com/electron-userland/electron-builder/compare/v6.3.3...v6.3.4) (2016-09-02)


### Bug Fixes

* **squirrel.windows:** remove RELEASES because Squirrel.Windows doesn't check ([0c592e8](https://github.com/electron-userland/electron-builder/commit/0c592e8)), closes [#713](https://github.com/electron-userland/electron-builder/issues/713)



<a name="6.3.3"></a>
## [6.3.3](https://github.com/electron-userland/electron-builder/compare/v6.3.2...v6.3.3) (2016-09-01)


### Bug Fixes

* **squirrel.windows:** use GH_TOKEN ([e102e3e](https://github.com/electron-userland/electron-builder/commit/e102e3e)), closes [#714](https://github.com/electron-userland/electron-builder/issues/714)



<a name="6.3.2"></a>
## [6.3.2](https://github.com/electron-userland/electron-builder/compare/v6.3.1...v6.3.2) (2016-09-01)


### Bug Fixes

* **mac:** build mac targets on non-macOs ([1398af4](https://github.com/electron-userland/electron-builder/commit/1398af4))
* **squirrel.windows:** The base package release does not exist ([3b1ad57](https://github.com/electron-userland/electron-builder/commit/3b1ad57)), closes [#713](https://github.com/electron-userland/electron-builder/issues/713)



<a name="6.3.1"></a>
## [6.3.1](https://github.com/electron-userland/electron-builder/compare/v6.3.0...v6.3.1) (2016-08-30)


### Bug Fixes

* **nsis:** NSIS perMachine fails if UAC prompt is enabled ([b739f42](https://github.com/electron-userland/electron-builder/commit/b739f42)), closes [#712](https://github.com/electron-userland/electron-builder/issues/712)
* **nsis:** set locale id for legalTrademarks ([91addfe](https://github.com/electron-userland/electron-builder/commit/91addfe)), closes [#672](https://github.com/electron-userland/electron-builder/issues/672)



<a name="6.3.0"></a>
# [6.3.0](https://github.com/electron-userland/electron-builder/compare/v6.2.0...v6.3.0) (2016-08-29)


### Bug Fixes

* **nsis:** no custom icon ([b7b18bc](https://github.com/electron-userland/electron-builder/commit/b7b18bc))


### Features

* **nsis:** assisted per-machine only installer ([a4eeade](https://github.com/electron-userland/electron-builder/commit/a4eeade))



<a name="6.2.0"></a>
# [6.2.0](https://github.com/electron-userland/electron-builder/compare/v6.1.0...v6.2.0) (2016-08-29)


### Features

* **mac:** rename electron.icns to productName.icns ([8fa482e](https://github.com/electron-userland/electron-builder/commit/8fa482e))



<a name="6.1.0"></a>
# [6.1.0](https://github.com/electron-userland/electron-builder/compare/v6.0.3...v6.1.0) (2016-08-29)


### Features

* A crossplatform way to create file associations ([f8840e1](https://github.com/electron-userland/electron-builder/commit/f8840e1)), closes [#409](https://github.com/electron-userland/electron-builder/issues/409)



<a name="6.0.3"></a>
## [6.0.3](https://github.com/electron-userland/electron-builder/compare/v6.0.2...v6.0.3) (2016-08-29)


### Bug Fixes

* **squirrel.windows:** stdout maxBuffer exceeded ([0b84868](https://github.com/electron-userland/electron-builder/commit/0b84868)), closes [#709](https://github.com/electron-userland/electron-builder/issues/709)



<a name="6.0.2"></a>
## [6.0.2](https://github.com/electron-userland/electron-builder/compare/v6.0.1...v6.0.2) (2016-08-27)


### Bug Fixes

* pattern **/*.js still copies all files ([51309bf](https://github.com/electron-userland/electron-builder/commit/51309bf)), closes [#701](https://github.com/electron-userland/electron-builder/issues/701)



<a name="6.0.1"></a>
## [6.0.1](https://github.com/electron-userland/electron-builder/compare/v6.0.0...v6.0.1) (2016-08-27)


### Bug Fixes

* close write steam on finish ([a6b7573](https://github.com/electron-userland/electron-builder/commit/a6b7573)), closes [#706](https://github.com/electron-userland/electron-builder/issues/706)



<a name="6.0.0"></a>
# [6.0.0](https://github.com/electron-userland/electron-builder/compare/v5.35.0...v6.0.0) (2016-08-27)


### Bug Fixes

* add undocumented dereference as workaround of #675 ([9fe326d](https://github.com/electron-userland/electron-builder/commit/9fe326d))
* rename linux to linux-unpacked #670 ([5d404ea](https://github.com/electron-userland/electron-builder/commit/5d404ea))


### Features

* set AppImage as default target for Linux ([8f55a2d](https://github.com/electron-userland/electron-builder/commit/8f55a2d))


### BREAKING CHANGES

* default target for Linux changed from `deb` to `AppImage`



<a name="5.35.0"></a>
# [5.35.0](https://github.com/electron-userland/electron-builder/compare/v5.34.1...v5.35.0) (2016-08-26)


### Features

* support from/to paths in file patterns for extraFiles and extraResources ([308438f](https://github.com/electron-userland/electron-builder/commit/308438f)), closes [#650](https://github.com/electron-userland/electron-builder/issues/650)



<a name="5.34.1"></a>
## [5.34.1](https://github.com/electron-userland/electron-builder/compare/v5.34.0...v5.34.1) (2016-08-22)


### Bug Fixes

* auto-unpack doesn't create file parent dirs ([26c8360](https://github.com/electron-userland/electron-builder/commit/26c8360)), closes [#689](https://github.com/electron-userland/electron-builder/issues/689)



<a name="5.34.0"></a>
# [5.34.0](https://github.com/electron-userland/electron-builder/compare/v5.33.0...v5.34.0) (2016-08-22)


### Bug Fixes

* Getting AppVeyor to Generate an Installer (Build Artifacts) ([bc9d437](https://github.com/electron-userland/electron-builder/commit/bc9d437)), closes [#674](https://github.com/electron-userland/electron-builder/issues/674)


### Features

* custom app scheme ([b7121c5](https://github.com/electron-userland/electron-builder/commit/b7121c5)), closes [#575](https://github.com/electron-userland/electron-builder/issues/575)



<a name="5.33.0"></a>
# [5.33.0](https://github.com/electron-userland/electron-builder/compare/v5.32.1...v5.33.0) (2016-08-22)


### Features

* add node-gyp-rebuild #683 ([e3a5899](https://github.com/electron-userland/electron-builder/commit/e3a5899))



<a name="5.32.1"></a>
## [5.32.1](https://github.com/electron-userland/electron-builder/compare/v5.32.0...v5.32.1) (2016-08-20)


### Bug Fixes

* XDG_DATA_DIRS is missing when starting AppImage on Fedora 24 ([92d4895](https://github.com/electron-userland/electron-builder/commit/92d4895)), closes [#682](https://github.com/electron-userland/electron-builder/issues/682)



<a name="5.32.0"></a>
# [5.32.0](https://github.com/electron-userland/electron-builder/compare/v5.31.1...v5.32.0) (2016-08-20)


### Features

* nodeGypRebuild ([6d433ad](https://github.com/electron-userland/electron-builder/commit/6d433ad)), closes [#683](https://github.com/electron-userland/electron-builder/issues/683)



<a name="5.31.1"></a>
## [5.31.1](https://github.com/electron-userland/electron-builder/compare/v5.31.0...v5.31.1) (2016-08-20)


### Bug Fixes

* pass --build-from-source to force native dep compilation ([ef5f146](https://github.com/electron-userland/electron-builder/commit/ef5f146)), closes [#647](https://github.com/electron-userland/electron-builder/issues/647)



<a name="5.31.0"></a>
# [5.31.0](https://github.com/electron-userland/electron-builder/compare/v5.30.0...v5.31.0) (2016-08-20)


### Features

* **nsis:** per-machine installer automatically removes per-user installation ([834434c](https://github.com/electron-userland/electron-builder/commit/834434c)), closes [#621](https://github.com/electron-userland/electron-builder/issues/621) [#672](https://github.com/electron-userland/electron-builder/issues/672)



<a name="5.30.0"></a>
# [5.30.0](https://github.com/electron-userland/electron-builder/compare/v5.29.0...v5.30.0) (2016-08-19)


### Features

* **nsis:** one-click installer automatically removes old version #621 ([682ddde](https://github.com/electron-userland/electron-builder/commit/682ddde))



<a name="5.29.0"></a>
# [5.29.0](https://github.com/electron-userland/electron-builder/compare/v5.28.2...v5.29.0) (2016-08-17)


### Features

* **nsis:** per-machine installer automatically removes old version #621 ([2c3d8c2](https://github.com/electron-userland/electron-builder/commit/2c3d8c2))



<a name="5.28.2"></a>
## [5.28.2](https://github.com/electron-userland/electron-builder/compare/v5.28.1...v5.28.2) (2016-08-17)


### Bug Fixes

* skip rcedit for .msi installer ([d40e0b5](https://github.com/electron-userland/electron-builder/commit/d40e0b5)), closes [#677](https://github.com/electron-userland/electron-builder/issues/677)



<a name="5.28.1"></a>
## [5.28.1](https://github.com/electron-userland/electron-builder/compare/v5.28.0...v5.28.1) (2016-08-17)


### Bug Fixes

* disable dual-signing for .msi installer ([903148b](https://github.com/electron-userland/electron-builder/commit/903148b))



<a name="5.28.0"></a>
# [5.28.0](https://github.com/electron-userland/electron-builder/compare/v5.27.0...v5.28.0) (2016-08-16)


### Features

* **nsis:** custom icon for file association #409 ([09497cc](https://github.com/electron-userland/electron-builder/commit/09497cc))



<a name="5.27.0"></a>
# [5.27.0](https://github.com/electron-userland/electron-builder/compare/v5.26.0...v5.27.0) (2016-08-16)


### Features

* NSIS sign uninstaller ([17c0a82](https://github.com/electron-userland/electron-builder/commit/17c0a82)), closes [#526](https://github.com/electron-userland/electron-builder/issues/526)



<a name="5.26.0"></a>
# [5.26.0](https://github.com/electron-userland/electron-builder/compare/v5.25.1...v5.26.0) (2016-08-12)


### Bug Fixes

* Build fails due to peer dependency errors ([fcecbf0](https://github.com/electron-userland/electron-builder/commit/fcecbf0)), closes [#611](https://github.com/electron-userland/electron-builder/issues/611)
* Do not trash old build artifacts ([361b369](https://github.com/electron-userland/electron-builder/commit/361b369)), closes [#586](https://github.com/electron-userland/electron-builder/issues/586)
* do not required email for all Linux targets ([ddfa6fc](https://github.com/electron-userland/electron-builder/commit/ddfa6fc))


### Features

* Changing build attributes for different environment ([b9d0139](https://github.com/electron-userland/electron-builder/commit/b9d0139)), closes [#639](https://github.com/electron-userland/electron-builder/issues/639)



<a name="5.25.1"></a>
## [5.25.1](https://github.com/electron-userland/electron-builder/compare/v5.25.0...v5.25.1) (2016-08-12)


### Bug Fixes

* Bump electron-wininstaller-fixed to Squirrel 1.4.4 ([8008734](https://github.com/electron-userland/electron-builder/commit/8008734))



<a name="5.25.0"></a>
# [5.25.0](https://github.com/electron-userland/electron-builder/compare/v5.24.1...v5.25.0) (2016-08-11)


### Bug Fixes

* remove outdated license check ([8665ef4](https://github.com/electron-userland/electron-builder/commit/8665ef4))


### Features

* bundle osslsigncode for Linux ([fc8d6c6](https://github.com/electron-userland/electron-builder/commit/fc8d6c6))



<a name="5.24.1"></a>
## [5.24.1](https://github.com/electron-userland/electron-builder/compare/v5.24.0...v5.24.1) (2016-08-10)


### Bug Fixes

* Some files in app.asar get corrupted ([ee2f7c8](https://github.com/electron-userland/electron-builder/commit/ee2f7c8)), closes [#662](https://github.com/electron-userland/electron-builder/issues/662)



<a name="5.24.0"></a>
# [5.24.0](https://github.com/electron-userland/electron-builder/compare/v5.23.2...v5.24.0) (2016-08-09)


### Features

* **nsis:** multilang installer ([50d27bf](https://github.com/electron-userland/electron-builder/commit/50d27bf)), closes [#643](https://github.com/electron-userland/electron-builder/issues/643) [#646](https://github.com/electron-userland/electron-builder/issues/646)
*  EV certificate code signing (custom /n and /tr) ([e008c19](https://github.com/electron-userland/electron-builder/commit/e008c19)), closes [#627](https://github.com/electron-userland/electron-builder/issues/627) [#590](https://github.com/electron-userland/electron-builder/issues/590)
*  remove OriginalFilename, add LegalTrademarks, add ProductVersion for NSIS ([6a906ac](https://github.com/electron-userland/electron-builder/commit/6a906ac)), closes [#655](https://github.com/electron-userland/electron-builder/issues/655)



<a name="5.23.2"></a>
## [5.23.2](https://github.com/electron-userland/electron-builder/compare/v5.23.1...v5.23.2) (2016-08-05)


### Bug Fixes

* **AppImage:** app bin detection ([06def89](https://github.com/electron-userland/electron-builder/commit/06def89))



<a name="5.23.1"></a>
## [5.23.1](https://github.com/electron-userland/electron-builder/compare/v5.23.0...v5.23.1) (2016-08-05)


### Bug Fixes

* one-click CHECK_APP_RUNNING before SetSilent ([282fc72](https://github.com/electron-userland/electron-builder/commit/282fc72))
* one-click installer — Uninstall Confirm Dialog Option for One-click Windows NSIS #618 ([b3c49cb](https://github.com/electron-userland/electron-builder/commit/b3c49cb))



<a name="5.23.0"></a>
# [5.23.0](https://github.com/electron-userland/electron-builder/compare/v5.22.2...v5.23.0) (2016-08-04)


### Features

* prevent error "Unable to find a valid app" ([1778a8d](https://github.com/electron-userland/electron-builder/commit/1778a8d)), closes [#633](https://github.com/electron-userland/electron-builder/issues/633)
* support electron package https://github.com/electron-userland/electron-prebuilt/issues/160 ([aa0682f](https://github.com/electron-userland/electron-builder/commit/aa0682f))



<a name="5.22.2"></a>
## [5.22.2](https://github.com/electron-userland/electron-builder/compare/v5.22.1...v5.22.2) (2016-08-04)


### Bug Fixes

* Can't build on OSX (x64) since electron-builder 5.19.0 ([753cd08](https://github.com/electron-userland/electron-builder/commit/753cd08)), closes [#635](https://github.com/electron-userland/electron-builder/issues/635)



<a name="5.22.1"></a>
## [5.22.1](https://github.com/electron-userland/electron-builder/compare/v5.20.0...v5.22.1) (2016-08-02)


### Bug Fixes

* AppImage does not run when invoked in unpacked form ([9731225](https://github.com/electron-userland/electron-builder/commit/9731225)), closes [#592](https://github.com/electron-userland/electron-builder/issues/592)
* Failing to sign the Windows build on Linux ([a6a0cd6](https://github.com/electron-userland/electron-builder/commit/a6a0cd6)), closes [#578](https://github.com/electron-userland/electron-builder/issues/578)
* NSIS Installer hangs when being run silently ([d0a4f90](https://github.com/electron-userland/electron-builder/commit/d0a4f90)), closes [#616](https://github.com/electron-userland/electron-builder/issues/616)
* Windows NSIS One-Click Setup Launched while App already running in background ([918a6c0](https://github.com/electron-userland/electron-builder/commit/918a6c0)), closes [#617](https://github.com/electron-userland/electron-builder/issues/617)
* don't take in account just directory `app` without `package.json` ([3418239](https://github.com/electron-userland/electron-builder/commit/3418239))
* extraMetadata — deep assign ([6a5c4bb](https://github.com/electron-userland/electron-builder/commit/6a5c4bb))


### Features

* --extraMetadata for conditional compilation ([da700d4](https://github.com/electron-userland/electron-builder/commit/da700d4)), closes [#494](https://github.com/electron-userland/electron-builder/issues/494)
* Uninstall Confirm Dialog Option for One-click Windows NSIS ([e99047d](https://github.com/electron-userland/electron-builder/commit/e99047d)), closes [#618](https://github.com/electron-userland/electron-builder/issues/618)



<a name="5.20.0"></a>
# [5.20.0](https://github.com/electron-userland/electron-builder/compare/v5.19.1...v5.20.0) (2016-07-29)


### Features

* Make sure compiled app has same hash on different computers ([d773077](https://github.com/electron-userland/electron-builder/commit/d773077)), closes [#604](https://github.com/electron-userland/electron-builder/issues/604)



<a name="5.19.1"></a>
## [5.19.1](https://github.com/electron-userland/electron-builder/compare/v5.19.0...v5.19.1) (2016-07-29)


### Bug Fixes

* Certificate file for sign was gone (provides with file://) under windows ([04a88b0](https://github.com/electron-userland/electron-builder/commit/04a88b0)), closes [#619](https://github.com/electron-userland/electron-builder/issues/619)



<a name="5.19.0"></a>
# [5.19.0](https://github.com/electron-userland/electron-builder/compare/v5.18.0...v5.19.0) (2016-07-28)


### Features

* don't pack into asar node module that contains executable/binary files ([e975881](https://github.com/electron-userland/electron-builder/commit/e975881)), closes [#602](https://github.com/electron-userland/electron-builder/issues/602)



<a name="5.18.0"></a>
# [5.18.0](https://github.com/electron-userland/electron-builder/compare/v5.17.1...v5.18.0) (2016-07-28)


### Bug Fixes

* remove "Warning: homepage" ([0fd6a3e](https://github.com/electron-userland/electron-builder/commit/0fd6a3e))


### Features

* NSIS script customization — script option ([a807b17](https://github.com/electron-userland/electron-builder/commit/a807b17)), closes [#583](https://github.com/electron-userland/electron-builder/issues/583)



<a name="5.17.1"></a>
## [5.17.1](https://github.com/electron-userland/electron-builder/compare/v5.17.0...v5.17.1) (2016-07-27)


### Bug Fixes

* do not use scoped asara package ([c53074c](https://github.com/electron-userland/electron-builder/commit/c53074c)), closes [#610](https://github.com/electron-userland/electron-builder/issues/610)



<a name="5.17.0"></a>
# [5.17.0](https://github.com/electron-userland/electron-builder/compare/v5.16.0...v5.17.0) (2016-07-27)


### Features

* NSIS script customization #583 ([63beaaf](https://github.com/electron-userland/electron-builder/commit/63beaaf))



<a name="5.16.0"></a>
# [5.16.0](https://github.com/electron-userland/electron-builder/compare/v5.15.0...v5.16.0) (2016-07-22)


### Features

* exclude **/node_modules/*/{README.md,README,readme.md,readme,test} by default ([5895583](https://github.com/electron-userland/electron-builder/commit/5895583)), closes [#591](https://github.com/electron-userland/electron-builder/issues/591) [#606](https://github.com/electron-userland/electron-builder/issues/606)
* exclude extraResources/extraFiles for one-package dir ([3aaf025](https://github.com/electron-userland/electron-builder/commit/3aaf025)), closes [#599](https://github.com/electron-userland/electron-builder/issues/599)



<a name="5.15.0"></a>
# [5.15.0](https://github.com/electron-userland/electron-builder/compare/v5.14.2...v5.15.0) (2016-07-21)


### Features

* **Linux:** app icon is not required ([ec0bda5](https://github.com/electron-userland/electron-builder/commit/ec0bda5)), closes [#593](https://github.com/electron-userland/electron-builder/issues/593)



<a name="5.14.2"></a>
## [5.14.2](https://github.com/electron-userland/electron-builder/compare/v5.14.1...v5.14.2) (2016-07-20)


### Bug Fixes

* **nsis:** fix all nsis warnings ([9a3fd5e](https://github.com/electron-userland/electron-builder/commit/9a3fd5e))



<a name="5.14.1"></a>
## [5.14.1](https://github.com/electron-userland/electron-builder/compare/v5.14.0...v5.14.1) (2016-07-19)


### Bug Fixes

* **AppImage:** AppImage should have arch in filename ([e7d4f76](https://github.com/electron-userland/electron-builder/commit/e7d4f76)), closes [#594](https://github.com/electron-userland/electron-builder/issues/594)



<a name="5.14.0"></a>
# [5.14.0](https://github.com/electron-userland/electron-builder/compare/v5.13.1...v5.14.0) (2016-07-18)


### Features

* file associations ([fd1e7da](https://github.com/electron-userland/electron-builder/commit/fd1e7da)), closes [#563](https://github.com/electron-userland/electron-builder/issues/563)



<a name="5.13.1"></a>
## [5.13.1](https://github.com/electron-userland/electron-builder/compare/v5.13.0...v5.13.1) (2016-07-14)


### Bug Fixes

* win codesign on windows 7 ([d78c69c](https://github.com/electron-userland/electron-builder/commit/d78c69c)), closes [#581](https://github.com/electron-userland/electron-builder/issues/581) [#584](https://github.com/electron-userland/electron-builder/issues/584)



<a name="5.13.0"></a>
# [5.13.0](https://github.com/electron-userland/electron-builder/compare/v5.12.1...v5.13.0) (2016-07-13)


### Features

* **Squirrel.Windows:** Automatic remoteReleases configuration ([d6aa555](https://github.com/electron-userland/electron-builder/commit/d6aa555)), closes [#561](https://github.com/electron-userland/electron-builder/issues/561)
* **nsis:** run after finish flag for one-click installer ([50039ea](https://github.com/electron-userland/electron-builder/commit/50039ea)), closes [#574](https://github.com/electron-userland/electron-builder/issues/574)



<a name="5.12.1"></a>
## [5.12.1](https://github.com/electron-userland/electron-builder/compare/v5.12.0...v5.12.1) (2016-07-11)


### Bug Fixes

* **nsis:** per machine assisted installer ([1bd32a7](https://github.com/electron-userland/electron-builder/commit/1bd32a7)), closes [#564](https://github.com/electron-userland/electron-builder/issues/564)



<a name="5.12.0"></a>
# [5.12.0](https://github.com/electron-userland/electron-builder/compare/v5.11.3...v5.12.0) (2016-07-09)


### Bug Fixes

* **nsis:** install per current user even if run as administrator ([a01f481](https://github.com/electron-userland/electron-builder/commit/a01f481))


### Features

* **nsis:** per machine one-click installer #564 ([9f52848](https://github.com/electron-userland/electron-builder/commit/9f52848))



<a name="5.11.3"></a>
## [5.11.3](https://github.com/electron-userland/electron-builder/compare/v5.11.2...v5.11.3) (2016-07-09)


### Bug Fixes

* **AppImage:** bundle xorriso ([a1bf645](https://github.com/electron-userland/electron-builder/commit/a1bf645))



<a name="5.11.2"></a>
## [5.11.2](https://github.com/electron-userland/electron-builder/compare/v5.11.1...v5.11.2) (2016-07-07)


### Bug Fixes

* **AppImage:** do not pack into archive, add `.AppImage` suffix ([f59c7bd](https://github.com/electron-userland/electron-builder/commit/f59c7bd))



<a name="5.11.1"></a>
## [5.11.1](https://github.com/electron-userland/electron-builder/compare/v5.11.0...v5.11.1) (2016-07-07)


### Bug Fixes

* **nsis:** ia32 Extracting wrong archive ([56b3450](https://github.com/electron-userland/electron-builder/commit/56b3450)), closes [#567](https://github.com/electron-userland/electron-builder/issues/567)



<a name="5.11.0"></a>
# [5.11.0](https://github.com/electron-userland/electron-builder/compare/v5.10.5...v5.11.0) (2016-07-07)


### Bug Fixes

* AppImage desktop icons ([9a69286](https://github.com/electron-userland/electron-builder/commit/9a69286))
* **AppImage:** use app name as a executable name ([159446b](https://github.com/electron-userland/electron-builder/commit/159446b))


### Features

* Build AppImage for Linux ([a9afdd4](https://github.com/electron-userland/electron-builder/commit/a9afdd4)), closes [#504](https://github.com/electron-userland/electron-builder/issues/504)
* multi-cert p12 ([de01c6d](https://github.com/electron-userland/electron-builder/commit/de01c6d)), closes [#560](https://github.com/electron-userland/electron-builder/issues/560)
* **mac:** Add build-version override property ([0b0ed62](https://github.com/electron-userland/electron-builder/commit/0b0ed62)), closes [#565](https://github.com/electron-userland/electron-builder/issues/565)



<a name="5.10.5"></a>
## [5.10.5](https://github.com/electron-userland/electron-builder/compare/v5.10.4...v5.10.5) (2016-07-03)


### Bug Fixes

* CSC_INSTALLER_KEY_PASSWORD environment variable isn't picked up #560 ([3fdd1f8](https://github.com/electron-userland/electron-builder/commit/3fdd1f8))
* CSC_INSTALLER_LINK environment variable isn't picked up #560 ([1c2632d](https://github.com/electron-userland/electron-builder/commit/1c2632d))



<a name="5.10.4"></a>
## [5.10.4](https://github.com/electron-userland/electron-builder/compare/v5.10.3...v5.10.4) (2016-07-02)


### Bug Fixes

* non-English characters confuse rcedit: Unable to load file on windows build (from linux) ([233fafe](https://github.com/electron-userland/electron-builder/commit/233fafe)), closes [#384](https://github.com/electron-userland/electron-builder/issues/384)



<a name="5.10.3"></a>
## [5.10.3](https://github.com/electron-userland/electron-builder/compare/v5.10.2...v5.10.3) (2016-07-01)


### Bug Fixes

* Ignore .DS_Store Files ([152b987](https://github.com/electron-userland/electron-builder/commit/152b987)), closes [#545](https://github.com/electron-userland/electron-builder/issues/545)
* dereference copied app files only for windows targets ([bf2aafb](https://github.com/electron-userland/electron-builder/commit/bf2aafb))



<a name="5.10.2"></a>
## [5.10.2](https://github.com/electron-userland/electron-builder/compare/v5.10.1...v5.10.2) (2016-06-28)


### Bug Fixes

* **nsis:** installerHeaderIcon ([00e8da8](https://github.com/electron-userland/electron-builder/commit/00e8da8)), closes [#525](https://github.com/electron-userland/electron-builder/issues/525)



<a name="5.10.1"></a>
## [5.10.1](https://github.com/electron-userland/electron-builder/compare/v5.10.0...v5.10.1) (2016-06-27)


### Bug Fixes

* Build failing when productName contains a slash ([726e574](https://github.com/electron-userland/electron-builder/commit/726e574)), closes [#539](https://github.com/electron-userland/electron-builder/issues/539)



<a name="5.10.0"></a>
# [5.10.0](https://github.com/electron-userland/electron-builder/compare/v5.9.0...v5.10.0) (2016-06-26)


### Features

* **publisher:** Check that tag name starts with "v" #340 ([bb71621](https://github.com/electron-userland/electron-builder/commit/bb71621))



<a name="5.9.0"></a>
# [5.9.0](https://github.com/electron-userland/electron-builder/compare/v5.8.0...v5.9.0) (2016-06-26)


### Features

* **nsis:** Different Icon for installer / App ? (Windows) ([65650ea](https://github.com/electron-userland/electron-builder/commit/65650ea)), closes [#525](https://github.com/electron-userland/electron-builder/issues/525)



<a name="5.8.0"></a>
# [5.8.0](https://github.com/electron-userland/electron-builder/compare/v5.7.0...v5.8.0) (2016-06-26)


### Bug Fixes

* **mas:** cannot find mas installer ([5ba6276](https://github.com/electron-userland/electron-builder/commit/5ba6276)), closes [#535](https://github.com/electron-userland/electron-builder/issues/535)


### Features

* **nsis:** 32 bit + 64 bit installer ([bbd0bd6](https://github.com/electron-userland/electron-builder/commit/bbd0bd6)), closes [#528](https://github.com/electron-userland/electron-builder/issues/528) [#536](https://github.com/electron-userland/electron-builder/issues/536)



<a name="5.7.0"></a>
# [5.7.0](https://github.com/electron-userland/electron-builder/compare/v5.6.3...v5.7.0) (2016-06-24)


### Bug Fixes

* don't throw release must be a draft if onTag policy was guessed ([26c89f0](https://github.com/electron-userland/electron-builder/commit/26c89f0))


### Features

* **nsis:** MUI_HEADERIMAGE #525 ([3f43c0a](https://github.com/electron-userland/electron-builder/commit/3f43c0a))



<a name="5.6.3"></a>
## [5.6.3](https://github.com/electron-userland/electron-builder/compare/v5.6.2...v5.6.3) (2016-06-23)


### Bug Fixes

* Installation Has Failed - Seems to be an issue with the RELEASES file ([7c84f5f](https://github.com/electron-userland/electron-builder/commit/7c84f5f)), closes [#534](https://github.com/electron-userland/electron-builder/issues/534)



<a name="5.6.2"></a>
## [5.6.2](https://github.com/electron-userland/electron-builder/compare/v5.6.1...v5.6.2) (2016-06-23)


### Bug Fixes

* Creating an MSI on Windows fails ([d1ee7de](https://github.com/electron-userland/electron-builder/commit/d1ee7de)), closes [#485](https://github.com/electron-userland/electron-builder/issues/485)



<a name="5.6.1"></a>
## [5.6.1](https://github.com/electron-userland/electron-builder/compare/v5.6.0...v5.6.1) (2016-06-22)


### Bug Fixes

* `build --target dir` doesn't work ([f880157](https://github.com/electron-userland/electron-builder/commit/f880157)), closes [#531](https://github.com/electron-userland/electron-builder/issues/531)



<a name="5.6.0"></a>
# [5.6.0](https://github.com/electron-userland/electron-builder/compare/v5.5.0...v5.6.0) (2016-06-21)


### Features

* specified icon not being used when generating osx build ([74388bb](https://github.com/electron-userland/electron-builder/commit/74388bb)), closes [#519](https://github.com/electron-userland/electron-builder/issues/519)



<a name="5.5.0"></a>
# [5.5.0](https://github.com/electron-userland/electron-builder/compare/v5.4.4...v5.5.0) (2016-06-19)


### Features

* finish NSIS installer look and feel ([e50e3c8](https://github.com/electron-userland/electron-builder/commit/e50e3c8))



<a name="5.4.4"></a>
## [5.4.4](https://github.com/electron-userland/electron-builder/compare/v5.4.3...v5.4.4) (2016-06-17)


### Bug Fixes

* NSIS LZMA compression is slower and worse then external 7z compression ([e1e6d67](https://github.com/electron-userland/electron-builder/commit/e1e6d67))
* ignore dev deps if ignore func specified ([0944985](https://github.com/electron-userland/electron-builder/commit/0944985))
* validate bin checksum ([0f9d2e1](https://github.com/electron-userland/electron-builder/commit/0f9d2e1))


### Performance Improvements

* create asar without intermediate copy ([95c8a0c](https://github.com/electron-userland/electron-builder/commit/95c8a0c))



<a name="5.4.3"></a>
## [5.4.3](https://github.com/electron-userland/electron-builder/compare/v5.4.2...v5.4.3) (2016-06-16)


### Bug Fixes

* allow passing absolute and relative path as userAppDir option (#515) ([df096f0](https://github.com/electron-userland/electron-builder/commit/df096f0))



<a name="5.4.2"></a>
## [5.4.2](https://github.com/electron-userland/electron-builder/compare/v5.4.1...v5.4.2) (2016-06-16)


### Bug Fixes

* ignore com.apple.idms.appleid.prd. certs ([b69d3ab](https://github.com/electron-userland/electron-builder/commit/b69d3ab)), closes [#510](https://github.com/electron-userland/electron-builder/issues/510)



<a name="5.4.1"></a>
## [5.4.1](https://github.com/electron-userland/electron-builder/compare/v5.4.0...v5.4.1) (2016-06-14)


### Bug Fixes

* don't use deb default deps for other targets #502 ([c3679e7](https://github.com/electron-userland/electron-builder/commit/c3679e7))



<a name="5.4.0"></a>
# [5.4.0](https://github.com/electron-userland/electron-builder/compare/v5.3.0...v5.4.0) (2016-06-14)


### Features

* NSIS target (#495) ([d8762db](https://github.com/electron-userland/electron-builder/commit/d8762db)), closes [#472](https://github.com/electron-userland/electron-builder/issues/472) [#493](https://github.com/electron-userland/electron-builder/issues/493)



<a name="5.3.0"></a>
# [5.3.0](https://github.com/electron-userland/electron-builder/compare/v5.2.1...v5.3.0) (2016-06-14)


### Features

* adding dot asar option (#496) ([3fc7a89](https://github.com/electron-userland/electron-builder/commit/3fc7a89))



<a name="5.2.1"></a>
## [5.2.1](https://github.com/electron-userland/electron-builder/compare/v5.2.0...v5.2.1) (2016-06-12)


### Bug Fixes

* don't try to build OS X x64 ([ee64432](https://github.com/electron-userland/electron-builder/commit/ee64432))



<a name="5.2.0"></a>
# [5.2.0](https://github.com/electron-userland/electron-builder/compare/v5.1.0...v5.2.0) (2016-06-11)


### Features

* Ability to set author/CompanyName programmatically ([63c2529](https://github.com/electron-userland/electron-builder/commit/63c2529)), closes [#455](https://github.com/electron-userland/electron-builder/issues/455)
* Add Ability to Create Pre-Releases and Releases ([e5b0c04](https://github.com/electron-userland/electron-builder/commit/e5b0c04)), closes [#446](https://github.com/electron-userland/electron-builder/issues/446)



<a name="5.1.0"></a>
# [5.1.0](https://github.com/electron-userland/electron-builder/compare/v5.0.3...v5.1.0) (2016-06-10)


### Bug Fixes

* Builder attempts to sign OSX app even though no signing is specified ([24f6045](https://github.com/electron-userland/electron-builder/commit/24f6045)), closes [#481](https://github.com/electron-userland/electron-builder/issues/481) [#484](https://github.com/electron-userland/electron-builder/issues/484)


### Features

* Windows targets `7z`, `zip`, `tar.xz`, `tar.lz`, `tar.gz`, `tar.bz2` ([1c983d4](https://github.com/electron-userland/electron-builder/commit/1c983d4))



<a name="5.0.3"></a>
## [5.0.3](https://github.com/electron-userland/electron-builder/compare/v5.0.2...v5.0.3) (2016-06-10)


### Bug Fixes

* Asar: true failing on Windows for electron-builder 5.x ([317a330](https://github.com/electron-userland/electron-builder/commit/317a330)), closes [#482](https://github.com/electron-userland/electron-builder/issues/482)



<a name="5.0.2"></a>
## [5.0.2](https://github.com/electron-userland/electron-builder/compare/v5.0.1...v5.0.2) (2016-06-09)


### Bug Fixes

* mas target — Identity name is specified, but no valid identity with this name in the keychain ([b091a13](https://github.com/electron-userland/electron-builder/commit/b091a13)), closes [#479](https://github.com/electron-userland/electron-builder/issues/479)



<a name="5.0.1"></a>
## [5.0.1](https://github.com/electron-userland/electron-builder/compare/v5.0.0...v5.0.1) (2016-06-09)


### Bug Fixes

* restore `--platform` and `--arch` CLI ([7f9e6e3](https://github.com/electron-userland/electron-builder/commit/7f9e6e3))



<a name="5.0.0"></a>
# [5.0.0](https://github.com/electron-userland/electron-builder/compare/v4.2.6...v5.0.0) (2016-06-08)


### Bug Fixes

* efficient implementation of copy extra files/resources ([5853514](https://github.com/electron-userland/electron-builder/commit/5853514))


### Features

* Development dependencies are never copied in any case ([6d4ab11](https://github.com/electron-userland/electron-builder/commit/6d4ab11))
* files option ([0f7624d](https://github.com/electron-userland/electron-builder/commit/0f7624d))


### BREAKING CHANGES

* prune by default, hidden files are not copied by default anymore



<a name="4.2.6"></a>
## [4.2.6](https://github.com/electron-userland/electron-builder/compare/v4.2.5...v4.2.6) (2016-06-06)


### Bug Fixes

* OS X code signing — cert type prefix must be added, restore non-Apple cert support ([97e16a2](https://github.com/electron-userland/electron-builder/commit/97e16a2)), closes [#458](https://github.com/electron-userland/electron-builder/issues/458)



<a name="4.2.5"></a>
## [4.2.5](https://github.com/electron-userland/electron-builder/compare/v4.2.4...v4.2.5) (2016-06-06)


### Bug Fixes

* Fallback to CSC_KEY_PASSWORD if certificatePassword not given ([aea6505](https://github.com/electron-userland/electron-builder/commit/aea6505)), closes [#475](https://github.com/electron-userland/electron-builder/issues/475)



<a name="4.2.4"></a>
## [4.2.4](https://github.com/electron-userland/electron-builder/compare/v4.2.3...v4.2.4) (2016-06-06)


### Bug Fixes

* Squirrel-packed executable not signed ([eb10afb](https://github.com/electron-userland/electron-builder/commit/eb10afb)), closes [#449](https://github.com/electron-userland/electron-builder/issues/449)



<a name="4.2.3"></a>
## [4.2.3](https://github.com/electron-userland/electron-builder/compare/v4.2.2...v4.2.3) (2016-06-05)


### Bug Fixes

* building windows 32 bit and 64 bit simultaneously ([cec4b3d](https://github.com/electron-userland/electron-builder/commit/cec4b3d)), closes [#470](https://github.com/electron-userland/electron-builder/issues/470)



<a name="4.2.2"></a>
## [4.2.2](https://github.com/electron-userland/electron-builder/compare/v4.2.1...v4.2.2) (2016-06-03)


### Bug Fixes

* 4.2.1 Doesn't Include `.node` Files ([12ba8b7](https://github.com/electron-userland/electron-builder/commit/12ba8b7)), closes [#468](https://github.com/electron-userland/electron-builder/issues/468)



<a name="4.2.1"></a>
## [4.2.1](https://github.com/electron-userland/electron-builder/compare/v4.2.0...v4.2.1) (2016-06-03)


### Bug Fixes

* Application entry can't be found ([a7b2932](https://github.com/electron-userland/electron-builder/commit/a7b2932)), closes [#371](https://github.com/electron-userland/electron-builder/issues/371)
* icudtl.dat: file changed as we read it ([567c813](https://github.com/electron-userland/electron-builder/commit/567c813)), closes [#460](https://github.com/electron-userland/electron-builder/issues/460)
* warn "It is not possible to build OS X app on Windows" ([f6c47f7](https://github.com/electron-userland/electron-builder/commit/f6c47f7)), closes [#422](https://github.com/electron-userland/electron-builder/issues/422)



<a name="4.2.0"></a>
# [4.2.0](https://github.com/electron-userland/electron-builder/compare/v4.1.0...v4.2.0) (2016-06-02)


### Bug Fixes

* Don´t throw error if Release is not a Draft and build triggered by Tag ([0f060c1](https://github.com/electron-userland/electron-builder/commit/0f060c1)), closes [#429](https://github.com/electron-userland/electron-builder/issues/429)
* entitlements file names according to new electron-osx-sign conventions ([ecdff3c](https://github.com/electron-userland/electron-builder/commit/ecdff3c))
* log github publisher user and project #425 ([c2c3ef6](https://github.com/electron-userland/electron-builder/commit/c2c3ef6))
* move npmRebuild to build ([1110596](https://github.com/electron-userland/electron-builder/commit/1110596))
* update electron-osx-sign to 0.4 beta ([bf93b24](https://github.com/electron-userland/electron-builder/commit/bf93b24))
* windows codesign on Linux ([7166580](https://github.com/electron-userland/electron-builder/commit/7166580))


### Features

* `--dist` by default ([ae3f1bb](https://github.com/electron-userland/electron-builder/commit/ae3f1bb)), closes [#413](https://github.com/electron-userland/electron-builder/issues/413)


### BREAKING CHANGES

* See new entitlements paths in the wiki



<a name="4.1.0"></a>
# [4.1.0](https://github.com/electron-userland/electron-builder/compare/v4.0.0...v4.1.0) (2016-05-30)


### Features

* user-friendly MAS code signing ([fe53388](https://github.com/electron-userland/electron-builder/commit/fe53388))



<a name="4.0.0"></a>
# [4.0.0](https://github.com/electron-userland/electron-builder/compare/v3.27.0...v4.0.0) (2016-05-29)


### Features

* `--dist` by default and remove this flag in favour of `--target=dir #413 ([a5e4571](https://github.com/electron-userland/electron-builder/commit/a5e4571))
* extraFiles ([ca120e3](https://github.com/electron-userland/electron-builder/commit/ca120e3))
* option to skip installAppDependencies ([67ed60b](https://github.com/electron-userland/electron-builder/commit/67ed60b)), closes [#442](https://github.com/electron-userland/electron-builder/issues/442)


### BREAKING CHANGES

* `extraResources` copying files to `resources` on Linux/Windows, not to root directory as before. To copy to the root please use new option `extraFiles`.
* `appDir` CLI is removed — use [directories.app](https://github.com/electron-userland/electron-builder/wiki/Options#MetadataDirectories-app) in the development package.json. `sign` CLI is removed — use [build.osx.identity](https://github.com/electron-userland/electron-builder/wiki/Options#OsXBuildOptions-identity) in the development package.json.



<a name="3.27.0"></a>
# [3.27.0](https://github.com/electron-userland/electron-builder/compare/v3.26.3...v3.27.0) (2016-05-26)


### Features

* **windows:** specification of signing algorithms (#435) ([73e7c14](https://github.com/electron-userland/electron-builder/commit/73e7c14)), closes [#374](https://github.com/electron-userland/electron-builder/issues/374) [#416](https://github.com/electron-userland/electron-builder/issues/416)
* support finding electron version in build.electronVersion or electron-prebuilt-compile ([4c1f06d](https://github.com/electron-userland/electron-builder/commit/4c1f06d))



<a name="3.26.3"></a>
## [3.26.3](https://github.com/electron-userland/electron-builder/compare/v3.26.2...v3.26.3) (2016-05-23)


### Bug Fixes

* import bundled certs into login.keychain ([bffbbf1](https://github.com/electron-userland/electron-builder/commit/bffbbf1)), closes [#398](https://github.com/electron-userland/electron-builder/issues/398)



<a name="3.26.2"></a>
## [3.26.2](https://github.com/electron-userland/electron-builder/compare/v3.26.1...v3.26.2) (2016-05-23)


### Bug Fixes

* check that description is not empty ([a3bbb3f](https://github.com/electron-userland/electron-builder/commit/a3bbb3f)), closes [#392](https://github.com/electron-userland/electron-builder/issues/392)



<a name="3.26.1"></a>
## [3.26.1](https://github.com/electron-userland/electron-builder/compare/v3.26.0...v3.26.1) (2016-05-23)


### Bug Fixes

* forbid name in the build ([e4eefb2](https://github.com/electron-userland/electron-builder/commit/e4eefb2)), closes [#360](https://github.com/electron-userland/electron-builder/issues/360)



<a name="3.26.0"></a>
# [3.26.0](https://github.com/electron-userland/electron-builder/compare/v3.25.0...v3.26.0) (2016-05-23)


### Features

* **linux:** sh, rpm, freebsd, pacman, p5p, apk, 7z, zip, tar.xz, tar.gz, tar.bz2, tar.lz ([50d31f1](https://github.com/electron-userland/electron-builder/commit/50d31f1)), closes [#414](https://github.com/electron-userland/electron-builder/issues/414)



<a name="3.25.0"></a>
# [3.25.0](https://github.com/electron-userland/electron-builder/compare/v3.24.0...v3.25.0) (2016-05-18)


### Bug Fixes

* Trouble building delta package for Squirrel.Windows on OSX ([cc8278a](https://github.com/electron-userland/electron-builder/commit/cc8278a)), closes [#407](https://github.com/electron-userland/electron-builder/issues/407)


### Features

* **osx:** Optional DMG background ([4088b13](https://github.com/electron-userland/electron-builder/commit/4088b13))
* The function to be run after pack (but before pack into distributable format and sign) ([7f32573](https://github.com/electron-userland/electron-builder/commit/7f32573)), closes [#397](https://github.com/electron-userland/electron-builder/issues/397)
* check asar existence and integrity (#401) ([4a9af55](https://github.com/electron-userland/electron-builder/commit/4a9af55))



<a name="3.24.0"></a>
# [3.24.0](https://github.com/electron-userland/electron-builder/compare/v3.23.0...v3.24.0) (2016-05-15)


### Features

* **linux:** Install libappindicator1 and libnotify as a dependency of the linux package ([05baad5](https://github.com/electron-userland/electron-builder/commit/05baad5))



<a name="3.23.0"></a>
# [3.23.0](https://github.com/electron-userland/electron-builder/compare/v3.22.2...v3.23.0) (2016-05-14)


### Features

* bundle Certum cert ([2e0894f](https://github.com/electron-userland/electron-builder/commit/2e0894f)), closes [#398](https://github.com/electron-userland/electron-builder/issues/398)



<a name="3.22.2"></a>
## [3.22.2](https://github.com/electron-userland/electron-builder/compare/v3.22.1...v3.22.2) (2016-05-14)


### Bug Fixes

* **linux:** use full path in .desktop file (#405) ([1164ca1](https://github.com/electron-userland/electron-builder/commit/1164ca1))
* incorrect nupkg file if created on windows ([a5a23ae](https://github.com/electron-userland/electron-builder/commit/a5a23ae)), closes [#402](https://github.com/electron-userland/electron-builder/issues/402) [#351](https://github.com/electron-userland/electron-builder/issues/351)



<a name="3.22.1"></a>
## [3.22.1](https://github.com/electron-userland/electron-builder/compare/v3.22.0...v3.22.1) (2016-05-13)


### Bug Fixes

* win ia32 out dir name — unexpanded $arch ([8d9b952](https://github.com/electron-userland/electron-builder/commit/8d9b952))



<a name="3.22.0"></a>
# [3.22.0](https://github.com/electron-userland/electron-builder/compare/v3.21.0...v3.22.0) (2016-05-13)


### Features

* revert "Releases file for Windows not uploaded to Github #190" ([079989a](https://github.com/electron-userland/electron-builder/commit/079989a))



<a name="3.21.0"></a>
# [3.21.0](https://github.com/electron-userland/electron-builder/compare/v3.20.0...v3.21.0) (2016-05-12)


### Bug Fixes

* Cannot upload prerelease version ([05121df](https://github.com/electron-userland/electron-builder/commit/05121df)), closes [#395](https://github.com/electron-userland/electron-builder/issues/395)


### Features

* Squirrel.Windows doesn't escape " in the description ([6977557](https://github.com/electron-userland/electron-builder/commit/6977557)), closes [#378](https://github.com/electron-userland/electron-builder/issues/378)



<a name="3.20.0"></a>
# [3.20.0](https://github.com/electron-userland/electron-builder/compare/v3.19.0...v3.20.0) (2016-05-11)


### Bug Fixes

* http download to destination if no parent dirs created ([b5505fc](https://github.com/electron-userland/electron-builder/commit/b5505fc))


### Features

* dual code-sign windows app + timestamped ([b71d2f3](https://github.com/electron-userland/electron-builder/commit/b71d2f3))



<a name="3.19.0"></a>
# [3.19.0](https://github.com/electron-userland/electron-builder/compare/v3.18.0...v3.19.0) (2016-05-10)


### Features

* Code signing windows app using SHA256 ([032ba05](https://github.com/electron-userland/electron-builder/commit/032ba05)), closes [#386](https://github.com/electron-userland/electron-builder/issues/386)



<a name="3.18.0"></a>
# [3.18.0](https://github.com/electron-userland/electron-builder/compare/v3.17.1...v3.18.0) (2016-05-09)


### Bug Fixes

* user-friendly error message "Error: buffer is not ico" ([7ac6ca2](https://github.com/electron-userland/electron-builder/commit/7ac6ca2)), closes [#349](https://github.com/electron-userland/electron-builder/issues/349)


### Features

* base64-encoded P12 file instead of https link ([3ab0e57](https://github.com/electron-userland/electron-builder/commit/3ab0e57))
* cleanup unused fpm versions ([633d006](https://github.com/electron-userland/electron-builder/commit/633d006))
* use self-contained fpm on Linux — don't need to install ruby anymore ([7d5b747](https://github.com/electron-userland/electron-builder/commit/7d5b747))



<a name="3.17.1"></a>
## [3.17.1](https://github.com/electron-userland/electron-builder/compare/v3.17.0...v3.17.1) (2016-05-05)


### Bug Fixes

* bundle StartSSL certs ([16d3805](https://github.com/electron-userland/electron-builder/commit/16d3805))
* osx code sign regression ([2d0f5f1](https://github.com/electron-userland/electron-builder/commit/2d0f5f1)), closes [#377](https://github.com/electron-userland/electron-builder/issues/377)



<a name="3.17.0"></a>
# [3.17.0](https://github.com/electron-userland/electron-builder/compare/v3.16.1...v3.17.0) (2016-05-04)


### Features

* use self-containe fpm on OS X — don't need to install ruby anymore ([e7cee5e](https://github.com/electron-userland/electron-builder/commit/e7cee5e))



<a name="3.16.1"></a>
## [3.16.1](https://github.com/electron-userland/electron-builder/compare/v3.16.0...v3.16.1) (2016-05-03)


### Bug Fixes

* check wine version ([d77c8da](https://github.com/electron-userland/electron-builder/commit/d77c8da)), closes [#352](https://github.com/electron-userland/electron-builder/issues/352)



<a name="3.16.0"></a>
# [3.16.0](https://github.com/electron-userland/electron-builder/compare/v3.15.0...v3.16.0) (2016-05-02)


### Features

* add Jenkins build number support (#373) ([eebe882](https://github.com/electron-userland/electron-builder/commit/eebe882))



<a name="3.15.0"></a>
# [3.15.0](https://github.com/electron-userland/electron-builder/compare/v3.14.0...v3.15.0) (2016-05-02)


### Features

* iconUrl git-lfs support, os x identity/installerIdentity options ([974f7f3](https://github.com/electron-userland/electron-builder/commit/974f7f3)), closes [#332](https://github.com/electron-userland/electron-builder/issues/332)
* osx entitlements location by convention ([af1165b](https://github.com/electron-userland/electron-builder/commit/af1165b))



<a name="3.14.0"></a>
# [3.14.0](https://github.com/electron-userland/electron-builder/compare/v3.13.1...v3.14.0) (2016-04-29)


### Features

* build mas + other targets, osx 7z ([c46e1f5](https://github.com/electron-userland/electron-builder/commit/c46e1f5))



<a name="3.13.1"></a>
## [3.13.1](https://github.com/electron-userland/electron-builder/compare/v3.13.0...v3.13.1) (2016-04-28)


### Bug Fixes

* statFileInPackage in platformPackager.js creates wrong path ([7373131](https://github.com/electron-userland/electron-builder/commit/7373131)), closes [#365](https://github.com/electron-userland/electron-builder/issues/365)



<a name="3.13.0"></a>
# [3.13.0](https://github.com/electron-userland/electron-builder/compare/v3.12.0...v3.13.0) (2016-04-28)


### Bug Fixes

* add debug log to investigate "Cannot build app with 3.6.2+" #360 ([1970550](https://github.com/electron-userland/electron-builder/commit/1970550))


### Features

* DMG — use bzip2 compression (old: 40MB, new: 36MB) ([e0c3b92](https://github.com/electron-userland/electron-builder/commit/e0c3b92))



<a name="3.12.0"></a>
# [3.12.0](https://github.com/electron-userland/electron-builder/compare/v3.11.0...v3.12.0) (2016-04-27)


### Bug Fixes

* Windows shortcut doesn't work when `productName` contains a space ([f99d61e](https://github.com/electron-userland/electron-builder/commit/f99d61e)), closes [#339](https://github.com/electron-userland/electron-builder/issues/339)


### Features

* check application package ([27faf73](https://github.com/electron-userland/electron-builder/commit/27faf73)), closes [#303](https://github.com/electron-userland/electron-builder/issues/303)



<a name="3.11.0"></a>
# [3.11.0](https://github.com/electron-userland/electron-builder/compare/v3.10.0...v3.11.0) (2016-04-25)


### Features

* mac app store ([260ca0b](https://github.com/electron-userland/electron-builder/commit/260ca0b)), closes [#332](https://github.com/electron-userland/electron-builder/issues/332)



<a name="3.10.0"></a>
# [3.10.0](https://github.com/electron-userland/electron-builder/compare/v3.9.0...v3.10.0) (2016-04-23)


### Features

* import startssl certs by default ([0f19455](https://github.com/electron-userland/electron-builder/commit/0f19455))



<a name="3.9.0"></a>
# [3.9.0](https://github.com/electron-userland/electron-builder/compare/v3.8.0...v3.9.0) (2016-04-21)


### Features

* build.osx.target to specify dmg, zip or both ([23df6a1](https://github.com/electron-userland/electron-builder/commit/23df6a1)), closes [#322](https://github.com/electron-userland/electron-builder/issues/322)



<a name="3.8.0"></a>
# [3.8.0](https://github.com/electron-userland/electron-builder/compare/v3.7.0...v3.8.0) (2016-04-20)


### Features

* accept multiple default app dirs ([ea5f842](https://github.com/electron-userland/electron-builder/commit/ea5f842)), closes [#344](https://github.com/electron-userland/electron-builder/issues/344)



<a name="3.7.0"></a>
# [3.7.0](https://github.com/electron-userland/electron-builder/compare/v3.6.3...v3.7.0) (2016-04-20)


### Features

* Windows code signing from OS X ([9134f61](https://github.com/electron-userland/electron-builder/commit/9134f61)), closes [#314](https://github.com/electron-userland/electron-builder/issues/314)



<a name="3.6.3"></a>
## [3.6.3](https://github.com/electron-userland/electron-builder/compare/v3.6.2...v3.6.3) (2016-04-19)


### Bug Fixes

* Looks for linux homepage in the development package.json not in the application package.json ([3da6893](https://github.com/electron-userland/electron-builder/commit/3da6893)), closes [#334](https://github.com/electron-userland/electron-builder/issues/334)



<a name="3.6.2"></a>
## [3.6.2](https://github.com/electron-userland/electron-builder/compare/v3.6.1...v3.6.2) (2016-04-19)


### Bug Fixes

* get rid of nuget to pack win ([c987439](https://github.com/electron-userland/electron-builder/commit/c987439))



<a name="3.6.1"></a>
## [3.6.1](https://github.com/electron-userland/electron-builder/compare/v3.6.0...v3.6.1) (2016-04-17)


### Bug Fixes

* deb package description according to spec ([3c6ec3f](https://github.com/electron-userland/electron-builder/commit/3c6ec3f)), closes [#327](https://github.com/electron-userland/electron-builder/issues/327)



<a name="3.6.0"></a>
# [3.6.0](https://github.com/electron-userland/electron-builder/compare/v3.5.2...v3.6.0) (2016-04-16)


### Bug Fixes

* check that noMsi specified as bool ([8266b22](https://github.com/electron-userland/electron-builder/commit/8266b22)), closes [#316](https://github.com/electron-userland/electron-builder/issues/316)


### Features

* Allow to specify custom build-version for electron-packager ([c866084](https://github.com/electron-userland/electron-builder/commit/c866084)), closes [#323](https://github.com/electron-userland/electron-builder/issues/323)



<a name="3.5.2"></a>
## [3.5.2](https://github.com/electron-userland/electron-builder/compare/v3.5.1...v3.5.2) (2016-04-15)


### Bug Fixes

* check that electron-packager create out directory ([e015b61](https://github.com/electron-userland/electron-builder/commit/e015b61)), closes [#301](https://github.com/electron-userland/electron-builder/issues/301)



<a name="3.5.1"></a>
## [3.5.1](https://github.com/electron-userland/electron-builder/compare/v3.5.0...v3.5.1) (2016-04-14)


### Bug Fixes

* Error while creating delta nupkg for Windows: System.DllNotFoundException: msdelta.dl #294 ([574add7](https://github.com/electron-userland/electron-builder/commit/574add7)), closes [#294](https://github.com/electron-userland/electron-builder/issues/294)



<a name="3.5.0"></a>
# [3.5.0](https://github.com/electron-userland/electron-builder/compare/v3.4.0...v3.5.0) (2016-04-10)


### Features

* if build/install-spinner.gif exists, set loadingGif to it ([85a6fba](https://github.com/electron-userland/electron-builder/commit/85a6fba)), closes [#292](https://github.com/electron-userland/electron-builder/issues/292)



<a name="3.4.0"></a>
# [3.4.0](https://github.com/electron-userland/electron-builder/compare/v3.3.1...v3.4.0) (2016-04-09)


### Features

* Ability to customize the output directory ([78bddc7](https://github.com/electron-userland/electron-builder/commit/78bddc7)), closes [#272](https://github.com/electron-userland/electron-builder/issues/272)



<a name="3.3.1"></a>
## [3.3.1](https://github.com/electron-userland/electron-builder/compare/v3.3.0...v3.3.1) (2016-04-08)


### Bug Fixes

* vendor/osx/7za seems to be broken ([422a032](https://github.com/electron-userland/electron-builder/commit/422a032)), closes [#296](https://github.com/electron-userland/electron-builder/issues/296)



<a name="3.3.0"></a>
# [3.3.0](https://github.com/electron-userland/electron-builder/compare/v3.2.0...v3.3.0) (2016-04-05)


### Features

* use 7za to produce Squirrel.mac zip (smaller size — the same time to compress) ([2dd5d7c](https://github.com/electron-userland/electron-builder/commit/2dd5d7c))



<a name="3.2.0"></a>
# [3.2.0](https://github.com/electron-userland/electron-builder/compare/v3.1.2...v3.2.0) (2016-04-02)


### Features

* Linux deb — specify license, package url #242 ([c62683a](https://github.com/electron-userland/electron-builder/commit/c62683a))



<a name="3.1.2"></a>
## [3.1.2](https://github.com/electron-userland/electron-builder/compare/v3.1.1...v3.1.2) (2016-04-01)


### Bug Fixes

* Windows installer metadata is incorrect #278 ([b151ffc](https://github.com/electron-userland/electron-builder/commit/b151ffc)), closes [#278](https://github.com/electron-userland/electron-builder/issues/278)
* check windows icon to avoid unclear error messages in the 3rd-part tools ([6ad853d](https://github.com/electron-userland/electron-builder/commit/6ad853d)), closes [#243](https://github.com/electron-userland/electron-builder/issues/243)



<a name="3.1.0"></a>
# [3.1.0](https://github.com/electron-userland/electron-builder/compare/v3.0.2...v3.1.0) (2016-03-25)


### Features

* prefix dist: as marker to package in a distributable format ([fa7cc85](https://github.com/electron-userland/electron-builder/commit/fa7cc85)), closes [#267](https://github.com/electron-userland/electron-builder/issues/267)



<a name="3.0.2"></a>
## [3.0.2](https://github.com/electron-userland/electron-builder/compare/v3.0.1...v3.0.2) (2016-03-25)


### Bug Fixes

* Error publishing to github when building on travis #261 ([92f7a38](https://github.com/electron-userland/electron-builder/commit/92f7a38)), closes [#261](https://github.com/electron-userland/electron-builder/issues/261)



<a name="3.0.1"></a>
## [3.0.1](https://github.com/electron-userland/electron-builder/compare/v3.0.0...v3.0.1) (2016-03-24)


### Bug Fixes

* copy extra resources to NuGet package ([65d8126](https://github.com/electron-userland/electron-builder/commit/65d8126)), closes [#230](https://github.com/electron-userland/electron-builder/issues/230)



<a name="3.0.0"></a>
# [3.0.0](https://github.com/electron-userland/electron-builder/compare/v2.11.0...v3.0.0) (2016-03-23)


### Bug Fixes

* Linux build fails at icon conversion #239 ([c778e2b](https://github.com/electron-userland/electron-builder/commit/c778e2b)), closes [#239](https://github.com/electron-userland/electron-builder/issues/239)
* Problems downloading electron #180 ([0265db9](https://github.com/electron-userland/electron-builder/commit/0265db9)), closes [#180](https://github.com/electron-userland/electron-builder/issues/180)
* update winstaller to fix build windows on OS X ([c2bd66b](https://github.com/electron-userland/electron-builder/commit/c2bd66b))
* zip, dmg and exe filenames do not use productName as intended ([bfca0a7](https://github.com/electron-userland/electron-builder/commit/bfca0a7))


### Code Refactoring

* remove deprecated API (<2.8) ([eadd09b](https://github.com/electron-userland/electron-builder/commit/eadd09b))


### Features

* copy extra resources to packaged app ([cbe3ff8](https://github.com/electron-userland/electron-builder/commit/cbe3ff8))
* linux icons from custom dir, generate missing from ICNS ([7ac4b84](https://github.com/electron-userland/electron-builder/commit/7ac4b84))
* remove support of `build` in the application package.json ([46dbfe1](https://github.com/electron-userland/electron-builder/commit/46dbfe1)), closes [#251](https://github.com/electron-userland/electron-builder/issues/251)


### BREAKING CHANGES

* `build` is allowed since 3.0 only in the development package.json
* Deprecated <2.8 API has been removed



<a name="2.9.5"></a>
## [2.9.5](https://github.com/electron-userland/electron-builder/compare/v2.9.4...v2.9.5) (2016-03-13)


### Bug Fixes

* Windows nupkg downloaded twice each time / also keeps downloading latest release #234 ([3c90af6](https://github.com/electron-userland/electron-builder/commit/3c90af6)), closes [#234](https://github.com/electron-userland/electron-builder/issues/234)



<a name="2.9.4"></a>
## [2.9.4](https://github.com/electron-userland/electron-builder/compare/v2.9.3...v2.9.4) (2016-03-13)


### Bug Fixes

* Github publishing not working on Linux #229 ([841f397](https://github.com/electron-userland/electron-builder/commit/841f397))
* delete release again if failed with "405 Not Allowed" (3 times) ([ebf783c](https://github.com/electron-userland/electron-builder/commit/ebf783c))
* ignore newline when parsing common name in .p12 certificates ([dee8303](https://github.com/electron-userland/electron-builder/commit/dee8303))
* npm install doesn't rebuild native dependencies if arch changed — rebuild must be used ([5bcc95a](https://github.com/electron-userland/electron-builder/commit/5bcc95a))
* reupload again if failed with "502 Bad Gateway" (3 times) ([f131e33](https://github.com/electron-userland/electron-builder/commit/f131e33))



<a name="2.9.0"></a>
# [2.9.0](https://github.com/electron-userland/electron-builder/compare/v2.8.6...v2.9.0) (2016-03-09)


### Bug Fixes

* **windows:** Releases file for Windows not uploaded to Github ([9f4fba9](https://github.com/electron-userland/electron-builder/commit/9f4fba9)), closes [#190](https://github.com/electron-userland/electron-builder/issues/190)
* **windows:** do not rename artifacts twice ([9c87ffd](https://github.com/electron-userland/electron-builder/commit/9c87ffd))
* Getting "no such file or directory, rename ..." #208 ([1b6012e](https://github.com/electron-userland/electron-builder/commit/1b6012e)), closes [#208](https://github.com/electron-userland/electron-builder/issues/208)


### Features

* Allow custom .p12 certificates ([6918916](https://github.com/electron-userland/electron-builder/commit/6918916)), closes [#216](https://github.com/electron-userland/electron-builder/issues/216)
* use productName from app/package.json if present #204 ([5d376e1](https://github.com/electron-userland/electron-builder/commit/5d376e1)), closes [#204](https://github.com/electron-userland/electron-builder/issues/204) [#223](https://github.com/electron-userland/electron-builder/issues/223)



<a name="2.8.4"></a>
## [2.8.4](https://github.com/electron-userland/electron-builder/compare/v2.8.3...v2.8.4) (2016-03-03)


### Bug Fixes

* Configure build resources directory #184 ([5df87d3](https://github.com/electron-userland/electron-builder/commit/5df87d3)), closes [#184](https://github.com/electron-userland/electron-builder/issues/184) [#196](https://github.com/electron-userland/electron-builder/issues/196)



<a name="2.8.3"></a>
## [2.8.3](https://github.com/electron-userland/electron-builder/compare/v2.8.2...v2.8.3) (2016-02-25)


### Bug Fixes

* **nsis:** error on win when APP_OUT_FILE has spaces ([f4e1b41](https://github.com/electron-userland/electron-builder/commit/f4e1b41))



<a name="2.8.2"></a>
## [2.8.2](https://github.com/electron-userland/electron-builder/compare/v2.8.1...v2.8.2) (2016-02-23)


### Bug Fixes

* remove unused dependency lodash.camelcase ([c7be41b](https://github.com/electron-userland/electron-builder/commit/c7be41b))



<a name="2.8.1"></a>
## [2.8.1](https://github.com/electron-userland/electron-builder/compare/v2.8.0...v2.8.1) (2016-02-23)


### Bug Fixes

* move read-package-json to production dependencies ([ac10716](https://github.com/electron-userland/electron-builder/commit/ac10716))



<a name="2.8.0"></a>
# [2.8.0](https://github.com/electron-userland/electron-builder/compare/v2.7.2...v2.8.0) (2016-02-23)


### Features

* use read-package-json as a correct fix of Linux maintainer .deb package field ([3fba451](https://github.com/electron-userland/electron-builder/commit/3fba451))

