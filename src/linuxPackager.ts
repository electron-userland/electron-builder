import * as path from "path"
import { Promise as BluebirdPromise } from "bluebird"
import { tsAwaiter } from "./awaiter"
import { init } from "../lib/linux"
import { PlatformPackager, BuildInfo } from "./platformPackager"

const __awaiter = tsAwaiter
Array.isArray(__awaiter)

const buildDeb = BluebirdPromise.promisify(init().build)

export default class LinuxPackager extends PlatformPackager<DebOptions> {
  constructor(info: BuildInfo) {
    super(info)
  }

  getBuildConfigurationKey() {
    return "linux"
  }

  packageInDistributableFormat(outDir: string, customConfiguration: DebOptions, arch: string): Promise<any> {
    const specification: DebOptions = {
      version: this.metadata.version,
      title: this.metadata.name,
      comment: this.metadata.description,
      maintainer: this.metadata.author,
      arch: arch === "ia32" ? 32 : 64,
      target: "deb",
      executable: this.metadata.name,
    }

    if (customConfiguration != null) {
      Object.assign(specification, customConfiguration)
    }
    return buildDeb({
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
}