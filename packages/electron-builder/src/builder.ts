import { addValue, Arch, archFromString, deepAssign, getArchCliNames, InvalidConfigurationError, log } from "builder-util"
import chalk from "chalk"
import { build as _build, Configuration, DIR_TARGET, Packager, PackagerOptions, Platform } from "app-builder-lib"
import { PublishOptions } from "electron-publish"
import yargs from "yargs"

/** @internal */
export interface BuildOptions extends PackagerOptions, PublishOptions {
}

export interface CliOptions extends PackagerOptions, PublishOptions {
  arch?: string

  x64?: boolean
  ia32?: boolean
  armv7l?: boolean
  arm64?: boolean

  dir?: boolean

  platform?: string
}

/** @internal */
export function normalizeOptions(args: CliOptions): BuildOptions {
  if ((args as any).extraMetadata != null) {
    throw new InvalidConfigurationError("Please specify extraMetadata under config field")
  }

  if (args.targets != null) {
    return args
  }

  if ((args as any).draft != null || (args as any).prerelease != null) {
    log.warn({solution: "set releaseType (http://electron.build/configuration/publish#GithubOptions-releaseType) in the GitHub publish options"}, "--draft and --prerelease is deprecated")
  }

  let targets = new Map<Platform, Map<Arch, Array<string>>>()

  function processTargets(platform: Platform, types: Array<string>) {
    function commonArch(currentIfNotSpecified: boolean): Array<Arch> {
      if (platform === Platform.MAC) {
        return args.x64 || currentIfNotSpecified ? [Arch.x64] : []
      }

      const result = Array<Arch>()
      if (args.x64) {
        result.push(Arch.x64)
      }
      if (args.armv7l) {
        result.push(Arch.armv7l)
      }
      if (args.arm64) {
        result.push(Arch.arm64)
      }
      if (args.ia32) {
        result.push(Arch.ia32)
      }

      return result.length === 0 && currentIfNotSpecified ? [archFromString(process.arch)] : result
    }

    if (args.platform != null) {
      throw new InvalidConfigurationError(`--platform cannot be used if --${platform.buildConfigurationKey} is passed`)
    }
    if (args.arch != null) {
      throw new InvalidConfigurationError(`--arch cannot be used if --${platform.buildConfigurationKey} is passed`)
    }

    let archToType = targets.get(platform)
    if (archToType == null) {
      archToType = new Map<Arch, Array<string>>()
      targets.set(platform, archToType)
    }

    if (types.length === 0) {
      const defaultTargetValue = args.dir ? [DIR_TARGET] : []
      for (const arch of commonArch(args.dir === true)) {
        archToType.set(arch, defaultTargetValue)
      }
      return
    }

    for (const type of types) {
      const suffixPos = type.lastIndexOf(":")
      if (suffixPos > 0) {
        addValue(archToType, archFromString(type.substring(suffixPos + 1)), type.substring(0, suffixPos))
      }
      else {
        for (const arch of commonArch(true)) {
          addValue(archToType, arch, type)
        }
      }
    }
  }

  if (args.mac != null) {
    processTargets(Platform.MAC, args.mac)
  }

  if (args.linux != null) {
    processTargets(Platform.LINUX, args.linux)
  }

  if (args.win != null) {
    processTargets(Platform.WINDOWS, args.win)
  }

  if (targets.size === 0) {
    if (args.platform == null && args.arch == null) {
      processTargets(Platform.current(), [])
    }
    else {
      targets = createTargets(normalizePlatforms(args.platform), args.dir ? DIR_TARGET : null, args.arch)
    }
  }

  const result = {...args}
  result.targets = targets

  delete result.dir
  delete result.mac
  delete result.linux
  delete result.win
  delete result.platform
  delete result.arch

  const r = result as any
  delete r.m
  delete r.o
  delete r.l
  delete r.w
  delete r.windows
  delete r.macos
  delete r.$0
  delete r._
  delete r.version
  delete r.help
  delete r.c
  delete r.p
  delete r.pd

  delete result.ia32
  delete result.x64
  delete result.armv7l
  delete result.arm64

  let config = result.config

  // config is array when combining dot-notation values with a config file value
  // https://github.com/electron-userland/electron-builder/issues/2016
  if (Array.isArray(config)) {
    const newConfig: Configuration = {}
    for (const configItem of config) {
      if (typeof configItem === "object") {
        deepAssign(newConfig, configItem)
      }
      else if (typeof configItem === "string") {
        newConfig.extends = configItem
      }
    }

    config = newConfig
    result.config = newConfig
  }

  if (config != null && typeof config !== "string") {
    if (config.extraMetadata != null) {
      coerceTypes(config.extraMetadata)
    }
    if (config.mac != null) {
      // ability to disable code sign using -c.mac.identity=null
      coerceValue(config.mac, "identity")
    }
  }

  if ("project" in r && !("projectDir" in result)) {
    result.projectDir = r.project
  }
  delete r.project

  return result as BuildOptions
}

function coerceValue(host: any, key: string): void {
  const value = host[key]
  if (value === "true") {
    host[key] = true
  }
  else if (value === "false") {
    host[key] = false
  }
  else if (value === "null") {
    host[key] = null
  }
  else if (key === "version" && typeof value === "number") {
    host[key] = value.toString()
  }
  else if (value != null && typeof value === "object") {
    coerceTypes(value)
  }
}

