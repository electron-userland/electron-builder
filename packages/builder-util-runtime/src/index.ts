export { CancellationToken, CancellationError } from "./CancellationToken"
export {
  HttpError,
  createHttpError,
  HttpExecutor,
  DownloadOptions,
  DigestTransform,
  RequestHeaders,
  safeGetHeader,
  configureRequestOptions,
  configureRequestOptionsFromUrl,
  safeStringifyJson,
  parseJson,
  configureRequestUrl,
} from "./httpExecutor"
export {
  CustomPublishOptions,
  GenericServerOptions,
  GithubOptions,
  KeygenOptions,
  BitbucketOptions,
  SnapStoreOptions,
  PublishConfiguration,
  S3Options,
  SpacesOptions,
  BaseS3Options,
  getS3LikeProviderBaseUrl,
  githubUrl,
  PublishProvider,
  AllPublishOptions,
} from "./publishOptions"
export { UpdateInfo, UpdateFileInfo, WindowsUpdateInfo, BlockMapDataHolder, PackageFileInfo, ReleaseNoteInfo } from "./updateInfo"
export { parseDn } from "./rfc2253Parser"
export { UUID } from "./uuid"
export { ProgressCallbackTransform, ProgressInfo } from "./ProgressCallbackTransform"
export { parseXml, XElement } from "./xml"
export { BlockMap } from "./blockMapApi"
export { newError } from "./error"
export { MemoLazy } from "./MemoLazy"
export { retry } from "./retry"

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

export type ObjectMap<ValueType> = { [key: string]: ValueType }
