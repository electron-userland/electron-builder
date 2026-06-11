import type {
  TestAPI,
  SuiteAPI,
  TestFunction,
  SuiteFunction,
  ExpectStatic,
} from "vitest"

type MetaTest = TestFunction
type MetaSuite = SuiteFunction

export interface ConditionalChainProps<T> {
  readonly ifMac: T
  readonly ifWindows: T
  readonly ifLinux: T
  readonly ifNotMac: T
  readonly ifNotWindows: T
  readonly ifNotLinux: T
  readonly heavy: T
}

interface ConditionalTestAPI extends TestAPI, ConditionalChainProps<ConditionalTestAPI> {
  ifEnv: (envKey: boolean | string | undefined) => ConditionalTestAPI
  ifLazyTrue: (truthy: () => boolean | Promise<boolean>) => ConditionalTestAPI
}

interface ConditionalSuiteAPI extends SuiteAPI, ConditionalChainProps<ConditionalSuiteAPI> {
  ifEnv: (envKey: boolean | string | undefined) => ConditionalSuiteAPI
  ifLazyTrue: (truthy: () => boolean | Promise<boolean>) => ConditionalSuiteAPI
}

interface ConditionalSkipAPI extends TestAPI["skip"] {
  ifMac: ConditionalSkipAPI
  ifWindows: ConditionalSkipAPI
  ifLinux: ConditionalSkipAPI

  ifNotMac: ConditionalSkipAPI
  ifNotWindows: ConditionalSkipAPI
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
}
