// The changelog generator of `changeset version` and scripts/aggregate-changesets.mjs: changesets-changelog-clean, with
// the lines after an entry's first line indented by two spaces instead of a tab, and without the author link: an entry
// ends with its PR and commit links only. The changelogs are not formatted ("prettier": false in config.json), and
// prettier used to do this (.editorconfig: indent_style = space).
const { default: changelogFunctions } = require("changesets-changelog-clean")

// @changesets/get-github-info reads GitHub's GraphQL API; a 5xx answered with an HTML page fails as a FetchError
// (type invalid-json) and fails the whole Release run. Retry those, behind one backoff shared by every failed call: the
// retries resume in the same tick, so get-github-info batches them into one GraphQL request again (its DataLoader drops
// the keys of a failed batch from its cache, so a retry fetches them again). A GraphQL answer with `errors` or without
// `data` is a plain Error with the JSON in its message: retry it only when GitHub reports a transient failure, not an
// authentication one
const TRANSIENT = /something went wrong|timeout|timed out|server error|bad gateway|service unavailable|secondary rate limit/i
function isTransient(e) {
  if (e?.name === "FetchError") {
    return true
  }
  const message = String(e?.message)
  return message.startsWith("An error occurred when fetching data from GitHub") && TRANSIENT.test(message)
}

let backoff
function wait(ms) {
  backoff ??= new Promise(resolve =>
    setTimeout(() => {
      backoff = undefined
      resolve()
    }, ms)
  )
  return backoff
}
async function withRetry(fn, attempts = 4) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn()
    } catch (e) {
      if (attempt >= attempts || !isTransient(e)) {
        throw e
      }
      console.warn(`GitHub API request failed (${String(e.message).split("\n")[0]}), retry ${attempt}/${attempts - 1}`)
      await wait(10_000 * attempt)
    }
  }
}

module.exports = {
  ...changelogFunctions,
  getReleaseLine: async (...args) =>
    (await withRetry(() => changelogFunctions.getReleaseLine(...args)))
      // the first line ends with `_[`#123`](…/pull/123) [`abc1234`](…/commit/…) [@user](…)_`: drop ` [@user](…)`
      .replace(/^([^\n]*) \[@[^\]\s]+\]\([^)\s]+\)_(?=\n|$)/, "$1_")
      .replace(/^\t/gm, "  ")
      .replace(/^[ \t]+$/gm, "")
      // changesets-changelog-clean puts a blank line before the rest of the summary, which starts with its own
      .replace(/^(.*)\n\n\n/, "$1\n\n"),
}
