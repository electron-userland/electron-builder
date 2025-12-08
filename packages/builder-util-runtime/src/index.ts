export { BlockMap } from "./blockMapApi"
export { CancellationError, CancellationToken } from "./CancellationToken"
export { newError } from "./error"
export {
  configureRequestOptions,
  configureRequestOptionsFromUrl,
  configureRequestUrl,
  createHttpError,
  DigestTransform,
  DownloadOptions,
  HttpError,
  HttpExecutor,
  parseJson,
  RequestHeaders,
  safeGetHeader,
  safeStringifyJson,
} from "./httpExecutor"
export { MemoLazy } from "./MemoLazy"
export { ProgressCallbackTransform, ProgressInfo } from "./ProgressCallbackTransform"
export {
  AllPublishOptions,
  BaseS3Options,
  BitbucketOptions,
  CustomPublishOptions,
  GenericServerOptions,
  getS3LikeProviderBaseUrl,
  GithubOptions,
  githubUrl,
  githubTagPrefix,
  GitlabOptions,
  KeygenOptions,
  PublishConfiguration,
  PublishProvider,
  S3Options,
  SnapStoreOptions,
  SpacesOptions,
  GitlabReleaseInfo,
  GitlabReleaseAsset,
} from "./publishOptions"
export { retry } from "./retry"
export { parseDn } from "./rfc2253Parser"
export { BlockMapDataHolder, PackageFileInfo, ReleaseNoteInfo, UpdateFileInfo, UpdateInfo, WindowsUpdateInfo } from "./updateInfo"
export { UUID } from "./uuid"
export { parseXml, XElement } from "./xml"

// nsis
export const CURRENT_APP_INSTALLER_FILE_NAME = "installer.exe"
// nsis-web
export const CURRENT_APP_PACKAGE_FILE_NAME = "package.7z"

export function asArray<T>(v: Nullish | T | Array<T>): Array<T> {
  if (v == null) {
    return []
  } else if (Array.isArray(v)) {
    return v
  } else {
    return [v]
  }
}

export type Nullish = null | undefined
