---
"electron-builder": patch
"app-builder-lib": patch
---

fix(migrate-schema): print an advisory, for JS/TS configs as well as JSON, YAML, TOML and package.json ones, for a `generic` publish `url` with a query string: electron-updater adds the feed url's query string only to requests on the feed's origin (scheme, host and port), and sends a request or redirect to another origin only the request headers from `requestHeaders` / `addAuthHeader` that the app's `autoUpdater.crossOriginHeaders` keeps. The build prints a warning with the same rule once per feed (naming the query parameters, not their values) when it writes such a feed to `app-update.yml`, so it does not depend on `migrate-schema` having been run. Both suggest serving the update files from the feed origin, using pre-signed URLs, or sending the credential as a request header that `autoUpdater.crossOriginHeaders` keeps for the origin that needs it, and link https://www.electron.build/docs/migration/v27-runtime-changes#update-credentials-stay-on-the-feeds-origin
