import { log } from "builder-util"
import { isValidKey, Nullish } from "builder-util-runtime"
import { PlugDescriptor } from "../../../options/SnapOptions.js"

/** Plug resolution helpers shared by the snap cores. Kept pure (no packager state) so they can be unit tested. */

export const BROWSER_SUPPORT_INTERFACE = "browser-support"

/** Keyword in a `plugs` list that stands for electron-builder's default plug set. */
export const DEFAULT_PLUGS_KEYWORD = "default"

const MIGRATION_GUIDE = "https://www.electron.build/docs/migration/v27-breaking-changes"
export const CORE24_NO_ALLOW_SANDBOX_DOCS = `${MIGRATION_GUIDE}#snap-core24-no-allow-sandbox-by-default`
export const CORE24_DEFAULT_PLUGS_MERGE_DOCS = `${MIGRATION_GUIDE}#snap-core24-default-in-plugs-merges-the-full-default-set`

/** App-level plugs core24 declares when it is not delegating them to the `gnome` extension. */
export const CORE24_DEFAULT_APP_PLUGS: ReadonlyArray<string> = [
  "desktop",
  "desktop-legacy",
  "home",
  "x11",
  "wayland",
  "unity7",
  "network",
  "gsettings",
  "audio-playback",
  "pulseaudio",
  "opengl",
]

export type SnapPlugsConfig = Array<string | PlugDescriptor> | PlugDescriptor | Nullish

/** Root-level plug definitions plus the app-level plug references for a snap. */
export interface ResolvedSnapPlugs {
  root: Record<string, any> | undefined
  app: string[] | undefined
}

/**
 * Which plugs core24 generates on its own:
 * - `classic`: none — the snap store review rejects classic snaps that declare plugs
 * - `gnome-extension`: only `browser-support` — the extension supplies the desktop plugs and content snaps
 *   (gnome-46-2404, gtk-3-themes, icon-themes, sound-themes) itself
 * - `host`: the app-level default plugs plus `browser-support`, no content-snap root plugs
 * - `strict`: the content-snap root plugs, the app-level default plugs and `browser-support`
 */
export type Core24PlugFlavor = "classic" | "gnome-extension" | "host" | "strict"

export interface Core24PlugResolution extends ResolvedSnapPlugs {
  /**
   * `generated` — `plugs` is unset, so electron-builder's own set is used;
   * `merged` — the `plugs` list contains `"default"`, so the user's entries are merged into the default set;
   * `explicit` — the user's `plugs` replace the defaults.
   */
  source: "generated" | "merged" | "explicit"
  /**
   * Only for `merged`: plugs the v27 `"default"` expansion adds that the previous expansion (the app-level
   * default list plus the user's own entries) did not, e.g. `browser-support` and the content-snap plugs.
   */
  addedByDefaultExpansion: string[]
}

/** Root-level content-snap plugs wiring up the GNOME platform, theme, and GPU content snaps manually (no extension). */
export function core24ContentPlugs(): Record<string, any> {
  return {
    "gtk-3-themes": {
      interface: "content",
      target: "$SNAP/data-dir/themes",
      "default-provider": "gtk-common-themes",
    },
    "icon-themes": {
      interface: "content",
      target: "$SNAP/data-dir/icons",
      "default-provider": "gtk-common-themes",
    },
    "sound-themes": {
      interface: "content",
      target: "$SNAP/data-dir/sounds",
      "default-provider": "gtk-common-themes",
    },
    "gnome-46-2404": {
      interface: "content",
      target: "$SNAP/gnome-platform",
      "default-provider": "gnome-46-2404",
    },
    "gpu-2404": {
      interface: "content",
      target: "$SNAP/gpu-2404",
      "default-provider": "mesa-2404",
    },
  }
}

/**
 * The plugs core24 declares when `plugs` is unset.
 *
 * `browser-support` is requested *without* `allow-sandbox`: the snap store reserves that attribute for
 * vetted publishers (browsers) and rejects other uploads that request it. Without it the app is launched
 * with `--no-sandbox` and relies on the snap confinement (see SnapCore24).
 */
