import { Arch, removeNullish, toLinuxArchString } from "builder-util"
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
      env: {
        SNAPCRAFT_BUILD_ENVIRONMENT_ARCH: toLinuxArchString(snapArch, "snap"),
      },
    })
  }

  async createDescriptor(arch: Arch): Promise<any> {
    const snap = await this.mapSnapOptionsToSnapcraftYAML({
      arch,
      command: `desktop-launch $SNAP/${this.packager.executableName}`,
    })
    return snap
  }

  async mapSnapOptionsToSnapcraftYAML({ arch, command }: { arch: Arch;   command: string }): Promise<SnapcraftYAML> {
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
    }

    const config = options.hooks
    const hooks = config
      ? (await readdir(path.resolve(this.packager.buildResourcesDir, config))).reduce((acc, hookPath) => {
          acc[path.basename(hookPath, path.extname(hookPath))] = path.resolve(this.packager.buildResourcesDir, config, hookPath)
          return acc
        }, {} as any)
      : undefined

    const snapcraft: SnapcraftYAML = {
      name: appName,
      base: "core24",
      confinement: options.confinement || "strict",
      parts: {
        [appName]: appPart,
      },
      platforms: { app: { "build-for": toLinuxArchString(arch, "snap") } },

      summary: options.summary || appInfo.productName,
      grade: options.grade || "stable",
      title: options.title || appInfo.productName,
      compression: options.compression || undefined,
      assumes: this.normalizeAssumesList(options.assumes),
      environment:
        options.allowNativeWayland === false
          ? {
              DISABLE_WAYLAND: "1",
              ...options.environment,
            }
          : options.environment || undefined,
      layout: options.layout || undefined,
      plugs: Object.keys(rootPlugs).length ? rootPlugs : undefined,
      slots: Object.keys(rootSlots).length ? rootSlots : undefined,
      hooks: hooks,
      apps: {
        [appName]: app,
      },
    }

    return removeNullish(snapcraft)
  }

  /**
   * Normalize assumes list (can be string or array)
   */
  normalizeAssumesList(assumes: Array<string> | string | null | undefined): string[] | undefined {
    if (!assumes) return undefined
    if (typeof assumes === "string") {
      return [assumes]
    }
    return assumes
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

  processPlugOrSlots(slots: Array<string | SlotDescriptor | PlugDescriptor> | SlotDescriptor | PlugDescriptor | null): {
    root: Record<string, unknown>
    app: string[]
  } {
    const root: Record<string, unknown> = {}
    const app: string[] = []

    if (!slots) {
      return { root: root, app: app }
    }

    // Handle single descriptor object
    if (!Array.isArray(slots)) {
      Object.entries(slots).forEach(([name, config]) => {
        root[name] = config
        app.push(name)
      })
      return { root: root, app: app }
    }

    // Handle array
    for (const slot of slots) {
      if (typeof slot === "string") {
        app.push(slot)
      } else {
        // It's a descriptor object
        Object.entries(slot).forEach(([name, config]) => {
          root[name] = config
          app.push(name)
        })
      }
    }

    return { root: root, app: app }
  }
}
