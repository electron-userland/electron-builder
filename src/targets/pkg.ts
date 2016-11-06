import { exec } from "../util/util"
import { BaseSignOptions } from "electron-osx-sign-tf"

export function flatApplication(opts: BaseSignOptions, outFile: string, identity: string): Promise<any> {
  const args = [
    "--component", opts.app, "/Applications",
    "--sign", identity,
  ]
  if (opts.keychain != null) {
    args.push("--keychain", opts.keychain)
  }
  args.push(outFile)
  return exec("productbuild", args)
}