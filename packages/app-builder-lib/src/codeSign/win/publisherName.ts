import { InvalidConfigurationError } from "builder-util"
import { isDistinguishedName, parseDn } from "builder-util-runtime"

const PUBLISHER_NAME_DOCS = "https://www.electron.build/docs/features/code-signing/code-signing-win#publisher-name-and-update-verification"

/**
 * electron-updater never matches a publisherName that is a bare common name ("My Company") against the update's signer, so a
 * bare name written into app-update.yml would make every update fail verification: the build fails instead.
 */
export function assertDistinguishedPublisherNames(publisherNames: Array<string>, option = "win.sign.publisherName"): Array<string> {
  const bareNames = publisherNames.filter(name => !isDistinguishedName(name))
  if (bareNames.length > 0) {
    throw new InvalidConfigurationError(
      `${option} must be the distinguished name of the signing certificate's subject, not a bare common name: ${bareNames.map(it => JSON.stringify(it)).join(", ")}. ` +
        "electron-updater rejects every update whose publisherName is a bare common name. " +
        `Set it to the CN, O and C of the certificate subject, e.g. "CN=My Company, O=My Company, C=US" (every attribute you list must match the certificate) — see ${PUBLISHER_NAME_DOCS}`
    )
  }
  return publisherNames
}

// Windows quotes an RDN value that has leading/trailing white space or contains one of these characters.
const NEEDS_DN_QUOTING = /[,+="\n<>#;]/

/**
 * The publisherName derived from a signing certificate's subject (in the format Windows reports it): its CN, O and C attributes,
 * as a distinguished name. The other attributes are left out because they are the ones that change when a certificate is renewed
 * (locality, street, organizational unit), so updates signed with a renewed certificate keep verifying.
 */
export function publisherNameFromSubject(windowsSubjectDn: string): string | null {
  const subject = parseDn(windowsSubjectDn)
  if (!subject.get("CN")) {
    return null
  }
  return ["CN", "O", "C"]
    .filter(key => subject.get(key))
    .map(key => {
      const value = subject.get(key)!
      return `${key}=${value !== value.trim() || NEEDS_DN_QUOTING.test(value) ? `"${value}"` : value}`
    })
    .join(", ")
}
