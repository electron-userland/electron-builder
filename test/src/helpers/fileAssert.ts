import { exists, statOrNull } from "builder-util"
import * as fs from "fs/promises"
import * as path from "path"
import { ExpectStatic } from "vitest"

// http://joel-costigliola.github.io/assertj/
export function assertThat(expect: ExpectStatic, actual: any): Assertions {
  return new Assertions(expect, actual)
}

const appVersion = require(path.join(__dirname, "../../../packages/app-builder-lib/package.json")).version

class Assertions {
  constructor(
    private readonly expect: ExpectStatic,
    private actual: any
  ) {}

  containsAll<T>(expected: Iterable<T>) {
    this.expect(this.actual.slice().sort()).toEqual(Array.from(expected).slice().sort())
  }

  isAbsolute() {
    if (!path.isAbsolute(this.actual)) {
      throw new Error(`Path ${this.actual} is not absolute`)
    }
  }

  async isFile() {
    const info = await statOrNull(this.actual)
    if (info == null) {
      throw new Error(`Path ${this.actual} doesn't exist`)
    }
    if (!info.isFile()) {
      throw new Error(`Path ${this.actual} is not a file`)
    }
  }

  async isSymbolicLink() {
    const info = await fs.lstat(this.actual)
    if (!info.isSymbolicLink()) {
      throw new Error(`Path ${this.actual} is not a symlink`)
    }
  }

  async isDirectory() {
    const file = this.actual
    const info = await statOrNull(file)
    if (info == null) {
      throw new Error(`Path ${file} doesn't exist`)
    }
    if (!info.isDirectory()) {
      throw new Error(`Path ${file} is not a directory`)
    }
  }

  async doesNotExist() {
    if (await exists(this.actual)) {
      throw new Error(`Path ${this.actual} must not exist`)
    }
  }

  async throws(customErrorAssert?: (error: Error) => void) {
    let actualError: Error | null = null
    let result: any
    try {
      result = await this.actual
    } catch (e: any) {
      actualError = e
    }

    let m: any
    if (actualError == null) {
      m = result
    } else {
      m = (actualError as NodeJS.ErrnoException).code || actualError.message

      if (m.includes("HttpError: ") && m.indexOf("\n") > 0) {
        m = m.substring(0, m.indexOf("\n"))
      }

      if (m.startsWith("Cannot find specified resource")) {
        m = m.substring(0, m.indexOf(","))
      }

      m = m.replace(appVersion, "<appVersion>")
      m = m.replace(/\((C:)?([\/\\])[^(]+([\/\\])([^(\/\\]+)\)/g, `(<path>/$4)`)
      m = m.replace(/"(C:)?([\/\\])[^"]+([\/\\])([^"\/\\]+)"/g, `"<path>/$4"`)
      m = m.replace(/'(C:)?([\/\\])[^']+([\/\\])([^'\/\\]+)'/g, `'<path>/$4'`)
    }
    try {
      if (customErrorAssert == null) {
        this.expect(m).toMatchSnapshot()
      } else {
        customErrorAssert(actualError!)
      }
    } catch (matchError: any) {
      throw new Error(matchError + " " + actualError?.message)
    }
  }
}
