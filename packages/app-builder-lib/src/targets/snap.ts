import { Arch, deepAssign, executeAppBuilder, InvalidConfigurationError, log, replaceDefault as _replaceDefault, serializeToYaml, toLinuxArchString } from "builder-util"
import { asArray } from "builder-util-runtime"
import { outputFile, readFile } from "fs-extra"
import { safeLoad } from "js-yaml"
import * as path from "path"
import * as semver from "semver"
import { SnapOptions } from ".."
import { Target } from "../core"
import { LinuxPackager } from "../linuxPackager"
import { PlugDescriptor } from "../options/SnapOptions"
import { getTemplatePath } from "../util/pathManager"
import { LinuxTargetHelper } from "./LinuxTargetHelper"
import { createStageDirPath } from "./targetUtil"

const defaultPlugs = ["desktop", "desktop-legacy", "home", "x11", "wayland", "unity7", "browser-support", "network", "gsettings", "pulseaudio", "opengl"]

export default class SnapTarget extends Target {
  readonly options: SnapOptions = {...this.packager.platformSpecificBuildOptions, ...(this.packager.config as any)[this.name]}

  public isUseTemplateApp = false

  constructor(name: string, private readonly packager: LinuxPackager, private readonly helper: LinuxTargetHelper, readonly outDir: string) {
    super(name)
  }

  private replaceDefault(inList: Array<string> | null | undefined, defaultList: Array<string>) {
    const result = _replaceDefault(inList, defaultList)
    if (result !== defaultList) {
      this.isUseTemplateApp = false
    }
    return result
  }

