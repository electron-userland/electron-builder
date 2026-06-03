import { Arch, archFromString, copyDir, InvalidConfigurationError, log, removeNullish, toLinuxArchString } from "builder-util"
import { copy, mkdir, readdir, writeFile } from "fs-extra"
import * as path from "path"
import { PlugDescriptor, SlotDescriptor, SnapOptions24 } from "../../options/SnapOptions"
import { SnapCore } from "./SnapTarget"
import { App, Part, SnapcraftYAML } from "./snapcraft"
import { buildSnap, DEFAULT_STAGE_PACKAGES, SNAPCRAFT_YAML_OPTIONS } from "./snapcraftBuilder"
import * as yaml from "js-yaml"
import { deepAssign, isValidKey, Nullish } from "builder-util-runtime"

/** Snap build strategy for core24 — generates a native snapcraft.yaml and invokes the snapcraft CLI. */
export class SnapCore24 extends SnapCore<SnapOptions24> {
  // browser-support is intentionally absent here; it is auto-injected in mapSnapOptionsToSnapcraftYAML
  // when the user has not provided custom plugs, so it always lands in both root plugs and app plugs.
  defaultPlugs = ["desktop", "desktop-legacy", "home", "x11", "wayland", "unity7", "network", "gsettings", "audio-playback", "pulseaudio", "opengl"]

  // Snap file hierarchy:
  // - snap/gui/ gets automatically copied to meta/gui/ in the final snap
  // - Desktop files in meta/gui/ are used for menu integration
  readonly configRelativePath = "snap"
  readonly guiRelativePath = path.join(this.configRelativePath, "gui")

  async createDescriptor(arch: Arch): Promise<SnapcraftYAML> {
    return await this.mapSnapOptionsToSnapcraftYAML(arch)
  }

  private isHostMode(): boolean {
    return this.options.useDestructiveMode === true
  }

  /** Writes the snapcraft.yaml, stages app files, then invokes `buildSnap()` to run the actual snapcraft build. */
  async buildSnap(params: { snap: SnapcraftYAML; appOutDir: string; stageDir: string; snapArch: Arch; artifactPath: string }): Promise<void> {
    const { snap, appOutDir, stageDir, artifactPath } = params

    const snapDirResolved = path.resolve(stageDir, this.configRelativePath)
    const snapcraftYamlPath = path.join(snapDirResolved, "snapcraft.yaml")

    // Create snap/gui directory for desktop files and icons
    // Snapcraft will automatically copy snap/gui/ contents to meta/gui/ in the final snap
    const guiOutput = path.resolve(stageDir, this.guiRelativePath)
    await mkdir(guiOutput, { recursive: true })

    const yamlContent = yaml.dump(snap, SNAPCRAFT_YAML_OPTIONS)
    await writeFile(snapcraftYamlPath, yamlContent, "utf8")
    log.debug(snap, "generated snapcraft.yaml")

    // Copy icon to snap/gui/ directory
    // Snapcraft will automatically copy this to meta/gui/ in the final snap
    const desktopExtraProps: Record<string, string> = {}
    const icon = this.helper.maxIconPath
    if (icon) {
      const iconFileName = `${snap.name}${path.extname(icon)}`
      await copy(icon, path.join(guiOutput, iconFileName))
      // Icon path will be available at ${SNAP}/meta/gui/<icon-file> after installation
      desktopExtraProps.Icon = `\${SNAP}/meta/gui/${iconFileName}`
    }

    // Create desktop file in snap/gui/ directory
    // Snapcraft will automatically copy this to meta/gui/ in the final snap
    const desktopFilePath = path.join(guiOutput, `${snap.name}.desktop`)
    await this.helper.writeDesktopEntry(this.options, this.packager.executableName + " %U", desktopFilePath, desktopExtraProps)

    // Copy app files to the project root `app` directory so `source: app`
    // in the generated `snapcraft.yaml` (which is under `snap/`) can be
    // resolved by snapcraft running in the build environment.
    const appDir = path.resolve(stageDir, "app")
    if (path.resolve(appDir) !== path.resolve(appOutDir)) {
      log.debug({ to: log.filePath(appDir), from: log.filePath(appOutDir) }, "copying app files to project root app directory")
      await copyDir(appOutDir, appDir)
    }

    // Auto-generate `organize` mapping for the app part so top-level helper
    // binaries and resources are placed under `app/` inside the snap. Update
    // the already-written `snapcraft.yaml` so the build sees the mapping.
    try {
      const appPart = snap.parts[snap.name]
      if (appPart) {
        const entries = (await readdir(appOutDir)).sort()
        const organize: Record<string, string> = (appPart.organize as Record<string, string>) || {}
        for (const entry of entries) {
          if (!entry) {
            continue
          }
          if (organize[entry]) {
            continue
          }
          organize[entry] = `app/${entry}`
        }
        appPart.organize = organize

        const updatedYaml = yaml.dump(snap, SNAPCRAFT_YAML_OPTIONS)
        await writeFile(snapcraftYamlPath, updatedYaml, "utf8")
        log.debug({ organize }, "updated snapcraft.yaml with organize mapping")
      }
    } catch (e: any) {
      log.warn({ error: e.message }, "failed to generate and update organize mapping")
    }

    const buildMode = {
      useLXD: this.options.useLXD === true,
      useMultipass: this.options.useMultipass === true,
      useDestructiveMode: this.options.useDestructiveMode === true,
      remoteBuild: this.options.remoteBuild || undefined,
    }

    if (this.packager.packagerOptions.effectiveOptionComputed != null) {
      const shouldSkip = await this.packager.packagerOptions.effectiveOptionComputed({ snap, ...buildMode })
      if (shouldSkip) {
        return
      }
    }

    const rootOptions = this.packager.config.snapcraft
    await buildSnap({
      snapcraftConfig: snap,
      artifactPath,
      stageDir,
      packager: this.packager,
      cscLink: rootOptions?.cscLink,
      ...buildMode,
    })
  }

