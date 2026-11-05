---
"app-builder-lib": patch
"electron-builder": patch
---

fix(builder): the build warning and the `migrate-schema` advisory for a `generic` publish `url` with a query string state the same rule: electron-updater adds the feed query only to requests on the feed's origin, and sends a request or redirect to another origin only the request headers the app's `autoUpdater.crossOriginHeaders` keeps. Their suggested fixes include sending the credential as a request header that `autoUpdater.crossOriginHeaders` keeps for the origin that needs it. The warning names the query parameters, never their values, and both link https://www.electron.build/docs/migration/v27-runtime-changes#update-credentials-stay-on-the-feeds-origin
