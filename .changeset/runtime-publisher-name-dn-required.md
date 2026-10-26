---
"builder-util-runtime": major
---

feat(win)!: `matchPublisherName` matches only publisher names that are a distinguished name (DN), every attribute of which must equal the signer's; a bare name never matches the signer's Common Name any more, and its `logger` parameter is removed. New export `isValidPublisherNameDn` tells whether a publisher name is a DN. See https://www.electron.build/docs/migration/v27-build-changes#windows-publishername-must-be-a-distinguished-name