  /** Converts `SnapOptions24` into a fully resolved `SnapcraftYAML` descriptor for the given architecture. */
  async mapSnapOptionsToSnapcraftYAML(arch: Arch): Promise<SnapcraftYAML> {
    const appInfo = this.packager.appInfo
    const appName = this.packager.executableName.toLowerCase()
    const options = this.options

    // Default to ["gnome"] in normal builds; no extensions in host/destructive-mode (where the
    // gnome extension is incompatible). Throw if the user explicitly includes "gnome" in host mode.
    const hostMode = this.isHostMode()
    const extensionsList: string[] = options.extensions != null ? [...options.extensions] : hostMode ? [] : ["gnome"]
    if (hostMode && extensionsList.includes("gnome")) {
      throw new InvalidConfigurationError(
        `The "gnome" snapcraft extension is incompatible with host/destructive-mode builds.\n` +
          `In this mode snapcraft cannot resolve the extension's command-chain source ` +
          `(/usr/share/snapcraft/extensions/desktop/command-chain) and will fail.\n\n` +
          `To resolve this, choose one of:\n` +
          `  1. Remove "gnome" from snapcraft.core24.extensions (or set it to []) and add any\n` +
          `     required stage-packages manually.\n` +
          `  2. Switch to an isolated build environment by setting snapcraft.core24.useLXD: true\n` +
          `     or snapcraft.core24.useMultipass: true instead of useDestructiveMode.\n\n` +
          `See: https://snapcraft.io/docs/gnome-extension`
      )
    }
    const resolvedExtensions = extensionsList.length > 0 ? extensionsList : undefined
    const useGnomeExtension = extensionsList.includes("gnome")

    // Create the app part
    const appPart: Part = {
      plugin: "dump",
      source: "app",
      "build-packages": options.buildPackages?.length ? options.buildPackages : undefined,
      "stage-packages": this.expandDefaultsInArray(options.stagePackages, DEFAULT_STAGE_PACKAGES),
      after: this.expandDefaultsInArray(options.after, []),
      stage: options.appPartStage?.length ? options.appPartStage : undefined,
    }

    // Process plugs and slots
    // When using GNOME extension, we don't need to manually configure content snaps
    // The extension will handle: gnome-46-2404, gtk-3-themes, icon-themes, sound-themes
    let rootPlugs: Record<string, any> | undefined
    let appPlugs: string[] | undefined

    if (useGnomeExtension) {
      // With GNOME extension, only process user-provided custom plugs
      const result = options.plugs ? this.processPlugOrSlots(options.plugs) : { root: undefined, app: undefined }
      rootPlugs = result.root
      // Extension automatically adds common plugs, so we only add custom ones
      appPlugs = result.app
    } else {
      // Without GNOME extension, we need manual content snaps
      const defaultRootPlugs: Record<string, any> = {
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

      const result = options.plugs
        ? this.processPlugOrSlots(options.plugs)
        : hostMode
          ? { root: undefined, app: this.defaultPlugs }
          : {
              root: defaultRootPlugs,
              app: this.defaultPlugs,
            }
      rootPlugs = result.root
      appPlugs = result.app
    }

    // Always add browser-support with allow-sandbox so Chromium's internal sandbox
    // can create user namespaces under strict confinement.  Without allow-sandbox: true
    // the app crashes immediately with "FATAL: Permission denied (13)" in credentials.cc.
    // Skip the injection only when the user has explicitly provided their own plugs
    // (they are responsible for including browser-support in that case).
    if (!options.plugs) {
      rootPlugs = { ...rootPlugs, "browser-support": { interface: "browser-support", "allow-sandbox": true } }
      if (!appPlugs?.includes("browser-support")) {
        appPlugs = [...(appPlugs ?? []), "browser-support"]
      }
    }

    const { root: rootSlots, app: appSlots } = options.slots ? this.processPlugOrSlots(options.slots) : { root: undefined, app: undefined }

    // Build the effective arg list for the snap command.
    // Start with any user-supplied executableArgs, then conditionally add --no-sandbox
    // if browser-support with allow-sandbox:true is not present in the resolved plugs
    // (mirrors the same logic in SnapCoreLegacy.buildSnap).
    const extraArgs: string[] = [...(this.options.executableArgs ?? [])]
    if (this.options.forceX11 === true) {
      if (!extraArgs.includes("--ozone-platform=x11")) {
        extraArgs.push("--ozone-platform=x11")
      }
    }
    if (this.helper.isElectronVersionGreaterOrEqualThan("5.0.0") && !this.isBrowserSandboxAllowed(rootPlugs)) {
      if (!extraArgs.includes("--no-sandbox")) {
        extraArgs.push("--no-sandbox")
      }
    }
    const commandSuffix = extraArgs.length > 0 ? ` ${extraArgs.join(" ")}` : ""

    // Create the app configuration
    const app: App = {
      command: `app/${this.packager.executableName}${commandSuffix}`,
      "command-chain": undefined, // explicitly undefined so removeNullish strips it; extensions supply their own command-chain
      plugs: appPlugs,
      slots: appSlots,
      autostart: options.autoStart ? `${appName}.desktop` : undefined,
      desktop: `meta/gui/${appName}.desktop`,
      extensions: resolvedExtensions,
    }

    // Icon path — build-time relative path so snapcraft can find the file in snap/gui/
    await this.helper.icons
    const iconPath = this.helper.maxIconPath != null ? `snap/gui/${appName}${path.extname(this.helper.maxIconPath)}` : undefined

    // Process hooks if configured
    const hooksConfig = options.hooks
    const hooks = hooksConfig ? await this.processHooks(hooksConfig) : undefined

    // Parts configuration - the extension automatically adds a gnome/sdk part
    // Don't manually add desktop-launch when using the extension
    const parts: Record<string, Part> = {
      [appName]: appPart,
    }

    // Note: `organize` will be generated later in `buildSnap` based on the
    // actual contents of the built app directory so helper binaries and
    // resources are automatically moved under `app/` in the snap.

    // Build the snapcraft configuration
    const snapcraft: SnapcraftYAML = {
      // Required fields
      name: appName,
      base: "core24",
      confinement: options.confinement || "strict",
      parts: parts,

      // Architecture/Platform — only needed for cross-compilation; snapcraft 8
      // defaults to host arch and snapcraft 7 rejects this field entirely.
      ...(arch !== archFromString(process.arch)
        ? {
            platforms: {
              [toLinuxArchString(arch, "snap")]: {
                "build-for": toLinuxArchString(arch, "snap"),
                "build-on": toLinuxArchString(archFromString(process.arch), "snap"),
              },
            },
          }
        : {}),

      // Metadata - with fallbacks from appInfo
      version: appInfo.version,
      summary: options.summary || appInfo.productName,
      description: this.helper.getDescription(options),
      grade: options.grade || "stable",
      title: options.title || appInfo.productName,
      icon: iconPath,

      // Build configuration
      compression: options.compression || undefined,
      assumes: this.normalizeAssumesList(options.assumes),

      // Environment
      environment: this.buildEnvironment(options),

      // User-supplied layout always wins. Without gnome extension and not in host mode, fall back to content-snap defaults.
      layout: options.layout ?? (useGnomeExtension || hostMode ? undefined : this.buildDefaultLayout(options)),

      // Interfaces
      plugs: rootPlugs,
      slots: rootSlots,

      // Hooks
      hooks: hooks,

      // Apps
      apps: {
        [appName]: app,
      },
    }

    return removeNullish(snapcraft)
  }

  /**
   * Build environment variables with proper defaults
   */
  private buildEnvironment(options: SnapOptions24): Record<string, string | null> | undefined {
    const env: Record<string, string | null> = {}

    // Add default TMPDIR for Electron/Chromium apps
    if (!options.environment?.TMPDIR) {
      env.TMPDIR = "$XDG_RUNTIME_DIR"
    }

    if (options.environment) {
      deepAssign(env, options.environment)
    }

    return Object.keys(env).length > 0 ? env : undefined
  }

  /**
   * Build default layout for core24 with GNOME platform content snaps (non-extension mode)
   * This allows the app to access libraries from the gnome-46-2404 and mesa-2404 content snaps
   */
  private buildDefaultLayout(options: SnapOptions24): Record<string, any> | undefined {
    // If user provides custom layout, use that instead
    if (options.layout) {
      return options.layout
    }

    // Default layout for core24 Electron apps using GNOME content snaps WITHOUT extension
    return {
      "/usr/lib/$CRAFT_ARCH_TRIPLET_BUILD_FOR/webkit2gtk-4.0": {
        bind: "$SNAP/gnome-platform/usr/lib/$CRAFT_ARCH_TRIPLET_BUILD_FOR/webkit2gtk-4.0",
      },
      "/usr/lib/$CRAFT_ARCH_TRIPLET_BUILD_FOR/webkit2gtk-4.1": {
        bind: "$SNAP/gnome-platform/usr/lib/$CRAFT_ARCH_TRIPLET_BUILD_FOR/webkit2gtk-4.1",
      },
      "/usr/share/xml/iso-codes": {
        bind: "$SNAP/gnome-platform/usr/share/xml/iso-codes",
      },
      "/usr/share/libdrm": {
        bind: "$SNAP/gpu-2404/libdrm",
      },
      "/usr/share/drirc.d": {
        symlink: "$SNAP/gpu-2404/drirc.d",
      },
    }
  }

  /**
   * Process hooks directory into hook definitions
   */
  private async processHooks(hooksPath: string): Promise<Record<string, any> | undefined> {
    try {
      const buildResourcesDir = this.packager.buildResourcesDir
      const hooksDir = path.resolve(buildResourcesDir, hooksPath)
      if (!hooksDir.startsWith(buildResourcesDir + path.sep) && hooksDir !== buildResourcesDir) {
        throw new InvalidConfigurationError(`snapcraft.core24.hooks must resolve within the build resources directory (got "${hooksDir}")`)
      }
      const hookFiles = await readdir(hooksDir)

      if (hookFiles.length === 0) {
        return undefined
      }

      const hooks: Record<string, any> = {}
      for (const hookFile of hookFiles) {
        const hookName = path.basename(hookFile, path.extname(hookFile))
        if (!isValidKey(hookName)) {
          throw new InvalidConfigurationError(`Invalid hook name: ${hookName}`)
        }
        hooks[hookName] = {
          // Hook definitions will be populated by snapcraft from the files
          // Just register that these hooks exist
        }
      }

      return hooks
    } catch (e: any) {
      log.error({ message: e.message }, "error processing Snap hooks directory")
      throw e
    }
  }

  /**
   * Normalize assumes list (can be string or array)
   */
  normalizeAssumesList(assumes: Array<string> | string | Nullish): string[] | undefined {
    if (!assumes) {
      return undefined
    }
    if (typeof assumes === "string") {
      return [assumes]
    }
    return assumes.length > 0 ? assumes : undefined
  }

  /**
   * Process plugs or slots into root-level definitions and app-level references
   */
  processPlugOrSlots<T extends Array<string | SlotDescriptor | PlugDescriptor> | SlotDescriptor | PlugDescriptor | null>(
    items: T
  ): {
    root: Record<string, unknown> | undefined
    app: string[] | undefined
  } {
    if (!items || (Array.isArray(items) && items.length === 0)) {
      return { root: undefined, app: undefined }
    }
    const root: Record<string, unknown> = {}
    const app: string[] = []

    // Handle single descriptor object
    if (!Array.isArray(items)) {
      Object.entries(items).forEach(([name, config]) => {
        if (!isValidKey(name)) {
          throw new Error(`Invalid plug/slot name: ${name}`)
        }
        root[name] = config
        app.push(name)
      })
      return { root, app }
    }

    // Handle array - support "default" keyword
    const processedItems = this.expandDefaultsInArray(items, this.defaultPlugs)
    for (const item of processedItems ?? []) {
      if (typeof item === "string") {
        // Simple string reference
        app.push(item)
      } else {
        // Descriptor object with configuration
        Object.entries(item).forEach(([name, config]) => {
          if (!isValidKey(name)) {
            throw new Error(`Invalid plug/slot name: ${name}`)
          }
          root[name] = config
          app.push(name)
        })
      }
    }

    return { root: Object.keys(root).length > 0 ? root : undefined, app: app.length > 0 ? app : undefined }
  }

  private isBrowserSandboxAllowed(plugs: Record<string, any> | undefined): boolean {
    if (!plugs) {
      return false
    }
    for (const plug of Object.values(plugs)) {
      if (plug?.interface === "browser-support" && plug["allow-sandbox"] === true) {
        return true
      }
    }
    return false
  }

  /**
   * Expand "default" keyword in arrays of anything
   */
  private expandDefaultsInArray<T>(items: T[] | Nullish, defaults: T[]): T[] | undefined {
    const result: Array<T> = []
    for (const item of items ?? []) {
      if (typeof item === "string" && item === "default") {
        result.push(...defaults)
      } else {
        result.push(item)
      }
    }
    return result.length > 0 ? result : undefined
  }
}
