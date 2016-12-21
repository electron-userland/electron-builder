declare module jest {
  interface It {
    ifNotWindows: jest.It
    ifMac: jest.It
    ifNotCi: jest.It
    ifCi: jest.It
    ifNotCiMac: jest.It
    ifNotCiWin: jest.It
    ifDevOrWinCi: jest.It
    ifWinCi: jest.It
    ifDevOrLinuxCi: jest.It
  }

  interface Matchers {
    toMatchObject(object: any)
  }
}