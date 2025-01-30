import 'vitest'

type Test = typeof import('vitest')['test']

interface CustomMatchers<R = unknown> {
  toMatchObject: (object: any) => R
}
interface CustomTestMatcher extends Test {
  ifNotWindows: CustomTestMatcher
  ifMac: CustomTestMatcher
  ifNotMac: CustomTestMatcher
  ifWindows: CustomTestMatcher
  ifNotCi: CustomTestMatcher
  ifCi: CustomTestMatcher
  ifNotCiMac: CustomTestMatcher
  ifNotCiWin: CustomTestMatcher
  ifDevOrWinCi: CustomTestMatcher
  ifWinCi: CustomTestMatcher
  ifDevOrLinuxCi: CustomTestMatcher
  ifLinux: CustomTestMatcher
  ifLinuxOrDevMac: CustomTestMatcher
  ifAll: CustomTestMatcher
  ifEnv: (envVar: any) => CustomTestMatcher
}

declare module 'vitest' {
  interface Assertion<T = any> extends CustomMatchers<T> {}
  interface AsymmetricMatchersContaining extends CustomMatchers {}

  interface TestAPI extends CustomTestMatcher {}
  type TestAPI = CustomTestMatcher

  // interface Describe {
  //   ifAll: vitest.Describe
  // }

  // interface Matchers {
  //   toMatchObject(object: any)
  // }
}

declare global {
  const it: CustomTestMatcher
  const test: CustomTestMatcher
  const describe: typeof import('vitest')['describe']
  const expect: typeof import('vitest')['expect']
}