/** @private */
export function coerceTypes(host: any): any {
  for (const key of Object.getOwnPropertyNames(host)) {
    coerceValue(host, key)
  }
  return host
}

export function createTargets(platforms: Array<Platform>, type?: string | null, arch?: string | null): Map<Platform, Map<Arch, Array<string>>> {
  const targets = new Map<Platform, Map<Arch, Array<string>>>()
  for (const platform of platforms) {
    const archs = platform === Platform.MAC ? [Arch.x64] : (arch === "all" ? [Arch.x64, Arch.ia32] : [archFromString(arch == null ? process.arch : arch)])
    const archToType = new Map<Arch, Array<string>>()
    targets.set(platform, archToType)

    for (const arch of archs) {
      archToType.set(arch, type == null ? [] : [type])
    }
  }
  return targets
}

export function build(rawOptions?: CliOptions): Promise<Array<string>> {
  const buildOptions = normalizeOptions(rawOptions || {})
  return _build(buildOptions, new Packager(buildOptions))
}

/**
 * @private
 * @internal
 */
export function configureBuildCommand(yargs: yargs.Argv): yargs.Argv {
  const publishGroup = "Publishing:"
  const buildGroup = "Building:"
  const deprecated = "Deprecated:"

  return yargs
    .option("mac", {
      group: buildGroup,
      alias: ["m", "o", "macos"],
      description: `Build for macOS, accepts target list (see ${chalk.underline("https://goo.gl/5uHuzj")}).`,
      type: "array",
    })
    .option("linux", {
      group: buildGroup,
      alias: "l",
      description: `Build for Linux, accepts target list (see ${chalk.underline("https://goo.gl/4vwQad")})`,
      type: "array",
    })
    .option("win", {
      group: buildGroup,
      alias: ["w", "windows"],
      description: `Build for Windows, accepts target list (see ${chalk.underline("https://goo.gl/jYsTEJ")})`,
      type: "array",
    })
    .option("x64", {
      group: buildGroup,
      description: "Build for x64",
      type: "boolean",
    })
    .option("ia32", {
      group: buildGroup,
      description: "Build for ia32",
      type: "boolean",
    })
    .option("armv7l", {
      group: buildGroup,
      description: "Build for armv7l",
      type: "boolean",
    })
    .option("arm64", {
      group: buildGroup,
      description: "Build for arm64",
      type: "boolean",
    })
    .option("dir", {
      group: buildGroup,
      description: "Build unpacked dir. Useful to test.",
      type: "boolean",
    })
    .option("publish", {
      group: publishGroup,
      alias: "p",
      description: `Publish artifacts, see ${chalk.underline("https://goo.gl/tSFycD")}`,
      choices: ["onTag", "onTagOrDraft", "always", "never", undefined as any],
    })
    .option("draft", {
      group: deprecated,
      description: "Please set releaseType in the GitHub publish options instead",
      type: "boolean",
      default: undefined,
    })
    .option("prerelease", {
      group: deprecated,
      description: "Please set releaseType in the GitHub publish options instead",
      type: "boolean",
      default: undefined,
    })
    .option("platform", {
      group: deprecated,
      description: "The target platform (preferred to use --mac, --win or --linux)",
      choices: ["mac", "win", "linux", "darwin", "win32", "all", undefined as any],
    })
    .option("arch", {
      group: deprecated,
      description: "The target arch (preferred to use --x64 or --ia32)",
      choices: getArchCliNames().concat("all", undefined as any),
    })
    .option("prepackaged", {
      alias: ["pd"],
      group: buildGroup,
      description: "The path to prepackaged app (to pack in a distributable format)",
    })
    .option("projectDir", {
      alias: ["project"],
      group: buildGroup,
      description: "The path to project directory. Defaults to current working directory.",
    })
    .option("config", {
      alias: ["c"],
      group: buildGroup,
      description: "The path to an electron-builder config. Defaults to `electron-builder.yml` (or `json`, or `json5`), see " + chalk.underline("https://goo.gl/YFRJOM"),
    })
    .group(["help", "version"], "Other:")
    .example("electron-builder -mwl", "build for macOS, Windows and Linux")
    .example("electron-builder --linux deb tar.xz", "build deb and tar.xz for Linux")
    .example("electron-builder --win --ia32", "build for Windows ia32")
    .example("electron-builder -c.extraMetadata.foo=bar", "set package.json property `foo` to `bar`")
    .example("electron-builder --config.nsis.unicode=false", "configure unicode options for NSIS")
}

function normalizePlatforms(rawPlatforms: Array<string | Platform> | string | Platform | null | undefined): Array<Platform> {
  const platforms = rawPlatforms == null || Array.isArray(rawPlatforms) ? (rawPlatforms as Array<string | Platform | null | undefined>) : [rawPlatforms]
  if (platforms as any == null || platforms.length === 0) {
    return [Platform.fromString(process.platform)]
  }
  else if (platforms[0] === "all") {
    if (process.platform === Platform.MAC.nodeName) {
      return [Platform.MAC, Platform.LINUX, Platform.WINDOWS]
    }
    else if (process.platform === Platform.LINUX.nodeName) {
      // macOS code sign works only on macOS
      return [Platform.LINUX, Platform.WINDOWS]
    }
    else {
      return [Platform.WINDOWS]
    }
  }
  else {
    return platforms.map(it => it instanceof Platform ? it : Platform.fromString(it!))
  }
}