export { BlockMap, BlockMapFile } from "./blockMapApi.js"
export { CancellationError, CancellationToken } from "./CancellationToken.js"
export { newError } from "./error.js"
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
} from "./httpExecutor.js"
export { MemoLazy } from "./MemoLazy.js"
export { ProgressCallbackTransform, ProgressInfo } from "./ProgressCallbackTransform.js"
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
} from "./publishOptions.js"
export { retry } from "./retry.js"
export { parseDn } from "./rfc2253Parser.js"
export { BlockMapDataHolder, PackageFileInfo, ReleaseNoteInfo, UpdateFileInfo, UpdateInfo, WindowsUpdateInfo } from "./updateInfo.js"
export { UUID } from "./uuid.js"
export { parseXml, XElement } from "./xml.js"

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
