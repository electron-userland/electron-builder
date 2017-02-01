export type PublishProvider = "github" | "bintray" | "generic"

export type Publish = string | Array<string> | PublishConfiguration | GithubOptions | BintrayOptions | GenericServerOptions | Array<PublishConfiguration> | Array<GithubOptions> | Array<GenericServerOptions> | Array<BintrayOptions> | null

/*
### `publish`

Can be specified in the [build](https://github.com/electron-userland/electron-builder/wiki/Options#build) or any platform- or target- specific options.

If `GH_TOKEN` is set — defaults to `[{provider: "github"}]`.
If `BT_TOKEN` is set and `GH_TOKEN` is not set — defaults to `[{provider: "bintray"}]`.

Array of option objects. Order is important — first item will be used as a default auto-update server on Windows (NSIS).

Amazon S3 — `https` must be used, so, if you use direct Amazon S3 endpoints, format `https://s3.amazonaws.com/bucket_name` [must be used](http://stackoverflow.com/a/11203685/1910191). And do not forget to make files/directories public.
 */
export interface PublishConfiguration {
  /*
  The provider, one of `github`, `bintray`, `generic`.
   */
  provider: PublishProvider

  /*
  The owner.
   */
  owner?: string

  token?: string
}

/*
### `publish` Generic (any https server)
 */
export interface GenericServerOptions extends PublishConfiguration {
  /*
  The base url. e.g. `https://s3.amazonaws.com/bucket_name`.  You can use `${os}` (expanded to `mac`, `linux` or `win` according to current platform) and `${arch}` macros.
   */
  url: string

  /**
  The channel. Defaults to `latest`.
   */
  channel?: string | null
}

export interface VersionInfo {
  readonly version: string
}

export interface UpdateInfo extends VersionInfo {
  readonly path: string
  readonly githubArtifactName?: string | null
  readonly sha2: string

  readonly releaseName?: string | null
  readonly releaseNotes?: string | null
  readonly releaseDate: string
}

/*
### `publish` GitHub
 */
export interface GithubOptions extends PublishConfiguration {
  /*
   The repository name. [Detected automatically](https://github.com/electron-userland/electron-builder/wiki/Publishing-Artifacts#github-repository).
   */
  repo?: string

  /*
  Whether to use `v`-prefixed tag name. Defaults to `true`.
   */
  vPrefixedTagName?: boolean
}

/*
### `publish` Bintray
 */
export interface BintrayOptions extends PublishConfiguration {
  /*
  The Bintray package name.
   */
  package?: string

  /*
   The Bintray repository name. Defaults to `generic`.
   */
  repo?: string

  /*
   The Bintray user account. Used in cases where the owner is an organization.
   */
  user?: string
}