declare module "@malept/flatpak-bundler" {
  // See https://docs.flatpak.org/en/latest/flatpak-builder-command-reference.html#flatpak-manifest
  export interface FlatpakManifest {
    id: string
    branch?: string
    defaultBranch?: string
    collectionId?: string
    extensionTag?: string
    tokenType?: number
    runtime: string
    runtimeVersion: string
    sdk: string
    var?: string
    metadata?: string
    command: string
    buildRuntime?: boolean
    buildExtension?: boolean
    separateLocales?: boolean
    idPlatform?: string
    metadataPlatform?: string
    writableSdk?: boolean
    appstreamCompose?: boolean
    sdkExtensions?: string[]
    platformExtensions?: string[]
    base?: string
    baseVersion?: string
    baseExtensions?: string[]
    inheritExtensions?: string[]
    inheritSdkExtensions?: string[]
    tags?: string[]
    buildOptions?: any
    modules?: (any | string)[]
    addExtensions?: any
    addBuildExtensions?: any
    cleanup?: string[]
    cleanupCommands?: string[]
    cleanupPlatform?: string[]
    cleanupPlatformCommands?: string[]
    preparePlatformCommands?: string[]
    finishArgs?: string[]
    renameDesktopFile?: string
    renameAppdataFile?: string
    renameIcon?: string
    appdataLicense?: string
    copyIcon?: boolean
    desktopFileNamePrefix?: string
    desktopFileNameSuffix?: string
  }

  export interface FlatpakBundlerBuildOptions {
    bundlePath: string
    arch: "i386" | "x86_64" | "aarch64"| "arm"
    workingDir?: string
    buildDir?: string
    repoDir?: string
    cleanTmpdirs?: boolean
    autoInstallRuntime?: boolean
    autoInstallSdk?: boolean
    autoInstallBase?: boolean
    gpgSign?: string
    gpgHomedir?: string
    subject?: string
    body?: string
    files?: [string, string][]
    symlinks?: [string, string][]
    extraExports?: any
    runtimeFlatpakref?: string
    sdkFlatpakref?: string
    baseFlatpakref?: string
    bundleRepoUrl?: string
    extraFlatpakBuilderArgs?: any
    extraFlatpakBuildExportArgs?: any
    extraFlatpakBuildBundleArgs?: any
  }

  export function bundle(manifest: FlatpakManifest, options: FlatpakBundlerBuildOptions): Promise<void>
  export function translateArch(arch: string): string
}
