import type { MakerBase, MakerOptions } from "@electron-forge/maker-base"
import type { ForgeConfig, ForgePlatform as ForgeOwnPlatform } from "@electron-forge/shared-types"
import * as path from "path"
import type { Configuration } from "./configuration.js"
import { build } from "./index.js"
import { PackagerOptions } from "./packagerApi.js"

export interface ForgeOptions {
  readonly dir: string
}

/** Platforms Electron Forge makes for (`ForgePlatform` in `@electron-forge/shared-types`). */
export type ForgePlatform = "darwin" | "mas" | "win32" | "linux"

/**
 * The options Electron Forge passes to a maker's `make()` (`MakerOptions` in `@electron-forge/maker-base`).
 * Only the fields electron-builder reads are declared.
 */
export interface ForgeMakerOptions extends ForgeOptions {
  /** Where Forge expects artifacts. Defaults to a `make` directory next to `dir`. */
  readonly makeDir?: string
  /** The sanitized app name Forge packaged the app with. */
  readonly appName?: string
  readonly targetPlatform?: string
  readonly targetArch: string
  readonly forgeConfig?: { readonly packagerConfig?: { readonly executableName?: string } }
}

/** A maker config, or a function returning one for the target arch (as accepted by Forge's `MakerBase`). */
export type ForgeMakerConfig<C> = C | ((targetArch: string) => C | Promise<C>)

/** The electron-builder targets and target configuration a maker builds for one arch. */
export interface ForgeMakerTarget {
  readonly win?: Array<string>
  readonly linux?: Array<string>
  readonly config: Configuration
}

function forgeOutputDir(appDir: string): string {
  // https://github.com/electron/forge/blob/main/packages/api/core/src/api/make.ts (`makeDir`)
  return path.join(path.dirname(appDir), "make")
}

export function buildForge(forgeOptions: ForgeOptions, options: PackagerOptions) {
  // Resolve appDir to an absolute canonical path before deriving any sibling
  // directories from it.  Using path.dirname avoids embedding ".." in the
  // resolved path, which keeps downstream path comparisons and CodeQL taint
  // tracking straightforward.
  const appDir = path.resolve(forgeOptions.dir)
  return build({
    prepackaged: appDir,
    config: {
      directories: {
        output: forgeOutputDir(appDir),
      },
    },
    ...options,
  })
}

const FORGE_PLATFORMS: ReadonlyArray<string> = ["darwin", "mas", "win32", "linux"] satisfies ReadonlyArray<ForgePlatform>

function isForgePlatform(platform: string): platform is ForgePlatform {
  return FORGE_PLATFORMS.includes(platform)
}

function isConfigFetcher<C>(config: ForgeMakerConfig<C> | undefined): config is (targetArch: string) => C | Promise<C> {
  return typeof config === "function"
}

/**
 * Base class for electron-builder's Electron Forge makers. Structurally compatible with `MakerBase` from
 * `@electron-forge/maker-base` (Forge 6+), without depending on it: Forge instantiates the package's default export
 * with `new Maker(config, platforms)`, or accepts an instance directly in `makers`.
 */
export abstract class ElectronBuilderForgeMaker<C extends object = object> {
  abstract readonly name: string

  abstract readonly defaultPlatforms: ForgePlatform[]

  readonly requiredExternalBinaries: string[] = []

  /** The resolved maker config, set by `prepareConfig()`. */
  config: C | undefined

  private isConfigPrepared = false

  constructor(
    private readonly configOrConfigFetcher?: ForgeMakerConfig<C>,
    // Forge 7 types platforms as `string`; Forge 8 narrows them to `ForgePlatform`
    protected readonly platformsToMakeOn?: ReadonlyArray<string> | null
  ) {}

  /** Forge identifies maker instances in `makers` by this flag. */
  get __isElectronForgeMaker(): true {
    return true
  }

  get platforms(): ForgePlatform[] {
    return this.platformsToMakeOn == null ? this.defaultPlatforms : this.platformsToMakeOn.filter(isForgePlatform)
  }

  async prepareConfig(targetArch: string): Promise<void> {
    const config = this.configOrConfigFetcher
    this.config = isConfigFetcher(config) ? await config(targetArch) : config
    this.isConfigPrepared = true
  }

  isSupportedOnCurrentPlatform(): boolean {
    return true
  }

  externalBinariesExist(): boolean {
    return true
  }

  ensureExternalBinariesExist(): void {
    // electron-builder downloads the tools it needs
  }

