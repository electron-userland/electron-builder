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
    target[key] = value
  } else {
    target[key] = assign(prevValue, value)
  }
}

function assign(to: any, from: any) {
  if (to !== from) {
    for (const key of Object.getOwnPropertyNames(from)) {
      assignKey(to, from, key)
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
