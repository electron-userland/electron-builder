export { CancellationToken, CancellationError } from "./CancellationToken"
export { HttpError, createHttpError, HttpExecutor, DownloadOptions, DigestTransform, RequestHeaders, safeGetHeader, configureRequestOptions, configureRequestOptionsFromUrl, safeStringifyJson, parseJson, configureRequestUrl } from "./httpExecutor"
export { BintrayOptions, GenericServerOptions, GithubOptions, PublishConfiguration, S3Options, SpacesOptions, BaseS3Options, getS3LikeProviderBaseUrl, githubUrl, PublishProvider, AllPublishOptions } from "./publishOptions"
export { UpdateInfo, UpdateFileInfo, WindowsUpdateInfo, BlockMapDataHolder, PackageFileInfo, ReleaseNoteInfo } from "./updateInfo"
export { parseDn } from "./rfc2253Parser"
export { UUID } from "./uuid"
export { ProgressCallbackTransform, ProgressInfo } from "./ProgressCallbackTransform"
export { parseXml, XElement } from "./xml"
export { BlockMap } from "./blockMapApi"

// nsis
export const CURRENT_APP_INSTALLER_FILE_NAME = "installer.exe"
// nsis-web
export const CURRENT_APP_PACKAGE_FILE_NAME = "package.7z"

export function asArray<T>(v: null | undefined | T | Array<T>): Array<T> {
  if (v == null) {
    return []
  }
  else if (Array.isArray(v)) {
    return v
  }
  else {
    return [v]
  }
}

export function newError(message: string, code: string) {
  const error = new Error(message);
  (error as NodeJS.ErrnoException).code = code
  return error
}