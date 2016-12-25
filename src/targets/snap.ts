import { toDebArch } from "../platformPackager"
import { Arch } from "../metadata"
import { LinuxTargetHelper } from "./LinuxTargetHelper"
import { LinuxPackager } from "../linuxPackager"
import { log } from "../util/log"
import { SnapOptions } from "../options/linuxOptions"
import { emptyDir, writeFile, rename, copy } from "fs-extra-p"
import * as path from "path"
import { safeDump } from "js-yaml"
import { spawn } from "../util/util"
import { homedir } from "os"
import { Target } from "./targetFactory"
import BluebirdPromise from "bluebird-lst-c"

export default class SnapTarget extends Target {
  private readonly options: SnapOptions = Object.assign({}, this.packager.platformSpecificBuildOptions, (<any>this.packager.config)[this.name])

  constructor(name: string, private packager: LinuxPackager, private helper: LinuxTargetHelper, private outDir: string) {
    super(name)
  }

  async build(appOutDir: string, arch: Arch): Promise<any> {
    log(`Building Snap for arch ${Arch[arch]}`)

    const packager = this.packager
    const appInfo = packager.appInfo
    const options = this.options

    const snapDir = `${appOutDir}-snap`
    await emptyDir(snapDir)

    const extraSnapSourceDir = path.join(snapDir, ".extra")
    const isUseUbuntuPlatform = options.ubuntuAppPlatformContent != null
    if (isUseUbuntuPlatform) {
      // ubuntu-app-platform requires empty directory
      await BluebirdPromise.all([this.helper.icons, emptyDir(path.join(extraSnapSourceDir, "ubuntu-app-platform"))])
    }

    const snap: any = {}
    snap.name = packager.executableName
    snap.version = appInfo.version
    snap.summary = options.summary || appInfo.productName
    snap.description = this.helper.getDescription(options)
    snap.confinement = options.confinement || "strict"
    snap.grade = options.grade || "stable"

    await this.helper.icons
    if (this.helper.maxIconPath != null) {
      snap.icon = "setup/gui/icon.png"
      await copy(this.helper.maxIconPath, path.join(snapDir, "setup", "gui", "icon.png"))
    }

    await this.helper.computeDesktopEntry(this.options, `${snap.name}`, path.join(snapDir, "setup", "gui", `${snap.name}.desktop`), {
      "Icon": "${SNAP}/meta/gui/icon.png"
    })

    if (options.assumes != null) {
      if (!Array.isArray(options.assumes)) {
        throw new Error("snap.assumes must be an array of strings")
      }
      snap.assumes = options.assumes
    }

    snap.apps = {
      [snap.name]: {
        command: `desktop-launch $SNAP/${packager.executableName}`,
        plugs: [
          "home", "x11", "unity7", "unity8", "browser-support", "network", "gsettings", "pulseaudio", "opengl", "platform",
        ]
      }
    }

    if (isUseUbuntuPlatform) {
      snap.plugs = {
        platform: {
          interface: "content",
          content: "ubuntu-app-platform1",
          target: "ubuntu-app-platform",
          "default-provider": "ubuntu-app-platform",
        }
      }
    }

    const isUseDocker = process.platform !== "linux"
    snap.parts = {
      app: {
        plugin: "dump",
        "stage-packages": options.stagePackages || (isUseUbuntuPlatform ? ["libnss3"] : ["libnotify4", "libappindicator1", "libxtst6", "libnss3", "fontconfig-config"]),
        source: isUseDocker ? `/out/${path.basename(snapDir)}` : appOutDir,
        after: isUseUbuntuPlatform ? ["extra", "desktop-ubuntu-app-platform"] : ["desktop-glib-only"]
      }
    }

    if (isUseUbuntuPlatform) {
      snap.parts.extra = {
        plugin: "dump",
        source: extraSnapSourceDir
      }
    }

    const snapcraft = path.join(snapDir, "snapcraft.yaml")
    await writeFile(snapcraft, safeDump(snap, {lineWidth: 160}))

    // const args = ["snapcraft", path.relative(snapDir)]
    // snap /out/${path.basename(snapDir)} --output /out/${path.basename(resultFile)}
    if (isUseDocker) {
      await spawn("docker", ["run", "--rm",
        "-v", `${packager.info.projectDir}:/project`,
        "-v", `${homedir()}/.electron:/root/.electron`,
        // dist dir can be outside of project dir
        "-v", `${this.outDir}:/out`,
        "-w", `/out/${path.basename(snapDir)}`,
        "electronuserland/electron-builder:latest",
        "/bin/bash", "-c", `env && snapcraft snap`], {
        cwd: packager.info.projectDir,
      })
    }
    else {
      await spawn("snapcraft", ["snap"], {
        cwd: snapDir,
        stdio: ["ignore", "inherit", "pipe"]
      })
    }

    const snapName = `${snap.name}_${snap.version}_${toDebArch(arch)}.snap`
    const resultFile = path.join(this.outDir, snapName)
    await rename(path.join(snapDir, snapName), resultFile)
    packager.dispatchArtifactCreated(resultFile)
  }
}