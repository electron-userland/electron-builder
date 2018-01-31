import { isEnvTrue, Arch, exec, replaceDefault as _replaceDefault, serializeToYaml, spawn, toLinuxArchString } from "builder-util"
import { copyFile, copyDir, copyDirUsingHardLinks, USE_HARD_LINKS } from "builder-util/out/fs"
import { outputFile, writeFile } from "fs-extra-p"
import * as path from "path"
import { SnapOptions } from ".."
import { asArray } from "builder-util-runtime"
import { Target } from "../core"
import { LinuxPackager } from "../linuxPackager"
import { LinuxTargetHelper } from "./LinuxTargetHelper"
import { createStageDir, StageDir } from "./targetUtil"
import BluebirdPromise from "bluebird-lst"
import { getSnapTemplate } from "./tools"

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

// libxss1, libasound2, gconf2 - was "error while loading shared libraries: libXss.so.1" on Xubuntu 16.04
const defaultStagePackages = ["libasound2", "libgconf2-4", "libnotify4", "libnspr4", "libnss3", "libpcre3", "libpulse0", "libxss1", "libxtst6"]
const defaultPlugs = ["desktop", "desktop-legacy", "home", "x11", "unity7", "browser-support", "network", "gsettings", "pulseaudio", "opengl"]

export default class SnapTarget extends Target {
  readonly options: SnapOptions = {...this.packager.platformSpecificBuildOptions, ...(this.packager.config as any)[this.name]}

  private isUsePrepackedSnap = true

  constructor(name: string, private readonly packager: LinuxPackager, private readonly helper: LinuxTargetHelper, readonly outDir: string) {
    super(name)
  }

  private replaceDefault(inList: Array<string> | null | undefined, defaultList: Array<string>) {
    const result = _replaceDefault(inList, defaultList)
    if (result !== defaultList) {
      this.isUsePrepackedSnap = false
    }
    return result
  }

  async build(appOutDir: string, arch: Arch): Promise<any> {
    const packager = this.packager
    const appInfo = packager.appInfo
    const options = this.options
    const snapName = packager.executableName.toLowerCase()
    const buildPackages = asArray(options.buildPackages)
    const isUseDocker = process.platform !== "linux" || isEnvTrue(process.env.SNAP_USE_DOCKER)
    this.isUsePrepackedSnap = arch === Arch.x64 && buildPackages.length === 0

    const snap: any = {
      name: snapName,
      version: appInfo.version,
      summary: options.summary || appInfo.productName,
      description: this.helper.getDescription(options),
      confinement: options.confinement || "strict",
      grade: options.grade || "stable",
      apps: {
        [snapName]: {
          command: `desktop-launch $SNAP/${packager.executableName}`,
          environment: {
            TMPDIR: "$XDG_RUNTIME_DIR",
            ...options.environment,
          },
          plugs: this.replaceDefault(options.plugs, defaultPlugs),
        }
      },
      parts: {
        app: {
          plugin: "dump",
          "stage-packages": this.replaceDefault(options.stagePackages, defaultStagePackages),
          source: isUseDocker ? "/appOutDir" : appOutDir,
          after: this.replaceDefault(options.after, ["desktop-gtk2"]),
        }
      },
    }

    const wrapperFileName = `command-${packager.executableName}.wrapper`
    if (this.isUsePrepackedSnap) {
      delete snap.parts
      snap.apps[snapName].command = wrapperFileName
    }

    const snapFileName = `${snap.name}_${snap.version}_${toLinuxArchString(arch)}.snap`
    const artifactPath = path.join(this.outDir, snapFileName)
    this.logBuilding("snap", artifactPath, arch)

    if (options.assumes != null) {
      snap.assumes = asArray(options.assumes)
    }

    const stageDir = await createStageDir(this, packager, arch)
    // snapcraft.yaml inside a snap directory
    const snapDir = path.join(stageDir.dir, "snap")
    const snapMetaDir = this.isUsePrepackedSnap ? path.join(stageDir.dir, "meta") : snapDir

    await this.helper.icons
    if (this.helper.maxIconPath != null) {
      if (!this.isUsePrepackedSnap) {
        snap.icon = "snap/gui/icon.png"
      }
      await copyFile(this.helper.maxIconPath, path.join(snapMetaDir, "gui", "icon.png"))
    }

    const hooksDir = await packager.getResource(options.hooks, "snap-hooks")
    if (hooksDir != null) {
      await copyDir(hooksDir, path.join(snapMetaDir, "hooks"), {
        isUseHardLink: USE_HARD_LINKS,
      })
    }

    const desktopFile = path.join(snapMetaDir, "gui", `${snap.name}.desktop`)
    await this.helper.writeDesktopEntry(this.options, packager.executableName, desktopFile, {
      // tslint:disable:no-invalid-template-strings
      Icon: "${SNAP}/meta/gui/icon.png"
    })

    if (packager.packagerOptions.effectiveOptionComputed != null && await packager.packagerOptions.effectiveOptionComputed({snap, desktopFile})) {
      return
    }

    const snapcraftFile = path.join(snapMetaDir, this.isUsePrepackedSnap ? "snap.yaml" : "snapcraft.yaml")
    await outputFile(snapcraftFile, serializeToYaml(snap))
    if (this.isUsePrepackedSnap) {
      // noinspection SpellCheckingInspection
      await writeFile(path.join(stageDir.dir, wrapperFileName), `#!/bin/sh
export PATH="$SNAP/usr/sbin:$SNAP/usr/bin:$SNAP/sbin:$SNAP/bin:$PATH"
export LD_LIBRARY_PATH="$LD_LIBRARY_PATH:$SNAP/lib:$SNAP/usr/lib:$SNAP/lib/x86_64-linux-gnu:$SNAP/usr/lib/x86_64-linux-gnu"
export LD_LIBRARY_PATH="$SNAP/usr/lib/x86_64-linux-gnu/mesa-egl:$LD_LIBRARY_PATH"
export LD_LIBRARY_PATH="$SNAP/usr/lib/x86_64-linux-gnu:$SNAP/usr/lib/x86_64-linux-gnu/pulseaudio:$LD_LIBRARY_PATH"
export LD_LIBRARY_PATH=$SNAP_LIBRARY_PATH:$LD_LIBRARY_PATH
exec "desktop-launch" "$SNAP/${packager.executableName}" "$@"
`, {mode: "0755"})

      await copyDir(await getSnapTemplate(), stageDir.dir, {
        isUseHardLink: USE_HARD_LINKS,
      })
      await copyDirUsingHardLinks(appOutDir, stageDir.dir)
    }

    if (isUseDocker) {
      if (this.isUsePrepackedSnap) {
        await this.buildUsingDockerAndPrepackedSnap(snapFileName, stageDir)
      }
      else {
        await this.buildUsingDocker(options, arch, snapFileName, stageDir, appOutDir)
      }
    }
    else {
      await this.buildWithoutDocker(buildPackages, stageDir.dir, arch, artifactPath)
    }

    await stageDir.cleanup()
    packager.dispatchArtifactCreated(artifactPath, this, arch)
  }

