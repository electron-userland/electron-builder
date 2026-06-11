import { PlatformPackager } from "app-builder-lib"
import { getLicenseAssets } from "app-builder-lib/internal"

export interface LicenseButtonsFile {
  file: string
  lang: string
  langWithRegion: string
  langName: string
}

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
