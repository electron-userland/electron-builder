import { replaceDefault as _replaceDefault, Arch, InvalidConfigurationError, log, stripUndefinedRecursively, toLinuxArchString } from "builder-util"
import { asArray } from "builder-util-runtime"
import { readdir } from "fs-extra"
import * as path from "path"
import { PlugDescriptor, SlotDescriptor, SnapOptions } from "../../options/SnapOptions"
import SnapTarget from "./snap"
import { App, Part, SnapcraftYAML } from "./snapcraft"

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

const defaultPlugs = ["desktop", "desktop-legacy", "home", "x11", "wayland", "unity7", "browser-support", "network", "gsettings", "audio-playback", "pulseaudio", "opengl"]
export default class SnapTarget24 extends SnapTarget {
  async createDescriptor(arch: Arch): Promise<any> {
    const appInfo = this.packager.appInfo
    const snapName = this.packager.executableName.toLowerCase()
    const options = this.options

    const { app: appPlugs, root: rootPlugs } = this.convertPlugArrayToObject(defaultPlugs, options.plugs ? asArray(options.plugs) : [])
    const { app: appSlots, root: rootSlots } = this.convertPlugArrayToObject([], options.slots ? asArray(options.slots) : [])
    const buildPackages = asArray(options.buildPackages)
    const defaultStagePackages = this.getDefaultStagePackages()
    const stagePackages = this.replaceDefault(options.stagePackages, defaultStagePackages)

    const config = options.hooks
    const hooks = config
      ? (await readdir(path.resolve(this.packager.buildResourcesDir, config))).reduce((acc, hookPath) => {
          acc[path.basename(hookPath, path.extname(hookPath))] = path.resolve(this.packager.buildResourcesDir, config, hookPath)
          return acc
        }, {} as any)
      : undefined

    const snap: SnapcraftYAML = {
      base: "core24",
      name: snapName,
      version: appInfo.version,
      title: options.title || appInfo.productName,
      summary: options.summary || appInfo.productName,
      description: this.helper.getDescription(options),

      compression: options.compression || undefined,
      grade: options.grade || "stable",
      confinement: options.confinement || "strict",
      environment: environment || undefined,

      assumes: options.assumes ? asArray(options.assumes) : undefined,

      slots: Object.keys(rootSlots).length > 0 ? rootSlots : undefined,
      plugs: Object.keys(rootPlugs).length > 0 ? rootPlugs : undefined,

      hooks: hooks,
      platforms: {
        app: {
          "build-on": toLinuxArchString(arch, "snap"),
          "build-for": toLinuxArchString(arch, "snap"),
        },
      },
      apps: {
        [snapName]: {
          autostart: options.autoStart ? `${snapName}.desktop` : undefined,
          command: `app/${this.packager.executableName}`,
          extensions: ["gnome"],
          plugs: appPlugs.length > 0 ? appPlugs : undefined,
          slots: appSlots.length > 0 ? appSlots : undefined,
        },
      },
      parts: {
        app: {
          "stage-packages": stagePackages.length > 0 ? stagePackages : undefined,
          "build-packages": buildPackages.length > 0 ? buildPackages : undefined,
          after: options.after || undefined,
          plugin: "dump",
          source: "./app",
          stage: options.appPartStage || undefined,
        },
      },

      layout: options.layout || undefined,
    }
    const cleaned = stripUndefinedRecursively(snap)
    return cleaned
  }

  private convertPlugArrayToObject(defaults: string[], plugsOrSlots: Array<string | PlugDescriptor>): { app: string[]; root: Record<string, any> } {
    const plugs = this.normalizePlugConfiguration(plugsOrSlots)
    const app = this.replaceDefault(plugs == null ? null : Object.getOwnPropertyNames(plugs), defaults)
    const root = app.reduce<Record<string, any>>((acc, key) => {
      const val = plugs?.[key]
      if (val != null) {
        acc[key] = val
      }
      return acc
    }, {})
    return { app, root }
  }

