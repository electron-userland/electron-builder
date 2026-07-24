---
"app-builder-lib": patch
---

fix(app-builder-lib): expand lower channels when the channel name has a suffix

With `generateUpdatesFilesForAllChannels` enabled, the extra `alpha`/`beta` update files were only written when the channel was exactly `alpha`, `beta`, or `latest`. A per-arch feed configured as `channel: "${channel}-${arch}"` resolves to something like `beta-arm64`, which hit the default branch, so `alpha-arm64.yml` was never written and arm64 pre-release users stopped getting promoted. The base channel is now read off the front of the name and the suffix is reattached to the expanded channels, so `beta-arm64` yields `beta-arm64` and `alpha-arm64`, and `latest-arm64` yields all three.
