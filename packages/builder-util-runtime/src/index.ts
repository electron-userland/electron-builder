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
  hashSensitiveValue,
  HttpExecutor,
  isSensitiveFieldName,
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
export { isValidKey, mapToObject, asArray, Nullish, deepAssign, objectToArgs } from "./objects"

// nsis
export const CURRENT_APP_INSTALLER_FILE_NAME = "installer.exe"
// nsis-web
export const CURRENT_APP_PACKAGE_FILE_NAME = "package.7z"
