import { AllPublishOptions, BaseS3Options, BintrayOptions, GenericServerOptions, getS3LikeProviderBaseUrl, GithubOptions, newError, PublishConfiguration } from "builder-util-runtime"
import { Provider } from "./main"
import { AppUpdater } from "./AppUpdater"
import { BintrayProvider } from "./BintrayProvider"
import { GenericProvider } from "./GenericProvider"
import { GitHubProvider } from "./GitHubProvider"
import { PrivateGitHubProvider } from "./PrivateGitHubProvider"

export type ProviderFactoryFunction = (data: PublishConfiguration | AllPublishOptions, updater: AppUpdater) => Provider<any>

interface ProviderFactoryList {
  [key: string]: ProviderFactoryFunction
}

const providerList: ProviderFactoryList = {
  github: createGitHubProvider,
  spaces: createSpacesOrS3Provider,
  s3: createSpacesOrS3Provider,
  generic: createGenericProvider,
  bintray: createBinTrayProvider
}

export function createClient(data: PublishConfiguration | AllPublishOptions, updater: AppUpdater): Provider<any> {
  // noinspection SuspiciousTypeOfGuard
  if (typeof data === "string") {
    throw newError("Please pass PublishConfiguration object", "ERR_UPDATER_INVALID_PROVIDER_CONFIGURATION")
  }

  const providerFactoryFunction = providerList[data.provider]
  if (!providerFactoryFunction) {
    throw newError(`Unsupported provider: ${data.provider}`, "ERR_UPDATER_UNSUPPORTED_PROVIDER")
  }
  return providerFactoryFunction(data, updater)
}

export function registerProviderType(name: string, factoryMethod: ProviderFactoryFunction) {
  if (!providerList[name]) {
    throw newError(`Provider name ${name} is already registered`, "ERR_PROVIDER_NAME_COLLISION")
  }
  providerList[name] = factoryMethod
}

export function unregisterProviderType(name: string) {
  delete providerList[name]
}

function createGitHubProvider(data: PublishConfiguration | AllPublishOptions, updater: AppUpdater) {
  const githubOptions = data as GithubOptions
  const token = (githubOptions.private ? process.env.GH_TOKEN || process.env.GITHUB_TOKEN : null) || githubOptions.token
  if (token == null) {
    return new GitHubProvider(githubOptions, updater, updater.httpExecutor)
  }
  else {
    return new PrivateGitHubProvider(githubOptions, token, updater.httpExecutor)
  }
}

function createSpacesOrS3Provider(data: PublishConfiguration | AllPublishOptions, updater: AppUpdater) {
  if (typeof data === "string") {
    throw newError("Please pass PublishConfiguration object", "ERR_UPDATER_INVALID_PROVIDER_CONFIGURATION")
  }

  return new GenericProvider({
    provider: "generic",
    url: getS3LikeProviderBaseUrl(data),
    channel: (data as BaseS3Options).channel || null
  }, updater, data.provider === "spaces" /* https://github.com/minio/minio/issues/5285#issuecomment-350428955 */)
}

function createGenericProvider(data: PublishConfiguration | AllPublishOptions, updater: AppUpdater) {
  const options = data as GenericServerOptions
  return new GenericProvider(options, updater, options.useMultipleRangeRequest !== false && !options.url.includes("s3.amazonaws.com"))
}

function createBinTrayProvider(data: PublishConfiguration | AllPublishOptions, updater: AppUpdater) {
  return new BintrayProvider(data as BintrayOptions, updater.httpExecutor)
}