export function core24GeneratedPlugs(flavor: Core24PlugFlavor, appDefaults: ReadonlyArray<string> = CORE24_DEFAULT_APP_PLUGS): ResolvedSnapPlugs {
  const browserSupport = { [BROWSER_SUPPORT_INTERFACE]: { interface: BROWSER_SUPPORT_INTERFACE } }
  switch (flavor) {
    case "classic":
      return { root: undefined, app: undefined }
    case "gnome-extension":
      return { root: browserSupport, app: [BROWSER_SUPPORT_INTERFACE] }
    case "host":
      return { root: browserSupport, app: [...appDefaults, BROWSER_SUPPORT_INTERFACE] }
    case "strict":
      return { root: { ...core24ContentPlugs(), ...browserSupport }, app: [...appDefaults, BROWSER_SUPPORT_INTERFACE] }
  }
}

/**
 * Resolve core24 plugs from the user's `plugs` option.
 *
 * - unset: the generated set for the build flavor (see core24GeneratedPlugs)
 * - a list containing `"default"`: the full default set — the app-level default plugs plus everything the
 *   flavor generates — with the user's other entries added to it, deduplicated by plug name. A descriptor
 *   whose name matches a default plug overrides that plug's attributes (shallow merge; `null` resets it to
 *   the snapd defaults for the interface).
 * - anything else: the user's plugs replace the defaults.
 */
export function resolveCore24Plugs(plugs: SnapPlugsConfig, flavor: Core24PlugFlavor, appDefaults: ReadonlyArray<string> = CORE24_DEFAULT_APP_PLUGS): Core24PlugResolution {
  if (!plugs) {
    return { ...core24GeneratedPlugs(flavor, appDefaults), source: "generated", addedByDefaultExpansion: [] }
  }
  if (!Array.isArray(plugs) || !plugs.includes(DEFAULT_PLUGS_KEYWORD)) {
    return { ...normalizeSnapPlugs(plugs), source: "explicit", addedByDefaultExpansion: [] }
  }

  const generated = core24GeneratedPlugs(flavor, appDefaults)
  const defaultAppPlugs = [...appDefaults, ...(generated.app ?? [])]
  const defaultRoot: Record<string, any> = { ...generated.root }

  const app: string[] = []
  const appSeen = new Set<string>()
  const addApp = (name: string) => {
    if (!appSeen.has(name)) {
      appSeen.add(name)
      app.push(name)
    }
  }
  const userRoot: Record<string, any> = {}
  const userNames = new Set<string>()

  for (const item of plugs) {
    if (item === DEFAULT_PLUGS_KEYWORD) {
      defaultAppPlugs.forEach(addApp)
      continue
    }
    if (typeof item === "string") {
      assertValidPlugName(item)
      userNames.add(item)
      addApp(item)
      continue
    }
    for (const [name, config] of Object.entries(item)) {
      assertValidPlugName(name)
      userNames.add(name)
      userRoot[name] = config
      addApp(name)
    }
  }

  const root: Record<string, any> = { ...defaultRoot }
  for (const [name, config] of Object.entries(userRoot)) {
    const base = defaultRoot[name]
    root[name] = isPlainObject(base) && isPlainObject(config) ? { ...base, ...config } : config
  }

  // Before v27, "default" expanded to the app-level default list only, followed by the user's own entries.
  const previousExpansion = new Set<string>([...appDefaults, ...userNames])
  const addedByDefaultExpansion = [...new Set([...app, ...Object.keys(root)])].filter(name => !previousExpansion.has(name))

  return {
    root: Object.keys(root).length > 0 ? root : undefined,
    app: app.length > 0 ? app : undefined,
    source: "merged",
    addedByDefaultExpansion,
  }
}

/** Split a plugs config (no `"default"` expansion) into root-level definitions and app-level references. */
export function normalizeSnapPlugs(plugs: SnapPlugsConfig): ResolvedSnapPlugs {
  if (!plugs || (Array.isArray(plugs) && plugs.length === 0)) {
    return { root: undefined, app: undefined }
  }
  const root: Record<string, any> = {}
  const app: string[] = []

  if (!Array.isArray(plugs)) {
    for (const [name, config] of Object.entries(plugs)) {
      assertValidPlugName(name)
      root[name] = config
      app.push(name)
    }
    return { root, app }
  }

  for (const item of plugs) {
    if (typeof item === "string") {
      app.push(item)
      continue
    }
    for (const [name, config] of Object.entries(item)) {
      assertValidPlugName(name)
      root[name] = config
      app.push(name)
    }
  }
  return { root: Object.keys(root).length > 0 ? root : undefined, app: app.length > 0 ? app : undefined }
}

