export type Nullish = null | undefined

type RecursiveMap = Map<any, RecursiveMap | any>

export function mapToObject(map: RecursiveMap) {
  const obj: any = {}
  for (const [key, value] of map) {
    if (!isValidKey(key)) {
      continue
    }
    if (value instanceof Map) {
      obj[key] = mapToObject(value)
    } else {
      obj[key] = value
    }
  }
  return obj
}

export function isValidKey(key: any) {
  const protectedProperties = ["__proto__", "prototype", "constructor"]
  if (protectedProperties.includes(key)) {
    return false
  }
  return ["string", "number", "symbol", "boolean"].includes(typeof key) || key === null
}

export function asArray<T>(v: Nullish | T | Array<T>): Array<T> {
  if (v == null) {
    return []
  } else if (Array.isArray(v)) {
    return v
  } else {
    return [v]
  }
}

function isObject(x: any) {
  if (Array.isArray(x)) {
    return false
  }

  const type = typeof x
  return type === "object" || type === "function"
}

function assignKey(target: any, from: any, key: string) {
  const value = from[key]
  // https://github.com/electron-userland/electron-builder/pull/562
  if (value === undefined) {
    return
  }

  const prevValue = target[key]
  if (prevValue == null || value == null || !isObject(prevValue) || !isObject(value)) {
    // Merge arrays.
    if (Array.isArray(prevValue) && Array.isArray(value)) {
      target[key] = Array.from(new Set(prevValue.concat(value)))
    } else {
      target[key] = value
    }
  } else {
    target[key] = assign(prevValue, value)
  }
}

function assign(to: any, from: any) {
  if (to !== from) {
    for (const key of Object.getOwnPropertyNames(from)) {
      if (isValidKey(key)) {
        assignKey(to, from, key)
      }
    }
  }
  return to
}

export function deepAssign<T>(target: T, ...objects: Array<any>): T {
  for (const o of objects) {
    if (o != null) {
      assign(target, o)
    }
  }
  return target
}

// Flag names must be letters/digits/hyphens only (e.g. "maintainer", "deb-priority").
// Anything else could inject extra flags into the argument array.
const SAFE_FLAG_NAME_RE = /^[a-zA-Z][a-zA-Z0-9-]*$/

// Null bytes truncate arguments at the C layer; newlines can split arguments in some parsers.
const UNSAFE_VALUE_RE = /[\0\r\n]/

export function objectToArgs(obj: Record<string, string | null>): readonly string[] {
  const args = Object.entries(obj).reduce<string[]>((args, [name, value]) => {
    if (!isValidKey(name) || value == null) {
      return args
    }
    if (!SAFE_FLAG_NAME_RE.test(name)) {
      throw new Error(`objectToArgs: unsafe flag name rejected: ${JSON.stringify(name)}`)
    }
    if (UNSAFE_VALUE_RE.test(value)) {
      throw new Error(`objectToArgs: value for --${name} contains a null byte or newline`)
    }
    return args.concat([`--${name}`, value])
  }, [])
  return Object.freeze(args)
}
