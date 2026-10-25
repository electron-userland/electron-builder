---
"electron-updater": patch
---

fix(updater): every request of a differential download (single-range, multi-range and reading the embedded block map) follows redirects itself: credential headers such as `Authorization`, `PRIVATE-TOKEN`, `X-Api-Key` and `Cookie` are sent to a redirect target only on the same origin, each multi-range request starts at the update URL, at most 10 redirects are followed per request, and an invalid redirect URL fails the download instead of leaving it waiting
