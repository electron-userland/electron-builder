import { Nullish } from "builder-util-runtime"

export function isEmptyOrSpaces(s: string | Nullish): s is "" | Nullish {
  return s == null || s.trim().length === 0
}
