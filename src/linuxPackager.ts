import * as path from "path"
import { Promise as BluebirdPromise } from "bluebird"
import { tsAwaiter } from "./awaiter"
import { init } from "../lib/linux"
import { PlatformPackager, BuildInfo } from "./platformPackager"
import { dir as _tpmDir, Options as TmpOptions } from "tmp"
import { exec, log } from "./util"
import { State as Gm } from "gm"

const __awaiter = tsAwaiter
Array.isArray(__awaiter)

const buildDeb = BluebirdPromise.promisify(init().build)
const tmpDir = BluebirdPromise.promisify(<(config: TmpOptions, callback: (error: Error, path: string, cleanupCallback: () => void) => void) => void>_tpmDir)

export default class LinuxPackager extends PlatformPackager<DebOptions> {
  desktopIcons: Promise<Array<string>>

  constructor(info: BuildInfo) {
    super(info)

    if (this.options.dist && (this.customDistOptions == null || this.customDistOptions.desktopTemplate == null)) {
      this.desktopIcons = this.computeDesktopIconPath()
    }
    else {
      this.desktopIcons = BluebirdPromise.resolve(null)
    }
  }

  private async computeDesktopIconPath(): Promise<Array<string>> {
    const tempDir = await tmpDir({
      unsafeCleanup: true,
      prefix: "png-icons"
    })

    const outputs = await exec("icns2png", ["-x", "-o", tempDir, path.join(this.projectDir, "build", "icon.icns")])
    if (!outputs[0].toString().includes("ih32")) {
      log("48x48 is not found in the icns, 128x128 will be resized")
      // icns doesn't contain required 48x48, use gm to resize
      await new BluebirdPromise((resolve, reject) => {
        (<Gm>require("gm")(path.join(tempDir, "icon_128x128x32.png")))
          .resize(48, 48)
          .write(path.join(tempDir, "icon_48x48x32.png"), error => error == null ? resolve() : reject(error))
      })
    }

    const appName = this.metadata.name
    function createMapping(size: string) {
      return `${tempDir}/icon_${size}x${size}x32.png=/usr/share/icons/hicolor/${size}x${size}/apps/${appName}.png`
    }

    return [
      createMapping("16"),
      createMapping("32"),
      createMapping("48"),
      createMapping("128"),
      createMapping("256"),
      createMapping("512"),
    ]
  }

  getBuildConfigurationKey() {
    return "linux"
  }

  async packageInDistributableFormat(outDir: string, arch: string): Promise<any> {
    const specification: DebOptions = {
      version: this.metadata.version,
      title: this.metadata.name,
      comment: this.metadata.description,
      maintainer: this.metadata.author,
      arch: arch === "ia32" ? 32 : 64,
      target: "deb",
      executable: this.metadata.name,
      desktop: `[Desktop Entry]
      Name=${this.metadata.name}
      Comment=${this.metadata.description}
      Exec=${this.metadata.name}
      Terminal=false
      Type=Application
      Icon=${this.metadata.name}
      `,
      dirs: await this.desktopIcons
    }

    if (this.customDistOptions != null) {
      Object.assign(specification, this.customDistOptions)
    }
    return await buildDeb({
      log: function emptyLog() {/* ignore out */},
      appPath: outDir,
      out: path.dirname(outDir),
      config: {
        linux: specification
      }
    })
      .then(it => this.dispatchArtifactCreated(it))
  }
}

interface DebOptions {
  title: string
  comment: string

  version: string

  arch: number
  maintainer: string
  executable: string
  target: string

  desktopTemplate?: string
  desktop?: string

  dirs?: Array<string>
}