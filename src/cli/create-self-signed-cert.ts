import yargs from "yargs"
import { printErrorAndExit } from "../util/promise"
import { exec, spawn } from "../util/util"
import { getSignVendorPath } from "../windowsCodeSign"
import * as path from "path"
import sanitizeFileName from "sanitize-filename"
import { log } from "../util/log"
import { TmpDir } from "../util/tmp"
import { unlinkIfExists } from "../util/fs"

async function main() {
  const args: any = yargs
    .option("publisher", {
      alias: ["p"],
    }).argv

  const tmpDir = new TmpDir()
  const targetDir = process.cwd()
  const tempPrefix = path.join(await tmpDir.getTempFile(""), sanitizeFileName(args.publisher))
  const cer = `${tempPrefix}.cer`
  const pvk = `${tempPrefix}.pvk`

  log('When asked to enter a password ("Create Private Key Password"), please select "None".')

  const vendorPath = path.join(await getSignVendorPath(), "windows-10", process.arch)
  await exec(path.join(vendorPath, "makecert.exe"),
    ["-r", "-h", "0", "-n", `CN=${args.publisher}`, "-eku", "1.3.6.1.5.5.7.3.3", "-pe", "-sv", pvk, cer])

  const pfx = path.join(targetDir, `${sanitizeFileName(args.publisher)}.pfx`)
  await unlinkIfExists(pfx)
  await exec(path.join(vendorPath, "pvk2pfx.exe"), ["-pvk", pvk, "-spc", cer, "-pfx", pfx])
  log(`${pfx} created. Please see https://github.com/electron-userland/electron-builder/wiki/Code-Signing how do use it to sign.`)

  const certLocation = "Cert:\\LocalMachine\\TrustedPeople"
  log(`${pfx} will be imported into ${certLocation} Operation will be succeed only if runned from root. Otherwise import file manually.`)
  await spawn("powershell.exe", ["Import-PfxCertificate", "-FilePath", `"${pfx}"`, "-CertStoreLocation", ""])
  tmpDir.cleanup()
}

main()
  .catch(printErrorAndExit)