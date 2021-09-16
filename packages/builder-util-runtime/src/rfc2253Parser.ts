export function parseDn(seq: string): Map<string, string> {
  let quoted = false
  let key: string | null = null
  let token = ""
  let nextNonSpace = 0

  seq = seq.trim()
  const result = new Map<string, string>()
  for (let i = 0; i <= seq.length; i++) {
    if (i === seq.length) {
      if (key !== null) {
        result.set(key, token)
      }
      break
    }

    const ch = seq[i]
    if (quoted) {
      if (ch === '"') {
        quoted = false
        continue
      }
    } else {
      if (ch === '"') {
        quoted = true
        continue
      }

      if (ch === "\\") {
        i++
        const ord = parseInt(seq.slice(i, i + 2), 16)
        if (Number.isNaN(ord)) {
          token += seq[i]
        } else {
          i++
          token += String.fromCharCode(ord)
        }
        continue
      }

      if (key === null && ch === "=") {
        key = token
        token = ""
        continue
      }

      if (ch === "," || ch === ";" || ch === "+") {
        if (key !== null) {
          result.set(key, token)
        }
        key = null
        token = ""
        continue
      }
    }

    if (ch === " " && !quoted) {
      if (token.length === 0) {
        continue
      }

      if (i > nextNonSpace) {
        let j = i
        while (seq[j] === " ") {
          j++
        }
        nextNonSpace = j
      }

      if (
        nextNonSpace >= seq.length ||
        seq[nextNonSpace] === "," ||
        seq[nextNonSpace] === ";" ||
        (key === null && seq[nextNonSpace] === "=") ||
        (key !== null && seq[nextNonSpace] === "+")
      ) {
        i = nextNonSpace - 1
        continue
      }
    }

    token += ch
  }

  return result
}

export function compareDnToPublisher(dn: string, publisherName: string) {
  const fields = ["CN", "O", "L", "S", "C"]
  const dict1 = parseDn(dn)
  const dict2 = parseDn(publisherName)
  for (const field of fields) {
    const v1 = dict1.get(field)
    const v2 = dict2.get(field)
    if (v1 !== v2) {
      return false
    }
  }
  return true
}
