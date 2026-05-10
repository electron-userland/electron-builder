import { Arch } from "builder-util"
import * as path from "path"
import { getBinFromUrl } from "../binDownload"
import { downloadBuilderToolset } from "../util/electronGet"
import { ToolsetConfig } from "../configuration"

const fpmChecksums = {
  "fpm-1.17.0-ruby-3.4.3-darwin-arm64.7z": "6cc6d4785875bc7d79bdf52ca146080a4c300e1d663376ae79615fb548030ede",
  "fpm-1.17.0-ruby-3.4.3-darwin-x86_64.7z": "f7cb468c5e64177124c9d3a5f400ac20ffcb411aa5aa0ea224a808ff5a2d3bbf",
  "fpm-1.17.0-ruby-3.4.3-linux-amd64.7z": "44b0ec6025c14ec137f56180e62675c0eae36233cdce53d0953d9c73ced8989f",
  "fpm-1.17.0-ruby-3.4.3-linux-arm64v8.7z": "338b50cfa7f12d745a997d1a3d000bcd0410008050fa7d8c4476a78a61c0564e",
  "fpm-1.17.0-ruby-3.4.3-linux-i386.7z": "181124e2e9856855c21229ea9096bb7006a9e3e712d133ce332597ba878cd7b6",
} as const

export const appimageChecksums = {
  "0.0.0": {
    // legacy
  },
  "1.0.2": {
    "appimage-tools-runtime-20251108.tar.gz": "a784a8c26331ec2e945c23d6bdb14af5c9df27f5939825d84b8709c61dc81eb0",
  },
  "1.0.3": {
    "appimage-tools-runtime-20251108.tar.gz": "84021a78ee214ae6fd33a2d62a92ba25542dd10bc86bf117a9b2d0bba44e7665",
  },
} as const

export function getLinuxToolsPath() {
  return getBinFromUrl("linux-tools-mac-10.12.3", "linux-tools-mac-10.12.3.7z", "58ff69a6f5082c78b809b72c929f5f2a82e6c3974c014bd1382fc87d9da1075c")
}

export async function getFpmPath() {
  if (process.env.CUSTOM_FPM_PATH != null) {
    return path.resolve(process.env.CUSTOM_FPM_PATH)
  }
  const exec = "fpm"
  if (process.platform === "win32" || process.env.USE_SYSTEM_FPM === "true") {
    return exec
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
  const fpmPath = await getBinFromUrl("fpm@2.1.4", filename, fpmChecksums[filename])
  return path.join(fpmPath, exec)
}

export async function getAppImageTools(appimageToolVersion: ToolsetConfig["appimage"], targetArch: Arch) {
  // nullish and 0.0.0 are both considered legacy, but utilize an upstream dependency to download runtimes, so thus, we ignore logic here
  if (appimageToolVersion == null || appimageToolVersion === "0.0.0") {
    throw new Error(
      "Legacy AppImage toolset was selected, but electron-builder is attempting to download newer runtime. Please file a GH issue if you see this error. Exiting early"
    )
  }

  const override = process.env.APPIMAGE_TOOLS_PATH?.trim()
  const filenameWithExt = "appimage-tools-runtime-20251108.tar.gz"
  let artifactPath =
    override ||
    (await downloadBuilderToolset({
      releaseName: `appimage@${appimageToolVersion}`,
      filenameWithExt,
      checksums: {
        [filenameWithExt]: appimageChecksums[appimageToolVersion][filenameWithExt],
      },
      githubOrgRepo: "electron-userland/electron-builder-binaries",
    }))

  artifactPath = path.resolve(artifactPath)

  const runtimeArch = targetArch === Arch.armv7l ? "arm32" : targetArch === Arch.arm64 ? "arm64" : targetArch === Arch.ia32 ? "ia32" : "x64"

  return {
    mksquashfs: path.join(artifactPath, "mksquashfs"),
    desktopFileValidate: path.join(artifactPath, "desktop-file-validate"),
    runtime: path.join(artifactPath, "runtimes", `runtime-${runtimeArch}`),
    runtimeLibraries: path.join(artifactPath, "lib", runtimeArch),
  }
}
