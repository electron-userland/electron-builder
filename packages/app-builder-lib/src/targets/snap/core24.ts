import { Arch, archFromString, copyDir, log, removeNullish, toLinuxArchString } from "builder-util"
import { copy, mkdir, readdir, writeFile } from "fs-extra"
import * as path from "path"
import { PlugDescriptor, SlotDescriptor, SnapOptions24 } from "../../options/SnapOptions"
import { SnapCore } from "./SnapTarget"
import { App, Part, SnapcraftYAML } from "./snapcraft"
import { buildSnap } from "./snapcraftBuilder"
import * as yaml from "js-yaml"
import { Nullish } from "builder-util-runtime"
import { execSync } from "child_process"

// Mapping of SnapOptions to SnapcraftYAML
export interface SnapOptionsMapping {
  base: SnapcraftYAML["base"]
  confinement: SnapcraftYAML["confinement"]
  environment: SnapcraftYAML["environment"]
  summary: SnapcraftYAML["summary"]
  grade: SnapcraftYAML["grade"]
  assumes: SnapcraftYAML["assumes"]
  hooks: SnapcraftYAML["hooks"]
  plugs: SnapcraftYAML["plugs"]
  slots: SnapcraftYAML["slots"]
  layout: SnapcraftYAML["layout"]
  title: SnapcraftYAML["title"]
  compression: SnapcraftYAML["compression"]

  buildPackages: Part["build-packages"]
  stagePackages: Part["stage-packages"]
  after: Part["after"]
  appPartStage: Part["stage"]

  autoStart: App["autostart"]

  // Extension support
  useGnomeExtension: boolean
}

const defaultStagePackages = ["libnspr4", "libnss3", "libxss1", "libappindicator3-1", "libsecret-1-0"]

export class SnapCore24 extends SnapCore<SnapOptions24> {
  defaultPlugs = ["desktop", "desktop-legacy", "home", "x11", "wayland", "unity7", "browser-support", "network", "gsettings", "audio-playback", "pulseaudio", "opengl"]

  // Snap file hierarchy:
  // - snap/gui/ gets automatically copied to meta/gui/ in the final snap
  // - Desktop files in meta/gui/ are used for menu integration
  readonly configRelativePath = "snap"
  readonly guiRelativePath = path.join(this.configRelativePath, "gui")

  async createDescriptor(arch: Arch): Promise<any> {
    return await this.mapSnapOptionsToSnapcraftYAML(arch)
  }

