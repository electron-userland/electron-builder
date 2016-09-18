export type PublishProvider = "github" | "bintray"

export interface PublishConfiguration {
  provider: PublishProvider
}

export interface GithubPublishConfiguration extends PublishConfiguration {
  repo: string
  version: string
  owner: string

  vPrefixedTagName?: boolean
}