import { dump } from "js-yaml"

export function serializeToYaml(object: any, skipInvalid = false, noRefs = false) {
  return dump(object, {
    lineWidth: 8000,
    skipInvalid,
    noRefs,
  })
}
