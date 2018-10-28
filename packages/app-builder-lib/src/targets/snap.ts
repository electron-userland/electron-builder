import { Arch, executeAppBuilder, replaceDefault as _replaceDefault, serializeToYaml, toLinuxArchString } from "builder-util"
import { asArray } from "builder-util-runtime"
import { outputFile } from "fs-extra-p"
import * as path from "path"
import * as semver from "semver"
import { SnapOptions } from ".."
import { Target } from "../core"
import { LinuxPackager, toAppImageOrSnapArch } from "../linuxPackager"
import { PlugDescriptor } from "../options/SnapOptions"
import { LinuxTargetHelper } from "./LinuxTargetHelper"
import { createStageDirPath } from "./targetUtil"

// libxss1, libasound2, gconf2 - was "error while loading shared libraries: libXss.so.1" on Xubuntu 16.04
const defaultStagePackages = ["libasound2", "libgconf2-4", "libnotify4", "libnspr4", "libnss3", "libpcre3", "libpulse0", "libxss1", "libxtst6", "libappindicator1", "libsecret-1-0"]
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

  private get isElectron2(): boolean {
    return semver.gte(this.packager.config.electronVersion || "1.8.3", "2.0.0-beta.1")
  }

  private createDescriptor(arch: Arch): any {
    const appInfo = this.packager.appInfo
    const snapName = this.packager.executableName.toLowerCase()
    const options = this.options
    const linuxArchName = toAppImageOrSnapArch(arch)

    const plugs = normalizePlugConfiguration(options.plugs)
    const plugNames = this.replaceDefault(plugs == null ? null : Object.getOwnPropertyNames(plugs), defaultPlugs)
    const desktopPart = this.isElectron2 ? "desktop-gtk3" : "desktop-gtk2"

    const buildPackages = asArray(options.buildPackages)
    this.isUseTemplateApp = this.options.useTemplateApp !== false && arch === Arch.x64 && buildPackages.length === 0 && this.isElectron2

    const appDescriptor: any = {
      command: `command.sh`,
      plugs: plugNames,
    }
    const snap: any = {
      name: snapName,
      version: appInfo.version,
      summary: options.summary || appInfo.productName,
      description: this.helper.getDescription(options),
      confinement: options.confinement || "strict",
      grade: options.grade || "stable",
      architectures: [toLinuxArchString(arch)],
      apps: {
        [snapName]: appDescriptor
      },
      parts: {
        app: {
          plugin: "nil",
          "stage-packages": this.replaceDefault(options.stagePackages, defaultStagePackages),
          after: this.replaceDefault(options.after, [desktopPart]),
        }
      },
    }

    if (options.confinement !== "classic") {
      appDescriptor.environment = {
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
      }
    }

    if (!this.isUseTemplateApp) {
      appDescriptor.adapter = "none"
    }

    if (buildPackages.length > 0) {
      snap.parts.app["build-packages"] = buildPackages
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

    if (!this.isUseTemplateApp && snap.parts.app.after.includes(desktopPart)) {
      // call super build (snapcraftctl build) otherwise /bin/desktop not created
      const desktopPartOverride: any = {
        "override-build": `set -x
snapcraftctl build
export XDG_DATA_DIRS=$SNAPCRAFT_PART_INSTALL/usr/share
update-mime-database $SNAPCRAFT_PART_INSTALL/usr/share/mime

for dir in $SNAPCRAFT_PART_INSTALL/usr/share/icons/*/; do
  if [ -f $dir/index.theme ]; then
    if which gtk-update-icon-cache-3.0 &> /dev/null; then
      gtk-update-icon-cache-3.0 -q $dir
    elif which gtk-update-icon-cache &> /dev/null; then
      gtk-update-icon-cache -q $dir
    fi
  fi
done`
      }

      if (appDescriptor.plugs.includes("desktop") || appDescriptor.plugs.includes("desktop-legacy")) {
        desktopPartOverride.stage = ["-./usr/share/fonts/**"]
      }

      snap.parts[desktopPart] = desktopPartOverride
    }

    return snap
  }

  async build(appOutDir: string, arch: Arch): Promise<any> {
    const packager = this.packager
    const options = this.options
    // tslint:disable-next-line:no-invalid-template-strings
    const artifactName = packager.expandArtifactNamePattern(this.options, "snap", arch, "${name}_${version}_${arch}.${ext}", false)
    const artifactPath = path.join(this.outDir, artifactName)
    this.logBuilding("snap", artifactPath, arch)

    const snap: any = this.createDescriptor(arch)
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
      "--arch", toLinuxArchString(arch),
      "--output", artifactPath,
      "--executable", this.packager.executableName,
      "--docker-image", "electronuserland/builder:latest",
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

    const hooksDir = await packager.getResource(options.hooks, "snap-hooks")
    if (hooksDir != null) {
      args.push("--hooks", hooksDir)
    }

    if (this.isUseTemplateApp) {
      args.push("--template-url", "electron2")
    }
    await executeAppBuilder(args)
    packager.dispatchArtifactCreated(artifactPath, this, arch, packager.computeSafeArtifactName(artifactName, "snap", arch, false))
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
