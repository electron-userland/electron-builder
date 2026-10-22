import { createHash } from "crypto"
import { newError } from "./error.js"
import { parseXml, XElement } from "./xml.js"

// Crockford's base32 alphabet, lowercase
const PUBLISHER_ID_ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz"

/**
 * The package family name Windows derives from a package identity: `<Name>_<PublisherId>`. The PublisherId is the first 64 bits
 * of the SHA-256 of the UTF-16LE `Publisher`, padded to 65 bits and encoded as 13 Crockford base32 characters.
 */
export function computePackageFamilyName(identityName: string, publisher: string): string {
  const bits = createHash("sha256").update(publisher, "utf16le").digest().readBigUInt64BE(0) << 1n
  let publisherId = ""
  for (let shift = 60; shift >= 0; shift -= 5) {
    publisherId += PUBLISHER_ID_ALPHABET[Number((bits >> BigInt(shift)) & 31n)]
  }
  return `${identityName}_${publisherId}`
}

/** The `<Identity>` of an AppX/MSIX package manifest or bundle manifest, with its attribute values unescaped. */
export function getPackageIdentity(manifestXml: string): { name: string; publisher: string; version: string } {
  // parseXml returns no root element for a document without one
  const root: XElement | null = parseXml(manifestXml)
  if (root == null) {
    throw newError("The manifest has no root element", "ERR_XML_MISSED_ELEMENT")
  }
  const identity = root.element("Identity")
  return { name: identity.attribute("Name"), publisher: identity.attribute("Publisher"), version: identity.attribute("Version") }
}
