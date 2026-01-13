import { replaceDefault as _replaceDefault, Arch, deepAssign, executeAppBuilder, InvalidConfigurationError, isArrayEqualRegardlessOfSort, log, serializeToYaml, toLinuxArchString } from "builder-util"
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

const defaultPlugs = ["desktop", "desktop-legacy", "home", "x11", "wayland", "unity7", "browser-support", "network", "gsettings", "audio-playback", "pulseaudio", "opengl"]
const VM_NAME = "snap-builder"

export default class SnapTarget24 extends SnapTarget {
  async createDescriptor(arch: Arch): Promise<any> {
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

    const slots = this.normalizePlugConfiguration(this.options.slots)
    const buildPackages = asArray(options.buildPackages)
    const defaultStagePackages = this.getDefaultStagePackages()
    const stagePackages = this.replaceDefault(options.stagePackages, defaultStagePackages)

    const snap: SnapcraftYAML = {
    name: snapName,
    version: appInfo.version,
    summary: options.summary || appInfo.productName,
    description: appInfo.description,
base: "core24",
    grade: options.grade || "stable",

    platforms: {
      "app": {
        "build-on": toLinuxArchString(arch, "snap"),
        "build-for": toLinuxArchString(arch, "snap"),
      },
    },

    parts: {
      app: {
        "stage-packages": options.stagePackages || ["libnspr4", "libnss3", "libxss1", "libappindicator3-1", "libsecret-1-0"],
        plugin: "dump",
        source: "./app",
      },
    },

    // Default apps section
    apps: {
      [snapName]: {
        command: `app/${this.packager.executableName}`,
        extensions: ["gnome"],
        plugs: plugNames,
        environment: this.options.allowNativeWayland === false
          ? {
              DISABLE_WAYLAND: "1",
            }
          : undefined,
      },
    },

    // Default plugs section
    plugs: {
          "browser-support": {
            "allow-sandbox": true,
          },
        },
    confinement: options.confinement || "strict",

    parts: {
      app: {
        "stage-packages": options.stagePackages || ["libnspr4", "libnss3", "libxss1", "libappindicator3-1", "libsecret-1-0"],
        plugin: "dump",
        source: "./app",
      },
    },
  }
}

    const appDescriptor: any = {
      command: "command.sh",
      plugs: plugNames,
    }

    if (options.grade != null) {
      snap.grade = options.grade
    }
    if (options.confinement != null) {
      snap.confinement = options.confinement
    }
    if (options.appPartStage != null) {
      snap.parts.app.stage = options.appPartStage
    }
    if (options.layout != null) {
      snap.layout = options.layout
    }
    if (slots != null) {
      appDescriptor.slots = Object.getOwnPropertyNames(slots)
      for (const slotName of appDescriptor.slots) {
        const slotOptions = slots[slotName]
        if (slotOptions == null) {
          continue
        }
        if (!snap.slots) {
          snap.slots = {}
        }
        snap.slots[slotName] = slotOptions
      }
    }

    deepAssign(snap, {
      name: snapName,
      version: appInfo.version,
      title: options.title || appInfo.productName,
      summary: options.summary || appInfo.productName,
      compression: options.compression,
      description: this.helper.getDescription(options),
      platforms: [toLinuxArchString(arch, "snap")],
      apps: {
        [snapName]: appDescriptor,
      },
      parts: {
        app: {
          "stage-packages": stagePackages,
        },
      },
    })

    if (options.autoStart) {
      appDescriptor.autostart = `${snap.name}.desktop`
    }

    if (options.confinement === "classic") {
      delete appDescriptor.plugs
      delete snap.plugs
    } else {
      const archTriplet = this.archNameToTriplet(arch)
      const environment: Record<string, string> = {
        PATH: "$SNAP/usr/sbin:$SNAP/usr/bin:$SNAP/sbin:$SNAP/bin:$PATH",
        SNAP_DESKTOP_RUNTIME: "$SNAP/gnome-platform",
        LD_LIBRARY_PATH: [
          "$SNAP_LIBRARY_PATH",
          "$SNAP/lib:$SNAP/usr/lib:$SNAP/lib/" + archTriplet + ":$SNAP/usr/lib/" + archTriplet,
          "$LD_LIBRARY_PATH:$SNAP/lib:$SNAP/usr/lib",
          "$SNAP/lib/" + archTriplet + ":$SNAP/usr/lib/" + archTriplet,
        ].join(":"),
        ...options.environment,
      }
      // Determine whether Wayland should be disabled based on:
      // - Electron version (<38 historically had Wayland disabled)
      // - Explicit allowNativeWayland override.
      // https://github.com/electron-userland/electron-builder/issues/9320
      const allow = options.allowNativeWayland
      const isOldElectron = !this.isElectronVersionGreaterOrEqualThan("38.0.0")
      if (
        (allow == null && isOldElectron) || // No explicit option -> use legacy behavior for old Electron
        allow === false // Explicitly disallowed
      ) {
        environment.DISABLE_WAYLAND = "1"
      }

      appDescriptor.environment = environment

      if (plugs != null) {
        for (const plugName of plugNames) {
          const plugOptions = plugs[plugName]
          if (plugOptions == null) {
            continue
          }

          snap.plugs[plugName] = plugOptions
        }
      }
    }

    if (buildPackages.length > 0) {
      snap.parts.app["build-packages"] = buildPackages
    }
    if (options.after != null) {
      snap.parts.app.after = options.after
    }

    if (options.assumes != null) {
      snap.assumes = asArray(options.assumes)
    }

    return snap
  }

  protected buildSnap(snap: any, appOutDir: string, stageDir: string, snapArch: string, artifactPath: string): Promise<void> {

  }

  protected getDefaultStagePackages() {
    return ["libnspr4", "libnss3", "libxss1", "libappindicator3-1", "libsecret-1-0"]
  }
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
