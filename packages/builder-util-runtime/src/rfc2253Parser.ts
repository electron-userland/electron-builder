const strictUtf8Decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true })

function utf8SequenceLength(leadByte: number): number {
  if (leadByte < 0x80) {
    return 1
  }
  if (leadByte >= 0xc2 && leadByte <= 0xdf) {
    return 2
  }
  if (leadByte >= 0xe0 && leadByte <= 0xef) {
    return 3
  }
  if (leadByte >= 0xf0 && leadByte <= 0xf4) {
    return 4
  }
  return 0
}

function tryDecodeUtf8(bytes: Buffer): string | null {
  try {
    return strictUtf8Decoder.decode(bytes)
  } catch {
    return null
  }
}

// decode each valid UTF-8 sequence as UTF-8, and any other byte (e.g. a single-byte \FC) as a Latin-1 character
function decodeEscapedBytes(bytes: Buffer): string {
  let result = ""
  let i = 0
  while (i < bytes.length) {
    const length = utf8SequenceLength(bytes[i])
    const decoded = length === 0 || i + length > bytes.length ? null : tryDecodeUtf8(bytes.subarray(i, i + length))
    if (decoded == null) {
      result += String.fromCharCode(bytes[i])
      i++
    } else {
      result += decoded
      i += length
    }
  }
  return result
}

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
        // a run of \XX hex pairs is the UTF-8 encoding of the escaped characters
        const hexPairs = /^(?:\\[0-9a-fA-F]{2})+/.exec(seq.slice(i))
        if (hexPairs == null) {
          i++
          token += seq[i]
        } else {
          i += hexPairs[0].length - 1
          token += decodeEscapedBytes(Buffer.from(hexPairs[0].replace(/\\/g, ""), "hex"))
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
