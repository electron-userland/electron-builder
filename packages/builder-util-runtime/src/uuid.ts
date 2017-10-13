import { createHash, randomBytes } from "crypto"

// error codes
const invalidNamespace =
  "options.namespace must be a string or a Buffer " +
  "containing a valid UUID, or a UUID object"

const invalidName =
  "options.name must be either a string or a Buffer"

const moreThan10000 =
  "can not generate more than 10000 UUIDs per second"

// Node ID according to rfc4122#section-4.5
const randomHost = randomBytes(16)
randomHost[0] = randomHost[0] | 0x01

// randomize clockSeq initially, as per rfc4122#section-4.1.5
const seed = randomBytes(2)
let clockSeq = (seed[0] | (seed[1] << 8)) & 0x3fff

// clock values
let lastMTime = 0
let lastNTime = 0

// lookup table hex to byte
const hex2byte: any = {}

// lookup table byte to hex
const byte2hex: Array<string> = []
// populate lookup tables
for (let i = 0; i < 256; i++) {
    const hex = (i + 0x100).toString(16).substr(1)
    hex2byte[hex] = i
    byte2hex[i] = hex
}

// UUID class
export class UUID {
  private ascii: string | null
  private binary: Buffer
  private version: number

  // from rfc4122#appendix-C
  static readonly DNS = new UUID("6ba7b810-9dad-11d1-80b4-00c04fd430c8")
  static readonly URL = new UUID("6ba7b811-9dad-11d1-80b4-00c04fd430c8")
  static readonly OID = new UUID("6ba7b812-9dad-11d1-80b4-00c04fd430c8")
  static readonly X500 = new UUID("6ba7b814-9dad-11d1-80b4-00c04fd430c8")

  constructor(uuid: Buffer | string) {
    const check = UUID.check(uuid)
    if (!check) {
      throw new Error("not a UUID")
    }

    this.version = check.version!!

    if (check.format === "ascii") {
      this.ascii = uuid as string
    }
    else {
      this.binary = uuid as Buffer
    }
  }

  static v1() {
    return uuidTimeBased(randomHost)
  }

  static v5(name: string | Buffer, namespace: string | Buffer | UUID) {
    return uuidNamed(name, "sha1", 0x50, namespace)
  }

  toString() {
    if (this.ascii == null) {
      this.ascii = stringify(this.binary)
    }
    return this.ascii
  }

  toBuffer() {
    if (this.binary == null) {
      this.binary = UUID.parse(this.ascii!!)
    }
    return Buffer.from(this.binary)
  }

  inspect() {
    return `UUID v${this.version} ${this.toString()}`
  }

  static check(uuid: Buffer | string, offset: number = 0) {
    if (typeof uuid === "string") {
      uuid = uuid.toLowerCase()

      if (!/^[a-f0-9]{8}(\-[a-f0-9]{4}){3}\-([a-f0-9]{12})$/.test(uuid)) {
        return false
      }

      if (uuid === "00000000-0000-0000-0000-000000000000") {
        return {version: undefined, variant: "nil", format: "ascii"}
      }

      return {
        version: (hex2byte[uuid[14] + uuid[15]] & 0xf0) >> 4,
        variant: getVariant((hex2byte[uuid[19] + uuid[20]] & 0xe0) >> 5),
        format: "ascii"
      }
    }

    if (Buffer.isBuffer(uuid)) {
      if (uuid.length < offset + 16) {
        return false
      }

      let i = 0
      for (; i < 16; i++) {
        if (uuid[offset + i] !== 0) {
          break
        }
      }
      if (i === 16) {
        return {version: undefined, variant: "nil", format: "binary"}
      }

      return {
        version: (uuid[offset + 6] & 0xf0) >> 4,
        variant: getVariant((uuid[offset + 8] & 0xe0) >> 5),
        format: "binary"
      }
    }

    throw new Error("Unknown type of uuid")
  }

  // read stringified uuid into a Buffer
  static parse(input: string) {
    const buffer = Buffer.allocUnsafe(16)
    let j = 0
    for (let i = 0; i < 16; i++) {
      buffer[i] = hex2byte[input[j++] + input[j++]]
      if (i === 3 || i === 5 || i === 7 || i === 9) {
        j += 1
      }
    }
    return buffer
  }
}

// according to rfc4122#section-4.1.1
function getVariant(bits: number) {
    switch (bits) {
        case 0: case 1: case 3:
            return "ncs"
        case 4: case 5:
            return "rfc4122"
        case 6:
            return "microsoft"
        default:
            return "future"
    }
}

