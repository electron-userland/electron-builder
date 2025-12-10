<<<<<<< HEAD
<<<<<<< HEAD
import { TargetSpecificOptions } from "../core.js"
<<<<<<< HEAD
import { SnapcraftYAML } from "../targets/snap/snapcraft.js"
import { CommonLinuxOptions } from "./linuxOptions.js"
=======
import { TargetSpecificOptions } from "../core"
=======
import { TargetSpecificOptions } from "../core.js"
>>>>>>> d26567f58 (tmp save)
import { CommonLinuxOptions } from "./linuxOptions.js.js"
>>>>>>> 5a5d2b7d9 (tmp save for .js extension migration)
=======
import { CommonLinuxOptions } from "./linuxOptions.js"
>>>>>>> c92b22265 (tmp save for .js extension migration)

/**
 * New-style snap configuration. Use this via the `snapcraft` key in your build config.
 * Selects the snapcraft core version and its per-core options.
 */
export interface SnapcraftOptions extends TargetSpecificOptions {
  /**
   * The snap base to use as the execution environment. Determines which set of per-core options
   * (`core18`, `core20`, `core22`, `core24`, `custom`) is active.
   *
   * Only one core may be selected per build target.
   */
  readonly base: "core18" | "core20" | "core22" | "core24" | "custom"

  /**
   * Snapcraft Store credentials — base64-encoded credentials string or file path.
   * Accepts the same formats as `WIN_CSC_LINK` / `CSC_LINK`: base64 data,
   * absolute/relative/`~/` file paths, and `file://` URIs.
   * Relative paths are resolved against the build resources directory.
   *
   * Injected as `SNAPCRAFT_STORE_CREDENTIALS` into every snapcraft subprocess
   * (core18/core20/core22/core24 builds and `snapcraft upload`).
   * Not applied for `base: "custom"` — inject credentials manually via environment variables.
   *
   * The `SNAP_CSC_LINK` environment variable is the CI-friendly alternative.
   * Generate with: `snapcraft export-login - | base64 -w0`
   */
  readonly cscLink?: string

  /**
   * Configuration for a core18 build. Only active when `base` is `"core18"`.
   */
  readonly core18?: SnapOptionsLegacy | null
  /**
   * Configuration for a core20 build. Only active when `base` is `"core20"`.
   */
  readonly core20?: SnapOptionsLegacy | null
  /**
   * Configuration for a core22 build. Only active when `base` is `"core22"`.
   */
  readonly core22?: SnapOptionsLegacy | null

  /**
   * **[Beta]** Options for building a core24 snap. Uses the snapcraft CLI directly.
   * Inherits desktop-entry fields from `CommonLinuxOptions` and publish config from `TargetSpecificOptions`.
   * @beta
   */
  readonly core24?: SnapOptions24 | null
  /**
   * **[Beta]** Pass-through custom snap configuration. electron-builder will read the
   * snapcraft.yaml at `yamlPath` and use it verbatim — no plugs, extensions,
   * organize mappings, or desktop files are injected.
   * @beta
   */
  readonly custom?: SnapOptionsCustom | null
}
// Internal alias used by the core18/20/22 backward-compat fields in SnapcraftOptions.
// Not tagged @deprecated itself to avoid cascading TS6385 hints onto those properties.
export type SnapOptionsLegacy = Omit<SnapOptions, "base">

export interface SnapOptionsCustom {
  /**
   * Supports 2 routes:
   * - Path to an existing `snapcraft.yaml` file, relative to `buildResourcesDir`. electron-builder reads the file and passes it through without modification.
   * - A `SnapcraftYAML` object directly in the configuration. electron-builder uses the object to generate a `snapcraft.yaml` file, which is then passed through without modification.
   */
  readonly yaml?: string | SnapcraftYAML | null
}

/**
 * Flat snap options. Used via the `snap` key in your build config.
 *
 * @deprecated Prefer the `snapcraft` key with an explicit `base` field (e.g.
 * `{ "snapcraft": { "base": "core24", "core24": { ... } } }`). The flat `snap`
 * interface is maintained for backward compatibility and targets `core22` and
 * older snap bases only.
 *
 * Fields inherited from {@link CommonLinuxOptions} (e.g. `description`, `category`,
 * `mimeTypes`, `executableArgs`) are automatically populated from `linux.*` configuration
 * and do not need to be repeated here. Per-core values take precedence when both are set.
 */
