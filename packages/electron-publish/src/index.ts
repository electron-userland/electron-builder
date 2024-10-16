import { CancellationToken } from "builder-util-runtime"
import { MultiProgress } from "./multiProgress"
import { Arch } from "builder-util"

export { SpacesPublisher } from "./s3/spacesPublisher"
export { KeygenPublisher } from "./keygenPublisher"
export { SnapStorePublisher } from "./snapStorePublisher"
export { S3Publisher } from "./s3/s3Publisher"
export { GitHubPublisher } from "./gitHubPublisher"
export { BitbucketPublisher } from "./bitbucketPublisher"

export type PublishPolicy = "onTag" | "onTagOrDraft" | "always" | "never"

export { ProgressCallback } from "./progress"

export interface PublishOptions {
  publish?: PublishPolicy | null
}

export { Publisher, getCiTag } from "./publisher"
export { HttpPublisher } from "./httpPublisher"

export interface PublishContext {
  readonly cancellationToken: CancellationToken
  readonly progress: MultiProgress | null
}

export interface UploadTask {
  file: string
  fileContent?: Buffer | null

  arch: Arch | null
  safeArtifactName?: string | null
  timeout?: number | null
}
