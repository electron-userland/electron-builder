export interface PackageBuilder {
  readonly buildResourcesDir: string

  readonly resourceList: Promise<Array<string>>

  getTempFile(suffix: string): Promise<string>
}