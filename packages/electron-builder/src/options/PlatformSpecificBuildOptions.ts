import { CompressionLevel, TargetConfiguration, TargetSpecificOptions } from "../core"
import { Protocol, ReleaseInfo } from "../configuration"
import { AsarIntegrityOptions } from "asar-integrity"
import { FileAssociation } from "./FileAssociation"
import { Publish } from "builder-util-runtime"

export interface FileSet {
  /**
   * The source path relative to the project directory.
   */
  from?: string
  /**
   * The destination path relative to the app's content directory for `extraFiles` and the app's resource directory for `extraResources`.
   */
  to?: string
  /**
   * The [glob patterns](/file-patterns.md).
   */
  filter?: Array<string> | string
}

export interface AsarOptions extends AsarIntegrityOptions {
  /**
   * Whether to automatically unpack executables files.
   * @default true
   */
  smartUnpack?: boolean

  ordering?: string | null
}

export interface PlatformSpecificBuildOptions extends TargetSpecificOptions {
  /**
   * The [artifact file name template](/configuration/configuration.md#artifact-file-name-template). Defaults to `${productName}-${version}.${ext}` (some target can have other defaults, see corresponding options).
   */
  readonly artifactName?: string | null

  /**
   * The compression level. If you want to rapidly test build, `store` can reduce build time significantly. `maximum` doesn't lead to noticeable size difference, but increase build time.
   * @default normal
   */
  readonly compression?: CompressionLevel | null

  readonly files?: Array<FileSet | string> | FileSet | string | null
  readonly extraResources?: Array<FileSet | string> | FileSet | string | null
  readonly extraFiles?: Array<FileSet | string> | FileSet | string | null

  /**
   * Whether to package the application's source code into an archive, using [Electron's archive format](http://electron.atom.io/docs/tutorial/application-packaging/).
   *
   * Node modules, that must be unpacked, will be detected automatically, you don't need to explicitly set [asarUnpack](#configuration-asarUnpack) - please file an issue if this doesn't work.
   * @default true
   */
  readonly asar?: AsarOptions | boolean | null

  /**
   * A [glob patterns](/file-patterns.md) relative to the [app directory](#MetadataDirectories-app), which specifies which files to unpack when creating the [asar](http://electron.atom.io/docs/tutorial/application-packaging/) archive.
   */
  readonly asarUnpack?: Array<string> | string | null

  /** @private */
  readonly icon?: string | null

  /**
   * The file associations.
   */
  readonly fileAssociations?: Array<FileAssociation> | FileAssociation
  /**
   * The URL protocol schemes.
   */
  readonly protocols?: Array<Protocol> | Protocol

  readonly forceCodeSigning?: boolean

  publish?: Publish

  /**
   * Whether to infer update channel from application version pre-release components. e.g. if version `0.12.1-alpha.1`, channel will be set to `alpha`. Otherwise to `latest`.
   * @default true
   */
  readonly detectUpdateChannel?: boolean

  /**
   * Please see [Building and Releasing using Channels](https://github.com/electron-userland/electron-builder/issues/1182#issuecomment-324947139).
   * @default false
   */
  readonly generateUpdatesFilesForAllChannels?: boolean

  /**
   * The release info. Intended for command line usage:
   *
   * ```
   * -c.releaseInfo.releaseNotes="new features"
   * ```
   */
  readonly releaseInfo?: ReleaseInfo

  readonly target?: Array<string | TargetConfiguration> | string | TargetConfiguration | null
}
