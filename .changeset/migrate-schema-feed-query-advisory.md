---
"electron-builder": patch
"app-builder-lib": patch
---

fix(migrate-schema): print an advisory, for JS/TS configs as well as JSON, YAML, TOML and package.json ones, for a `generic` publish `url` with a query string: electron-updater sends the feed query and the credential headers only to downloads on the feed's origin. The build prints the same warning once per feed (naming the query parameters, not their values) when it writes such a feed to `app-update.yml`, so it does not depend on `migrate-schema` having been run
