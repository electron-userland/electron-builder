import { Nullish } from "builder-util-runtime"

export function isEmptyOrSpaces(s: string | Nullish): s is "" | Nullish {
  return s == null || s.trim().length === 0
}

/**
 * escape given string for usage as XML text or attribute value
 */
export function escapeForXml(raw?: string | null): string {
  if (!raw) {
    return ""
  }

  return raw.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;")
}
