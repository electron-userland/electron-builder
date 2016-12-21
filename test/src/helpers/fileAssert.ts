import { stat, Stats } from "fs-extra-p"
import * as path from "path"
import { exists } from "out/util/fs"

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
    const info: Stats = await stat(this.actual)
    if (!info.isFile()) {
      throw new Error(`Path ${this.actual} is not a file`)
    }
  }

  async isDirectory() {
    const info: Stats = await stat(this.actual)
    if (!info.isDirectory()) {
      throw new Error(`Path ${this.actual} is not a directory`)
    }
  }

  async doesNotExist() {
    if (await exists(this.actual)) {
      throw new Error(`Path ${this.actual} must not exist`)
    }
  }

  async throws(error: string | RegExp) {
    let actualError: Error | null
    let result: any
    try {
      result = await this.actual
    }
    catch (e) {
      actualError = e
    }

    expect(() => {
      if (actualError == null) {
        return result
      }
      else {
        throw actualError
      }
    }).toThrowError(error)
  }
}