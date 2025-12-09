import { Arch } from "builder-util"
import { CancellationToken } from "builder-util-runtime"
<<<<<<< HEAD
import { MultiProgress } from "./multiProgress.js"
=======
import { MultiProgress } from "./multiProgress.js.js"
>>>>>>> 5a5d2b7d9 (tmp save for .js extension migration)

export { MultiProgress }
export { ProgressBar } from "./progress.js"

export { BitbucketPublisher } from "./bitbucketPublisher.js"
export { GitHubPublisher } from "./gitHubPublisher.js"
export { GitlabPublisher } from "./gitlabPublisher.js"
export { KeygenPublisher } from "./keygenPublisher.js"
export { S3Publisher } from "./s3/s3Publisher.js"
export { SpacesPublisher } from "./s3/spacesPublisher.js"
export { SnapStorePublisher, resolveSnapCredentials } from "./snapStorePublisher.js"

export type PublishPolicy = "onTag" | "onTagOrDraft" | "always" | "never"

export { ProgressCallback } from "./progress.js"

export interface PublishOptions {
  publish?: PublishPolicy | null
}

export { HttpPublisher } from "./httpPublisher.js"
export { getCiTag, Publisher } from "./publisher.js"

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
