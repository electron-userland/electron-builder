export { CancellationToken, CancellationError } from "./CancellationToken"
export { HttpError, HttpExecutor, DownloadOptions, DigestTransform, RequestHeaders, safeGetHeader, configureRequestOptions, configureRequestOptionsFromUrl, safeStringifyJson, parseJson } from "./httpExecutor"
export { BintrayOptions, GenericServerOptions, GithubOptions, PublishConfiguration, S3Options, SpacesOptions, BaseS3Options, getS3LikeProviderBaseUrl, Publish, githubUrl, PublishProvider, AllPublishOptions } from "./publishOptions"
export { UpdateInfo, UpdateFileInfo, WindowsUpdateInfo, BlockMapDataHolder, PackageFileInfo, ReleaseNoteInfo } from "./updateInfo"
export { parseDn } from "./rfc2253Parser"
export { UUID } from "./uuid"
export { ProgressCallbackTransform, ProgressInfo } from "./ProgressCallbackTransform"
export { parseXml, XElement } from "./xml"

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