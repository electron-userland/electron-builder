import { Arch, InvalidConfigurationError } from "builder-util"
import { Nullish } from "builder-util-runtime"
import { ToolsetConfig } from "../configuration.js"
import { BUILD_CHANGES_URL } from "../util/config/legacyOptions.js"
import { downloadBuilderToolset } from "../util/electronGet.js"
import { getCustomToolsetPath } from "./custom.js"
import { resolveToolsetVersion } from "./version.js"

// Newest WiX bundle — selected when the config is unset or "latest".
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

const WIX4_NAMESPACE_PATTERN = /\bxmlns(?::[\w.-]+)?\s*=\s*(["'])(http:\/\/wixtoolset\.org\/schemas\/v4\/[^"']*)\1/g

/** The WiX 4 namespaces (`http://wixtoolset.org/schemas/v4/...`) that a `.wxs` project declares, each once. */
export function findWix4Namespaces(project: string): Array<string> {
  return [...new Set(Array.from(project.matchAll(WIX4_NAMESPACE_PATTERN), it => it[2]))]
}

/**
 * Fails a WiX 3 build whose project declares a WiX 4 namespace, which only an `msiProjectCreated` hook can add (the
 * generated project uses the WiX 3 ones). candle would reject it with an "unhandled extension element" error that
 * doesn't say the bundle is the cause.
 */
export function assertNoWix4Namespaces(project: string, schema: WixSchema): void {
  if (schema !== "v3") {
    return
  }
  const namespaces = findWix4Namespaces(project)
  if (namespaces.length === 0) {
    return
  }
  throw new InvalidConfigurationError(
    `The MSI project declares the WiX 4 namespace ${namespaces.map(it => `"${it}"`).join(", ")}, most likely from an msiProjectCreated hook, ` +
      `but the WiX 3 toolset reads WiX 3 namespaces only (electron-builder v27 builds MSIs with WiX 3.14.1 by default, toolsets.wix "latest"). ` +
      `Use the WiX 3 namespace (for example "http://schemas.microsoft.com/wix/UtilExtension" instead of "http://wixtoolset.org/schemas/v4/wxs/util"), ` +
      `or set toolsets.wix to "0.0.0" to keep the legacy WiX 4 preview bundle. ` +
      `See ${BUILD_CHANGES_URL}#toolset-defaults-resolve-to-latest-newest-bundle`
  )
}

/** Resolves a `toolsets.wix` version: unset or `"latest"` is the newest bundle, `"0.0.0"` the legacy one. */
export function resolveWixVersion(wix: Exclude<ToolsetConfig["wix"], object> | Nullish): "0.0.0" | "2.0.0" {
  return resolveToolsetVersion(wix, WIX_LATEST)
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
