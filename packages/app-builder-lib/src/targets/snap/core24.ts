import { Arch, archFromString, removeNullish, toLinuxArchString } from "builder-util"
import { readdir } from "fs-extra"
import * as path from "path"
import { PlugDescriptor, SlotDescriptor, SnapOptions24 } from "../../options/SnapOptions"
import { SnapCore } from "./SnapTarget"
import { App, Part, SnapcraftYAML } from "./snapcraft"
import { buildSnap } from "./snapcraftBuilder"

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

  async buildSnap(params: { snap: any; appOutDir: string; stageDir: string; snapArch: Arch; artifactPath: string }): Promise<void> {
    const { snap: snapcraftConfig, appOutDir, stageDir, snapArch, artifactPath } = params
    await buildSnap({
      snapcraftConfig,
      appOutDir,
      stageDir,
      outputFileName: path.basename(artifactPath),
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
      after: this.processDefaultList(options.after || ["default"], ["desktop-gtk2"]),
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
      command: `desktop-launch $SNAP/${this.packager.executableName}`,
      plugs: appPlugs.length ? appPlugs : undefined,
      slots: appSlots.length ? appSlots : undefined,
      autostart: options.autoStart ? `${appName}.desktop` : undefined,
      extensions: ["gnome"],
      // Add desktop file reference for better integration
      desktop: `${appName}.desktop`,
    }

    // Process hooks if configured
    const hooksConfig = options.hooks
    const hooks = hooksConfig
      ? await this.processHooks(hooksConfig)
      : undefined

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
    } catch (error) {
      // If hooks directory doesn't exist or can't be read, return undefined
      return undefined
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
  processDefaultList(list: Array<string>, defaults: Array<string>): Array<string> | undefined {
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
  processPlugOrSlots(
    items: Array<string | SlotDescriptor | PlugDescriptor> | SlotDescriptor | PlugDescriptor | null
  ): {
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
  private expandDefaultsInArray(
    items: Array<string | SlotDescriptor | PlugDescriptor>,
    defaults: string[]
  ): Array<string | SlotDescriptor | PlugDescriptor> {
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

/**
 * Builder pattern for creating snapcraft configurations programmatically
 */
export class SnapcraftConfigBuilder {
  private config: Partial<SnapcraftYAML>

  constructor(name: string, base: SnapcraftYAML["base"] = "core24") {
    this.config = {
      name,
      base,
      confinement: "strict",
      parts: {},
    }
  }

  withConfinement(confinement: SnapcraftYAML["confinement"]): this {
    this.config.confinement = confinement
    return this
  }

  withMetadata(metadata: {
    version?: string
    summary?: string
    description?: string
    title?: string
    grade?: "stable" | "devel"
    license?: string
  }): this {
    Object.assign(this.config, metadata)
    return this
  }

  addPart(name: string, part: Part): this {
    if (!this.config.parts) {
      this.config.parts = {}
    }
    this.config.parts[name] = part
    return this
  }

  addApp(name: string, app: App): this {
    if (!this.config.apps) {
      this.config.apps = {}
    }
    this.config.apps[name] = app
    return this
  }

  withEnvironment(env: Record<string, string | null>): this {
    this.config.environment = { ...this.config.environment, ...env }
    return this
  }

  withPlugs(plugs: Record<string, unknown>): this {
    this.config.plugs = { ...this.config.plugs, ...plugs }
    return this
  }

  withSlots(slots: Record<string, unknown>): this {
    this.config.slots = { ...this.config.slots, ...slots }
    return this
  }

  withPlatform(arch: string, buildOn?: string | string[], buildFor?: string | string[]): this {
    if (!this.config.platforms) {
      this.config.platforms = {}
    }
    this.config.platforms[arch] = {
      "build-on": buildOn || arch,
      "build-for": buildFor || arch,
    }
    return this
  }

  build(): SnapcraftYAML {
    // Basic validation
    if (!this.config.name || !this.config.base || !this.config.confinement) {
      throw new Error("Missing required fields: name, base, or confinement")
    }
    if (!this.config.parts || Object.keys(this.config.parts).length === 0) {
      throw new Error("At least one part is required")
    }

    return removeNullish(this.config as SnapcraftYAML)
  }
}

/**
 * Example usage:
 *
 * const config = new SnapcraftConfigBuilder("my-app")
 *   .withConfinement("strict")
 *   .withMetadata({
 *     version: "1.0.0",
 *     summary: "My awesome application",
 *     description: "A longer description of my app",
 *     grade: "stable"
 *   })
 *   .addPart("my-app", {
 *     plugin: "dump",
 *     source: "app",
 *     "stage-packages": ["libfoo", "libbar"]
 *   })
 *   .addApp("my-app", {
 *     command: "desktop-launch $SNAP/my-app",
 *     extensions: ["gnome"],
 *     plugs: ["home", "network"]
 *   })
 *   .withPlatform("amd64")
 *   .build()
 */