import { resolveEnvToolsetPath } from "builder-util"
import { Nullish } from "builder-util-runtime"
import { ToolsetConfig } from "../configuration"
import { downloadBuilderToolset } from "../util/electronGet"

export const wixChecksums = {
  "0.0.0": {
    "wix-4.0.0.5512.2.7z": "fe677fcd837b18c9b912985d91636bbd8a1e800c3b3a6a841b6f96e89624e839",
  },
  "1.0.0": {
    "wix-4.0.6.tar.gz": "2cb3ebab08f9dddff67688e7db25dbb5df61dfe7ff16a5fc1f86cca2c01e9a7a",
  },
} as const

export async function getWixBin(wix: ToolsetConfig["wix"] | Nullish): Promise<string> {
  const overridePath = await resolveEnvToolsetPath("ELECTRON_BUILDER_WIX_DIR", "directory")
  if (overridePath != null) {
    return overridePath
  }
  if (wix === "0.0.0" || wix == null) {
    return downloadBuilderToolset({
      releaseName: `wix-4.0.0.5512.2`,
      filenameWithExt: "wix-4.0.0.5512.2.7z",
      checksums: wixChecksums["0.0.0"],
    })
  }
  return downloadBuilderToolset({
    releaseName: `wix@${wix}`,
    filenameWithExt: "wix-4.0.6.tar.gz",
    checksums: wixChecksums[wix],
  })
}
