import { Target } from "../platformPackager"
import { Arch } from "../metadata"
import { LinuxTargetHelper } from "./LinuxTargetHelper"
import { LinuxPackager } from "../linuxPackager"
import { log } from "../util/log"
import { SnapOptions } from "../options/linuxOptions"
import { emptyDir, writeFile } from "fs-extra-p"
import * as path from "path"
import { safeDump } from "js-yaml"
import { spawn, unlinkIfExists } from "../util/util"
import { homedir } from "os"

export default class SnapTarget extends Target {
  private readonly options: SnapOptions = Object.assign({}, this.packager.platformSpecificBuildOptions, (<any>this.packager.devMetadata.build)[this.name])
  private readonly desktopEntry: Promise<string>

  constructor(private packager: LinuxPackager, private helper: LinuxTargetHelper, private outDir: string) {
    super("snap")

    // we add X-AppImage-BuildId to ensure that new desktop file will be installed
    this.desktopEntry = helper.computeDesktopEntry(this.options, "AppRun")
  }

  async build(appOutDir: string, arch: Arch): Promise<any> {
    log(`Building Snap for arch ${Arch[arch]}`)

    const packager = this.packager
    const appInfo = packager.appInfo
    const options = this.options

    const resultFile = path.join(this.outDir, packager.generateName("snap", arch, true))
    await unlinkIfExists(resultFile)

    const snap: any = {}
    snap.name = packager.executableName
    snap.version = appInfo.version
    snap.summary = options.summary || appInfo.productName
    snap.description = this.helper.getDescription(options)
    snap.confinement = options.confinement || "strict"
    snap.grade = options.grade || "stable"

    if (options.assumes != null) {
      if (!Array.isArray(options.assumes)) {
        throw new Error("snap.assumes must be an array of strings")
      }
      snap.assumes = options.assumes
    }

    const snapDir = `${appOutDir}-snap`

    snap.apps = {
      [snap.name]: {
        command: `desktop-launch $SNAP/${packager.executableName}`,
        plugs: [
          "home", "unity7", "x11", "browser-support", "network", "gsettings", "pulseaudio", "opengl",
        ]
      }
    }

    const isUseDocker = process.platform !== "linux"
    snap.parts = {
      app: {
        plugin: "dump",
        "stage-packages": ["libappindicator1", "libdbusmenu-glib4", "libnotify4", "libunity9", "libgconf-2-4", "libnss3", "libxss1", "fontconfig-config", "libnotify-bin"],
        source: isUseDocker ? `/out/${path.basename(snapDir)}` : appOutDir,
        filesets: {
          app: [`${appOutDir}/*`]
        },
        after: ["desktop-glib-only"]
      }
    }

    const snapcraft = path.join(snapDir, "snapcraft.yaml")
    await emptyDir(snapDir)
    await writeFile(snapcraft, safeDump(snap))

//     await writeFile(path.join(snapDir, "wrapper"), `
// #!/bin/bash
// unset XDG_CONFIG_DIRS
// exec $SNAP/${packager.executableName}
// `)

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
      })
    }

    packager.dispatchArtifactCreated(resultFile, packager.generateName("snap", arch, true))
  }
}