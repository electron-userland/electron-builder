import { Arch } from "builder-util"
import * as path from "path"
import { ToolsetConfig } from "../configuration.js"
import { downloadBuilderToolset } from "../util/electronGet.js"
import { getCustomToolsetPath } from "./custom.js"

// Newest AppImage bundle — selected when the config is unset / null / "latest".
const APPIMAGE_LATEST = "1.1.0"

export const appimageChecksums = {
  "0.0.0": {
    "appimage-12.0.1.7z": "d12ff7eb8f1d1ec4652ca5237a7fbdca33acc0c758045636feca62dc6ecb8ec4",
  },
  "1.0.3": {
    "appimage-tools-runtime-20251108.tar.gz": "84021a78ee214ae6fd33a2d62a92ba25542dd10bc86bf117a9b2d0bba44e7665",
  },
  "1.1.0": {
    "appimage-tools-runtime-20251108.tar.gz": "098182ab8d3bb93db8a23691671f665ff92316249ace850aec63b9d010ec7fe0",
  },
} as const

export async function getAppImageTools(toolset: ToolsetConfig["appimage"], targetArch: Arch, resourcesDir: string) {
  const runtimeArch = targetArch === Arch.armv7l ? "arm32" : targetArch === Arch.arm64 ? "arm64" : targetArch === Arch.ia32 ? "ia32" : "x64"

  // Static-runtime layout: tools at root, runtimes/ subdir, lib/{arch}/ subdir
  const getPaths = (artifactPath: string) => ({
    mksquashfs: path.resolve(artifactPath, "mksquashfs"),
    desktopFileValidate: path.resolve(artifactPath, "desktop-file-validate"),
    runtime: path.resolve(artifactPath, "runtimes", `runtime-${runtimeArch}`),
    runtimeLibraries: path.resolve(artifactPath, "lib", runtimeArch),
  })

  // FUSE2 layout: tools under a host-platform subdir; runtime files at root with target-arch suffix
  const getFuse2Paths = (artifactPath: string) => {
    // mksquashfs/desktop-file-validate are HOST binaries — use process.arch, not targetArch
    const hostArch = process.arch === "arm" ? "arm32" : process.arch === "arm64" ? "arm64" : process.arch === "ia32" ? "ia32" : "x64"
    const toolRoot = process.platform === "linux" ? `linux-${hostArch}` : "darwin"
    // Runtime files live at root; armv7l target uses "armv7l" filename, not the internal "arm32" alias
    const runtimeSuffix = targetArch === Arch.armv7l ? "armv7l" : runtimeArch
    // FUSE2 tree only ships lib/ia32 and lib/x64; arm targets fall back to x64 here
    const libArch = targetArch === Arch.ia32 ? "ia32" : "x64"
    return {
      mksquashfs: path.resolve(artifactPath, toolRoot, "mksquashfs"),
      desktopFileValidate: path.resolve(artifactPath, toolRoot, "desktop-file-validate"),
      runtime: path.resolve(artifactPath, `runtime-${runtimeSuffix}`),
      runtimeLibraries: path.resolve(artifactPath, "lib", libArch),
    }
  }

  // Only the explicit legacy pin selects the FUSE2 runtime; unset / null / "latest" → newest.
  const isFuse2 = toolset === "0.0.0"

  if (isFuse2) {
    const filenameWithExt = "appimage-12.0.1.7z"
    const artifactPath = await downloadBuilderToolset({
      releaseName: "appimage-12.0.1",
      filenameWithExt,
      checksums: { [filenameWithExt]: appimageChecksums["0.0.0"][filenameWithExt] },
      githubOrgRepo: "electron-userland/electron-builder-binaries",
    })
    return getFuse2Paths(artifactPath)
  }

  if (typeof toolset === "object" && toolset != null) {
    const vendorPath = await getCustomToolsetPath(toolset, resourcesDir)
    return getPaths(vendorPath)
  }

  // Unset / null / "latest" → newest ("1.1.0"); only an explicit "1.0.3" pin stays on 1.0.3.
  const effectiveVersion: "1.0.3" | typeof APPIMAGE_LATEST = toolset === "1.0.3" ? "1.0.3" : APPIMAGE_LATEST
  const filenameWithExt = "appimage-tools-runtime-20251108.tar.gz"
  const artifactPath = await downloadBuilderToolset({
    releaseName: `appimage@${effectiveVersion}`,
    filenameWithExt,
    checksums: { [filenameWithExt]: appimageChecksums[effectiveVersion][filenameWithExt] },
    githubOrgRepo: "electron-userland/electron-builder-binaries",
  })
  return getPaths(artifactPath)
}
