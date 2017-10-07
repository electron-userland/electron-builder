import { path7za } from "7zip-bin"
import BluebirdPromise from "bluebird-lst"
import { debug7zArgs, log, spawn, exec, isEnvTrue} from "builder-util"
import { copyDir, DO_NOT_USE_HARD_LINKS, statOrNull } from "builder-util/out/fs"
import { chmod, emptyDir } from "fs-extra-p"
import * as path from "path"
import { Configuration, ElectronDownloadOptions } from "../configuration"
import { PlatformPackager } from "../platformPackager"

const downloadElectron: (options: any) => Promise<any> = BluebirdPromise.promisify(require("electron-download-tf"))

interface InternalElectronDownloadOptions extends ElectronDownloadOptions {
  version: string
  platform: string
  arch: string
}

function createDownloadOpts(opts: Configuration, platform: string, arch: string, electronVersion: string): InternalElectronDownloadOptions {
  return {
    platform,
    arch,
    version: electronVersion, ...opts.electronDownload
  }
}

/** @internal */
export function unpackElectron(packager: PlatformPackager<any>, out: string, platform: string, arch: string, version: string) {
  return unpack(packager, out, platform, createDownloadOpts(packager.config, platform, arch, version))
}

/** @internal */
export function unpackMuon(packager: PlatformPackager<any>, out: string, platform: string, arch: string, version: string) {
  return unpack(packager, out, platform, {
    mirror: "https://github.com/brave/muon/releases/download/v",
    customFilename: `brave-v${version}-${platform}-${arch}.zip`,
    verifyChecksum: false, ...createDownloadOpts(packager.config, platform, arch, version)
  })
}

async function unpack(packager: PlatformPackager<any>, out: string, platform: string, options: InternalElectronDownloadOptions) {
  let dist: string | null | undefined = packager.config.electronDist
  if (dist != null) {
    const zipFile = `electron-v${options.version}-${platform}-${options.arch}.zip`
    const resolvedDist = path.resolve(packager.projectDir, dist)
    if ((await statOrNull(path.join(resolvedDist, zipFile))) != null) {
      options.cache = resolvedDist
      dist = null
    }
  }

  if (dist == null) {
    const zipPath = (await BluebirdPromise.all<any>([
      downloadElectron(options),
      emptyDir(out)
    ]))[0]

    if (process.platform === "darwin" || isEnvTrue(process.env.USE_UNZIP)) {
      // on mac unzip faster than 7za (1.1 sec vs 1.6 see)
      await exec("unzip", ["-oqq", "-d", out, zipPath])
    }
    else {
      await spawn(path7za, debug7zArgs("x").concat(zipPath, "-aoa", `-o${out}`))
      if (platform === "linux") {
        // https://github.com/electron-userland/electron-builder/issues/786
        // fix dir permissions — opposite to extract-zip, 7za creates dir with no-access for other users, but dir must be readable for non-root users
        await BluebirdPromise.all([
          chmod(path.join(out, "locales"), "0755"),
          chmod(path.join(out, "resources"), "0755")
        ])
      }
    }
  }
  else {
    const source = packager.getElectronSrcDir(dist)
    const destination = packager.getElectronDestinationDir(out)
    log(`Copying Electron from "${source}" to "${destination}"`)
    await emptyDir(out)
    await copyDir(source, destination, {
      isUseHardLink: DO_NOT_USE_HARD_LINKS,
    })
  }
}