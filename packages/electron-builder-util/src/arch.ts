export enum Arch {
  ia32, x64, armv7l
}

export function toLinuxArchString(arch: Arch) {
  return arch === Arch.ia32 ? "i386" : (arch === Arch.x64 ? "amd64" : "armv7l")
}

export type ArchType = "x64" | "ia32" | "armv7l"

export function getArchSuffix(arch: Arch): string {
  return arch === Arch.x64 ? "" : `-${Arch[arch]}`
}

export function archFromString(name: string): Arch {
  if (name === "x64") {
    return Arch.x64
  }
  if (name === "ia32") {
    return Arch.ia32
  }
  if (name === "armv7l") {
    return Arch.armv7l
  }

  throw new Error(`Unsupported arch ${name}`)
}