import test from "ava-tf"

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