import { debug, exec } from "electron-builder-util"
import { readFile, writeFile } from "fs-extra-p"
import * as path from "path"
import { PlatformPackager } from "../platformPackager"
import { getLicenseFiles } from "./license"

/** @internal */
export async function addLicenseToDmg(packager: PlatformPackager<any>, dmgPath: string) {
  // http://www.owsiak.org/?p=700
  const licenseFiles = await getLicenseFiles(packager)
  if (licenseFiles.length === 0) {
    return
  }

  if (debug.enabled) {
    debug(`License files: ${licenseFiles.join(" ")}`)
  }

  const tempFile = await packager.getTempFile(".r")
  let data = await readFile(path.join(__dirname, "..", "..", "templates", "dmg", "license.txt"), "utf8")
  let counter = 5000
  for (const item of licenseFiles) {
    const kind = item.file.toLowerCase().endsWith(".rtf") ? "RTF" : "TEXT"
    data += `data '${kind}' (${counter}, "${item.langName} SLA") {\n`

    const hex = (await readFile(item.file)).toString("hex").toUpperCase()
    for (let i = 0; i < hex.length; i += 32) {
      data += '$"' + hex.substring(i, Math.min(i + 32, hex.length)) + '"\n'
    }

    data += "};\n\n"
    // noinspection SpellCheckingInspection
    data += `data 'styl' (${counter}, "${item.langName} SLA") {
  $"0003 0000 0000 000C 0009 0014 0000 0000"
  $"0000 0000 0000 0000 0027 000C 0009 0014"
  $"0100 0000 0000 0000 0000 0000 002A 000C"
  $"0009 0014 0000 0000 0000 0000 0000"                
};`

    counter++
  }

  await writeFile(tempFile, data)
  await exec("hdiutil", ["unflatten", dmgPath])
  await exec("Rez", ["-a", tempFile, "-o", dmgPath])
  await exec("hdiutil", ["flatten", dmgPath])
}