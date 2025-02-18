import { outputFile } from "fs-extra"
import { serializeToYaml } from "./util"
import { mapToObject } from "./mapper"

export class DebugLogger {
  readonly data = new Map<string, any>()

  constructor(readonly isEnabled = true) {}

  add(key: string, value: any) {
    if (!this.isEnabled) {
      return
    }

    const dataPath = key.split(".")
    let o = this.data
    let lastName: string | null = null
    for (const p of dataPath) {
      if (p === dataPath[dataPath.length - 1]) {
        lastName = p
        break
      } else {
        if (!o.has(p)) {
          o.set(p, new Map<string, any>())
        } else if (typeof o.get(p) === "string") {
          o.set(p, [o.get(p)])
        }
        o = o.get(p)
      }
    }

    if (Array.isArray(o.get(lastName!))) {
      o.set(lastName!, [...o.get(lastName!), value])
    } else {
      o.set(lastName!, value)
    }
  }

  save(file: string) {
    const data = mapToObject(this.data)
    // toml and json doesn't correctly output multiline string as multiline
    if (this.isEnabled && Object.keys(data).length > 0) {
      return outputFile(file, serializeToYaml(data))
    } else {
      return Promise.resolve()
    }
  }
}