  /**
   * Maps SnapOptions to SnapcraftYAML format
   */
  async mapSnapOptionsToSnapcraftYAML({ arch, options, appName, command }: { arch: Arch; options: SnapOptions; appName: string; command: string }): Promise<SnapcraftYAML> {
    const snapcraft: SnapcraftYAML = {
      // Required fields
      name: appName,
      base: "core24",
      confinement: (options.confinement as any) || "strict",
      parts: {},
      summary: options.summary || undefined,
      grade: options.grade || "stable",
      title: options.title || undefined,
      compression: options.compression as any,
      assumes: this.normalizeAssumesList(options.assumes),
      environment:
        options.allowNativeWayland === false
          ? {
              DISABLE_WAYLAND: "1",
              ...options.environment,
            }
          : options.environment || undefined,
      layout: options.layout || undefined,
      platforms: {
        app: {
          "build-on": toLinuxArchString(arch, "snap"),
          "build-for": toLinuxArchString(arch, "snap"),
        },
      },
    }

    // Create the app part
    const appPart: Part = {
      plugin: "dump",
      source: "app",
    }

    // Map part-specific options
    if (options.buildPackages) {
      appPart["build-packages"] = options.buildPackages
    }

    if (options.stagePackages) {
      appPart["stage-packages"] = this.processDefaultList(options.stagePackages, ["libnspr4", "libnss3", "libxss1", "libappindicator3-1", "libsecret-1-0"])
    }

    if (options.after) {
      appPart.after = this.processDefaultList(options.after, ["desktop-gtk2"])
    }

    if (options.appPartStage) {
      appPart.stage = options.appPartStage
    }

    snapcraft.parts[appName] = appPart

    // Create the app configuration
    const app: App = {
      command: command,
      extensions: ["gnome"],
    }

    // Handle plugs
    if (options.plugs) {
      const { rootPlugs, appPlugs } = this.processPlugs(options.plugs)
      if (Object.keys(rootPlugs).length > 0) {
        snapcraft.plugs = rootPlugs
      }
      if (appPlugs.length > 0) {
        app.plugs = appPlugs
      }
    } else {
      // Default plugs
      app.plugs = ["desktop", "desktop-legacy", "home", "x11", "wayland", "unity7", "browser-support", "network", "gsettings", "audio-playback", "pulseaudio", "opengl"]
    }

    // Handle slots
    if (options.slots) {
      const { rootSlots, appSlots } = this.processSlots(options.slots)
      if (Object.keys(rootSlots).length > 0) {
        snapcraft.slots = rootSlots
      }
      if (appSlots.length > 0) {
        app.slots = appSlots
      }
    }

    if (options.autoStart) {
      app.autostart = `${appName}.desktop`
    }

    snapcraft.apps = {
      [appName]: app,
    }

    // Handle hooks (directory path → hook definitions)
    if (options.hooks) {
      snapcraft.hooks = (await readdir(path.resolve(this.packager.buildResourcesDir, options.hooks))).reduce((acc, hookPath) => {
        acc[path.basename(hookPath, path.extname(hookPath))] = path.resolve(this.packager.buildResourcesDir, options.hooks!, hookPath)
        return acc
      }, {} as any)
    }

    return snapcraft
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
  processDefaultList(list: Array<string>, defaults: Array<string>): Array<string> {
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
      return [...defaults, ...result]
    }

    return result.length > 0 ? result : defaults
  }

  /**
   * Process plugs into root-level and app-level
   */
  processPlugs(plugs: Array<string | PlugDescriptor> | PlugDescriptor | null): {
    rootPlugs: Record<string, unknown>
    appPlugs: string[]
  } {
    const rootPlugs: Record<string, unknown> = {}
    const appPlugs: string[] = []

    if (!plugs) {
      return { rootPlugs, appPlugs }
    }

    // Handle single PlugDescriptor object
    if (!Array.isArray(plugs)) {
      Object.entries(plugs).forEach(([name, config]) => {
        rootPlugs[name] = config
        appPlugs.push(name)
      })
      return { rootPlugs, appPlugs }
    }

    // Handle array
    const processed = this.processDefaultList(plugs as string[], [
      "desktop",
      "desktop-legacy",
      "home",
      "x11",
      "wayland",
      "unity7",
      "browser-support",
      "network",
      "gsettings",
      "audio-playback",
      "pulseaudio",
      "opengl",
    ])

    for (const plug of processed) {
      if (typeof plug === "string") {
        appPlugs.push(plug)
      } else {
        // It's a PlugDescriptor object
        Object.entries(plug).forEach(([name, config]) => {
          rootPlugs[name] = config
          appPlugs.push(name)
        })
      }
    }

    return { rootPlugs, appPlugs }
  }

