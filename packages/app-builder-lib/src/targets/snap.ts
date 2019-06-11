import { Arch, executeAppBuilder, replaceDefault as _replaceDefault, serializeToYaml, toLinuxArchString, deepAssign } from "builder-util"
import { asArray } from "builder-util-runtime"
import { outputFile, readFile, rename } from "fs-extra-p"
import * as path from "path"
import * as semver from "semver"
import { SnapOptions } from ".."
import { Target } from "../core"
import { LinuxPackager, toAppImageOrSnapArch } from "../linuxPackager"
import { PlugDescriptor } from "../options/SnapOptions"
import { getTemplatePath } from "../util/pathManager"
import { LinuxTargetHelper } from "./LinuxTargetHelper"
import { createStageDirPath } from "./targetUtil"
import { safeLoad } from "js-yaml"

const defaultPlugs = ["desktop", "desktop-legacy", "home", "x11", "unity7", "browser-support", "network", "gsettings", "pulseaudio", "opengl"]

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

  private getDefaultStagePackages() {
    // libxss1, libasound2 - was "error while loading shared libraries: libXss.so.1" on Xubuntu 16.04
    // noinspection SpellCheckingInspection
    const result = ["libnspr4", "libnss3", "libxss1", "libappindicator3-1", "libsecret-1-0"]
    // const result = []
    if (semver.lt(this.packager.config.electronVersion || "5.0.3", "4.0.0")) {
      result.push("libgconf2-4")
    }
    return result
  }

  private async createDescriptor(arch: Arch): Promise<any> {
    if (semver.lt(this.packager.config.electronVersion || "5.0.3", "2.0.0-beta.1")) {
      throw new Error("Electron 2 and higher is required to build Snap")
    }

    const appInfo = this.packager.appInfo
    const snapName = this.packager.executableName.toLowerCase()
    const options = this.options
    const linuxArchName = toAppImageOrSnapArch(arch)

    const plugs = normalizePlugConfiguration(this.options.plugs)

    const plugNames = this.replaceDefault(plugs == null ? null : Object.getOwnPropertyNames(plugs), defaultPlugs)
    const buildPackages = asArray(options.buildPackages)
    this.isUseTemplateApp = this.options.useTemplateApp !== false && arch === Arch.x64 && buildPackages.length === 0

    const appDescriptor: any = {
      command: "command.sh",
      // command: "$SNAP/" + (this.isUseTemplateApp ? "" : "app/") + this.packager.executableName
      plugs: plugNames,
      adapter: "none",
    }

    const snap: any = safeLoad(await readFile(path.join(getTemplatePath("snap"), "snapcraft.yaml"), "utf-8"))
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
      architectures: [toLinuxArchString(arch, true)],
      apps: {
        [snapName]: appDescriptor
      },
      parts: {
        app: {
          "stage-packages": this.replaceDefault(options.stagePackages, this.getDefaultStagePackages()),
        }
      },
    })

    if (options.confinement !== "classic") {
      appDescriptor.environment = {
        TMPDIR: "$XDG_RUNTIME_DIR",
        PATH: "$SNAP/usr/sbin:$SNAP/usr/bin:$SNAP/sbin:$SNAP/bin:$PATH",
        SNAP_DESKTOP_RUNTIME: "$SNAP/gnome-platform",
        LD_LIBRARY_PATH: [
          "$SNAP_LIBRARY_PATH",
          "$SNAP/lib:$SNAP/usr/lib:$SNAP/lib/" + linuxArchName + "-linux-gnu:$SNAP/usr/lib/" + linuxArchName + "-linux-gnu",
          "$LD_LIBRARY_PATH:$SNAP/lib:$SNAP/usr/lib",
          "$SNAP/lib/" + linuxArchName + "-linux-gnu:$SNAP/usr/lib/" + linuxArchName + "-linux-gnu"
        ].join(":"),
        ...options.environment,
      }
    }

    if (buildPackages.length > 0) {
      snap.parts.app["build-packages"] = buildPackages
    }
    if (options.after != null) {
      snap.parts.app.after = options.after
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
    // snapcraft.yaml inside a snap directory
    const snapMetaDir = path.join(stageDir, this.isUseTemplateApp ? "meta" : "snap")

    const args = [
      "snap",
      "--app", appOutDir,
      "--stage", stageDir,
      "--arch", toLinuxArchString(arch, true),
      "--output", this.isUseTemplateApp ? artifactPath : "out.snap",
      "--executable", this.packager.executableName,
    ]

    await this.helper.icons
    if (this.helper.maxIconPath != null) {
      if (!this.isUseTemplateApp) {
        snap.icon = "snap/gui/icon.png"
      }
      args.push("--icon", this.helper.maxIconPath)
    }

    const desktopFile = path.join(snapMetaDir, "gui", `${snap.name}.desktop`)
    await this.helper.writeDesktopEntry(this.options, packager.executableName, desktopFile, {
      // tslint:disable:no-invalid-template-strings
      Icon: "${SNAP}/meta/gui/icon.png"
    })

    if (semver.gte(this.packager.config.electronVersion || "5.0.3", "5.0.0") && !isBrowserSandboxAllowed(snap)) {
      args.push("--extraAppArgs=--no-sandbox")
      args.push("--exclude", "chrome-sandbox")
    }

    if (packager.packagerOptions.effectiveOptionComputed != null && await packager.packagerOptions.effectiveOptionComputed({snap, desktopFile, args})) {
      return
    }

    await outputFile(path.join(snapMetaDir, this.isUseTemplateApp ? "snap.yaml" : "snapcraft.yaml"), serializeToYaml(snap))

    const hooksDir = await packager.getResource(options.hooks, "snap-hooks")
    if (hooksDir != null) {
      args.push("--hooks", hooksDir)
    }

    if (this.isUseTemplateApp) {
      args.push("--template-url", semver.gte(this.packager.config.electronVersion || "5.0.3", "4.0.0") ? "electron4" : "electron2")
    }
    await executeAppBuilder(args)

    if (!this.isUseTemplateApp) {
      // multipass cannot access files outside of snapcraft command working dir
      await rename(path.join(stageDir, "out.snap"), artifactPath)
    }
    await packager.dispatchArtifactCreated(artifactPath, this, arch, packager.computeSafeArtifactName(artifactName, "snap", arch, false))
  }
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