import {
  replaceDefault as _replaceDefault,
  Arch,
  deepAssign,
  executeAppBuilder,
  InvalidConfigurationError,
  isArrayEqualRegardlessOfSort,
  log,
  serializeToYaml,
  stripUndefinedRecursively,
  toLinuxArchString,
} from "builder-util"
import { asArray, Nullish, SnapStoreOptions } from "builder-util-runtime"
import { mkdirSync, outputFile, readdirSync, readFile, statSync } from "fs-extra"
import { load } from "js-yaml"
import * as path from "path"
import * as semver from "semver"
import { Configuration } from "../../configuration"
import { Publish, Target } from "../../core"
import { LinuxPackager } from "../../linuxPackager"
import { PlugDescriptor, SnapOptions } from "../../options/SnapOptions"
import { getTemplatePath } from "../../util/pathManager"
import { LinuxTargetHelper } from "../LinuxTargetHelper"
import { createStageDirPath } from "../targetUtil"
import { execSync } from "child_process"
import { expandMacro } from "../../util/macroExpander"
import SnapTarget from "./snap"
import { Platform, SnapcraftYAML } from "./snapcraft"
import { SlotDescriptor } from "app-builder-lib/out"

const defaultPlugs = ["desktop", "desktop-legacy", "home", "x11", "wayland", "unity7", "browser-support", "network", "gsettings", "audio-playback", "pulseaudio", "opengl"]
const VM_NAME = "snap-builder"

export default class SnapTarget24 extends SnapTarget {
  createDescriptor(arch: Arch): Promise<any> {
    if (!this.isElectronVersionGreaterOrEqualThan("4.0.0")) {
      if (!this.isElectronVersionGreaterOrEqualThan("2.0.0-beta.1")) {
        throw new InvalidConfigurationError("Electron 2 and higher is required to build Snap")
      }

      log.warn("Electron 4 and higher is highly recommended for Snap")
    }

    const appInfo = this.packager.appInfo
    const snapName = this.packager.executableName.toLowerCase()
    const options = this.options

    const plugs = this.normalizePlugConfiguration(this.options.plugs)

    const plugNames = this.replaceDefault(plugs == null ? null : Object.getOwnPropertyNames(plugs), defaultPlugs)
    const { app: appSlots, root: rootSlots } = this.convertPlugArrayToObject(options.slots)
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
      platforms: {
        app: {
          "build-on": toLinuxArchString(arch, "snap"),
          "build-for": toLinuxArchString(arch, "snap"),
        },
      },

      parts: {
        app: {
          autostart: options.autoStart ? `${snapName}.desktop` : undefined,
          "stage-packages": stagePackages.length > 0 ? stagePackages : undefined,
          "build-packages": buildPackages.length > 0 ? buildPackages : undefined,
          after: options.after || undefined,
          plugin: "dump",
          source: "./app",
          stage: options.appPartStage || ["user/share/locale"],
          slots: appSlots.length > 0 ? appSlots : undefined,
        },
      },

      layout: options.layout || {
        "/usr/share/locale": {
          "bind-file": "usr/share/locale",
        },
      },
      apps: {
        [snapName]: {
          command: `app/${this.packager.executableName}`,
          extensions: ["gnome"],
          plugs: plugNames,
        },
      },
      plugs: {
        "browser-support": {
          "allow-sandbox": true,
        },
      },
    }
    const cleaned = stripUndefinedRecursively(snap)
    return cleaned
  }

  private convertPlugArrayToObject<T extends string | PlugDescriptor | SlotDescriptor>(plugsOrSlots: Array<T> | Nullish): { app: string[]; root: Record<string, T> } {
    const slots = this.normalizePlugConfiguration(plugsOrSlots)
    const app = Object.getOwnPropertyNames(slots)
    const root = Object.entries(slots || {}).reduce<Record<string, any>>((acc, slot) => {
      if (slot[1] == null) {
        return acc
      }
      acc[slot[0]] = slot[1]
      return acc
    }, {})
    return { app, root }
  }

  protected buildSnap(snap: any, appOutDir: string, stageDir: string, snapArch: string, artifactPath: string): Promise<void> {}

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

  protected ensureMultipassVM() {
    try {
      execSync(`multipass info snap-builder`, { stdio: "ignore" })
      console.log("✅ Multipass VM exists")
    } catch {
      execSync(`multipass launch --name snap-builder --cpus 4 --memory 8G --disk 20G`, { stdio: "inherit" })
    }
  }
  protected cleanupMultipass() {
    try {
      run(`multipass delete --purge ${VM_NAME}`)
      console.log("✅ Multipass VM cleaned up")
    } catch (err) {
      console.warn("⚠ Failed to cleanup Multipass VM", err)
    }
  }
  run(cmd: string) {
    console.log(`\n▶ ${cmd}`)
    execSync(cmd, { stdio: "inherit" })
  }
}
