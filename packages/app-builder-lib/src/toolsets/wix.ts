import { Arch } from "builder-util"
import { Nullish } from "builder-util-runtime"
import { ToolsetConfig } from "../configuration.js"
import { downloadBuilderToolset } from "../util/electronGet.js"
import { getCustomToolsetPath } from "./custom.js"

// Newest WiX bundle — selected by `"latest"`. Unlike the other toolsets, an unset `toolsets.wix` keeps the legacy bundle, so
// existing MSI builds are unchanged until the default moves.
const WIX_LATEST = "2.0.0"

export const wixChecksums = {
  "0.0.0": {
    "wix-4.0.0.5512.2.7z": "fe677fcd837b18c9b912985d91636bbd8a1e800c3b3a6a841b6f96e89624e839",
  },
  "2.0.0": {
    // WiX Toolset v3.14.1 (candle/light)
    "wix-3.14.1.tar.gz": "8f1a5a017042cb287b11b8056ed8e29f86ebe456b09086c4f510b56659e014d5",
  },
} as const

/**
 * The `.wxs` dialect a WiX bundle compiles. The legacy bundle is a WiX 4 preview (4.0.0.5512) that still ships `candle` /
 * `light`: it reads the v4 namespace and accepts v4 conveniences (the inline directory syntax `Name="APPLICATIONFOLDER:\sub\"`,
 * `Component/@Directory` inside a `ComponentGroup` that sets one) but has no `arm64`. WiX 3 needs every directory as a nested
 * `Directory` element and every component in its own directory, and supports `-arch arm64`.
 */
export type WixSchema = "v3" | "v4-preview"

/** A WiX bundle on disk and the `.wxs` dialect it compiles. */
export interface WixToolset {
  readonly path: string
  readonly schema: WixSchema
}

/** The `xmlns` of a `.wxs` document in `schema`. */
export function getWixNamespace(schema: WixSchema): string {
  return schema === "v3" ? "http://schemas.microsoft.com/wix/2006/wi" : "http://wixtoolset.org/schemas/v4/wxs"
}

/** Resolves a `toolsets.wix` version: unset or `"0.0.0"` is the legacy bundle, `"latest"` the newest one. */
export function resolveWixVersion(wix: Exclude<ToolsetConfig["wix"], object> | Nullish): "0.0.0" | "2.0.0" {
  if (wix == null) {
    return "0.0.0"
  }
  return wix === "latest" ? WIX_LATEST : wix
}

export async function getWixToolset(wix: ToolsetConfig["wix"] | Nullish, resourcesDir: string): Promise<WixToolset> {
  if (typeof wix === "object" && wix != null) {
    // a custom bundle must mirror the WiX v3 layout (candle.exe, light.exe and the extensions at its root)
    return { path: await getCustomToolsetPath(wix, resourcesDir), schema: "v3" }
  }
  const resolved = resolveWixVersion(wix)
  if (resolved === "0.0.0") {
    const file = "wix-4.0.0.5512.2.7z"
    // noinspection SpellCheckingInspection
    const toolsetPath = await downloadBuilderToolset({
      releaseName: "wix-4.0.0.5512.2",
      filenameWithExt: file,
      checksums: { [file]: wixChecksums["0.0.0"][file] },
    })
    return { path: toolsetPath, schema: "v4-preview" }
  }
  const file = "wix-3.14.1.tar.gz"
  const toolsetPath = await downloadBuilderToolset({
    releaseName: `wix@${resolved}`,
    filenameWithExt: file,
    checksums: { [file]: wixChecksums[resolved][file] },
  })
  return { path: toolsetPath, schema: "v3" }
}

/**
 * The architecture an MSI is built for: arm64 needs a toolset that supports it, otherwise it falls back to x64 (the
 * x64 package then runs on Windows on Arm under emulation).
 */
export function getWixArch(arch: Arch, schema: WixSchema): Arch {
  return arch === Arch.arm64 && schema !== "v3" ? Arch.x64 : arch
}

/** The value of `candle -arch` for `wixArch`. */
export function getCandleArch(wixArch: Arch): "x86" | "x64" | "arm64" {
  switch (wixArch) {
    case Arch.ia32:
      return "x86"
    case Arch.arm64:
      return "arm64"
    default:
      return "x64"
  }
}