export interface SnapOptions extends CommonLinuxOptions, TargetSpecificOptions {
  /**
   * The snap base to use as the execution environment.
   * Examples: `core18`, `core20`, `core22`.
   *
   * For new projects, use the `snapcraft` key with `base: "core24"` instead of
   * this legacy interface.
   */
  readonly base?: string | null

  /**
   * Whether to use the pre-built Electron snap template for faster builds.
   * When `true`, electron-builder delegates snap assembly to the upstream Electron snap
   * template rather than running a full snapcraft build, significantly reducing build time.
   * Defaults to `true` when `stagePackages` is not customised.
   * Only applicable to x64 and armv7l builds.
   */
  readonly useTemplateApp?: boolean

  /**
   * The type of [snap confinement](https://snapcraft.io/docs/reference/confinement).
   * - `strict` — recommended; the snap runs in a fully isolated sandbox.
   * - `devmode` — sandbox violations are logged but not enforced; for development only.
   * - `classic` — no confinement; equivalent to a traditionally packaged application.
   *   Requires Snap Store approval before publishing.
   * @default strict
   */
  readonly confinement?: "devmode" | "strict" | "classic" | null

  /**
   * Environment variables injected into the snap's runtime environment.
   * Merged with the electron-builder default `{ TMPDIR: "$XDG_RUNTIME_DIR" }`.
   * User-supplied values take precedence.
   */
  readonly environment?: { [key: string]: string } | null

  /**
   * A short summary of the snap (max 78 characters).
   * Defaults to [productName](./configuration.md#productName).
   */
  readonly summary?: string | null

  /**
   * The quality grade of the snap.
   * - `stable` — suitable for all channels, including `stable` and `candidate`.
   * - `devel` — development snapshot; cannot be promoted to `stable` or `candidate`.
   * @default stable
   */
  readonly grade?: "devel" | "stable" | null

  /**
   * [Snapd features](https://snapcraft.io/docs/snapcraft-yaml-reference#assumes) that must
   * be present on the host before the snap can be installed.
   */
  readonly assumes?: Array<string> | string | null

  /**
   * Debian packages required at **build** time (installed inside the build environment).
   */
  readonly buildPackages?: Array<string> | null

  /**
   * Ubuntu packages to **stage** alongside the app (equivalent to `depends` for deb).
   * Defaults to `["libnspr4", "libnss3", "libxss1", "libappindicator3-1", "libsecret-1-0"]`.
   *
   * Use the `"default"` keyword to extend the default list:
   * `["default", "my-extra-lib"]` appends `my-extra-lib` to the defaults.
   */
  readonly stagePackages?: Array<string> | null

  /**
   * Directory containing [snap hooks](https://snapcraft.io/docs/snap-hooks), relative to
   * the build resources directory (`build/`).
   * @default build/snap-hooks
   */
  readonly hooks?: string | null

  /**
   * [Plugs](https://snapcraft.io/docs/reference/interfaces) (consumed interfaces) to declare
   * for the app entry point.
   * Defaults to `["desktop", "desktop-legacy", "home", "x11", "wayland", "unity7",
   * "browser-support", "network", "gsettings", "audio-playback", "pulseaudio", "opengl"]`.
   *
   * Use `"default"` in the list to keep the defaults and append extras:
   * `["default", "camera"]` adds `camera` to the standard set.
   *
   * To configure plug attributes (e.g. `allow-sandbox` for Chromium's internal sandbox),
   * use a descriptor object:
   * ```json
   * [
   *   { "browser-sandbox": { "interface": "browser-support", "allow-sandbox": true } },
   *   "another-simple-plug-name"
   * ]
   * ```
   */
  readonly plugs?: Array<string | PlugDescriptor> | PlugDescriptor | null

  /**
   * [Slots](https://snapcraft.io/docs/reference/interfaces) (provided interfaces) to declare
   * for the app.
   *
   * To expose an MPRIS player under the Chromium bus name (required for strict confinement):
   * ```json
   * [{ "mpris": { "name": "chromium" } }]
   * ```
   * Chromium [hard-codes](https://source.chromium.org/chromium/chromium/src/+/master:components/system_media_controls/linux/system_media_controls_linux.cc;l=51;bpv=0;bpt=1)
   * the bus name `chromium`, so the slot name must match for snapd to
   * [allow it](https://forum.snapcraft.io/t/unable-to-use-mpris-interface/15360/7).
   */
  readonly slots?: Array<string | SlotDescriptor> | SlotDescriptor | null

  /**
   * Names of snapcraft parts that must be built before the app part.
   * Defaults to `["desktop-gtk2"]`.
   *
   * Use `"default"` to keep the default and add extras:
   * `["default", "my-helper-part"]`.
   */
  readonly after?: Array<string> | null

