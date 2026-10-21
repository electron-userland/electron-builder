---
"builder-util-runtime": major
---

feat(win)!: `matchPublisherName` matches only publisher names that are a certificate subject distinguished name (DN) including `CN` and `O` (every attribute listed must equal the signer's); a bare name or a DN with the `CN` only never matches any more, and its `logger` parameter is removed. New exports `isValidPublisherNameDn` and `PUBLISHER_NAME_REQUIRED_DN_ATTRIBUTES` tell whether a publisher name is such a DN. See https://www.electron.build/docs/migration/v27-breaking-changes#windows-publishername-must-be-a-distinguished-name
