// The changelog generator of `changeset version` and scripts/aggregate-changesets.mjs: changesets-changelog-clean, with
// the lines after an entry's first line indented by two spaces instead of a tab, and without the author link: an entry
// ends with its PR and commit links only. The changelogs are not formatted ("prettier": false in config.json), and
// prettier used to do this (.editorconfig: indent_style = space).
const { default: changelogFunctions } = require("changesets-changelog-clean")

module.exports = {
  ...changelogFunctions,
  getReleaseLine: async (...args) =>
    (await changelogFunctions.getReleaseLine(...args))
      // the first line ends with `_[`#123`](…/pull/123) [`abc1234`](…/commit/…) [@user](…)_`: drop ` [@user](…)`
      .replace(/^([^\n]*) \[@[^\]\s]+\]\([^)\s]+\)_(?=\n|$)/, "$1_")
      .replace(/^\t/gm, "  ")
      .replace(/^[ \t]+$/gm, "")
      // changesets-changelog-clean puts a blank line before the rest of the summary, which starts with its own
      .replace(/^(.*)\n\n\n/, "$1\n\n"),
}
