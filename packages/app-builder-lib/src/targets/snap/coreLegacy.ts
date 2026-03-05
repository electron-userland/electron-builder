import { getTemplatePath } from "../../util/pathManager"
import { replaceDefault as _replaceDefault, Arch, deepAssign, executeAppBuilder, isArrayEqualRegardlessOfSort, serializeToYaml, toLinuxArchString } from "builder-util"
import { asArray, Nullish } from "builder-util-runtime"
import { outputFile, readFile } from "fs-extra"
import { load } from "js-yaml"
import * as path from "path"
import { PlugDescriptor, SnapOptionsLegacy } from "../../options/SnapOptions"
import { SnapCore } from "./SnapTarget"

export class SnapCoreLegacy extends SnapCore<SnapOptionsLegacy> {
  private isUseTemplateApp = false

  defaultPlugs = ["desktop", "desktop-legacy", "home", "x11", "wayland", "unity7", "browser-support", "network", "gsettings", "audio-playback", "pulseaudio", "opengl"]

  private replaceDefault(inList: Array<string> | Nullish, defaultList: Array<string>) {
    const result = _replaceDefault(inList, defaultList)
    if (result !== defaultList) {
      this.isUseTemplateApp = false
    }
    return result
  }

  async createDescriptor(arch: Arch): Promise<any> {
    const appInfo = this.packager.appInfo
    const snapName = this.packager.executableName.toLowerCase()
    const options = this.options

    const plugs = this.normalizePlugConfiguration(this.options.plugs)

    const plugNames = this.replaceDefault(plugs == null ? null : Object.getOwnPropertyNames(plugs), this.defaultPlugs)

    const slots = this.normalizePlugConfiguration(this.options.slots)

    const buildPackages = asArray(options.buildPackages)
    const defaultStagePackages = this.getDefaultStagePackages()
    const stagePackages = this.replaceDefault(options.stagePackages, defaultStagePackages)

    this.isUseTemplateApp =
      this.options.useTemplateApp !== false &&
      (arch === Arch.x64 || arch === Arch.armv7l) &&
      buildPackages.length === 0 &&
      isArrayEqualRegardlessOfSort(stagePackages, defaultStagePackages)

    const appDescriptor: any = {
      command: "command.sh",
      plugs: plugNames,
      adapter: "none",
    }

    const snap: any = load(await readFile(path.join(getTemplatePath("snap"), "snapcraft.yaml"), "utf-8"))
    if (this.isUseTemplateApp) {
      delete appDescriptor.adapter
    }
    if (options.base != null) {
      snap.base = options.base
      // from core22 onwards adapter is legacy
      if (Number(snap.base.split("core")[1]) >= 22) {
        delete appDescriptor.adapter
      }
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
      const isOldElectron = !this.helper.isElectronVersionGreaterOrEqualThan("38.0.0")
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

  async buildSnap(props: { snap: any; appOutDir: string; stageDir: string; snapArch: Arch; artifactPath: string }) {
    const { snap, appOutDir, stageDir, snapArch, artifactPath } = props
    const args = [
      "snap",
      "--app",
      appOutDir,
      "--stage",
      stageDir,
      "--arch",
      toLinuxArchString(snapArch, "snap"),
      "--output",
      artifactPath,
      "--executable",
      this.packager.executableName,
    ]

    await this.helper.icons
    if (this.helper.maxIconPath != null) {
      if (!this.isUseTemplateApp) {
        snap.icon = "snap/gui/icon.png"
      }
      args.push("--icon", this.helper.maxIconPath)
    }

    // snapcraft.yaml inside a snap directory
    const snapMetaDir = path.join(stageDir, this.isUseTemplateApp ? "meta" : "snap")
    const desktopFile = path.join(snapMetaDir, "gui", `${snap.name}.desktop`)
    await this.helper.writeDesktopEntry(this.options, this.packager.executableName + " %U", desktopFile, {
      // tslint:disable:no-invalid-template-strings
      Icon: "${SNAP}/meta/gui/icon.png",
    })

    const extraAppArgs: Array<string> = this.options.executableArgs ?? []
    if (this.helper.isElectronVersionGreaterOrEqualThan("5.0.0") && !this.isBrowserSandboxAllowed(snap)) {
      const noSandboxArg = "--no-sandbox"
      if (!extraAppArgs.includes(noSandboxArg)) {
        extraAppArgs.push(noSandboxArg)
      }
      if (this.isUseTemplateApp) {
        args.push("--exclude", "chrome-sandbox")
      }
    }
    if (extraAppArgs.length > 0) {
      args.push("--extraAppArgs=" + extraAppArgs.join(" "))
    }

    if (snap.compression != null) {
      args.push("--compression", snap.compression)
    }

    if (this.isUseTemplateApp) {
      // remove fields that are valid in snapcraft.yaml, but not snap.yaml
      const fieldsToStrip = ["compression", "contact", "donation", "issues", "parts", "source-code", "website"]
      for (const field of fieldsToStrip) {
        delete snap[field]
      }
    }

    if (this.packager.packagerOptions.effectiveOptionComputed != null && (await this.packager.packagerOptions.effectiveOptionComputed({ snap, desktopFile, args }))) {
      return
    }

    await outputFile(path.join(snapMetaDir, this.isUseTemplateApp ? "snap.yaml" : "snapcraft.yaml"), serializeToYaml(snap))

    const hooksDir = await this.packager.getResource(this.options.hooks, "snap-hooks")
    if (hooksDir != null) {
      args.push("--hooks", hooksDir)
    }

    if (this.isUseTemplateApp) {
      args.push("--template-url", `electron4:${snapArch}`)
    }

    await executeAppBuilder(args)
  }

  private normalizePlugConfiguration(raw: Array<string | PlugDescriptor> | PlugDescriptor | Nullish): Record<string, Record<string, any> | null> | null {
    if (raw == null) {
      return null
    }

    const result: any = {}
    for (const item of Array.isArray(raw) ? raw : [raw]) {
      if (typeof item === "string") {
        result[item] = null
      } else {
        Object.assign(result, item)
      }
    }
    return result
  }

  private isBrowserSandboxAllowed(snap: any): boolean {
    if (snap.plugs != null) {
      for (const plugName of Object.keys(snap.plugs)) {
        const plug = snap.plugs[plugName]
        if (plug.interface === "browser-support" && plug["allow-sandbox"] === true) {
          return true
        }
      }
    }
    return false
  }

  private getDefaultStagePackages(): Array<string> {
    // libxss1 - was "error while loading shared libraries: libXss.so.1" on Xubuntu 16.04
    return ["libnspr4", "libnss3", "libxss1", "libappindicator3-1", "libsecret-1-0"]
  }

  private archNameToTriplet(arch: Arch): string {
    switch (arch) {
      case Arch.x64:
        return "x86_64-linux-gnu"
      case Arch.ia32:
        return "i386-linux-gnu"
      case Arch.armv7l:
        // noinspection SpellCheckingInspection
        return "arm-linux-gnueabihf"
      case Arch.arm64:
        return "aarch64-linux-gnu"

      default:
        throw new Error(`Unsupported arch ${arch}`)
    }
  }
}
