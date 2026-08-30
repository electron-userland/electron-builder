import { UUID } from "builder-util-runtime"

// noinspection SpellCheckingInspection
export const ELECTRON_BUILDER_NS_UUID = UUID.parse("50e065bc-3134-11e6-9bab-38c9862bdaf3")

// Microsoft caps a ProgID at 39 characters.
const MAX_PROG_ID_LENGTH = 39
// Budget for the human-readable head (program + "." + component prefix); the rest is reserved for the
// UUID tail so that some entropy always survives the final truncation.
const MAX_READABLE_LENGTH = 31
// Cap on the readable program segment, leaving room for the component to carry entropy.
const MAX_PROGRAM_LENGTH = 19
// A product filename that sanitizes shorter than this is too short to be a useful program segment.
const MIN_PROGRAM_LENGTH = 6

// ProgIDs may only contain alphanumerics plus a single separating period, so drop everything else.
function sanitize(value: string): string {
  return value.replace(/[^A-Za-z0-9]/g, "")
}

/**
 * Builds Windows file-association ProgIDs that follow Microsoft's recommendations
 * (https://learn.microsoft.com/windows/win32/com/-progid--key):
 *   - at most 39 characters,
 *   - only alphanumeric characters plus a single separating period,
 *   - must not start with a digit.
 *
 * The result has the form `<program>.<component>`, where `<program>` is derived from the product
 * filename (so it stays human-readable in the registry) and `<component>` mixes a readable prefix
 * with a UUIDv5 derived from the app GUID. This keeps the ProgID unique across applications and
 * stable for a given input, so the installer (register) and uninstaller (unregister) always agree.
 */
export class ProgIdMaker {
  private readonly program: string
  private readonly namespace: Buffer

  constructor(guid: string, productFilename: string) {
    // `guid` may be any user-supplied string (including a non-UUID), so normalize it to a real UUID.
    // It is lowercased because UUID.parse only understands lowercase hex; an uppercase GUID would
    // otherwise be parsed into a corrupt namespace and collide across applications.
    const uuidString = (UUID.check(guid) ? guid : UUID.v5(guid, ELECTRON_BUILDER_NS_UUID)).toLowerCase()
    this.namespace = UUID.parse(uuidString)
    this.program = ProgIdMaker.resolveProgram(guid, productFilename, uuidString)
  }

  progId(nameOrExt: string): string {
    const componentPrefix = sanitize(nameOrExt).slice(0, MAX_READABLE_LENGTH - this.program.length)
    const componentUuid = sanitize(UUID.v5(nameOrExt, this.namespace))
    return `${this.program}.${componentPrefix}${componentUuid}`.slice(0, MAX_PROG_ID_LENGTH)
  }

  // Resolves the readable program segment, preferring the product filename and falling back to the
  // GUID so the result is always non-empty and never starts with a digit (both Microsoft requirements).
  private static resolveProgram(guid: string, productFilename: string, uuidString: string): string {
    let program = sanitize(productFilename)
    if (program.length < MIN_PROGRAM_LENGTH) {
      program = sanitize(guid)
    }
    if (program.length < MIN_PROGRAM_LENGTH) {
      // `App<uuid>` is guaranteed long enough and starts with a letter.
      program = sanitize(`App${uuidString}`)
    } else if (/^\d/.test(program)) {
      program = `App${program}`
    }
    return program.slice(0, MAX_PROGRAM_LENGTH)
  }
}
