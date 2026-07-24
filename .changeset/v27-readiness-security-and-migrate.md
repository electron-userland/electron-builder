---
"builder-util": patch
"builder-util-runtime": patch
"electron-updater": patch
"electron-builder": patch
"app-builder-lib": patch
---

Security hardening and a migrate-schema fix:

- `builder-util` `removePassword`: redact single-letter/URI secret flags (`security … -k <password>`, `osslsigncode -key <pkcs11-uri?pin-value=…>`) and whitespace-containing secrets in debug logs, and make the `/b … /c` block-redaction regex ReDoS-safe.
- `builder-util-runtime` `httpExecutor`: fix the non-functional `maxRedirects` guard (the redirect counter was never advanced), so a redirect loop from a malicious feed/mirror no longer hangs the updater.
- `electron-updater` `GitLabProvider`: only forward the GitLab token to the channel-file request when its URL is same-origin as the API host, so an off-host/`http://` `direct_asset_url` in the release JSON cannot exfiltrate the token.
- `app-builder-lib`: defense-in-depth hardening — validate `executableName` before interpolating it into the generated Flatpak launcher, contain custom-toolset extraction within the cache dir, and XML-escape MSI file-association `ext`/`description`.
- `electron-builder` `migrate-schema`: auto-remove the removed `linux.syncDesktopName` flag.