  private async createDescriptor(arch: Arch): Promise<any> {
    if (!this.isElectronVersionGreaterOrEqualThen("4.0.0")) {
      if (!this.isElectronVersionGreaterOrEqualThen("2.0.0-beta.1")) {
        throw new InvalidConfigurationError("Electron 2 and higher is required to build Snap")
      }

      log.warn("Electron 4 and higher is highly recommended for Snap")
    }

    const appInfo = this.packager.appInfo
    const snapName = this.packager.executableName.toLowerCase()
    const options = this.options

    const plugs = normalizePlugConfiguration(this.options.plugs)

    const plugNames = this.replaceDefault(plugs == null ? null : Object.getOwnPropertyNames(plugs), defaultPlugs)
    const buildPackages = asArray(options.buildPackages)
    const defaultStagePackages = getDefaultStagePackages()
    const stagePackages = this.replaceDefault(options.stagePackages, defaultStagePackages)

    this.isUseTemplateApp = this.options.useTemplateApp !== false &&
      (arch === Arch.x64 || arch === Arch.armv7l) &&
      buildPackages.length === 0 &&
      isArrayEqualRegardlessOfSort(stagePackages, defaultStagePackages)

    const appDescriptor: any = {
      command: "command.sh",
      plugs: plugNames,
      adapter: "none",
    }

    const snap: any = safeLoad(await readFile(path.join(getTemplatePath("snap"), "snapcraft.yaml"), "utf-8"))
    if (this.isUseTemplateApp) {
      delete appDescriptor.adapter
    }
    if (options.grade != null) {
      snap.grade = options.grade
    }
    if (options.confinement != null) {
      snap.confinement = options.confinement
    }
    deepAssign(snap, {
      name: snapName,
      version: appInfo.version,
      summary: options.summary || appInfo.productName,
      description: this.helper.getDescription(options),
      architectures: [toLinuxArchString(arch, "snap")],
      apps: {
        [snapName]: appDescriptor
      },
      parts: {
        app: {
          "stage-packages": stagePackages,
        }
      },
    })

    if (options.autoStart) {
      appDescriptor.autostart = `${snap.name}.desktop`
    }

    if (options.confinement === "classic") {
      delete appDescriptor.plugs
      delete snap.plugs
    }
    else {
      const archTriplet = archNameToTriplet(arch)
      appDescriptor.environment = {
        // https://github.com/electron-userland/electron-builder/issues/4007
        // https://github.com/electron/electron/issues/9056
        DISABLE_WAYLAND: "1",
        TMPDIR: "$XDG_RUNTIME_DIR",
        PATH: "$SNAP/usr/sbin:$SNAP/usr/bin:$SNAP/sbin:$SNAP/bin:$PATH",
        SNAP_DESKTOP_RUNTIME: "$SNAP/gnome-platform",
        LD_LIBRARY_PATH: [
          "$SNAP_LIBRARY_PATH",
          "$SNAP/lib:$SNAP/usr/lib:$SNAP/lib/" + archTriplet + ":$SNAP/usr/lib/" + archTriplet,
          "$LD_LIBRARY_PATH:$SNAP/lib:$SNAP/usr/lib",
          "$SNAP/lib/" + archTriplet + ":$SNAP/usr/lib/" + archTriplet
        ].join(":"),
        ...options.environment,
      }

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

  async build(appOutDir: string, arch: Arch): Promise<any> {
    const packager = this.packager
    const options = this.options
    // tslint:disable-next-line:no-invalid-template-strings
    const artifactName = packager.expandArtifactNamePattern(this.options, "snap", arch, "${name}_${version}_${arch}.${ext}", false)
    const artifactPath = path.join(this.outDir, artifactName)
    await packager.info.callArtifactBuildStarted({
      targetPresentableName: "snap",
      file: artifactPath,
      arch,
    })

    const snap = await this.createDescriptor(arch)
    if (this.isUseTemplateApp) {
      delete snap.parts
    }

    const stageDir = await createStageDirPath(this, packager, arch)
    const snapArch = toLinuxArchString(arch, "snap")
    const args = [
      "snap",
      "--app", appOutDir,
      "--stage", stageDir,
      "--arch", snapArch,
      "--output", artifactPath,
      "--executable", this.packager.executableName,
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
    await this.helper.writeDesktopEntry(this.options, packager.executableName, desktopFile, {
      // tslint:disable:no-invalid-template-strings
      Icon: "${SNAP}/meta/gui/icon.png"
    })

    if (this.isElectronVersionGreaterOrEqualThen("5.0.0") && !isBrowserSandboxAllowed(snap)) {
      args.push("--extraAppArgs=--no-sandbox")
      if (this.isUseTemplateApp) {
        args.push("--exclude", "chrome-sandbox")
      }
    }

    if (packager.packagerOptions.effectiveOptionComputed != null && await packager.packagerOptions.effectiveOptionComputed({snap, desktopFile, args})) {
      return
    }

    console.log(JSON.stringify(snap, null, 2))
    await outputFile(path.join(snapMetaDir, this.isUseTemplateApp ? "snap.yaml" : "snapcraft.yaml"), serializeToYaml(snap))

    const hooksDir = await packager.getResource(options.hooks, "snap-hooks")
    if (hooksDir != null) {
      args.push("--hooks", hooksDir)
    }

    if (this.isUseTemplateApp) {
      args.push("--template-url", `electron4:${snapArch}`)
    }
    await executeAppBuilder(args)

    await packager.info.callArtifactBuildCompleted({
      file: artifactPath,
      safeArtifactName: packager.computeSafeArtifactName(artifactName, "snap", arch, false),
      target: this,
      arch,
      packager,
      publishConfig: options.publish == null ? {provider: "snapStore"} : null,
    })
  }

  private isElectronVersionGreaterOrEqualThen(version: string) {
    return semver.gte(this.packager.config.electronVersion || "5.0.3", version)
  }
}

function archNameToTriplet(arch: Arch): string {
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

function isArrayEqualRegardlessOfSort(a: Array<string>, b: Array<string>) {
  a = a.slice()
  b = b.slice()
  a.sort()
  b.sort()
  return a.length === b.length && a.every((value, index) => value === b[index])
}

function normalizePlugConfiguration(raw: Array<string | PlugDescriptor> | PlugDescriptor | null | undefined): { [key: string]: {[name: string]: any; } | null } | null {
  if (raw == null) {
    return null
  }

  const result: any = {}
  for (const item of (Array.isArray(raw) ? raw : [raw])) {
    if (typeof item === "string") {
      result[item] = null
    }
    else {
      Object.assign(result, item)
    }
  }
  return result
}

function isBrowserSandboxAllowed(snap: any): boolean {
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

function getDefaultStagePackages() {
  // libxss1 - was "error while loading shared libraries: libXss.so.1" on Xubuntu 16.04
  // noinspection SpellCheckingInspection
  return ["libnspr4", "libnss3", "libxss1", "libappindicator3-1", "libsecret-1-0"]
}
