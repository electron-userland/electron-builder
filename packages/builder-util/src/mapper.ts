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
