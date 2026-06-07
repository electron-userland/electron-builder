import * as path from "path"
import { ToolsetConfig } from "."
import { downloadBuilderToolset } from "../util/electronGet"
import { getCustomToolsetPath } from "./custom"
import { Arch } from "builder-util"

export const appimageChecksums = {
  "0.0.0": {
    "appimage-12.0.1.7z": "d12ff7eb8f1d1ec4652ca5237a7fbdca33acc0c758045636feca62dc6ecb8ec4",
  },
  "1.0.2": {
    "appimage-tools-runtime-20251108.tar.gz": "a784a8c26331ec2e945c23d6bdb14af5c9df27f5939825d84b8709c61dc81eb0",
  },
  "1.0.3": {
    "appimage-tools-runtime-20251108.tar.gz": "84021a78ee214ae6fd33a2d62a92ba25542dd10bc86bf117a9b2d0bba44e7665",
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
    // but buildLegacyFuse2AppImage only copies runtimeLibraries for x64/ia32.
    const libArch = targetArch === Arch.ia32 ? "ia32" : "x64"
    return {
      mksquashfs: path.resolve(artifactPath, toolRoot, "mksquashfs"),
      desktopFileValidate: path.resolve(artifactPath, toolRoot, "desktop-file-validate"),
      runtime: path.resolve(artifactPath, `runtime-${runtimeSuffix}`),
      runtimeLibraries: path.resolve(artifactPath, "lib", libArch),
    }
  }

  const isFuse2 = toolset === "0.0.0" || toolset == null

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

  if (typeof toolset === "object") {
    const vendorPath = await getCustomToolsetPath(toolset, resourcesDir)
    return getPaths(vendorPath)
  }

  const filenameWithExt = "appimage-tools-runtime-20251108.tar.gz"
  const artifactPath = await downloadBuilderToolset({
    releaseName: `appimage@${toolset}`,
    filenameWithExt,
    checksums: appimageChecksums[toolset],
  })
  return getPaths(artifactPath)
}
