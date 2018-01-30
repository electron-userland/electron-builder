import { Arch, exec, InvalidConfigurationError, replaceDefault, serializeToYaml, spawn, toLinuxArchString } from "builder-util"
import { copyFile } from "builder-util/out/fs"
import { outputFile } from "fs-extra-p"
import * as path from "path"
import { SnapOptions } from ".."
import { Target } from "../core"
import { LinuxPackager } from "../linuxPackager"
import { LinuxTargetHelper } from "./LinuxTargetHelper"
import { createStageDir, StageDir } from "./targetUtil"

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

export default class SnapTarget extends Target {
  readonly options: SnapOptions = {...this.packager.platformSpecificBuildOptions, ...(this.packager.config as any)[this.name]}

  constructor(name: string, private readonly packager: LinuxPackager, private readonly helper: LinuxTargetHelper, readonly outDir: string) {
    super(name)
  }

  async build(appOutDir: string, arch: Arch): Promise<any> {
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

    const snapFileName = `${snap.name}_${snap.version}_${toLinuxArchString(arch)}.snap`
    const artifactPath = path.join(this.outDir, snapFileName)
    this.logBuilding("snap", artifactPath, arch)

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
        throw new InvalidConfigurationError("snap.assumes must be an array of strings")
      }
      snap.assumes = options.assumes
    }

    snap.apps = {
      [snap.name]: {
        command: `desktop-launch $SNAP/${packager.executableName}`,
        environment: {
          TMPDIR: "$XDG_RUNTIME_DIR",
          ...options.environment,
        },
        plugs: replaceDefault(options.plugs, ["desktop", "desktop-legacy", "home", "x11", "unity7", "browser-support", "network", "gsettings", "pulseaudio", "opengl"]),
      }
    }

    const isUseDocker = process.platform !== "linux"
    // libxss1, libasound2, gconf2 - was "error while loading shared libraries: libXss.so.1" on Xubuntu 16.04
    const defaultStagePackages = ["libasound2", "libgconf2-4", "libnotify4", "libnspr4", "libnss3", "libpcre3", "libpulse0", "libxss1", "libxtst6"]
    const defaultAfter = ["desktop-gtk2"]
    const after = replaceDefault(options.after, defaultAfter)
    snap.parts = {
      app: {
        plugin: "dump",
        "stage-packages": replaceDefault(options.stagePackages, defaultStagePackages),
        source: isUseDocker ? "/appOutDir" : appOutDir,
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

    if (isUseDocker) {
      await this.buildUsingDocker(options, arch, snapFileName, stageDir, appOutDir)
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
      await exec("/bin/bash", ["-c", `rm -rf ${unnecessaryFiles.join(" ")}`], {
        cwd: stageDir.dir + path.sep + "prime",
      })
      await spawn("snapcraft", ["snap", "--target-arch", toLinuxArchString(arch), "-o", artifactPath], spawnOptions)
    }

    await stageDir.cleanup()
    packager.dispatchArtifactCreated(artifactPath, this, arch)
  }

  private async buildUsingDocker(options: SnapOptions, arch: Arch, snapFileName: string, stageDir: StageDir, appOutDir: string) {
    const commands: Array<string> = []
    if (options.buildPackages != null && options.buildPackages.length > 0) {
      commands.push(`apt-get update && apt-get install -y ${options.buildPackages.join(" ")}`)
    }

    // copy stage to linux fs to avoid performance issues (https://docs.docker.com/docker-for-mac/osxfs-caching/)
    commands.push(`cp -R /stage /s/`)
    commands.push("cd /s")
    commands.push("apt-get -qq update")
    commands.push(`snapcraft prime --target-arch ${toLinuxArchString(arch)}`)
    commands.push(`rm -rf ${unnecessaryFiles.map(it => `prime/${it}`).join(" ")}`)
    commands.push(`snapcraft snap --target-arch ${toLinuxArchString(arch)} -o /out/${snapFileName}`)

    const packager = this.packager
    await spawn("docker", ["run", "--rm",
      "-v", `${packager.info.projectDir}:/project:delegated`,
      // dist dir can be outside of project dir
      "-v", `${this.outDir}:/out`,
      "-v", `${stageDir.dir}:/stage:ro`,
      "-v", `${appOutDir}:/appOutDir:ro`,
      "electronuserland/builder:latest",
      "/bin/bash", "-c", commands.join(" && "),
    ], {
      cwd: packager.info.projectDir,
      stdio: ["ignore", "inherit", "inherit"],
    })
  }
}