export interface UuidOptions {
  encoding?: string

  name?: string

  namespace?: string | UUID | Buffer
}

enum UuidEncoding {
  ASCII, BINARY, OBJECT
}

// v1
function uuidTimeBased(nodeId: Buffer, encoding: UuidEncoding = UuidEncoding.ASCII) {
  let mTime = Date.now()
  let nTime = lastNTime + 1
  const delta = (mTime - lastMTime) + (nTime - lastNTime) / 10000

  if (delta < 0) {
    clockSeq = (clockSeq + 1) & 0x3fff
    nTime = 0
  }
  else if (mTime > lastMTime) {
    nTime = 0
  }
  else if (nTime >= 10000) {
    return moreThan10000
  }

  lastMTime = mTime
  lastNTime = nTime

  // unix timestamp to gregorian epoch as per rfc4122#section-4.5
  mTime += 12219292800000

  const buffer = Buffer.allocUnsafe(16)
  const myClockSeq = clockSeq
  const timeLow = ((mTime & 0xfffffff) * 10000 + nTime) % 0x100000000
  const timeHigh = (mTime / 0x100000000 * 10000) & 0xfffffff

  buffer[0] = timeLow >>> 24 & 0xff
  buffer[1] = timeLow >>> 16 & 0xff
  buffer[2] = timeLow >>> 8 & 0xff
  buffer[3] = timeLow & 0xff

  buffer[4] = timeHigh >>> 8 & 0xff
  buffer[5] = timeHigh & 0xff

  buffer[6] = (timeHigh >>> 24 & 0x0f) | 0x10
  buffer[7] = (timeHigh >>> 16 & 0x3f) | 0x80

  buffer[8] = myClockSeq >>> 8
  buffer[9] = myClockSeq & 0xff

  let result: any
  switch (encoding) {
    case UuidEncoding.BINARY:
      buffer[10] = nodeId[0]
      buffer[11] = nodeId[1]
      buffer[12] = nodeId[2]
      buffer[13] = nodeId[3]
      buffer[14] = nodeId[4]
      buffer[15] = nodeId[5]
      result = buffer
      break
    case UuidEncoding.OBJECT:
      buffer[10] = nodeId[0]
      buffer[11] = nodeId[1]
      buffer[12] = nodeId[2]
      buffer[13] = nodeId[3]
      buffer[14] = nodeId[4]
      buffer[15] = nodeId[5]
      result = new UUID(buffer)
      break
    default:
      result = byte2hex[buffer[0]] + byte2hex[buffer[1]] +
        byte2hex[buffer[2]] + byte2hex[buffer[3]] + "-" +
        byte2hex[buffer[4]] + byte2hex[buffer[5]] + "-" +
        byte2hex[buffer[6]] + byte2hex[buffer[7]] + "-" +
        byte2hex[buffer[8]] + byte2hex[buffer[9]] + "-" +
        byte2hex[nodeId[0]] + byte2hex[nodeId[1]] +
        byte2hex[nodeId[2]] + byte2hex[nodeId[3]] +
        byte2hex[nodeId[4]] + byte2hex[nodeId[5]]
      break
  }
  return result
}

// v3 + v5
function uuidNamed(name: string | Buffer, hashMethod: string, version: number, namespace: string | Buffer | UUID, encoding: UuidEncoding = UuidEncoding.ASCII) {
  const hash = createHash(hashMethod)

  if (typeof namespace === "string") {
    if (!UUID.check(namespace)) {
      throw new Error(invalidNamespace)
    }
    namespace = UUID.parse(namespace)
  }
  else if (namespace instanceof UUID) {
    namespace = namespace.toBuffer()
  }
  else if (!(Buffer.isBuffer(namespace)) || namespace.length !== 16) {
    throw new Error(invalidNamespace)
  }

  const nameIsNotAString = typeof name !== "string"
  if (nameIsNotAString && !(Buffer.isBuffer(name))) {
    throw new Error(invalidName)
  }

  hash.update(namespace)
  hash.update(name, nameIsNotAString ? "latin1" : "utf8")

  const buffer = hash.digest()
  let result: any
  switch (encoding) {
    case UuidEncoding.BINARY:
      buffer[6] = (buffer[6] & 0x0f) | version
      buffer[8] = (buffer[8] & 0x3f) | 0x80
      result = buffer
      break
    case UuidEncoding.OBJECT:
      buffer[6] = (buffer[6] & 0x0f) | version
      buffer[8] = (buffer[8] & 0x3f) | 0x80
      result = new UUID(buffer)
      break
    default:
      result = byte2hex[buffer[0]] + byte2hex[buffer[1]] +
        byte2hex[buffer[2]] + byte2hex[buffer[3]] + "-" +
        byte2hex[buffer[4]] + byte2hex[buffer[5]] + "-" +
        byte2hex[(buffer[6] & 0x0f) | version] +
        byte2hex[buffer[7]] + "-" +
        byte2hex[(buffer[8] & 0x3f) | 0x80] +
        byte2hex[buffer[9]] + "-" +
        byte2hex[buffer[10]] + byte2hex[buffer[11]] +
        byte2hex[buffer[12]] + byte2hex[buffer[13]] +
        byte2hex[buffer[14]] + byte2hex[buffer[15]]
      break
  }
  return result
}

