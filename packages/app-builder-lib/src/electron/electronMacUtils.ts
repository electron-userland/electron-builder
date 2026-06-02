import { InvalidConfigurationError, sanitizeDirPath } from "builder-util"
import { symlink } from "fs/promises"
import * as path from "path"

export function assertSafeHelperName(name: string, label: string): void {
  if (name.includes("/") || name.includes("\\") || name.includes("\0")) {
    throw new InvalidConfigurationError(`${label} contains illegal path characters: "${name}"`)
  }
}

export function getAvailableHelperSuffixes(
  helperEHPlist: Record<string, unknown> | null,
  helperNPPlist: Record<string, unknown> | null,
  helperRendererPlist: Record<string, unknown> | null,
  helperPluginPlist: Record<string, unknown> | null,
  helperGPUPlist: Record<string, unknown> | null
): string[] {
  const result = [" Helper"]
  if (helperEHPlist != null) {
    result.push(" Helper EH")
  }
  if (helperNPPlist != null) {
    result.push(" Helper NP")
  }
  if (helperRendererPlist != null) {
    result.push(" Helper (Renderer)")
  }
  if (helperPluginPlist != null) {
    result.push(" Helper (Plugin)")
  }
  if (helperGPUPlist != null) {
    result.push(" Helper (GPU)")
  }
  return result
}

/**
 * After renaming helper bundles (e.g. "Electron Helper.app" → "MyApp Helper.app"), create
 * backward-compatible symlinks so that Electron's primary ELECTRON_PRODUCT_NAME-based helper
 * lookup also succeeds alongside the CFBundleName-based fallback.
 *
 * Two symlinks are created per helper variant:
 *   1. Frameworks/<brandingName><suffix>.app  →  ./<appName><suffix>.app   (directory symlink)
 *   2. <appName><suffix>.app/Contents/MacOS/<brandingName><suffix>  →  ./<appName><suffix>  (executable symlink)
 *
 * This ensures that `base::PathExists(GetHelperAppPath(frameworksPath, ELECTRON_PRODUCT_NAME))`
 * resolves to the renamed bundle on platforms where the CFBundleName fallback is unavailable.
 */
export async function addHelperCompatSymlinks(helperSuffixes: string[], frameworksPath: string, appName: string, brandingName: string): Promise<void> {
  if (appName === brandingName) {
    return
  }
  await Promise.all(
    helperSuffixes.map(async suffix => {
      const renamedBundleName = `${appName}${suffix}.app`
      const originalBundleName = `${brandingName}${suffix}.app`

      // Bounds check: ensure both resolved paths remain inside frameworksPath.
      sanitizeDirPath(path.join(frameworksPath, originalBundleName), frameworksPath)
      sanitizeDirPath(path.join(frameworksPath, renamedBundleName), frameworksPath)

      // 1. Bundle-level directory symlink: "Electron Helper.app" → "./MyApp Helper.app"
      await symlink(`./${renamedBundleName}`, path.join(frameworksPath, originalBundleName))

      // 2. Executable symlink inside the renamed bundle: "Electron Helper" → "./MyApp Helper"
      const macOSDir = path.join(frameworksPath, renamedBundleName, "Contents", "MacOS")
      await symlink(`./${appName}${suffix}`, path.join(macOSDir, `${brandingName}${suffix}`))
    })
  )
}
