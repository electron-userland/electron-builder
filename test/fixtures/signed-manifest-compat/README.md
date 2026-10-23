# Signed update manifest compatibility fixtures

`frozen-27.0.0-alpha.9.json` is the contract `test/src/updater/signedManifestKeyCompatTest.ts` holds the current
builder and updater to. It was generated on 2026-10-20 with the **released** signing code from npm, using
`generate-frozen.mjs`:

- two Ed25519 key pairs, the private key files exactly as `electron-builder create-update-key` writes them
  (`old` and `new`, with their public key PEM and key id);
- `latest.yml` / `latest-mac.yml` signed with the old key (`signedSingleKey`) and with old + new (`signedDualKey`);
- the `app-update.yml` trust lists the released builder embeds: one key as a plain string (`single`), several as a
  list (`dual`).

Before the fixture was written, every signed manifest was verified against both trust lists by the verifiers of
all three released electron-updater versions that check signed manifests (7.0.0-alpha.8, alpha.9, alpha.10). So
when the test shows the current builder produces byte-identical key ids, `updateManifestPublicKey` values and
`signature`/`signatures` from the same keys, it shows that installs of those released updaters still accept what the
current builder signs.

**The private keys are test-only.** They are not used to sign anything outside this test.

## Package versions

| npm package                          | shipped in                                                 | tarball sha256                                                     |
| ------------------------------------ | ---------------------------------------------------------- | ------------------------------------------------------------------ |
| builder-util@27.0.0-alpha.9          | electron-builder@27.0.0-alpha.9 (signer used to generate)  | `1e0f45359d004dba3c43a5cf0cd3e16d228b09de59533218bbf669b948ba1072` |
| builder-util-runtime@10.0.0-alpha.8  | electron-updater@7.0.0-alpha.8, electron-builder@27.0.0-alpha.9 | `483754b3c5f18023aeee4c373d0f618d7d1a5198be8e239850a2f1dcba329404` |
| builder-util-runtime@10.0.0-alpha.9  | electron-updater@7.0.0-alpha.9                             | `9f9bc37a75e2c4c0793ebcb662a5d400c96d0d32052e02710b749ae17e039640` |
| builder-util-runtime@10.0.0-alpha.10 | electron-updater@7.0.0-alpha.10                            | `8e4f752efccaf47dfc70fe89d785bdd4b94457164848ad4ef4cc728b446b9f50` |

## Re-verifying or regenerating

Nothing here runs in CI. To re-check the committed fixture against the released verifiers, or to regenerate it
(new random keys), install the released packages into a scratch directory and run the script from the repo root:

```sh
PKGS="$(mktemp -d)"
npm install --no-save --ignore-scripts --prefix "$PKGS" builder-util@27.0.0-alpha.9 \
  builder-util-runtime-alpha.9@npm:builder-util-runtime@10.0.0-alpha.9 \
  builder-util-runtime-alpha.10@npm:builder-util-runtime@10.0.0-alpha.10
node test/fixtures/signed-manifest-compat/generate-frozen.mjs "$PKGS" --check   # verify only
node test/fixtures/signed-manifest-compat/generate-frozen.mjs "$PKGS"           # regenerate
```

Regenerate only when the fixture has to change on purpose. A failing compatibility test means the current builder
no longer reproduces what released versions produce; that is a compatibility break to fix, not a fixture to refresh.
