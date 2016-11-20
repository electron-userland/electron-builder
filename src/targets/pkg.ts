import { exec } from "../util/util"
import { Arch } from "../metadata"
import MacPackager from "../macPackager"
import * as path from "path"
import { Target } from "./targetFactory"

export class PkgTarget extends Target {
  constructor(private packager: MacPackager) {
    super("pkg")
  }

  async build(appOutDir: string, arch: Arch): Promise<any> {
    const packager = this.packager
    const appInfo = packager.appInfo
    const outFile = path.join(appOutDir, `${appInfo.productFilename}-${appInfo.version}.pkg`)
    const keychainName = (await packager.codeSigningInfo).keychainName
    const args = prepareProductBuildArgs(path.join(appOutDir, `${appInfo.productFilename}.app`), await packager.findInstallerIdentity(false, keychainName), keychainName)
    args.push("--version", appInfo.buildVersion)
    args.push(outFile)
    await exec("productbuild", args)
    packager.dispatchArtifactCreated(outFile, `${appInfo.name}-${appInfo.version}.pkg`)
  }
}

export function prepareProductBuildArgs(appPath: string, identity: string, keychain: string | n) {
  const args = [
    "--component", appPath, "/Applications",
    "--sign", identity,
  ]
  if (keychain != null) {
    args.push("--keychain", keychain)
  }
  return args
}