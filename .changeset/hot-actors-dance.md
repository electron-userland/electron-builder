---
"electron-updater": major
---

feat(updater): add `verifyUpdateFile` to `AppUpdater`, and rename the NSIS Authenticode verification interface

`AppUpdater.verifyUpdateFile` lets an app run its own verification of an update file before that file is allowed to become installable. The default implementation is a stub that immediately succeeds. It runs on every path that can lead to an install — right after a fresh download (while the file still sits under a temporary name, so an unverified file is never executable under its real name), when an update downloaded by an earlier session is reused from the cache, and before an install-on-next-launch spawns the cached installer. On failure the file is deleted and an `ERR_UPDATER_INVALID_UPDATE_FILE` error is emitted. Assigning `null` restores the default.

The NSIS Authenticode verification interface now returns an unambiguous result object instead of the `null`-means-success / `string`-means-error convention:

```ts
type VerifyUpdateFileResult = { response: "success" } | { response: "failure"; message: string }
```

BREAKING CHANGE: `NsisUpdater.verifyUpdateCodeSignature` is deprecated in favour of `verifyUpdateFileAuthenticodeSignature`, which differs in return type. The old name is kept as a compatibility shim that translates in both directions and shall be removed in electron-builder v28.

```ts
// Before
autoUpdater.verifyUpdateCodeSignature = async (publisherNames, path) => (isValid ? null : "why it failed")

// After
autoUpdater.verifyUpdateFileAuthenticodeSignature = async (publisherNames, path) =>
  isValid ? { response: "success" } : { response: "failure", message: "why it failed" }
```

BREAKING CHANGE: the protected `NsisUpdater._verifyUpdateCodeSignature` member is renamed to `_verifyUpdateFileAuthenticodeSignature` and takes the new return type. A deprecated accessor under the old name forwards to it, so a subclass that **assigns** `this._verifyUpdateCodeSignature` keeps working; a subclass that **redeclares** it as a class field shadows the accessor and must be migrated.

BREAKING CHANGE: the protected `BaseUpdater.verifyInstallerSignatureOnLaunch` returns `Promise<VerifyUpdateFileResult>` instead of `Promise<string | null>`. An override that resolves `null` to mean "verified" now reports every install-on-next-launch as unsigned; return `{ response: "success" }` instead. (This member was introduced earlier in the same v27 pre-release cycle, so only apps on a 7.0.0-alpha are affected.)
