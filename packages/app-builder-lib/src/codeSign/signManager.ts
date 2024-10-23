import { WindowsConfiguration } from "../options/winOptions"
import { WinPackager } from "../winPackager"

export abstract class SignManager {
  constructor(protected readonly packager: WinPackager) {}

  abstract signUsingTool(options: WindowsSignOptions): Promise<boolean>
  abstract finishSigning(): Promise<boolean>
}
export interface WindowsSignOptions {
  readonly path: string
  readonly options: WindowsConfiguration
}
