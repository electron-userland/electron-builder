import test from "ava-tf"

declare module "ava-tf" {
  namespace test {
    export const ifNotWindows: typeof test;
    export const ifOsx: typeof test;
    export const ifNotCi: typeof test;
    export const ifNotTravis: typeof test;
  }
  
  interface AssertContext {
    throws(value: (() => void) | Promise<any>, error?: ErrorValidator, message?: string): void
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
  "ifNotTravis": {
    get: function () {
      return process.env.TRAVIS ? this.skip : this
    }
  },
  "ifOsx": {
    get: function () {
      return process.platform === "darwin" ? this : this.skip
    }
  }
})

export default test