declare module jest {
  interface It {
    ifNotWindows: jest.It

    ifMac: jest.It
    ifNotMac: jest.It

    ifWindows: jest.It
    ifNotCi: jest.It
    ifCi: jest.It
    ifNotCiMac: jest.It
    ifNotCiWin: jest.It
    ifDevOrWinCi: jest.It
    ifWinCi: jest.It
    ifDevOrLinuxCi: jest.It
    ifLinux: jest.It
    ifLinuxOrDevMac: jest.It

    ifAll: jest.It
  }

  interface Describe {
    ifAll: jest.Describe
  }

  interface Matchers {
    toMatchObject(object: any)
  }
}