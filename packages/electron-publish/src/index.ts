import { CancellationToken } from "builder-util-runtime"
import { MultiProgress } from "./multiProgress"
import { Arch } from "builder-util"

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
