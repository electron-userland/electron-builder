import { test as baseTest, describe as baseDescribe, expect } from "vitest"
import { ConditionalSuiteAPI, ConditionalTestAPI } from "../typings/vitest"

const isWindows = process.platform === "win32"
const isMac = process.platform === "darwin"
const isLinux = process.platform === "linux"

type Meta = Record<string, any>

function copyProps(to: any, from: any) {
  for (const key of Reflect.ownKeys(from)) {
    if (key === "length" || key === "name") {
      continue
    }
    if (key in to) {
      continue
    }
    const d = Object.getOwnPropertyDescriptor(from, key)
    if (d) {
      Object.defineProperty(to, key, d)
    }
  }
}

function createChainable(baseFn: any, meta: Meta = {}, shouldSkip = false): any {
  const wrapped: any = (name: string, ...rest: any[]) => {
    const target = shouldSkip ? baseFn.skip : baseFn

    const body = rest.pop()
    const options = typeof rest[0] === "object" ? rest[0] : {}

    const finalMeta = { ...(options.meta ?? {}), ...meta }

    // Important: Pass through ALL options including timeout, retries, etc.
    // Don't wrap the body - let vitest-heavy-mutex.ts handle mutex via hooks
    const finalOptions = { ...options, meta: finalMeta }

    return target(name, finalOptions, body)
  }

  copyProps(wrapped, baseFn)

  const chain = (metaAdd: Meta, skipAdd: boolean) => createChainable(baseFn, { ...meta, ...metaAdd }, shouldSkip || skipAdd)

  const add = (prop: string, metaAdd: Meta, skipAdd: boolean) => {
    if (Object.prototype.hasOwnProperty.call(wrapped, prop)) {
      return
    }

    Object.defineProperty(wrapped, prop, {
      enumerable: true,
      configurable: false,
      get: () => chain(metaAdd, skipAdd),
    })
  }

  // Custom operators
  add("heavy", { heavy: true }, false)

  add("ifMac", { platform: "mac" }, !isMac)
  add("ifNotMac", { platformNot: "mac" }, isMac)

  add("ifWindows", { platform: "win" }, !isWindows)
  add("ifNotWindows", { platformNot: "win" }, isWindows)

  add("ifLinux", { platform: "linux" }, !isLinux)
  add("ifNotLinux", { platformNot: "linux" }, isLinux)

  wrapped.ifEnv = (envKey: boolean | string | undefined) => {
    let condition = false
    if (typeof envKey === "boolean") {
      condition = envKey
    } else if (typeof envKey === "string") {
      const v = process.env[envKey]
      condition = !!v && v !== "0" && v.toLowerCase() !== "false"
    }
    return chain({ envCondition: true }, !condition)
  }

  wrapped.ifLazyTrue = async (fn: () => boolean | Promise<boolean>) => {
    const condition = await fn()
    return chain({ lazyCondition: true }, !condition)
  }

  return wrapped
}

export const test: ConditionalTestAPI = createChainable(baseTest)
export const describe: ConditionalSuiteAPI = createChainable(baseDescribe)
export const skip: ConditionalTestAPI = createChainable(baseTest.skip)

// Make test available globally for compatibility
;(globalThis as any).test = test
;(globalThis as any).it = test
;(globalThis as any).describe = describe

export { expect }
