// if baseUrl path doesn't ends with /, this path will be not prepended to passed pathname for new URL(input, base)
import { HttpExecutor } from "builder-util-runtime"
import { URL } from "url"

/** @internal */
export function newBaseUrl(url: string): URL {
  const result = new URL(url)
  if (!result.pathname.endsWith("/")) {
    result.pathname += "/"
  }
  return result
}

// addRandomQueryToAvoidCaching is false by default because in most cases URL already contains version number,
// so, it makes sense only for Generic Provider for channel files
export function newUrlFromBase(pathname: string, baseUrl: URL, addRandomQueryToAvoidCaching = false): URL {
  const result = new URL(pathname, baseUrl)
  // a URL on another origin (e.g. an absolute URL in the update manifest) keeps its own query; the base query is only added on the base
  // origin, with the same rule as the credential headers (an http → https upgrade of the same host keeps it)
  if (HttpExecutor.isCrossOrigin(baseUrl, result)) {
    return result
  }
  // search is not propagated (search is an empty string if not specified)
  const search = baseUrl.search
  if (search != null && search.length !== 0) {
    result.search = search
  } else if (addRandomQueryToAvoidCaching) {
    result.search = `noCache=${Date.now().toString(32)}`
  }
  return result
}

export function getChannelFilename(channel: string): string {
  return `${channel}.yml`
}