  /**
   * Whether the snap should automatically start on login.
   * @default false
   */
  readonly autoStart?: boolean

  /**
   * [Snap layouts](https://snapcraft.io/docs/snap-layouts) — bind-mount or symlink host paths
   * into the snap's namespace, making libraries or config at `/usr`, `/var`, `/etc`, etc.
   * accessible inside the confined environment.
   */
  readonly layout?: { [key: string]: { [key: string]: string } } | null

  /**
   * Filesets controlling which files from the app part are staged into the snap.
   * Supports individual files, directories, globs, globstars, and exclusions (prefix `!`).
   * See [Snapcraft filesets](https://snapcraft.io/docs/snapcraft-filesets).
   * When not set, the snap template's default stage list is used for legacy bases (core18/core20/core22).
   */
  readonly appPartStage?: Array<string> | null

  /**
   * Display title for the snap (may contain uppercase letters and spaces).
   * Defaults to `productName`.
   * See [snap format](https://snapcraft.io/docs/snap-format).
   */
  readonly title?: string | null

  /**
   * Compression algorithm for the snap SquashFS image.
   * - `xz` — smaller file, slower decompression (good for distribution).
   * - `lzo` — larger file, faster decompression (good for development iteration).
   * Omit to use snapcraft's default (`xz`).
   *
   * When not set, `linux.compression` is mapped automatically:
   * `"store"` → `"lzo"`, `"maximum"` → `"xz"`, `"normal"` → snapcraft default.
   * Explicitly setting this field always overrides the mapped value.
   */
  readonly compression?: "xz" | "lzo" | null

  /**
   * Allow the snap to run with native Wayland support (`--ozone-platform=wayland`).
   * Defaults to `false` for Electron < 38 (legacy behaviour); `true` for Electron ≥ 38.
   * Set explicitly to override the version-based default.
   */
  readonly allowNativeWayland?: boolean | null
}

/**
 * Configuration for a remote snap build on [Launchpad](https://launchpad.net/).
 * Remote builds run on Canonical's infrastructure without requiring native hardware or nested virtualisation.
 *
 * Each electron-builder build invocation targets exactly one architecture — to build for multiple
 * architectures, configure the top-level `arch` option (e.g. `arch: ["x64", "arm64"]`); each arch
 * spawns a separate `snapcraft remote-build` job on Launchpad.
 *
 * Authentication is resolved in this order:
 * 1. `cscLink` config field — base64-encoded credentials or a file path
 * 2. `SNAP_CSC_LINK` environment variable — same format as `cscLink`
 *    (CI-recommended; follows the same pattern as `WIN_CSC_LINK` for Windows code signing)
 * 3. `SNAPCRAFT_STORE_CREDENTIALS` environment variable (read directly by snapcraft)
 * 4. An active interactive `snapcraft login` session
 *
 * **CI setup** (set once as a CI secret):
 * ```sh
 * export SNAP_CSC_LINK=$(snapcraft export-login - | base64 -w0)
 * ```
 * The resolved credentials are injected only into the spawned `snapcraft` subprocess
 * environment and never exposed through `process.env`.
 */
export interface RemoteBuildOptions {
  /**
   * Whether to enable remote build on Launchpad. Must be set explicitly to `true` to opt in.
   */
  enabled: boolean

  /**
   * Your Launchpad username. Used to select the correct Launchpad account when more than
   * one set of credentials is available.
   */
  launchpadUsername?: string

  /**
   * Target architecture for the remote build. Accepts a single snapcraft arch string
   * (e.g. `"amd64"`, `"arm64"`, `"armhf"`).
   *
   * To build for multiple architectures, configure electron-builder's top-level `arch` option
   * (e.g. `arch: ["x64", "arm64"]`) — each arch spawns a separate remote-build job on Launchpad,
   * keeping the one-build-per-artifact contract intact.
   * @example "amd64"
   */
  buildFor?: string

  /**
   * Suppress the Launchpad public-upload consent prompt by automatically accepting it.
   * Your source code will be uploaded to a **public** Launchpad repository.
   * Set to `true` in CI once you understand the implications.
   */
  acceptPublicUpload?: boolean

  /**
   * Launchpad project name to use for a **private** source upload.
   * The project must already exist and you must have write access.
   */
  privateProject?: string

  /**
   * Resume a previously interrupted remote build rather than starting a new one.
   */
  recover?: boolean

  /**
   * Maximum time in seconds to wait for the remote build to complete before aborting.
   * Passed to `snapcraft remote-build` as `--timeout <seconds>`.
   *
   * @example 1800  // 30 minutes
   */
  timeout?: number

