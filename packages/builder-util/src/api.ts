import { DebugLogger } from "./DebugLogger"

export interface PackageBuilder {
  readonly buildResourcesDir: string

  readonly debugLogger: DebugLogger

  readonly resourceList: Promise<Array<string>>

  getTempFile(suffix: string): Promise<string>
}