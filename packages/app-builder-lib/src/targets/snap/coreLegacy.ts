import { replaceDefault as _replaceDefault, Arch, executeAppBuilder, serializeToYaml, toLinuxArchString } from "builder-util"
import { asArray, deepAssign, isValidKey, Nullish } from "builder-util-runtime"
import { outputFile, readFile } from "fs-extra"
import { load } from "js-yaml"
import * as path from "path"
import { PlugDescriptor, SnapOptions } from "../../options/SnapOptions"
import { getTemplatePath } from "../../util/pathManager"
import { SnapCore } from "./SnapTarget"
import { SnapcraftYAML } from "./snapcraft"
import { DEFAULT_STAGE_PACKAGES } from "./snapcraftBuilder"

// Handles core18/core20/core22 snaps via the app-builder binary (not the snapcraft CLI).
// See: https://github.com/develar/app-builder/blob/master/pkg/package-format/snap
export class SnapCoreLegacy extends SnapCore<SnapOptions> {
  private isUseTemplateApp = false

  defaultPlugs = ["desktop", "desktop-legacy", "home", "x11", "wayland", "unity7", "browser-support", "network", "gsettings", "audio-playback", "pulseaudio", "opengl"]

  private replaceDefault(inList: Array<string> | Nullish, defaultList: Array<string>) {
    const result = _replaceDefault(inList, defaultList)
    // Any customisation opts out of the pre-built template app.
    if (result !== defaultList) {
      this.isUseTemplateApp = false
    }
    return result
  }

  async createDescriptor(arch: Arch): Promise<SnapcraftYAML> {
    const appInfo = this.packager.appInfo
    const snapName = this.packager.executableName.toLowerCase()
    const options = this.options

    const plugs = this.normalizePlugConfiguration(this.options.plugs)

    const plugNames = this.replaceDefault(plugs == null ? null : Object.getOwnPropertyNames(plugs), this.defaultPlugs)

    const slots = this.normalizePlugConfiguration(this.options.slots)

    const buildPackages = asArray(options.buildPackages)
    const stagePackages = this.replaceDefault(options.stagePackages, DEFAULT_STAGE_PACKAGES)

    const stageSet = new Set(stagePackages)
    const stageMatchesDefaults = stagePackages.length === DEFAULT_STAGE_PACKAGES.length && DEFAULT_STAGE_PACKAGES.every((p: string) => stageSet.has(p))

    // Template app is only available for x64/armv7l, and only when no packages are customised.
    this.isUseTemplateApp = this.options.useTemplateApp !== false && (arch === Arch.x64 || arch === Arch.armv7l) && buildPackages.length === 0 && stageMatchesDefaults

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
        if (!isValidKey(slotName)) {
          throw new Error(`Invalid plug/slot name: ${slotName}`)
        }
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
      architectures: [toLinuxArchString(arch, "snap")],
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
      const isOldElectron = !this.helper.isElectronVersionGreaterOrEqualThan("38.0.0", "7.0.0")
      if (
        (allow == null && isOldElectron) || // No explicit option -> use legacy behavior for old Electron
        allow === false // Explicitly disallowed
      ) {
        environment.DISABLE_WAYLAND = "1"
      }

      appDescriptor.environment = environment

      if (plugs != null) {
        for (const plugName of plugNames) {
          if (!isValidKey(plugName)) {
            throw new Error(`Invalid plug/slot name: ${plugName}`)
          }
          const plugOptions = plugs[plugName]
          if (plugOptions == null) {
            continue
          }
          if (!snap.plugs) {
            snap.plugs = {}
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

  async buildSnap(props: { snap: any; appOutDir: string; stageDir: string; snapArch: Arch; artifactPath: string }): Promise<void> {
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

    // snapcraft.yaml inside a snap directory, or snap.yaml inside meta/ for template builds
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
      // remove fields that are valid in snapcraft.yaml but not in snap.yaml (template format)
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
      // Map TypeScript Arch enum to the string keys expected by app-builder's ResolveTemplateDir.
      // The previous code passed the raw numeric enum value (e.g. Arch.x64 = 1 → "electron4:1")
      // which fell through to the default case and was treated as a bare URL, failing with
      // "unsupported protocol scheme". The switch in snap.go expects "electron4:amd64" / "electron4:armhf".
      const templateArch = snapArch === Arch.x64 ? "amd64" : "armhf"
      args.push("--template-url", `electron4:${templateArch}`)
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
        if (!isValidKey(item)) {
          throw new Error(`Invalid plug/slot name: ${item}`)
        }
        result[item] = null
      } else {
        deepAssign(result, item)
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
