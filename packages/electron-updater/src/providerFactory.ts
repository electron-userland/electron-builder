import { AllPublishOptions, BaseS3Options, BintrayOptions, GenericServerOptions, getS3LikeProviderBaseUrl, GithubOptions, newError, PublishConfiguration } from "builder-util-runtime"
import { AppUpdater } from "./AppUpdater"
import { BintrayProvider } from "./BintrayProvider"
import { GenericProvider } from "./GenericProvider"
import { GitHubProvider } from "./GitHubProvider"
import { PrivateGitHubProvider } from "./PrivateGitHubProvider"

export function createClient(data: PublishConfiguration | AllPublishOptions, updater: AppUpdater) {
  // noinspection SuspiciousTypeOfGuard
  if (typeof data === "string") {
    throw newError("Please pass PublishConfiguration object", "ERR_UPDATER_INVALID_PROVIDER_CONFIGURATION")
  }

  const httpExecutor = updater.httpExecutor
  const provider = data.provider
  switch (provider) {
    case "github":
      const githubOptions = data as GithubOptions
      const token = (githubOptions.private ? process.env.GH_TOKEN : null) || githubOptions.token
      if (token == null) {
        return new GitHubProvider(githubOptions, updater, httpExecutor)
      }
      else {
        return new PrivateGitHubProvider(githubOptions, token, httpExecutor)
      }

    case "s3":
    case "spaces":
      return new GenericProvider({
        provider: "generic",
        url: getS3LikeProviderBaseUrl(data),
        channel: (data as BaseS3Options).channel || null
      }, updater, provider === "spaces" /* https://github.com/minio/minio/issues/5285#issuecomment-350428955 */)

    case "generic":
      return new GenericProvider(data as GenericServerOptions, updater, true)

    case "bintray":
      return new BintrayProvider(data as BintrayOptions, httpExecutor)

    default:
      throw newError(`Unsupported provider: ${provider}`, "ERR_UPDATER_UNSUPPORTED_PROVIDER")
  }
}