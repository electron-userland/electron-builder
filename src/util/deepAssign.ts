function isObject(x: any) {
  const type = typeof x
  return type === "object" || type === "function"
}

function assignKey(to: any, from: any, key: string) {
  const value = from[key]
  // https://github.com/electron-userland/electron-builder/pull/562
  if (value === undefined) {
    return
  }

  const prevValue = to[key]
  if (prevValue == null || value === null || typeof prevValue !== "object" || !isObject(value)) {
    to[key] = value
  }
  else {
    to[key] = assign(prevValue, value)
  }
}

function assign(to: any, from: any) {
  if (to !== from) {
    for (let key of Object.getOwnPropertyNames(from)) {
      assignKey(to, from, key)
    }
  }
  return to
}

export function deepAssign(target: any, ...objects: Array<any>) {
  for (let o of objects) {
    if (o != null) {
      assign(target, o)
    }
  }
  return target
}