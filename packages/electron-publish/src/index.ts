import { Arch } from "builder-util"
import { CancellationToken } from "builder-util-runtime"
import { MultiProgress } from "./multiProgress"

export { BitbucketPublisher } from "./bitbucketPublisher"
export { GitHubPublisher } from "./gitHubPublisher"
export { KeygenPublisher } from "./keygenPublisher"
export { S3Publisher } from "./s3/s3Publisher"
export { SpacesPublisher } from "./s3/spacesPublisher"
export { SnapStorePublisher } from "./snapStorePublisher"

export type PublishPolicy = "onTag" | "onTagOrDraft" | "always" | "never"

export { ProgressCallback } from "./progress"

export interface PublishOptions {
  publish?: PublishPolicy | null
}

export { HttpPublisher } from "./httpPublisher"
export { getCiTag, Publisher } from "./publisher"

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