  /**
   * Controls whether snapcraft may fall back to a different remote build strategy.
   * - `"disable-fallback"` — always use the primary strategy, fail if unavailable.
   * - `"force-fallback"` — always use the fallback strategy.
   */
  strategy?: "disable-fallback" | "force-fallback"
}

/**
 * **[Beta]** Options for building a core24 snap. This interface does not extend the legacy
 * `SnapBaseOptions` — it uses the snapcraft CLI directly.
 *
 * Fields inherited from {@link CommonLinuxOptions} (`description`, `category`, `mimeTypes`,
 * `executableArgs`, `desktop`, `synopsis`) are automatically populated from the root `linux.*`
 * configuration. You do not need to duplicate them here; values set directly on this interface
 * take precedence over the cascaded `linux.*` values.
 *
 * @beta
 */
export interface SnapOptions24 extends CommonLinuxOptions, TargetSpecificOptions {
  // ─── Build environment (mutually exclusive) ─────────────────────────────────

  /**
   * Use [LXD](https://canonical.com/lxd) as the isolated build environment.
   * Preferred over Multipass on most Linux CI systems where nested virtualisation is unavailable.
   * Mutually exclusive with `useMultipass` and `useDestructiveMode`.
   */
  readonly useLXD?: boolean | null

  /**
   * Use [Multipass](https://multipass.run/) as the isolated build environment.
   * Mutually exclusive with `useLXD` and `useDestructiveMode`.
   */
  readonly useMultipass?: boolean | null

  /**
   * Build directly on the host without an isolated VM or container (snapcraft `--destructive-mode`).
   * Equivalent to setting `SNAPCRAFT_BUILD_ENVIRONMENT=host`.
   *
   * **Not recommended for most use cases.** Destructive mode pollutes the host environment
   * and produces builds that are difficult to reproduce — any library or tool present on the
   * host at build time can silently end up in the snap. Prefer `useLXD` or `useMultipass`
   * for clean, reproducible builds; use `remoteBuild` for multi-architecture CI.
   *
   * Valid reasons to enable this option:
   * - Building inside a Docker container where nested virtualisation (LXD / Multipass) is
   *   unavailable and a remote Launchpad build is not acceptable.
   * - Running test suites in CI where the environment is already fully controlled.
   *
   * The `gnome` extension is incompatible with this mode enabled — do not include it in `extensions`.
   * @see https://snapcraft.io/docs/build-options
   */
  readonly useDestructiveMode?: boolean | null

  /**
   * Configuration for a remote build on [Launchpad](https://launchpad.net/).
   * Enables cross-architecture builds in CI without native hardware or nested virtualisation.
   * Each build invocation targets one arch; use `arch: ["x64", "arm64"]` to build for multiple.
   */
  readonly remoteBuild?: RemoteBuildOptions | null

  // ─── Snapcraft extensions ────────────────────────────────────────────────────

  /**
   * [Snapcraft extensions](https://snapcraft.io/docs/snapcraft-extensions) to apply to the app.
   * Defaults to `["gnome"]` in normal builds (recommended for Electron apps on Ubuntu 24.04+).
   * Automatically set to `[]` in `useDestructiveMode` builds, where the gnome extension is
   * incompatible. Explicitly including `"gnome"` while `useDestructiveMode` is set will throw.
   * See: https://snapcraft.io/docs/gnome-extension
   */
  readonly extensions?: Array<string> | null

  // ─── Snap metadata ───────────────────────────────────────────────────────────

  /**
   * The type of [confinement](https://snapcraft.io/docs/reference/confinement) supported by the snap.
   * @default strict
   */
  readonly confinement?: "devmode" | "strict" | "classic" | null

  /**
   * The quality grade of the snap.
   * `devel` — not publishable to stable/candidate channels.
   * `stable` — suitable for all channels.
   * @default stable
   */
  readonly grade?: "devel" | "stable" | null

  /**
   * A short summary of the snap (max 78 characters). Defaults to `productName`.
   */
  readonly summary?: string | null

  /**
   * An optional display title (may contain uppercase letters and spaces). Defaults to `productName`.
   * See [snap format](https://snapcraft.io/docs/snap-format).
   */
  readonly title?: string | null

  /**
   * Compression algorithm for the snap SquashFS image.
   * - `xz` — smaller file, slower decompression (recommended for distribution).
   * - `lzo` — larger file, faster decompression (useful for development iteration).
   * Omit to use snapcraft's default (`xz`).
   *
   * When not set, `linux.compression` is mapped automatically:
   * `"store"` → `"lzo"`, `"maximum"` → `"xz"`, `"normal"` → snapcraft default.
   * Explicitly setting this field always overrides the mapped value.
   */
  readonly compression?: "xz" | "lzo" | null

