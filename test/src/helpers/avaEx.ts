import test from "ava-tf"

/* tslint:disable:no-invalid-this no-namespace */

declare module "ava-tf" {
  namespace test {
    export const ifNotWindows: typeof test
    export const ifOsx: typeof test
    export const ifNotCi: typeof test
    export const ifCi: typeof test
    export const ifNotCiOsx: typeof test
    export const ifDevOrWinCi: typeof test
    export const ifWinCi: typeof test
    export const ifDevOrLinuxCi: typeof test
    export const ifNotTravis: typeof test
  }
}

Object.defineProperties(test, {
  "ifNotWindows": {
    get: function () {
      return process.platform === "win32" ? this.skip : this
    }
  },
  "ifNotCi": {
    get: function () {
      return process.env.CI ? this.skip : this
    }
  },
  "ifCi": {
    get: function () {
      return process.env.CI ? this : this.skip
    }
  },
  "ifNotCiOsx": {
    get: function () {
      return process.env.CI && process.platform === "darwin" ? this.skip : this
    }
  },
  "ifNotTravis": {
    get: function () {
      return process.env.TRAVIS ? this.skip : this
    }
  },
  "ifOsx": {
    get: function () {
      return process.platform === "darwin" ? this : this.skip
    }
  },
  "ifDevOrWinCi": {
    get: function () {
      return process.env.CI == null || process.platform === "win32" ? this : this.skip
    }
  },
  "ifDevOrLinuxCi": {
    get: function () {
      return process.env.CI == null || process.platform === "linux" ? this : this.skip
    }
  },
  "ifWinCi": {
    get: function () {
      return (process.env.CI || "").toLowerCase() === "true" && process.platform === "win32" ? this : this.skip
    }
  }
})

export default test