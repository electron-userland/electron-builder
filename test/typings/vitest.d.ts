declare module vitest {
  interface TestAPI {
    ifNotWindows: vitest.TestAPI

    ifMac: vitest.TestAPI
    ifNotMac: vitest.TestAPI

    ifWindows: vitest.TestAPI
    ifNotCi: vitest.TestAPI
    ifCi: vitest.TestAPI
    ifNotCiMac: vitest.TestAPI
    ifNotCiWin: vitest.TestAPI
    ifDevOrWinCi: vitest.TestAPI
    ifWinCi: vitest.TestAPI
    ifDevOrLinuxCi: vitest.TestAPI
    ifLinux: vitest.TestAPI
    ifLinuxOrDevMac: vitest.TestAPI

    ifAll: vitest.TestAPI

    ifEnv: (envVar: any) => vitest.TestAPI
  }

  interface Describe {
    ifAll: vitest.Describe
  }

  interface Matchers {
    toMatchObject(object: any)
  }
}