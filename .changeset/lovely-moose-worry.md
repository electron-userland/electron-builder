---
"builder-util-runtime": minor
---

fix: strip auth headers on cross-origin redirects following HTTP specifications

Implement proper cross-origin redirect handling that strips authorization headers when redirected to a different origin (protocol, hostname, or port). This fixes GitHub release asset download failures that occur when GitHub redirects authenticated requests to cloud storage services like Azure or AWS that don't accept GitHub tokens.

The fix replaces hardcoded service-specific checks with a standards-compliant approach that works for any cross-origin redirect scenario.

Fixes #9207
