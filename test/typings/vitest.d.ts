import type {
  TestAPI,
  SuiteAPI,
  TestFunction,
  SuiteFunction,
  ExpectStatic,
} from "vitest"

type MetaTest = TestFunction
type MetaSuite = SuiteFunction

interface ConditionalTestAPI extends TestAPI {
  ifMac: ConditionalTestAPI
  ifWindows: ConditionalTestAPI
  ifWindowsNative: ConditionalTestAPI
  ifLinux: ConditionalTestAPI

  ifNotMac: ConditionalTestAPI
  ifNotWindows: ConditionalTestAPI
  ifNotWindowsNative: ConditionalTestAPI
  ifNotLinux: ConditionalTestAPI

  ifEnv: (envKey: boolean | string | undefined) => ConditionalTestAPI
  ifLazyTrue: (truthy: () => boolean | Promise<boolean>) => ConditionalTestAPI

  heavy: ConditionalTestAPI
}

interface ConditionalSuiteAPI extends SuiteAPI {
  ifMac: ConditionalSuiteAPI
  ifWindows: ConditionalSuiteAPI
  ifWindowsNative: ConditionalSuiteAPI
  ifLinux: ConditionalSuiteAPI

  ifNotMac: ConditionalSuiteAPI
  ifNotWindows: ConditionalSuiteAPI
  ifNotWindowsNative: ConditionalSuiteAPI
  ifNotLinux: ConditionalSuiteAPI
  ifEnv: (envKey: boolean | string | undefined) => ConditionalSuiteAPI
  ifLazyTrue: (truthy: () => boolean | Promise<boolean>) => ConditionalSuiteAPI

  heavy: ConditionalSuiteAPI
}

interface ConditionalSkipAPI extends TestAPI["skip"] {
  ifMac: ConditionalSkipAPI
  ifWindows: ConditionalSkipAPI
  ifWindowsNative: ConditionalSkipAPI
  ifLinux: ConditionalSkipAPI

  ifNotMac: ConditionalSkipAPI
  ifNotWindows: ConditionalSkipAPI
  ifNotWindowsNative: ConditionalSkipAPI
  ifNotLinux: ConditionalSkipAPI
}

export declare const test: ConditionalTestAPI
export declare const describe: ConditionalSuiteAPI
export declare const skip: ConditionalSkipAPI
export declare const expect: ExpectStatic

declare module "vitest" {
  interface TestOptions {
    meta?: {
      platform?: "mac" | "win" | "linux"
      platformNot?: "mac" | "win" | "linux"
      ci?: boolean
      [key: string]: any
    }
  }
}

declare global {
  const it: ConditionalTestAPI
  const test: ConditionalTestAPI
  const describe: ConditionalSuiteAPI
  /** true only on native Windows (process.platform === "win32") */
  const isWindowsNative: boolean
  /** true on native Windows OR when a Windows VM (Parallels/PWSH+Wine) is available */
  const isWindows: boolean
  /** the VmManager instance if a Windows VM is available, undefined otherwise */
  const windowsVm: import("app-builder-lib/out/vm/vm").VmManager | undefined
}