  /**
   * Features that must be supported by the host snapd before the snap can be installed.
   * See [assumes](https://snapcraft.io/docs/snapcraft-yaml-reference#assumes).
   */
  readonly assumes?: Array<string> | string | null

  // ─── Build packages / stage packages ────────────────────────────────────────

  /**
   * Debian packages required at **build** time (installed inside the build environment).
   */
  readonly buildPackages?: Array<string> | null

  /**
   * Ubuntu packages to **stage** alongside the app (equivalent to `depends` for deb).
   * Defaults to `["libnspr4", "libnss3", "libxss1", "libappindicator3-1", "libsecret-1-0"]`.
   * Supports the `"default"` keyword to reference the default list:
   * `["default", "my-extra-lib"]` appends `my-extra-lib` to the defaults.
   */
  readonly stagePackages?: Array<string> | null

  /**
   * Filesets controlling which files from the app part are staged into the snap.
   * Supports glob patterns and exclusions. See [filesets](https://snapcraft.io/docs/snapcraft-filesets).
   */
  readonly appPartStage?: Array<string> | null

  /**
   * Names of other snapcraft parts that must be built before the app part.
   */
  readonly after?: Array<string> | null

  // ─── Snap interfaces ─────────────────────────────────────────────────────────

  /**
   * [Plugs](https://snapcraft.io/docs/reference/interfaces) (consumed interfaces) for the app.
   * When the `gnome` extension is active, content-snap plugs (themes, GNOME platform, GPU)
   * are added automatically — only list custom plugs here.
   * Without any extension, defaults to the standard Electron plug set.
   *
   * Supports descriptor objects for plugs with attributes:
   * ```json
   * [{ "browser-sandbox": { "interface": "browser-support", "allow-sandbox": true } }]
   * ```
   */
  readonly plugs?: Array<string | PlugDescriptor> | PlugDescriptor | null

  /**
   * [Slots](https://snapcraft.io/docs/reference/interfaces) (provided interfaces) for the app.
   * Use for MPRIS, D-Bus services, etc.
   *
   * Example — expose MPRIS under the Chromium bus name:
   * ```json
   * [{ "mpris": { "name": "chromium" } }]
   * ```
   */
  readonly slots?: Array<string | SlotDescriptor> | SlotDescriptor | null

  /**
   * [Snap layouts](https://snapcraft.io/docs/snap-layouts) — bind-mount or symlink host paths
   * into the snap's namespace. User-provided layouts always override the extension defaults.
   */
  readonly layout?: { [key: string]: { [key: string]: string } } | null

  // ─── Runtime environment ─────────────────────────────────────────────────────

  /**
   * Additional environment variables injected into the snap's runtime environment.
   * Merged with the electron-builder defaults (`TMPDIR=$XDG_RUNTIME_DIR`).
   * User-supplied values take precedence.
   */
  readonly environment?: { [key: string]: string } | null

  /**
   * Whether the app should auto-start on login (creates an autostart desktop entry).
   * @default false
   */
  readonly autoStart?: boolean

  /**
   * Set to `true` to force X11 by injecting `--ozone-platform=x11` into the snap command line.
   * When unset or `false`, no flag is injected and native Wayland is allowed.
   * Unlike the legacy `snap.allowNativeWayland`, there is no electron-version-based default here —
   * core24 always allows Wayland unless this is explicitly `true`.
   */
  readonly forceX11?: boolean | null

  // ─── Hooks ───────────────────────────────────────────────────────────────────

  /**
   * Directory containing [snap hooks](https://snapcraft.io/docs/snap-hooks), relative to
   * the build resources directory.
   * @default build/snap-hooks
   */
  readonly hooks?: string | null
}

/**
 * Maps a named plug to its attribute object.
 * `null` uses snapd defaults for that interface.
 *
 * @example
 * ```json
 * { "browser-sandbox": { "interface": "browser-support", "allow-sandbox": true } }
 * ```
 */
export interface PlugDescriptor {
  [key: string]: { [key: string]: any } | null
}

/**
 * Maps a named slot to its attribute object.
 * `null` uses snapd defaults for that interface.
 *
 * @example
 * ```json
 * { "mpris": { "name": "chromium" } }
 * ```
 */
export interface SlotDescriptor {
  [key: string]: { [key: string]: any } | null
}
