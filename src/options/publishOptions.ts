export type PublishProvider = "github" | "bintray"

/*
### `.build.publish`

Can be specified in [build](https://github.com/electron-userland/electron-builder/wiki/Options#build) or any platform- or target- specific options.
Please see [Publishing Artifacts](https://github.com/electron-userland/electron-builder/wiki/Publishing-Artifacts).

Array of option objects.
 */
export interface PublishConfiguration {
  /*
  The provider, one of `github`, `bintray`.
   */
  provider: PublishProvider

  /*
  The owner.
   */
  owner?: string

  token?: string
}

/*
### `.build.publish` GitHub
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
### `.build.publish` Bintray
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
   The Bintray user account.  Used in cases where the owner is an organization.
   */
  user?: string
}