// v4
// function uuidRandom(arg1, arg2) {
//
//     const options = arg1 || {}
//     const callback = typeof arg1 === "function" ? arg1 : arg2
//
//     const buffer = crypto.randomBytes(16)
//
//     buffer[6] = (buffer[6] & 0x0f) | 0x40
//     buffer[8] = (buffer[8] & 0x3f) | 0x80
//
//     let result
//     switch (options.encoding && options.encoding[0]) {
//         case "b":
//         case "B":
//             result = buffer
//             break
//         case "o":
//         case "U":
//             result = new UUID(buffer)
//             break
//         default:
//             result = byte2hex[buffer[0]] + byte2hex[buffer[1]] +
//                      byte2hex[buffer[2]] + byte2hex[buffer[3]] + "-" +
//                      byte2hex[buffer[4]] + byte2hex[buffer[5]] + "-" +
//                      byte2hex[(buffer[6] & 0x0f) | 0x40] +
//                      byte2hex[buffer[7]] + "-" +
//                      byte2hex[(buffer[8] & 0x3f) | 0x80] +
//                      byte2hex[buffer[9]] + "-" +
//                      byte2hex[buffer[10]] + byte2hex[buffer[11]] +
//                      byte2hex[buffer[12]] + byte2hex[buffer[13]] +
//                      byte2hex[buffer[14]] + byte2hex[buffer[15]]
//             break
//     }
//     if (callback) {
//         setImmediate(function() {
//             callback(null, result)
//         })
//     } else {
//         return result
//     }
// }

// v4 fast
// function uuidRandomFast() {
//
//     const r1 = Math.random() * 0x100000000
//     const r2 = Math.random() * 0x100000000
//     const r3 = Math.random() * 0x100000000
//     const r4 = Math.random() * 0x100000000
//
//     return byte2hex[ r1        & 0xff] +
//            byte2hex[ r1 >>>  8 & 0xff] +
//            byte2hex[ r1 >>> 16 & 0xff] +
//            byte2hex[ r1 >>> 24 & 0xff] + "-" +
//            byte2hex[ r2 & 0xff] +
//            byte2hex[ r2 >>>  8 & 0xff] + "-" +
//            byte2hex[(r2 >>> 16 & 0x0f) | 0x40] +
//            byte2hex[ r2 >>> 24 & 0xff] + "-" +
//            byte2hex[(r3 & 0x3f) | 0x80] +
//            byte2hex[ r3 >>>  8 & 0xff] + "-" +
//            byte2hex[ r3 >>> 16 & 0xff] +
//            byte2hex[ r3 >>> 24 & 0xff] +
//            byte2hex[ r4        & 0xff] +
//            byte2hex[ r4 >>>  8 & 0xff] +
//            byte2hex[ r4 >>> 16 & 0xff] +
//            byte2hex[ r1 >>> 24 & 0xff]
// }

function stringify(buffer: Buffer) {
  return byte2hex[buffer[0]] + byte2hex[buffer[1]] +
    byte2hex[buffer[2]] + byte2hex[buffer[3]] + "-" +
    byte2hex[buffer[4]] + byte2hex[buffer[5]] + "-" +
    byte2hex[buffer[6]] + byte2hex[buffer[7]] + "-" +
    byte2hex[buffer[8]] + byte2hex[buffer[9]] + "-" +
    byte2hex[buffer[10]] + byte2hex[buffer[11]] +
    byte2hex[buffer[12]] + byte2hex[buffer[13]] +
    byte2hex[buffer[14]] + byte2hex[buffer[15]]
}

// according to rfc4122#section-4.1.7
export const nil = new UUID("00000000-0000-0000-0000-000000000000")

// UUID.v4 = uuidRandom

// UUID.v4fast = uuidRandomFast

// UUID.v3 = function(options, callback) {
//     return uuidNamed("md5", 0x30, options, callback)
// }