  clone(): ElectronBuilderForgeMaker<C> {
    const clone: unknown = Reflect.construct(this.constructor, [this.configOrConfigFetcher, this.platformsToMakeOn])
    if (!(clone instanceof ElectronBuilderForgeMaker)) {
      throw new Error(`Cannot clone maker ${this.name}`)
    }
    return clone
  }

  async make(options: ForgeMakerOptions): Promise<string[]> {
    if (!this.isConfigPrepared) {
      await this.prepareConfig(options.targetArch)
    }
    return build(this.getBuildOptions(options))
  }

  /** Maps Forge's `make()` options onto the electron-builder `build()` options for this maker's target. */
  getBuildOptions(options: ForgeMakerOptions): PackagerOptions {
    const appDir = path.resolve(options.dir)
    // Forge configs commonly pass `config: {}`; leave the target's own defaults in place for it (an empty `snapcraft` is invalid)
    const makerConfig = this.config == null || Object.keys(this.config).length === 0 ? undefined : this.config
    const { config, ...targets } = this.getTarget(options.targetArch, makerConfig)
    // The packaged binary is named by Forge (`packagerConfig.executableName`, else the app name), not by electron-builder's defaults.
    const executableName = options.forgeConfig?.packagerConfig?.executableName ?? options.appName
    return {
      ...targets,
      prepackaged: appDir,
      config: {
        ...(executableName == null ? {} : { executableName }),
        ...config,
        directories: {
          output: options.makeDir ?? forgeOutputDir(appDir),
        },
      },
    }
  }

  /** The electron-builder targets for `targetArch`, with the maker config applied to the target's configuration key. */
  protected abstract getTarget(targetArch: string, config: C | undefined): ForgeMakerTarget
}

type ForgeMakerClass = new (...args: never[]) => ElectronBuilderForgeMaker

/**
 * Lets the maker class also be called as a function, as Electron Forge 5 called a maker module's default export
 * (`maker.default(options)`). Forge 6+ constructs it with `new`, which is passed through unchanged.
 */
export function withLegacyForgeCall<T extends ForgeMakerClass>(MakerClass: T): T {
  return new Proxy(MakerClass, {
    apply(_target, _thisArg, args: unknown[]): Promise<string[]> {
      const options: unknown = args[0]
      if (options == null || typeof options !== "object" || !("dir" in options) || typeof options.dir !== "string") {
        throw new TypeError(`${MakerClass.name} must be constructed with "new" (Electron Forge 6+) or called with Electron Forge 5 maker options`)
      }
      const maker: unknown = Reflect.construct(MakerClass, [])
      if (!(maker instanceof ElectronBuilderForgeMaker)) {
        throw new TypeError(`${MakerClass.name} is not an electron-builder Forge maker`)
      }
      return maker.make({
        dir: options.dir,
        targetArch: "targetArch" in options && typeof options.targetArch === "string" ? options.targetArch : process.arch,
        appName: "appName" in options && typeof options.appName === "string" ? options.appName : undefined,
      })
    },
  })
}

// Compile-time check against the Electron Forge devDependencies (type-only, stripped from the published declarations):
// a renovate bump of @electron-forge/* fails `pnpm compile` if Forge's maker contract drifts from ours.
type Expect<T extends true> = T
type IsAssignable<From, To> = [From] extends [To] ? true : false
/** The MakerBase members Forge's `make` uses (packages/api/core/src/api/make.ts). */
type ForgeUsedMakerMembers =
  | "name"
  | "defaultPlatforms"
  | "requiredExternalBinaries"
  | "__isElectronForgeMaker"
  | "platforms"
  | "prepareConfig"
  | "isSupportedOnCurrentPlatform"
  | "externalBinariesExist"
  | "ensureExternalBinariesExist"
  | "make"
type ForgeUsedMaker = Pick<MakerBase<object>, ForgeUsedMakerMembers>

/** @internal */
export type ForgeMakerCompatibility = [
  Expect<IsAssignable<ElectronBuilderForgeMaker, ForgeUsedMaker>>,
  Expect<IsAssignable<ReturnType<ElectronBuilderForgeMaker["clone"]>, ForgeUsedMaker>>,
  Expect<IsAssignable<ElectronBuilderForgeMaker, NonNullable<ForgeConfig["makers"]>[number]>>,
  Expect<IsAssignable<MakerOptions, ForgeMakerOptions>>,
  Expect<IsAssignable<ForgePlatform, ForgeOwnPlatform>>,
  Expect<IsAssignable<ForgeOwnPlatform, ForgePlatform>>,
]
