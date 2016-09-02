export type PublishPolicy = "onTag" | "onTagOrDraft" | "always" | "never"

export interface PublishOptions {
  publish?: PublishPolicy | null
  githubToken?: string | null
  bintrayToken?: string | null

  draft?: boolean
  prerelease?: boolean
}

export interface Publisher {
  upload(file: string, artifactName?: string): Promise<any>
}