export enum Arch {
  ia32, x64, armv7l, arm64
}

export type ArchType = "x64" | "ia32" | "armv7l" | "arm64"

export function toLinuxArchString(arch: Arch, targetName: string): string {
  switch (arch) {
    case Arch.x64:
      return "amd64"
    case Arch.ia32:
      return targetName === "pacman" ? "i686" : "i386"
    case Arch.armv7l:
      return targetName === "snap" || targetName === "deb" ? "armhf" : "armv7l"
    case Arch.arm64:
      return "arm64"

    default:
      throw new Error(`Unsupported arch ${arch}`)
  }
}

export function getArchCliNames(): Array<string> {
  return [Arch[Arch.ia32], Arch[Arch.x64], Arch[Arch.armv7l], Arch[Arch.arm64]]
}

export function getArchSuffix(arch: Arch): string {
  return arch === Arch.x64 ? "" : `-${Arch[arch]}`
}

export function archFromString(name: string): Arch {
  switch (name) {
    case "x64":
      return Arch.x64
    case "ia32":
      return Arch.ia32
    case "arm64":
      return Arch.arm64
    case "armv7l":
      return Arch.armv7l

    default:
      throw new Error(`Unsupported arch ${name}`)
  }
}

export function getArtifactArchName(arch: Arch, ext: string): string {
  let archName = Arch[arch]
  const isAppImage = ext === "AppImage" || ext === "appimage"
  if (arch === Arch.x64) {
    if (isAppImage || ext === "rpm") {
      archName = "x86_64"
    }
    else if (ext === "deb" || ext === "snap") {
      archName = "amd64"
    }
  }
  else if (arch === Arch.ia32) {
    if (ext === "deb" || isAppImage || ext === "snap") {
      archName = "i386"
    }
    else if (ext === "pacman" || ext === "rpm") {
      archName = "i686"
    }
  }
  else if (arch === Arch.armv7l) {
    if (ext === "snap") {
      archName = "armhf"
    }
  }
  return archName
}