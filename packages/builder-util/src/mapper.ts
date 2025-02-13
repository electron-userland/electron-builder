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

export function isValidKey(value: any) {
  if (["string", "number", "symbol", "boolean"].includes(typeof value)) {
    const protectedProperties = ["__proto__", "prototype", "constructor"]
    return !protectedProperties.includes(value)
  }
  return value === null
}
