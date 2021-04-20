// @ts-ignore
import * as _sanitizeFileName from "sanitize-filename"

export function sanitizeFileName(s: string): string {
  return _sanitizeFileName(s)
}