/** Whether the resolved root plugs grant Chromium's own sandbox (`browser-support` with `allow-sandbox: true`). */
export function isBrowserSandboxAllowed(rootPlugs: Record<string, any> | Nullish): boolean {
  if (!rootPlugs) {
    return false
  }
  return Object.values(rootPlugs).some(plug => plug?.interface === BROWSER_SUPPORT_INTERFACE && plug["allow-sandbox"] === true)
}

/**
 * Names of the root-level plugs that request `browser-support` with `allow-sandbox: true`. A plug without an
 * explicit `interface` uses its name as the interface, as snapd does.
 */
export function findAllowSandboxPlugs(rootPlugs: Record<string, any> | Nullish): string[] {
  if (!rootPlugs) {
    return []
  }
  return Object.entries(rootPlugs)
    .filter(([name, plug]) => isPlainObject(plug) && (plug.interface ?? name) === BROWSER_SUPPORT_INTERFACE && plug["allow-sandbox"] === true)
    .map(([name]) => name)
}

const emittedNotices = new Set<string>()

/** Log a warning once per process (keyed by `key`), so multi-arch builds do not repeat it. */
function warnOnce(key: string, fields: Record<string, any>, message: string): void {
  if (emittedNotices.has(key)) {
    return
  }
  emittedNotices.add(key)
  log.warn(fields, message)
}

/** @internal test-only: forget which once-per-process snap plug notices were already logged. */
export function resetSnapPlugNoticesForTests(): void {
  emittedNotices.clear()
}

/** Warn that the snap store reserves `allow-sandbox` for vetted publishers. The configuration is left as is. */
export function warnAboutAllowSandboxPlugs(rootPlugs: Record<string, any> | Nullish, optionPath: string): void {
  const plugNames = findAllowSandboxPlugs(rootPlugs)
  if (plugNames.length === 0) {
    return
  }
  warnOnce(
    `allow-sandbox:${optionPath}:${plugNames.join(",")}`,
    { plugs: plugNames.join(", "), option: optionPath },
    `${optionPath} requests the browser-support interface with "allow-sandbox: true". ` +
      "The Snap Store reserves allow-sandbox for vetted publishers (browsers), so store review rejects this snap unless your publisher has been granted it. " +
      "Remove the attribute to launch with --no-sandbox under snap confinement instead. " +
      `See ${CORE24_NO_ALLOW_SANDBOX_DOCS}`
  )
}

/** v27 behaviour-change notice: default core24 plugs no longer keep Chromium's sandbox. */
export function warnAboutCore24NoSandboxDefault(): void {
  warnOnce(
    "core24-no-sandbox-default",
    { reason: "the Snap Store rejects allow-sandbox from non-vetted publishers", solution: "no action needed unless you are a vetted publisher" },
    `snapcraft.core24 now requests the plain browser-support interface by default (electron-builder <= 26 added "allow-sandbox: true", which the Snap Store rejects for most publishers). ` +
      "The app is launched with --no-sandbox and chrome-sandbox is left out of the snap; snap confinement isolates the app instead. " +
      `See ${CORE24_NO_ALLOW_SANDBOX_DOCS}`
  )
}

/** v27 behaviour-change notice: `"default"` in core24 `plugs` now expands to the full default set. */
export function warnAboutCore24DefaultPlugsExpansion(added: string[]): void {
  if (added.length === 0) {
    return
  }
  warnOnce(
    `core24-default-plugs:${added.join(",")}`,
    { added: added.join(", ") },
    `"default" in snapcraft.core24.plugs now expands to the full default plug set, so these plugs are added to your snap. ` +
      `electron-builder <= 26 expanded it to the app-level desktop plugs only. ` +
      `See ${CORE24_DEFAULT_PLUGS_MERGE_DOCS}`
  )
}

function assertValidPlugName(name: string): void {
  if (!isValidKey(name)) {
    throw new Error(`Invalid plug/slot name: ${name}`)
  }
}

function isPlainObject(value: unknown): value is Record<string, any> {
  return value != null && typeof value === "object" && !Array.isArray(value)
}
