import { parseDn } from "./rfc2253Parser.js"

/**
 * How a configured publisher name matched a signing certificate subject:
 * - `dn` — the publisher name is a Distinguished Name and every RDN it specifies equals the subject's value
 * - `cn` — the publisher name is a plain string and equals the subject's Common Name (CN) only
 */
export type PublisherNameMatchKind = "dn" | "cn"

export interface PublisherNameMatch {
  /** The configured publisher name that matched. */
  readonly publisherName: string
  readonly kind: PublisherNameMatchKind
}

/**
 * Matches configured publisher names against the subject of the certificate that signed a Windows executable,
 * exactly as electron-updater does when it verifies a downloaded update (and as electron-builder does when it
 * checks a signed installer at build time, so the two cannot drift apart).
 *
 * The configured names are tried in order and the first match wins:
 * - a name that parses as a Distinguished Name (DN) matches when every RDN it specifies equals the subject's value
 *   for the same key (RDN order and subject RDNs the name does not specify are ignored);
 * - any other name matches when it is strictly equal to the subject's Common Name (CN). Callers should warn on
 *   such a match, because a CN alone identifies the publisher less precisely than a full DN.
 *
 * @param publisherNames the configured publisher names (`publisherName` in `app-update.yml`)
 * @param signerSubject the signing certificate subject in the format Windows reports it
 *   (`X509Certificate2.Subject`, e.g. `CN=My Company, O=My Company, L=Berlin, S=Berlin, C=DE`)
 * @returns the first matching name and how it matched, or `null` when none matches
 */
export function matchPublisherName(publisherNames: ReadonlyArray<string>, signerSubject: string): PublisherNameMatch | null {
  const subject = parseDn(signerSubject)
  for (const publisherName of publisherNames) {
    const dn = parseDn(publisherName)
    if (dn.size > 0) {
      let allEqual = true
      for (const [key, value] of dn) {
        if (subject.get(key) !== value) {
          allEqual = false
          break
        }
      }
      if (allEqual) {
        return { publisherName, kind: "dn" }
      }
    } else if (publisherName === subject.get("CN")) {
      return { publisherName, kind: "cn" }
    }
  }
  return null
}