  private async buildWithoutDocker(buildPackages: Array<string>, stageDir: string, arch: Arch, artifactPath: string) {
    if (buildPackages.length > 0) {
      const notInstalledPackages = await BluebirdPromise.filter(buildPackages, (it): Promise<boolean> => {
        return exec("dpkg", ["-s", it])
          .then(result => result.includes("is not installed"))
      })
      if (notInstalledPackages.length > 0) {
        await spawn("apt-get", ["-qq", "update"])
        await spawn("apt-get", ["-qq", "install", "--no-install-recommends"].concat(notInstalledPackages))
      }
    }
    const spawnOptions = {
      cwd: stageDir,
      stdio: ["ignore", "inherit", "inherit"],
    }

    let primeDir: string
    if (this.isUsePrepackedSnap) {
      primeDir = stageDir
    }
    else {
      await spawn("snapcraft", ["prime", "--target-arch", toLinuxArchString(arch)], spawnOptions)
      primeDir = stageDir + path.sep + "prime"
      await exec("/bin/bash", ["-c", `rm -rf ${unnecessaryFiles.join(" ")}`], {
        cwd: primeDir,
      })
    }
    await spawn("snapcraft", ["pack", primeDir, "--output", artifactPath], spawnOptions)
  }

  private async buildUsingDockerAndPrepackedSnap(snapFileName: string, stageDir: StageDir) {
    await spawn("docker", ["run", "--rm",
      // dist dir can be outside of project dir
      "-v", `${this.outDir}:/out`,
      "-v", `${stageDir.dir}:/stage:ro`,
      "electronuserland/builder:latest",
      "/bin/bash", "-c", `snapcraft pack /stage --output /out/${snapFileName}`,
    ], {
      cwd: this.packager.info.projectDir,
      stdio: ["ignore", "inherit", "inherit"],
    })
  }

  private async buildUsingDocker(options: SnapOptions, arch: Arch, snapFileName: string, stageDir: StageDir, appOutDir: string) {
    const commands: Array<string> = []
    if (options.buildPackages != null && options.buildPackages.length > 0) {
      commands.push(`apt-get install --no-install-recommends -y ${options.buildPackages.join(" ")}`)
    }

    // copy stage to linux fs to avoid performance issues (https://docs.docker.com/docker-for-mac/osxfs-caching/)
    commands.push("cp -R /stage /s/")
    commands.push("cd /s")
    commands.push(`snapcraft prime --target-arch ${toLinuxArchString(arch)}`)
    commands.push(`rm -rf ${unnecessaryFiles.map(it => `prime/${it}`).join(" ")}`)
    commands.push(`snapcraft pack /s/prime --output /out/${snapFileName}`)

    await spawn("docker", ["run", "--rm",
      "-v", `${this.packager.info.projectDir}:/project:delegated`,
      // dist dir can be outside of project dir
      "-v", `${this.outDir}:/out`,
      "-v", `${stageDir.dir}:/stage:ro`,
      "-v", `${appOutDir}:/appOutDir:ro`,
      "electronuserland/builder:latest",
      "/bin/bash", "-c", commands.join(" && "),
    ], {
      cwd: this.packager.info.projectDir,
      stdio: ["ignore", "inherit", "inherit"],
    })
  }
}