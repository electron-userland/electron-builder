import { path7za } from "7zip-bin"
import { appBuilderPath } from "app-builder-bin"
import { isEnvTrue, Arch, replaceDefault as _replaceDefault, serializeToYaml, spawn, toLinuxArchString, log } from "builder-util"
import { outputFile } from "fs-extra-p"
import * as path from "path"
import { SnapOptions } from ".."
import { asArray } from "builder-util-runtime"
import { Target } from "../core"
import { LinuxPackager, toAppImageOrSnapArch } from "../linuxPackager"
import { PlugDescriptor } from "../options/SnapOptions"
import { LinuxTargetHelper } from "./LinuxTargetHelper"
import { createStageDir } from "./targetUtil"
import { SNAP_TEMPLATE_SHA512, SNAP_TEMPLATE_VERSION } from "./tools"

// libxss1, libasound2, gconf2 - was "error while loading shared libraries: libXss.so.1" on Xubuntu 16.04
const defaultStagePackages = ["libasound2", "libgconf2-4", "libnotify4", "libnspr4", "libnss3", "libpcre3", "libpulse0", "libxss1", "libxtst6"]
const defaultPlugs = ["desktop", "desktop-legacy", "home", "x11", "unity7", "browser-support", "network", "gsettings", "pulseaudio", "opengl"]

export default class SnapTarget extends Target {
  readonly options: SnapOptions = {...this.packager.platformSpecificBuildOptions, ...(this.packager.config as any)[this.name]}

  private isUseTemplateApp = false

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

  private createDescriptor(snapName: string, arch: Arch): any {
    const appInfo = this.packager.appInfo
    const options = this.options
    const linuxArchName = toAppImageOrSnapArch(arch)

    const plugs = normalizePlugConfiguration(options.plugs)
    const plugNames = this.replaceDefault(plugs == null ? null : Object.getOwnPropertyNames(plugs), defaultPlugs)

    const snap: any = {
      name: snapName,
      version: appInfo.version,
      summary: options.summary || appInfo.productName,
      description: this.helper.getDescription(options),
      confinement: options.confinement || "strict",
      grade: options.grade || "stable",
      apps: {
        [snapName]: {
          command: `bin/desktop-launch $SNAP/app/${this.packager.executableName}`,
          adapter: "none",
          environment: {
            TMPDIR: "$XDG_RUNTIME_DIR",
            PATH: "$SNAP/usr/sbin:$SNAP/usr/bin:$SNAP/sbin:$SNAP/bin:$PATH",
            LD_LIBRARY_PATH: [
              "$SNAP_LIBRARY_PATH",
              "$SNAP/usr/lib/" + linuxArchName + "-linux-gnu:$SNAP/usr/lib/" + linuxArchName + "-linux-gnu/pulseaudio",
              "$SNAP/usr/lib/" + linuxArchName + "-linux-gnu/mesa-egl",
              "$SNAP/lib:$SNAP/usr/lib:$SNAP/lib/" + linuxArchName + "-linux-gnu:$SNAP/usr/lib/" + linuxArchName + "-linux-gnu",
              "$LD_LIBRARY_PATH:$SNAP/lib:$SNAP/usr/lib",
              "$SNAP/lib/" + linuxArchName + "-linux-gnu:$SNAP/usr/lib/" + linuxArchName + "-linux-gnu"
            ].join(":"),
            ...options.environment,
          },
          plugs: plugNames,
        }
      },
      parts: {
        app: {
          plugin: "nil",
          "stage-packages": this.replaceDefault(options.stagePackages, defaultStagePackages),
          after: this.replaceDefault(options.after, ["desktop-gtk2"]),
        }
      },
    }

    if (plugs != null) {
      for (const plugName of plugNames) {
        const plugOptions = plugs[plugName]
        if (plugOptions == null) {
          continue
        }

        if (snap.plugs == null) {
          snap.plugs = {}
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
    const snapName = packager.executableName.toLowerCase()
    const buildPackages = asArray(options.buildPackages)
    this.isUseTemplateApp = this.options.useTemplateApp !== false && arch === Arch.x64 && buildPackages.length === 0

    const snapFileName = `${snapName}_${packager.appInfo.version}_${toLinuxArchString(arch)}.snap`
    const artifactPath = path.join(this.outDir, snapFileName)
    this.logBuilding("snap", artifactPath, arch)

    const snap: any = this.createDescriptor(snapName, arch)
    if (this.isUseTemplateApp) {
      delete snap.parts
    }

    const stageDir = await createStageDir(this, packager, arch)
    // snapcraft.yaml inside a snap directory
    const snapMetaDir = path.join(stageDir.dir, this.isUseTemplateApp ? "meta" : "snap")

    const args = [
      "snap",
      "--app", appOutDir,
      "--stage", stageDir.dir,
      "--arch", toLinuxArchString(arch),
      "--output", artifactPath,
      "--docker-image", "electronuserland/builder:latest"
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

    if (packager.packagerOptions.effectiveOptionComputed != null && await packager.packagerOptions.effectiveOptionComputed({snap, desktopFile})) {
      return
    }

    await outputFile(path.join(snapMetaDir, this.isUseTemplateApp ? "snap.yaml" : "snapcraft.yaml"), serializeToYaml(snap))

    if (log.isDebugEnabled && !isEnvTrue(process.env.ELECTRON_BUILDER_REMOVE_STAGE_EVEN_IF_DEBUG)) {
      args.push("--no-remove-stage")
    }

    const hooksDir = await packager.getResource(options.hooks, "snap-hooks")
    if (hooksDir != null) {
      args.push("--hooks", hooksDir)
    }

    if (this.isUseTemplateApp) {
      const templateDirName = `snap-template-${SNAP_TEMPLATE_VERSION}`
      args.push(
        "--template-url", `https://github.com/electron-userland/electron-builder-binaries/releases/download/${templateDirName}/${templateDirName}.7z`,
        "--template-sha512", SNAP_TEMPLATE_SHA512,
      )
    }

    await spawn(appBuilderPath, args, {
      env: {
        ...process.env,
        SZA_PATH: path7za,
      },
      stdio: ["ignore", "inherit", "inherit"]
    })
    packager.dispatchArtifactCreated(artifactPath, this, arch)
  }
}

function normalizePlugConfiguration(raw: Array<string | PlugDescriptor> | PlugDescriptor | null | undefined): { [key: string]: PlugDescriptor | null } | null {
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