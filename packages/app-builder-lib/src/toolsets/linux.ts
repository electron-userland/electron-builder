import { Arch } from "builder-util"
import * as path from "path"
import { downloadArtifact, getBinFromUrl } from "../binDownload"

// It's just easier to copy the map of checksums here rather than adding them to within each if-statement. Also, easy copy-paste from the releases page
const fpmChecksums = {
  "fpm-1.17.0-ruby-3.4.3-darwin-arm64.7z": "0n3BG/Xz1T5YIsoNNTG1bBege9E8A7rym5e3mfzHSHbiSiTS44v6GIHW4amDQk1Y5dtKtWXVq7FwjdmAf3kmMg==",
  "fpm-1.17.0-ruby-3.4.3-darwin-x86_64.7z": "wPX3UheBznIlAXduM22W/d27i+DZVIB/MYnY5eh/qLeEEASZqHJWgN+pIckz3jT0dP37g1SQCikXXfsgxtMSPA==",
  "fpm-1.17.0-ruby-3.4.3-linux-amd64.7z": "7miGWr6dfJSzXDD9ALqkwxvGACp7s7GR50NPcU0YwzbJL825H1SLwGJSGME+v57BxDI2xac47gFEkRZf5u9EtA==",
  "fpm-1.17.0-ruby-3.4.3-linux-arm64v8.7z": "moRNjg6Q2iSXpkrm5sGNL2F6KilGNPagbefxhtr3VEqvAUSg2k2pMLr5xXUo0L4rZ4V+uETbwmbDCpeO3pmLyQ==",
  "fpm-1.17.0-ruby-3.4.3-linux-i386.7z": "UPzsXhkW2T7+oHSKgFsZsFUxxmPC9lNZHsQbT+OeoTbIGsb6+qf3m7c6uP0XvRFnJiu3MM3lE1xAWQOctvajWA==",
} as const

export function getLinuxToolsPath() {
  return getBinFromUrl("linux-tools-mac-10.12.3", "linux-tools-mac-10.12.3.7z", "SQ8fqIRVXuQVWnVgaMTDWyf2TLAJjJYw3tRSqQJECmgF6qdM7Kogfa6KD49RbGzzMYIFca9Uw3MdsxzOPRWcYw==")
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

export async function getAppImageTools(targetArch: Arch) {
  const override = process.env.APPIMAGE_TOOLS_PATH?.trim()
  let artifactPath =
    override ||
    (await downloadArtifact({
      releaseName: "appimage@1.0.2",
      filenameWithExt: "appimage-tools-runtime-20251108.tar.gz",
      checksums: {
        "appimage-tools-runtime-20251108.tar.gz": "a784a8c26331ec2e945c23d6bdb14af5c9df27f5939825d84b8709c61dc81eb0",
      },
      githubOrgRepo: "electron-userland/electron-builder-binaries",
    }))

  artifactPath = path.resolve(artifactPath)

  const runtimeArch =
    targetArch === Arch.armv7l
      ? "arm32"
      : targetArch === Arch.arm64
      ? "arm64"
      : targetArch === Arch.ia32
      ? "ia32"
      : "x64"

  return {
    mksquashfs: path.join(artifactPath, "mksquashfs"),
    desktopFileValidate: path.join(artifactPath, "desktop-file-validate"),
    runtime: path.join(artifactPath, "runtimes", `runtime-${runtimeArch}`),
    runtimeLibraries: path.join(artifactPath, "lib", runtimeArch),
  }
}
