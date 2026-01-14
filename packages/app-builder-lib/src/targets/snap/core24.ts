import { Arch, archFromString, copyDir, log, removeNullish, toLinuxArchString } from "builder-util"
import { mkdir, readdir, writeFile } from "fs-extra"
import * as path from "path"
import { PlugDescriptor, SlotDescriptor, SnapOptions24 } from "../../options/SnapOptions"
import { SnapCore } from "./SnapTarget"
import { App, Part, SnapcraftYAML } from "./snapcraft"
import { buildSnap } from "./snapcraftBuilder"
import * as yaml from "js-yaml"
import { Nullish } from "builder-util-runtime"

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
}

const defaultStagePackages = ["libnspr4", "libnss3", "libxss1", "libappindicator3-1", "libsecret-1-0"]

export class SnapCore24 extends SnapCore<SnapOptions24> {
  defaultPlugs = ["desktop", "desktop-legacy", "home", "x11", "wayland", "unity7", "browser-support", "network", "gsettings", "audio-playback", "pulseaudio", "opengl"]

  async buildSnap(params: { snap: SnapcraftYAML; appOutDir: string; stageDir: string; snapArch: Arch; artifactPath: string }): Promise<void> {
    const { snap: snapcraftConfig, appOutDir, stageDir, artifactPath } = params

    const configRelativePath = "snap"
    const snapDir = path.resolve(stageDir, configRelativePath)
    const snapcraftYamlPath = path.join(snapDir, "snapcraft.yaml")

    await mkdir(path.resolve(snapDir, "gui"), { recursive: true })

    log.debug({ path: snapcraftYamlPath }, "preparing writing snapcraft.yaml")
    const yamlContent = yaml.dump(snapcraftConfig, {
      indent: 2,
      lineWidth: -1, // No line wrapping
      noRefs: true,
    })
    await writeFile(snapcraftYamlPath, yamlContent, "utf8")
    log.debug(snapcraftConfig, "generated snapcraft.yaml")

    await this.helper.icons
    if (this.helper.maxIconPath != null) {
      snapcraftConfig.icon = `\${SNAP}/${configRelativePath}/icon.png`
    }

    const desktopFilePath = path.join(stageDir, configRelativePath, `${snapcraftConfig.name}.desktop`)
    await this.helper.writeDesktopEntry(this.options, this.packager.executableName + " %U", desktopFilePath, {
      Icon: `\${SNAP}/${configRelativePath}/icon.png`,
    })

    const appDir = path.resolve(stageDir, "app")
    if (path.resolve(stageDir) !== path.resolve(appOutDir)) {
      log.info("preparing", "copying source files")
      await copyDir(appOutDir, appDir)
      log.debug({ to: log.filePath(appDir), from: log.filePath(appOutDir) }, "copied app files")
    }

    await buildSnap({
      snapcraftConfig,
      desktopFile: path.posix.join(configRelativePath, `${snapcraftConfig.name}.desktop`),
      artifactPath,
      stageDir,
      remoteBuild: this.options.remoteBuild || undefined,
      useLXD: this.options.useLXD === true,
      useMultipass: this.options.useMultipass === true,
      useDestructiveMode: this.options.useDestructiveMode === true,
    })
  }

  async createDescriptor(arch: Arch): Promise<any> {
    return await this.mapSnapOptionsToSnapcraftYAML(arch)
  }

  async mapSnapOptionsToSnapcraftYAML(arch: Arch): Promise<SnapcraftYAML> {
    const appInfo = this.packager.appInfo
    const appName = this.packager.executableName.toLowerCase()
    const options = this.options

    // Create the app part
    const appPart: Part = {
      plugin: "dump",
      source: "app",
      "build-packages": options.buildPackages?.length ? options.buildPackages : undefined,
      "stage-packages": this.processDefaultList(options.stagePackages || ["default"], defaultStagePackages),
      after: this.processDefaultList(options.after ?? [], []),
      stage: options.appPartStage?.length ? options.appPartStage : undefined,
    }

    // Process plugs and slots
    const { root: rootPlugs, app: appPlugs } = options.plugs
      ? this.processPlugOrSlots(options.plugs)
      : {
          root: {},
          app: this.defaultPlugs,
        }
    const { root: rootSlots, app: appSlots } = options.slots ? this.processPlugOrSlots(options.slots) : { root: {}, app: [] }

    // Create the app configuration
    const app: App = {
      command: `desktop-launch $SNAP/app/${this.packager.executableName}`,
      plugs: appPlugs.length ? appPlugs : undefined,
      slots: appSlots.length ? appSlots : undefined,
      autostart: options.autoStart ? `${appName}.desktop` : undefined,
      extensions: ["gnome"],
      // Add desktop file reference for better integration
      desktop: `${appName}.desktop`,
    }

    // Process hooks if configured
    const hooksConfig = options.hooks
    const hooks = hooksConfig ? await this.processHooks(hooksConfig) : undefined

    // Build the snapcraft configuration
    const snapcraft: SnapcraftYAML = {
      // Required fields
      name: appName,
      base: "core24",
      confinement: options.confinement || "strict",
      parts: {
        [appName]: appPart,
      },

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
      // license: appInfo.metadata?.license,

      // Build configuration
      compression: options.compression || undefined,
      assumes: this.normalizeAssumesList(options.assumes),

      // Environment
      environment: this.buildEnvironment(options),

      // Layout
      layout: options.layout || undefined,

      // Interfaces
      plugs: Object.keys(rootPlugs).length ? rootPlugs : undefined,
      slots: Object.keys(rootSlots).length ? rootSlots : undefined,

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

    // Add default TMPDIR if not specified
    // if (!options.environment?.TMPDIR) {
    //   env.TMPDIR = "$XDG_RUNTIME_DIR"
    // }

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
  normalizeAssumesList(assumes: Array<string> | string | null | undefined): string[] | undefined {
    if (!assumes) return undefined
    if (typeof assumes === "string") {
      return [assumes]
    }
    return assumes.length > 0 ? assumes : undefined
  }

  /**
   * Process lists that support "default" keyword
   */
  processDefaultList(list: Array<string>, defaults: Array<string> = []): Array<string> | undefined {
    const result: string[] = []
    let hasDefault = false

    for (const item of list) {
      if (item === "default") {
        hasDefault = true
      } else {
        result.push(item)
      }
    }

    if (hasDefault) {
      const merged = [...defaults, ...result]
      return merged.length ? merged : undefined
    }

    return result.length ? result : defaults.length ? defaults : undefined
  }

  /**
   * Process plugs or slots into root-level definitions and app-level references
   */
  processPlugOrSlots(items: Array<string | SlotDescriptor | PlugDescriptor> | SlotDescriptor | PlugDescriptor | null): {
    root: Record<string, unknown>
    app: string[]
  } {
    const root: Record<string, unknown> = {}
    const app: string[] = []

    if (!items) {
      return { root, app }
    }

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

    for (const item of processedItems) {
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

    return { root, app }
  }

  /**
   * Expand "default" keyword in arrays of plugs/slots
   */
  private expandDefaultsInArray(items: Array<string | SlotDescriptor | PlugDescriptor>, defaults: string[]): Array<string | SlotDescriptor | PlugDescriptor> {
    const result: Array<string | SlotDescriptor | PlugDescriptor> = []
    let hasDefault = false

    for (const item of items) {
      if (typeof item === "string" && item === "default") {
        hasDefault = true
      } else {
        result.push(item)
      }
    }

    if (hasDefault) {
      return [...defaults, ...result]
    }

    return result.length > 0 ? result : defaults
  }
}
