import { AllPublishOptions, BaseS3Options, BintrayOptions, GenericServerOptions, getS3LikeProviderBaseUrl, GithubOptions, newError, PublishConfiguration, S3Options } from "builder-util-runtime"
import { AppUpdater } from "./AppUpdater"
import { BintrayProvider } from "./providers/BintrayProvider"
import { GenericProvider } from "./providers/GenericProvider"
import { GitHubProvider } from "./providers/GitHubProvider"
import { PrivateGitHubProvider } from "./providers/PrivateGitHubProvider"
import { Provider, ProviderRuntimeOptions } from "./providers/Provider"
import { S3Provider } from "./providers/S3Provider"

export function isUrlProbablySupportMultiRangeRequests(url: string): boolean {
  return !url.includes("s3.amazonaws.com")
}

export function createClient(data: PublishConfiguration | AllPublishOptions, updater: AppUpdater, runtimeOptions: ProviderRuntimeOptions): Provider<any> {
  // noinspection SuspiciousTypeOfGuard
  if (typeof data === "string") {
    throw newError("Please pass PublishConfiguration object", "ERR_UPDATER_INVALID_PROVIDER_CONFIGURATION")
  }

  const provider = data.provider
  switch (provider) {
    case "github": {
      const githubOptions = data as GithubOptions
      const token = (githubOptions.private ? process.env.GH_TOKEN || process.env.GITHUB_TOKEN : null) || githubOptions.token
      if (token == null) {
        return new GitHubProvider(githubOptions, updater, runtimeOptions)
      }
      else {
        return new PrivateGitHubProvider(githubOptions, updater, token, runtimeOptions)
      }
    }

    case "s3":
      return new S3Provider({
        bucket: (data as S3Options).bucket,
        region: (data as S3Options).region,
        endpoint: (data as S3Options).endpoint,
        channel: (data as S3Options).channel || null,
        path: (data as S3Options).path,
        awsAccessKeyId: process.env.AUTOUPDATER_AWS_ACCESS_KEY_ID,
        awsSecretAccessKey: process.env.AUTOUPDATER_AWS_SECRET_ACCESS_KEY,
      }, updater, runtimeOptions)

    case "spaces":
      return new GenericProvider({
        provider: "generic",
        url: getS3LikeProviderBaseUrl(data),
        channel: (data as BaseS3Options).channel || null
      }, updater, {
        ...runtimeOptions,
        // https://github.com/minio/minio/issues/5285#issuecomment-350428955
        isUseMultipleRangeRequest: false,
      })

    case "generic": {
      const options = data as GenericServerOptions
      return new GenericProvider(options, updater, {
        ...runtimeOptions,
        isUseMultipleRangeRequest: options.useMultipleRangeRequest !== false && isUrlProbablySupportMultiRangeRequests(options.url),
      })
    }

    case "bintray":
      return new BintrayProvider(data as BintrayOptions, runtimeOptions)

    default:
      throw newError(`Unsupported provider: ${provider}`, "ERR_UPDATER_UNSUPPORTED_PROVIDER")
  }
}