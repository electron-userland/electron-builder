export enum Arch {
  ia32, x64, armv7l, arm64
}

export function toLinuxArchString(arch: Arch) {
  return arch === Arch.ia32 ? "i386" :
          (arch === Arch.x64 ? "amd64" :
          (arch === Arch.arm64 ? "arm64" : "armv7l"))
}

export type ArchType = "x64" | "ia32" | "armv7l" | "arm64"

export function getArchSuffix(arch: Arch): string {
  return arch === Arch.x64 ? "" : `-${Arch[arch]}`
}

export function archFromString(name: string): Arch {
  switch (name) {
    case "x64":
      return Arch.x64

    case "ia32":
      return Arch.ia32

    case "armv7l":
      return Arch.armv7l

    case "arm64":
      return Arch.arm64

    default:
      throw new Error(`Unsupported arch ${name}`)
  }
}