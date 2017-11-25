import { Arch, debug, exec, log, replaceDefault, spawn, toLinuxArchString, serializeToYaml } from "builder-util"
import { copyFile } from "builder-util/out/fs"
import { outputFile } from "fs-extra-p"
import * as path from "path"
import { Target } from "../core"
import { LinuxPackager } from "../linuxPackager"
import { SnapOptions } from "../options/SnapOptions"
import { LinuxTargetHelper } from "./LinuxTargetHelper"
import { RemoteBuilder } from "../remoteBuilder/RemoteBuilder"
import { createStageDir } from "./targetUtil"

export default class SnapTarget extends Target {
  readonly options: SnapOptions = {...this.packager.platformSpecificBuildOptions, ...(this.packager.config as any)[this.name]}

  constructor(name: string, private readonly packager: LinuxPackager, private readonly helper: LinuxTargetHelper, readonly outDir: string) {
    super(name)
  }

  async build(appOutDir: string, arch: Arch): Promise<any> {
    log(`Building Snap for arch ${Arch[arch]}`)

    if (process.platform === "win32" || process.env._REMOTE_BUILD) {
      const remoteBuilder = new RemoteBuilder()
      return await remoteBuilder.build(["snap"], appOutDir, this.packager, this.outDir)
    }

    const packager = this.packager
    const appInfo = packager.appInfo
    const options = this.options

    const stageDir = await createStageDir(this, packager, arch)
    // snapcraft.yaml inside a snap directory
    const snapDir = path.join(stageDir.dir, "snap")

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
    const defaultStagePackages = ["libnotify4", "libappindicator1", "libxtst6", "libnss3", "libxss1", "fontconfig-config", "gconf2", "libasound2", "pulseaudio"]
    const defaultAfter = ["desktop-glib-only"]
    const after = replaceDefault(options.after, defaultAfter)
    snap.parts = {
      app: {
        plugin: "dump",
        "stage-packages": replaceDefault(options.stagePackages, defaultStagePackages),
        source: isUseDocker ? `/out/${path.basename(appOutDir)}` : appOutDir,
        after
      }
    }

    const stagePackages = replaceDefault(options.stagePackages, defaultStagePackages)
    if (stagePackages.length > 0) {
      snap.parts.app["stage-packages"] = stagePackages
    }

    if (packager.packagerOptions.effectiveOptionComputed != null && await packager.packagerOptions.effectiveOptionComputed({snap, desktopFile})) {
      return
    }

    const snapcraftFile = path.join(snapDir, "snapcraft.yaml")
    await outputFile(snapcraftFile, serializeToYaml(snap))

    const snapFileName = `${snap.name}_${snap.version}_${toLinuxArchString(arch)}.snap`
    const resultFile = path.join(this.outDir, snapFileName)

    // usr/share/fonts is required, cannot run otherwise
    const unnecessaryFiles = [
      "usr/share/doc",
      "usr/share/man",
      "usr/share/icons",
      "usr/share/bash-completion",
      "usr/share/lintian",
      "usr/share/dh-python",
      "usr/share/python3",

      "usr/lib/python*",
      "usr/bin/python*",
    ]

    if (isUseDocker) {
      const commands: Array<string> = []
      if (options.buildPackages != null && options.buildPackages.length > 0) {
        commands.push(`apt-get update && apt-get install -y ${options.buildPackages.join(" ")}`)
      }

      // https://bugs.launchpad.net/snapcraft/+bug/1692752
      commands.push(`cp -R /out/${path.basename(stageDir.dir)} /s/`)
      commands.push("cd /s")
      commands.push("apt-get -qq update")
      commands.push(`snapcraft prime --target-arch ${toLinuxArchString(arch)}`)
      commands.push(`rm -rf ${unnecessaryFiles.map(it => `prime/${it}`).join(" ")}`)
      commands.push(`snapcraft snap --target-arch ${toLinuxArchString(arch)} -o /out/${snapFileName}`)

      await spawn("docker", ["run", "--rm",
        "-v", `${packager.info.projectDir}:/project`,
        // dist dir can be outside of project dir
        "-v", `${this.outDir}:/out`,
        "electronuserland/builder:latest",
        "/bin/bash", "-c", commands.join(" && ")], {
        cwd: packager.info.projectDir,
        stdio: ["ignore", "inherit", "inherit"],
      })
    }
    else {
      if (options.buildPackages != null && options.buildPackages.length > 0) {
        await spawn("apt-get", ["-qq", "update"])
        await spawn("apt-get", ["-qq", "install", "--no-install-recommends"].concat(options.buildPackages))
      }
      const spawnOptions = {
        cwd: stageDir.dir,
        stdio: ["ignore", "inherit", "inherit"],
      }
      await spawn("snapcraft", ["prime", "--target-arch", toLinuxArchString(arch)], spawnOptions)
      await exec("sh", ["-c", `rm -rf ${unnecessaryFiles.join(" ")}`], {
        cwd: stageDir + path.sep + "prime",
      })
      await spawn("snapcraft", ["snap", "--target-arch", toLinuxArchString(arch), "-o", resultFile], spawnOptions)
    }

    await stageDir.cleanup()
    packager.dispatchArtifactCreated(resultFile, this, arch)
  }
}