  async buildSnap(params: { snap: SnapcraftYAML; appOutDir: string; stageDir: string; snapArch: Arch; artifactPath: string }): Promise<void> {
    const { snap, appOutDir, stageDir, artifactPath } = params

    // IMPORTANT: GNOME extension cannot be used with destructive-mode
    // The extension's gnome/sdk part tries to install to system paths like /snap/command-chain/
    // which fails with permission denied in destructive mode
    const useGnomeExtension = this.options.useGnomeExtension !== false
    if (useGnomeExtension && this.options.useDestructiveMode) {
      log.warn(
        { useGnomeExtension, useDestructiveMode: this.options.useDestructiveMode },
        "GNOME extension cannot be used with destructive-mode. Switching to LXD container build."
      )
      // Override destructive mode when using extension
      this.options.useDestructiveMode = false
      if (!this.options.useLXD && !this.options.useMultipass && !this.options.remoteBuild) {
        this.options.useLXD = true
      }
    }

    const snapDirResolved = path.resolve(stageDir, this.configRelativePath)
    const snapcraftYamlPath = path.join(snapDirResolved, "snapcraft.yaml")

    // Create snap/gui directory for desktop files and icons
    // Snapcraft will automatically copy snap/gui/ contents to meta/gui/ in the final snap
    const guiOutput = path.resolve(stageDir, this.guiRelativePath)
    await mkdir(guiOutput, { recursive: true })

    const yamlContent = yaml.dump(snap, {
      indent: 2,
      lineWidth: -1, // No line wrapping
      noRefs: true,
    })
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
        const entries = await readdir(appOutDir)
        const organize: Record<string, string> = (appPart.organize as Record<string, string>) || {}
        for (const entry of entries) {
          if (!entry) continue
          if (organize[entry]) continue
          organize[entry] = `app/${entry}`
        }
        appPart.organize = organize

        const updatedYaml = yaml.dump(snap, {
          indent: 2,
          lineWidth: -1,
          noRefs: true,
        })
        await writeFile(snapcraftYamlPath, updatedYaml, "utf8")
        log.debug({ organize }, "updated snapcraft.yaml with organize mapping")
      }
    } catch (e: any) {
      log.debug({ error: e.message }, "failed to generate organize mapping")
    }

    await buildSnap({
      snapcraftConfig: snap,
      artifactPath,
      stageDir,
      remoteBuild: this.options.remoteBuild || undefined,
      useLXD: this.options.useLXD === true,
      useMultipass: this.options.useMultipass === true,
      useDestructiveMode: this.options.useDestructiveMode === true,
    })
  }

  async mapSnapOptionsToSnapcraftYAML(arch: Arch): Promise<SnapcraftYAML> {
    const appInfo = this.packager.appInfo
    const appName = this.packager.executableName.toLowerCase()
    const options = this.options
    const useGnomeExtension = options.useGnomeExtension !== false // Default to true

    // Create the app part
    const appPart: Part = {
      plugin: "dump",
      source: "app",
      "build-packages": options.buildPackages?.length ? options.buildPackages : undefined,
      "stage-packages": this.expandDefaultsInArray(options.stagePackages, defaultStagePackages),
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
        : {
            root: defaultRootPlugs,
            app: this.defaultPlugs,
          }
      rootPlugs = result.root
      appPlugs = result.app
    }

    const { root: rootSlots, app: appSlots } = options.slots ? this.processPlugOrSlots(options.slots) : { root: {}, app: [] }

    // Create the app configuration
    const app: App = {
      // When using the extension, don't manually specify command or command-chain
      // The extension handles this automatically. Use the executable name (no `app/` prefix)
      // because the `dump` plugin copies the contents of the `app` source into the
      // part install root (so the executable ends up at the snap root), not in a
      // nested `app/` directory inside the snap.
      command: `app/${this.packager.executableName}`,
      // Don't manually add command-chain when using extension - it adds it automatically
      "command-chain": useGnomeExtension ? undefined : ["snap/command-chain/desktop-launch"],
      plugs: appPlugs,
      slots: appSlots,
      autostart: options.autoStart ? `${appName}.desktop` : undefined,
      desktop: `meta/gui/${appName}.desktop`,
      // Add GNOME extension to the app if enabled
      extensions: useGnomeExtension ? ["gnome"] : undefined,
    }

    // Icon path in the top-level metadata
    const iconPath = (await this.helper.icons) && this.helper.maxIconPath != null ? `\${SNAP}/meta/gui/${appName}${path.extname(this.helper.maxIconPath)}` : undefined

    // Process hooks if configured
    const hooksConfig = options.hooks
    const hooks = hooksConfig ? await this.processHooks(hooksConfig) : undefined

    // Parts configuration - the extension automatically adds a gnome/sdk part
    // Don't manually add desktop-launch when using the extension
    const parts: Record<string, Part> = {
      [appName]: appPart,
    }

    // Only add desktop-launch if NOT using GNOME extension
    if (!useGnomeExtension) {
      parts["desktop-launch"] = {
        plugin: "make",
        source: "https://github.com/ubuntu/snapcraft-desktop-helpers.git",
        "source-subdir": "gtk",
        "build-packages": ["build-essential"],
        stage: ["snap/command-chain/desktop-launch"],
      }
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

      // Architecture/Platform
      platforms: {
        [toLinuxArchString(arch, "snap")]: {
          "build-for": toLinuxArchString(arch, "snap"),
          "build-on": toLinuxArchString(archFromString(process.arch), "snap"),
        },
      },

      // Metadata - with fallbacks from appInfo
      version: appInfo.version,
      summary: options.summary || appInfo.productName,
      description: appInfo.description || options.summary || appInfo.productName,
      grade: options.grade || "stable",
      title: options.title || appInfo.productName,
      icon: iconPath,
      // license: appInfo.metadata?.license,

      // Build configuration
      compression: options.compression || undefined,
      assumes: this.normalizeAssumesList(options.assumes),

      // Environment
      environment: this.buildEnvironment(options),

      // Layout - only add custom layout if NOT using GNOME extension
      // The extension provides its own layout
      layout: useGnomeExtension ? (options.layout ?? undefined) : this.buildDefaultLayout(options),

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

    // Handle Wayland support
    if (options.allowNativeWayland === false) {
      env.DISABLE_WAYLAND = "1"
    }

    // Merge with user-provided environment
    if (options.environment) {
      Object.assign(env, options.environment)
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
      const hooksDir = path.resolve(this.packager.buildResourcesDir, hooksPath)
      const hookFiles = await readdir(hooksDir)

      if (hookFiles.length === 0) {
        return undefined
      }

      const hooks: Record<string, any> = {}
      for (const hookFile of hookFiles) {
        const hookName = path.basename(hookFile, path.extname(hookFile))
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
    if (!assumes) return undefined
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
          root[name] = config
          app.push(name)
        })
      }
    }

    return { root: Object.keys(root).length > 0 ? root : undefined, app: app.length > 0 ? app : undefined }
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
