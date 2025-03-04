import 'vitest'

type Test = typeof import('vitest')['test']

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
  interface TestAPI extends CustomTestMatcher {}
  type TestAPI = CustomTestMatcher
}

declare global {
  const it: CustomTestMatcher
  const test: CustomTestMatcher
  const describe: typeof import('vitest')['describe']
}
