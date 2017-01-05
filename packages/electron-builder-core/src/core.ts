export enum Arch {
  ia32, x64, armv7l
}

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

export class Platform {
  static MAC = new Platform("mac", "mac", "darwin")
  static LINUX = new Platform("linux", "linux", "linux")
  static WINDOWS = new Platform("windows", "win", "win32")

  // deprecated
  //noinspection JSUnusedGlobalSymbols
  static OSX = Platform.MAC

  constructor(public name: string, public buildConfigurationKey: string, public nodeName: string) {
  }

  toString() {
    return this.name
  }

  createTarget(type?: string | Array<string> | null, ...archs: Array<Arch>): Map<Platform, Map<Arch, Array<string>>> {
    const archToType = new Map()
    if (this === Platform.MAC) {
      archs = [Arch.x64]
    }

    for (const arch of (archs == null || archs.length === 0 ? [archFromString(process.arch)] : archs)) {
      archToType.set(arch, type == null ? [] : (Array.isArray(type) ? type : [type]))
    }
    return new Map([[this, archToType]])
  }

  static current(): Platform {
    return Platform.fromString(process.platform)
  }

  static fromString(name: string): Platform {
    name = name.toLowerCase()
    switch (name) {
      case Platform.MAC.nodeName:
      case Platform.MAC.name:
        return Platform.MAC

      case Platform.WINDOWS.nodeName:
      case Platform.WINDOWS.name:
      case Platform.WINDOWS.buildConfigurationKey:
        return Platform.WINDOWS

      case Platform.LINUX.nodeName:
        return Platform.LINUX

      default:
        throw new Error(`Unknown platform: ${name}`)
    }
  }
}


export abstract class Target {
  constructor(public readonly name: string, public readonly isAsyncSupported: boolean = true) {
  }

  abstract build(appOutDir: string, arch: Arch): Promise<any>

  finishBuild(): Promise<any> {
    return Promise.resolve()
  }
}