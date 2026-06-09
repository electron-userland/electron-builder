import { Arch, exists, resolveEnvToolsetPath, use } from "builder-util"
import * as path from "path"
import { ToolsetConfig } from "../configuration.js"
import { downloadBuilderToolset } from "../util/electronGet.js"
import { isUseSystemFpm } from "../util/flags.js"
import { getCustomToolsetPath } from "./custom.js"

const fpmChecksums = {
  "fpm-1.17.0-ruby-3.4.3-darwin-arm64.7z": "6cc6d4785875bc7d79bdf52ca146080a4c300e1d663376ae79615fb548030ede",
  "fpm-1.17.0-ruby-3.4.3-darwin-x86_64.7z": "f7cb468c5e64177124c9d3a5f400ac20ffcb411aa5aa0ea224a808ff5a2d3bbf",
  "fpm-1.17.0-ruby-3.4.3-linux-amd64.7z": "44b0ec6025c14ec137f56180e62675c0eae36233cdce53d0953d9c73ced8989f",
  "fpm-1.17.0-ruby-3.4.3-linux-arm64v8.7z": "338b50cfa7f12d745a997d1a3d000bcd0410008050fa7d8c4476a78a61c0564e",
  "fpm-1.17.0-ruby-3.4.3-linux-i386.7z": "181124e2e9856855c21229ea9096bb7006a9e3e712d133ce332597ba878cd7b6",
} as const

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

// no legacy toolset as macos arm64 BSD gtar/ar/lzip are not compatible with linux targets, so we always use newer toolset on macos for linux archives
const linuxToolsMacChecksums = {
  "linux-tools-mac-darwin-arm64.tar.gz": "204e76f08364352edb28a6a4be87e8f9bd9340213865d9a0d1c664aa46fcf053",
  "linux-tools-mac-darwin-x86_64.tar.gz": "7ee26dfbd0d2a4c2c83b55a9416a30cc84876eef01c6497ca49bb016a190c726",
} as const

export async function getLinuxToolsPath(toolset: ToolsetConfig["linuxToolsMac"], resourcesDir: string): Promise<string> {
  if (typeof toolset === "object" && toolset != null) {
    return getCustomToolsetPath(toolset, resourcesDir)
  }
  const arch = process.arch === "arm64" ? "arm64" : "x86_64"
  const filename: keyof typeof linuxToolsMacChecksums = `linux-tools-mac-darwin-${arch}.tar.gz`
  return downloadBuilderToolset({
    releaseName: `linux-tools-mac@${toolset ?? "1.0.0"}`,
    filenameWithExt: filename,
    checksums: linuxToolsMacChecksums,
    githubOrgRepo: "electron-userland/electron-builder-binaries",
  })
}

export async function getLinuxToolsMacToolset(toolset: ToolsetConfig["linuxToolsMac"], resourcesDir: string) {
  const linuxToolsPath = await getLinuxToolsPath(toolset, resourcesDir)
  const bin = (pkg: string) => path.join(linuxToolsPath, "bin", pkg)
  return {
    ar: bin("ar"),
    lzip: bin("lzip"),
    gtar: bin("gtar"),
  }
}

export async function getFpmPath(toolset: ToolsetConfig["fpm"], resourcesDir: string) {
  const exec = "fpm"
  if (process.platform === "win32" || isUseSystemFpm()) {
    return exec
  }

  if (typeof toolset === "object" && toolset != null) {
    const vendorPath = await getCustomToolsetPath(toolset, resourcesDir)
    return path.resolve(vendorPath, exec)
  }

  const getKey = () => {
    if (process.platform === "linux") {
      if (process.arch == "x64") {
        return "fpm-1.17.0-ruby-3.4.3-linux-amd64.7z"
      } else if (process.arch === "arm64") {
        return "fpm-1.17.0-ruby-3.4.3-linux-arm64v8.7z"
      }
      return "fpm-1.17.0-ruby-3.4.3-linux-i386.7z"
    }
    // darwin arm64
    if (process.arch === "arm64") {
      return "fpm-1.17.0-ruby-3.4.3-darwin-arm64.7z"
    }
    return "fpm-1.17.0-ruby-3.4.3-darwin-x86_64.7z"
  }

  const filename = getKey()
  const fpmPath = await downloadBuilderToolset({
    releaseName: `fpm@${toolset ?? "1.0.0"}`,
    filenameWithExt: filename,
    checksums: fpmChecksums,
    githubOrgRepo: "electron-userland/electron-builder-binaries",
  })
  return path.join(fpmPath, exec)
}

export async function getAppImageTools(appimageToolVersion: ToolsetConfig["appimage"], targetArch: Arch, resourcesDir: string) {
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

  // null → modern default "1.0.3"
  const isFuse2 = (appimageToolVersion ?? "1.0.3") === "0.0.0"

  if (isFuse2) {
    const filenameWithExt = "appimage-12.0.1.7z"
    const artifactPath = await downloadBuilderToolset({
      releaseName: "appimage-12.0.1",
      filenameWithExt,
      checksums: { [filenameWithExt]: appimageChecksums["0.0.0"][filenameWithExt] },
      githubOrgRepo: "electron-userland/electron-builder-binaries",
    })
    const artifact = getFuse2Paths(artifactPath)
    for (const entry of Object.entries(artifact)) {
      if (!(await exists(entry[1]))) {
        throw new Error(`AppImage tool ${entry[0]} not found at path: ${entry[1]}`)
      }
    }
    return artifact
  }

  if (typeof appimageToolVersion === "object" && appimageToolVersion != null) {
    const vendorPath = await getCustomToolsetPath(appimageToolVersion, resourcesDir)
    return getPaths(vendorPath)
  }

  const effectiveVersion = (appimageToolVersion ?? "1.0.3") as "1.0.2" | "1.0.3"
  const filenameWithExt = "appimage-tools-runtime-20251108.tar.gz"
  const artifactPath = await downloadBuilderToolset({
    releaseName: `appimage@${effectiveVersion}`,
    filenameWithExt,
    checksums: { [filenameWithExt]: appimageChecksums[effectiveVersion][filenameWithExt] },
    githubOrgRepo: "electron-userland/electron-builder-binaries",
  })
  const artifact = getPaths(artifactPath)
  for (const entry of Object.entries(artifact)) {
    if (!(await exists(entry[1]))) {
      throw new Error(`AppImage tool ${entry[0]} not found at path: ${entry[1]}`)
    }
  }
  return artifact
}
