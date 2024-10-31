import { Lazy } from "lazy-val";
import { WindowsSignOptions } from "./windowsCodeSign";
import { Target } from "../core";

export interface SignManager {
  readonly computedPublisherName: Lazy<Array<string> | null>
  computePublisherName(target: Target, publisherName: string | null | undefined): Promise<string>
  initializeProviderModules(): Promise<void>
  signFile(options: WindowsSignOptions): Promise<boolean>
}