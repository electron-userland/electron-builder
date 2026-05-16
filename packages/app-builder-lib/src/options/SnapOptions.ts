import { TargetSpecificOptions } from "../core"
import { SnapcraftYAML } from "../targets/snap/snapcraft"
import { CommonLinuxOptions } from "./linuxOptions"

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
   * core18; Migrates configuration from the legacy `snap` field for backward compatibility, but only applies if the core is selected in `base`.
   */
  readonly core18?: SnapOptionsLegacy | null
  /**
   * core20; Migrates configuration from the legacy `snap` field for backward compatibility, but only applies if the core is selected in `base`.
   */
  readonly core20?: SnapOptionsLegacy | null
  /**
   * core22; Migrates configuration from the legacy `snap` field for backward compatibility, but only applies if the core is selected in `base`.
   */
  readonly core22?: SnapOptionsLegacy | null

  /**
   * [Beta support] Options for building a core24 snap. This is a fresh, forward-looking interface that does not extend the legacy `SnapBaseOptions`.
   * Inherits desktop-entry fields from `CommonLinuxOptions` (categories, mimeTypes, executableArgs, etc.) and publish configuration from `TargetSpecificOptions`.
   * @beta
   */
  readonly core24?: SnapOptions24 | null
  /**
   * [Beta support] Pass-through custom snap configuration. electron-builder will read the
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
   *
   * The built-in defaults are in [snapcraft.ts](https://github.com/electron-userland/electron-builder/blob/master/packages/app-builder-lib/src/targets/snap/snapcraft.ts).
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
   */
  readonly compression?: "xz" | "lzo" | null

  /**
   * Allow the snap to run with native Wayland support (`--ozone-platform=wayland`).
   * Disabled by default due to compatibility issues in some Electron/snap combinations.
   * @default false
   */
  readonly allowNativeWayland?: boolean | null
}

/**
 * Configuration for a remote snap build on [Launchpad](https://launchpad.net/).
 * Remote builds run on Canonical's infrastructure and support multiple architectures
 * (amd64, arm64, armhf) without requiring native hardware or nested virtualisation.
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
   * Snapcraft Store credentials — a base64-encoded credentials string or a file path.
   * Accepts the same formats as `WIN_CSC_LINK` / `CSC_LINK` on Windows and macOS:
   * base64 data, absolute/relative/`~/` file paths, and `file://` URIs.
   *
   * Generate a credentials string for CI:
   * ```sh
   * export SNAP_CSC_LINK=$(snapcraft export-login - | base64 -w0)
   * ```
   *
   * The `SNAP_CSC_LINK` environment variable is the CI-friendly alternative when you
   * cannot embed credentials in the build config.
   */
  cscLink?: string

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
 * Options for building a core24 snap. This is a fresh, forward-looking interface that does
 * not extend the legacy `SnapBaseOptions`. It inherits desktop-entry fields from
 * `CommonLinuxOptions` (categories, mimeTypes, executableArgs, etc.) and publish
 * configuration from `TargetSpecificOptions`.
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
   * Enables multi-architecture builds (amd64, arm64, armhf) in CI without native hardware.
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
   * Allow running the application with native Wayland support (`--ozone-platform=wayland`).
   * For core24 this defaults to `true`. Set to `false` to force X11 mode via XWayland.
   * @default true
   */
  readonly allowNativeWayland?: boolean | null

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
