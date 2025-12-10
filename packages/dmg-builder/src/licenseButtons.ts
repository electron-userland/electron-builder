import { PlatformPackager } from "app-builder-lib"
<<<<<<< HEAD
import { getLicenseAssets } from "app-builder-lib/internal"

export interface LicenseButtonsFile {
  file: string
  lang: string
  langWithRegion: string
  langName: string
}
=======
import { getLicenseAssets } from "app-builder-lib/out/util/license"
import { log } from "builder-util"
import { readFile } from "fs-extra"
import * as iconv from "iconv-lite"
import { load } from "js-yaml"
<<<<<<< HEAD
import { serializeString } from "./dmgUtil.js.js"
import { getDefaultButtons } from "./licenseDefaultButtons.js.js"
>>>>>>> 5a5d2b7d9 (tmp save for .js extension migration)
=======
import { serializeString } from "./dmgUtil.js"
import { getDefaultButtons } from "./licenseDefaultButtons.js"
>>>>>>> c92b22265 (tmp save for .js extension migration)

export async function getLicenseButtonsFile(packager: PlatformPackager<any>): Promise<Array<LicenseButtonsFile>> {
  return getLicenseAssets(
    (await packager.resourceList).filter(it => {
      const name = it.toLowerCase()
      // noinspection SpellCheckingInspection
      return name.startsWith("licensebuttons_") && (name.endsWith(".json") || name.endsWith(".yml"))
    }),
    packager
  )
}
