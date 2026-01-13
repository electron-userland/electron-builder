import { replaceDefault as _replaceDefault, Arch, InvalidConfigurationError, log, stripUndefinedRecursively, toLinuxArchString } from "builder-util"
import { asArray } from "builder-util-runtime"
import { readdir } from "fs-extra"
import * as path from "path"
import { PlugDescriptor } from "../../options/SnapOptions"
import SnapTarget from "./snap"
import { SnapcraftYAML } from "./snapcraft"

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

    const environment =
      options.allowNativeWayland === false
        ? {
            DISABLE_WAYLAND: "1",
            ...options.environment,
          }
        : options.environment || undefined

    const hooks = options.hooks
      ? (await readdir(path.resolve(this.packager.buildResourcesDir, options.hooks))).reduce((acc, hookPath) => {
          acc[path.basename(hookPath, path.extname(hookPath))] = hookPath
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
      environment: environment,

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

  // protected buildSnap(snap: any, appOutDir: string, stageDir: string, snapArch: string, artifactPath: string): Promise<void> {}

  // protected getDefaultStagePackages() {
  //   return ["libnspr4", "libnss3", "libxss1", "libappindicator3-1", "libsecret-1-0"]
  // }
  // protected buildSnapCore24(options: {
  //   SNAP_DIR: string
  //   DIST_DIR: string
  //   APP_NAME: string
  //   VERSION: string
  //   USE_CLASSIC: boolean
  // }) {
  //   const { SNAP_DIR, DIST_DIR, APP_NAME, VERSION, USE_CLASSIC } = options
  // if (path.isAbsolute(DIST_DIR)) {
  //   throw new Error("snapcraft.yaml source must be relative, absolute paths are invalid")
  // }
  //   // Detect Electron binary and strip debug symbols
  //   const binaryName = path.join("app", APP_NAME)
  //   const binaryPath = path.join(DIST_DIR, binaryName)
  //   // Create snap directory
  //   mkdirSync(SNAP_DIR, { recursive: true })

  //   // Generate Snapcraft YAML with flat lists (no nested lists)
  //   const snapcraftYaml = `
  // name: ${APP_NAME}
  // base: core24
  // version: '${VERSION}'
  // summary: ${APP_NAME}
  // description: |
  //   ${APP_NAME} Electron application

  // grade: stable
  // confinement: ${USE_CLASSIC ? "classic" : "strict"}

  // platforms:
  //   amd64:
  //     build-on: amd64
  //     build-for: amd64
  //   arm64:
  //     build-on: arm64
  //     build-for: arm64

  // apps:
  //   ${APP_NAME}:
  //     command: ${binaryName}
  //     extensions: [gnome]
  //     environment:
  //       ELECTRON_DISABLE_SANDBOX: "1"
  //     plugs:
  //       - network
  //       - home
  //       - desktop
  //       - desktop-legacy
  //       - wayland
  //       - x11
  //       - audio-playback
  //       - opengl

  // parts:
  //   ${APP_NAME}:
  //     plugin: dump
  //     source: app
  //     stage-packages:
  //       - libnss3
  //       - libatk-bridge2.0-0
  //       - libgtk-3-0
  //       - libx11-xcb1
  //       - libxcomposite1
  //       - libxrandr2
  //       - libxdamage1
  //       - libxfixes3
  //       - libasound2
  //       - libgbm1
  //       - libdrm2
  //     stage:
  //       - usr/share/locale
  //     override-stage: |
  //       snapcraftctl stage
  //       mkdir -p $SNAPCRAFT_PART_INSTALL/usr/share/locale
  // `.trimStart()

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
