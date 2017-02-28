import { exists } from "electron-builder-util/out/fs"
import { lstat, stat } from "fs-extra-p"
import * as path from "path"

// http://joel-costigliola.github.io/assertj/
export function assertThat(actual: any): Assertions {
  return new Assertions(actual)
}

class Assertions {
  constructor (private actual: any) {
  }

  containsAll<T>(expected: Iterable<T>) {
    expect(this.actual.slice().sort()).toEqual(Array.from(expected).slice().sort())
  }

  isAbsolute() {
    if (!path.isAbsolute(this.actual)) {
      throw new Error(`Path ${this.actual} is not absolute`)
    }
  }

  async isFile() {
    const info = await stat(this.actual)
    if (!info.isFile()) {
      throw new Error(`Path ${this.actual} is not a file`)
    }
  }

  async isSymbolicLink() {
    const info = await lstat(this.actual)
    if (!info.isSymbolicLink()) {
      throw new Error(`Path ${this.actual} is not a symlink`)
    }
  }

  async isDirectory() {
    const info = await stat(this.actual)
    if (!info.isDirectory()) {
      throw new Error(`Path ${this.actual} is not a directory`)
    }
  }

  async doesNotExist() {
    if (await exists(this.actual)) {
      throw new Error(`Path ${this.actual} must not exist`)
    }
  }

  async throws() {
    let actualError: Error | null
    let result: any
    try {
      result = await this.actual
    }
    catch (e) {
      actualError = e
    }

    let m
    if (actualError == null) {
      m = result
    }
    else {
      m = actualError.message

      if (m.includes("HttpError: ") && m.indexOf("\n") > 0) {
        m = m.substring(0, m.indexOf("\n"))
      }

      if (m.startsWith("Cannot find specified resource")) {
        m = m.substring(0, m.indexOf(","))
      }

      m = m.replace(/\((C:)?(\/|\\)[^(]+(\/|\\)([^(\/\\]+)\)/g, `(<path>/$4)`)
      m = m.replace(/"(C:)?(\/|\\)[^"]+(\/|\\)([^"\/\\]+)"/g, `"<path>/$4"`)
      m = m.replace(/'(C:)?(\/|\\)[^']+(\/|\\)([^'\/\\]+)'/g, `'<path>/$4'`)
    }
    expect(m).toMatchSnapshot()
  }
}