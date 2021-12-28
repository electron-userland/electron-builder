---
"electron-publish": patch
---

fix: Explicitly set the protocol to https on the request objects to allow publishing to work from behind a proxy server when the https_proxy environment variable is set.
