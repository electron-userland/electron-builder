import { Arch, debug, exec, log, replaceDefault, spawn, toLinuxArchString, serializeToYaml } from "builder-util"
import { copyFile } from "builder-util/out/fs"
import { emptyDir, outputFile } from "fs-extra-p"
import { homedir } from "os"
import * as path from "path"
import { Target } from "../core"
import { LinuxPackager } from "../linuxPackager"
import { SnapOptions } from "../options/SnapOptions"
import { LinuxTargetHelper } from "./LinuxTargetHelper"

export default class SnapTarget extends Target {
  readonly options: SnapOptions = {...this.packager.platformSpecificBuildOptions, ...(this.packager.config as any)[this.name]}

  constructor(name: string, private readonly packager: LinuxPackager, private readonly helper: LinuxTargetHelper, readonly outDir: string) {
    super(name)
  }

  async build(appOutDir: string, arch: Arch): Promise<any> {
    log(`Building Snap for arch ${Arch[arch]}`)

    const packager = this.packager
    const appInfo = packager.appInfo
    const options = this.options

    const stageDir = `${appOutDir}-snap`
    const snapDir = path.join(stageDir, "snap")
    await emptyDir(stageDir)

    const extraSnapSourceDir = path.join(stageDir, "extra")
    const isUseUbuntuPlatform = options.ubuntuAppPlatformContent != null
    if (isUseUbuntuPlatform) {
      // ubuntu-app-platform requires empty directory
      await emptyDir(path.join(extraSnapSourceDir, "ubuntu-app-platform"))
    }

    const snap: any = {}
    snap.name = packager.executableName.toLowerCase()
    snap.version = appInfo.version
    snap.summary = options.summary || appInfo.productName
    snap.description = this.helper.getDescription(options)
    snap.confinement = options.confinement || "strict"
    snap.grade = options.grade || "stable"

    await this.helper.icons
    if (this.helper.maxIconPath != null) {
      snap.icon = "snap/gui/icon.png"
      await copyFile(this.helper.maxIconPath, path.join(snapDir, "gui", "icon.png"))
    }

    const desktopFile = await this.helper.writeDesktopEntry(this.options, packager.executableName, path.join(snapDir, "gui", `${snap.name}.desktop`), {
      // tslint:disable:no-invalid-template-strings
      Icon: "${SNAP}/meta/gui/icon.png"
    })

    if (options.assumes != null) {
      if (!Array.isArray(options.assumes)) {
        throw new Error("snap.assumes must be an array of strings")
      }
      snap.assumes = options.assumes
    }

    snap.apps = {
      [snap.name]: {
        command: `env TMPDIR=$XDG_RUNTIME_DIR desktop-launch $SNAP/${packager.executableName}`,
        plugs: replaceDefault(options.plugs, ["home", "x11", "unity7", "browser-support", "network", "gsettings", "pulseaudio", "opengl"])
      }
    }

    if (isUseUbuntuPlatform) {
      snap.apps[snap.name].plugs.push("platform")
      snap.plugs = {
        platform: {
          interface: "content",
          content: "ubuntu-app-platform1",
          target: "ubuntu-app-platform",
          "default-provider": "ubuntu-app-platform",
        }
      }
    }

    let isUseDocker = process.platform !== "linux"
    if (process.platform === "darwin" && process.env.USE_SYSTEM_SNAPCAFT) {
      try {
        // http://click.pocoo.org/5/python3/
        const env: any = {...process.env}
        delete env.VERSIONER_PYTHON_VERSION
        delete env.VERSIONER_PYTHON_PREFER_32_BIT
        await exec("snapcraft", ["--version"], {
          // execution because Python 3 was configured to use ASCII as encoding for the environment
          env,
        })
        isUseDocker = false
      }
      catch (e) {
        debug(`snapcraft not installed: ${e}`)
      }
    }

    // libxss1, libasound2, gconf2 - was "error while loading shared libraries: libXss.so.1" on Xubuntu 16.04
    const defaultStagePackages = (isUseUbuntuPlatform ? ["libnss3"] : ["libnotify4", "libappindicator1", "libxtst6", "libnss3", "libxss1", "fontconfig-config", "gconf2", "libasound2", "pulseaudio"])
    const defaultAfter = isUseUbuntuPlatform ? ["extra", "desktop-ubuntu-app-platform"] : ["desktop-glib-only"]
    const after = replaceDefault(options.after, defaultAfter)
    snap.parts = {
      app: {
        plugin: "dump",
        "stage-packages": replaceDefault(options.stagePackages, defaultStagePackages),
        source: isUseDocker ? `/out/${path.basename(appOutDir)}` : appOutDir,
        after
      }
    }

    if (isUseUbuntuPlatform) {
      snap.parts.extra = {
        plugin: "dump",
        source: isUseDocker ? `/out/${path.basename(stageDir)}/${path.basename(extraSnapSourceDir)}` : extraSnapSourceDir
      }
    }

    if (packager.packagerOptions.effectiveOptionComputed != null && await packager.packagerOptions.effectiveOptionComputed({snap, desktopFile})) {
      return
    }

    const snapcraft = path.join(snapDir, "snapcraft.yaml")
    await outputFile(snapcraft, serializeToYaml(snap))

    const snapFileName = `${snap.name}_${snap.version}_${toLinuxArchString(arch)}.snap`
    const resultFile = path.join(this.outDir, snapFileName)

    if (isUseDocker) {
      const commands: Array<string> = []
      if (options.buildPackages && options.buildPackages.length > 0) {
        commands.push(`apt-get update && apt-get install -y ${options.buildPackages.join(" ")}`)
      }

      // https://bugs.launchpad.net/snapcraft/+bug/1692752
      // commands.push("snapcraft --version")
      commands.push(`cp -R /out/${path.basename(stageDir)} /s/`)
      commands.push("cd /s")
      commands.push(`snapcraft snap --target-arch ${toLinuxArchString(arch)} -o /out/${snapFileName}`)

      await spawn("docker", ["run", "--rm",
        "-v", `${packager.info.projectDir}:/project`,
        "-v", `${homedir()}/.electron:/root/.electron`,
        // dist dir can be outside of project dir
        "-v", `${this.outDir}:/out`,
        "electronuserland/builder:latest",
        "/bin/bash", "-c", commands.join(" && ")], {
        cwd: packager.info.projectDir,
        stdio: ["ignore", "inherit", "inherit"],
      })
    }
    else {
      if (options.buildPackages && options.buildPackages.length > 0) {
        await spawn("apt-get", ["update"])
        await spawn("apt-get", ["install", "-y"].concat(options.buildPackages))
      }
      await spawn("snapcraft", ["snap", "--target-arch", toLinuxArchString(arch), "-o", resultFile], {
        cwd: stageDir,
        stdio: ["ignore", "inherit", "pipe"],
      })
    }
    packager.dispatchArtifactCreated(resultFile, this, arch)
  }
}