  /**
   * Process slots into root-level and app-level
   */
  processSlots(slots: Array<string | SlotDescriptor> | SlotDescriptor | null): {
    rootSlots: Record<string, unknown>
    appSlots: string[]
  } {
    const rootSlots: Record<string, unknown> = {}
    const appSlots: string[] = []

    if (!slots) {
      return { rootSlots, appSlots }
    }

    // Handle single descriptor object
    if (!Array.isArray(slots)) {
      Object.entries(slots).forEach(([name, config]) => {
        rootSlots[name] = config
        appSlots.push(name)
      })
      return { rootSlots, appSlots }
    }

    // Handle array
    for (const slot of slots) {
      if (typeof slot === "string") {
        appSlots.push(slot)
      } else {
        // It's a descriptor object
        Object.entries(slot).forEach(([name, config]) => {
          rootSlots[name] = config
          appSlots.push(name)
        })
      }
    }

    return { rootSlots, appSlots }
  }

  //   const snapcraftYamlPath = path.join(SNAP_DIR, "snapcraft.yaml")
  //   await outputFile(snapcraftYamlPath, snapcraftYaml)

  //   try {
  //     // Ensure Multipass VM exists
  //     ensureMultipassVM()

  //     // Make sure /home/ubuntu/app exists in VM
  //     run(`multipass exec ${VM_NAME} -- mkdir -p /home/ubuntu/app/app`)

  //     // Transfer project files into VM
  //     const hostSnapDir = path.resolve(SNAP_DIR)
  //     run(`multipass transfer -r ${hostSnapDir}/snapcraft.yaml ${VM_NAME}:/home/ubuntu/app`)
  //     run(`multipass transfer -r ${hostSnapDir}/* ${VM_NAME}:/home/ubuntu/app/app`)

  //     // Install Snapcraft if missing
  //     run(`multipass exec ${VM_NAME} -- bash -c "sudo snap install snapcraft --classic || true"`)

  //     // Install QEMU for ARM64 cross-builds
  //     run(`multipass exec ${VM_NAME} -- bash -c "sudo apt-get update && sudo apt-get install -y qemu-user-static"`)

  //     // Build snap inside VM
  //     // run(`multipass exec ${VM_NAME} -- bash -c "cd /home/ubuntu/app && ls -lRh && snapcraft validate"`)
  //     run(`multipass exec ${VM_NAME} -- bash -c "cd /home/ubuntu/app && snapcraft pack --verbosity debug"`)

  //     // Copy built snaps back to host
  //     run(`multipass transfer ${VM_NAME}:/home/ubuntu/app/*.snap ./`)

  //     console.log("🎉 Snap build complete! Check the current folder for .snap files.")
  //   } finally {
  //     run(`multipass exec snap-builder -- bash -lc  "ls -lh ~/.local/state/snapcraft/log && cat ~/.local/state/snapcraft/log/*.log"`)
  //     this.cleanupMultipass()
  //   }
  // }

  //   protected ensureMultipassVM() {
  //     try {
  //       execSync(`multipass info snap-builder`, { stdio: "ignore" })
  //       console.log("✅ Multipass VM exists")
  //     } catch {
  //       execSync(`multipass launch --name snap-builder --cpus 4 --memory 8G --disk 20G`, { stdio: "inherit" })
  //     }
  //   }
  //   protected cleanupMultipass() {
  //     try {
  //       run(`multipass delete --purge ${VM_NAME}`)
  //       console.log("✅ Multipass VM cleaned up")
  //     } catch (err) {
  //       console.warn("⚠ Failed to cleanup Multipass VM", err)
  //     }
  //   }
  //   run(cmd: string) {
  //     console.log(`\n▶ ${cmd}`)
  //     execSync(cmd, { stdio: "inherit" })
  //   }
}
