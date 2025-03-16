import 'vitest'

type Test = typeof import('vitest')['test']

type RunIfReturnType = CustomTestMatcher2

interface CustomTestMatcher2 extends Test {
  ifNotWindows: RunIfReturnType
  ifMac: RunIfReturnType
  ifNotMac: RunIfReturnType
  ifWindows: RunIfReturnType
  ifNotCi: RunIfReturnType
  ifCi: RunIfReturnType
  ifNotCiMac: RunIfReturnType
  ifNotCiWin: RunIfReturnType
  ifDevOrWinCi: RunIfReturnType
  ifWinCi: RunIfReturnType
  ifDevOrLinuxCi: RunIfReturnType
  ifLinux: RunIfReturnType
  ifLinuxOrDevMac: RunIfReturnType
  ifAll: RunIfReturnType
  ifEnv: (envVar: any) => CustomTestMatcher
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
  interface TestAPI extends CustomTestMatcher {}
  type TestAPI = CustomTestMatcher
}

declare module '@test/vitest/vitest-test-wrapper' {
  interface TestAPI extends CustomTestMatcher2 {}
  type TestAPI = CustomTestMatcher2
}

declare global {
  const it: CustomTestMatcher
  const test: CustomTestMatcher
  const describe: typeof import('vitest')['describe']
}
