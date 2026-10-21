// Generates (or, with --check, re-verifies) frozen-27.0.0-alpha.9.json with the RELEASED signing code from npm.
// Nothing here runs in CI; see README.md for when to use it.
//
//   PKGS="$(mktemp -d)"
//   npm install --no-save --ignore-scripts --prefix "$PKGS" builder-util@27.0.0-alpha.9 \
//     builder-util-runtime-alpha.9@npm:builder-util-runtime@10.0.0-alpha.9 \
//     builder-util-runtime-alpha.10@npm:builder-util-runtime@10.0.0-alpha.10
//   node test/fixtures/signed-manifest-compat/generate-frozen.mjs "$PKGS" --check   # verify the committed fixture
//   node test/fixtures/signed-manifest-compat/generate-frozen.mjs "$PKGS"           # regenerate (new random keys)
//
// builder-util@27.0.0-alpha.9 pulls in builder-util-runtime@10.0.0-alpha.8 (electron-updater@7.0.0-alpha.8); the two
// aliases are the runtimes of electron-updater@7.0.0-alpha.9 and alpha.10. Every signed manifest is verified by all
// three released verifiers against both app-update.yml trust lists before anything is written.
import { readFileSync, writeFileSync } from "fs"
import { createRequire } from "module"
import * as path from "path"
import { fileURLToPath, pathToFileURL } from "url"

const [pkgsDir, mode] = process.argv.slice(2)
if (pkgsDir == null) {
  throw new Error("usage: generate-frozen.mjs <npm prefix with the released packages> [--check]")
}
const fixtureFile = path.join(path.dirname(fileURLToPath(import.meta.url)), "frozen-27.0.0-alpha.9.json")
const requireFromPkgs = createRequire(path.join(path.resolve(pkgsDir), "package.json"))
const importPkg = name => import(pathToFileURL(requireFromPkgs.resolve(name)).href)

const signer = await importPkg("builder-util")
const runtimeAlpha8 = await importPkg("builder-util-runtime")
const releasedRuntimes = {
  "builder-util-runtime@10.0.0-alpha.8 (electron-updater@7.0.0-alpha.8)": runtimeAlpha8,
  "builder-util-runtime@10.0.0-alpha.9 (electron-updater@7.0.0-alpha.9)": await importPkg("builder-util-runtime-alpha.9"),
  "builder-util-runtime@10.0.0-alpha.10 (electron-updater@7.0.0-alpha.10)": await importPkg("builder-util-runtime-alpha.10"),
}
const { dump, load } = requireFromPkgs("js-yaml")
const yaml = o => dump(o, { lineWidth: 8000 })

function generate() {
  const oldKey = signer.generateUpdateSigningKeypair()
  const newKey = signer.generateUpdateSigningKeypair()
  // exactly what `electron-builder create-update-key` 27.0.0-alpha.9..alpha.11 writes to update-private-key.pem
  const oldKeyFile = oldKey.privateKeyPem + "\n"
  const newKeyFile = newKey.privateKeyPem + "\n"

  const sha = c => Buffer.alloc(64, c).toString("base64")
  const manifests = {
    "latest.yml": {
      version: "1.2.3",
      files: [
        { url: "App-Setup-1.2.3.exe", sha512: sha(1), size: 81234567 },
        { url: "App-Setup-1.2.3-arm64.exe", sha512: sha(2), size: 79234567 },
      ],
      path: "App-Setup-1.2.3.exe",
      sha512: sha(1),
      releaseDate: "2026-10-01T12:00:00.000Z",
      stagingPercentage: 25,
    },
    "latest-mac.yml": {
      version: "1.2.3",
      files: [
        { url: "App-1.2.3-universal-mac.zip", sha512: sha(3), size: 123456789 },
        { url: "App-1.2.3-universal.dmg", sha512: sha(4), size: 133456789 },
      ],
      path: "App-1.2.3-universal-mac.zip",
      sha512: sha(3),
      releaseDate: "2026-10-01T12:00:00.000Z",
      minimumSystemVersion: "12.0",
    },
  }

  // what the released updateInfoBuilder does: info = { ...info, signature: signatures[0].signature, signatures }
  const sign = (info, keys) => {
    const signatures = signer.createUpdateManifestSignatures(info, keys)
    return { ...info, signature: signatures[0].signature, signatures }
  }
  const singleKeys = signer.loadUpdateSigningKeys({ signingKey: oldKeyFile })
  const dualKeys = signer.loadUpdateSigningKeys({ signingKey: oldKeyFile + newKeyFile })
  const signedSingleKey = {}
  const signedDualKey = {}
  for (const [name, info] of Object.entries(manifests)) {
    signedSingleKey[name] = yaml(sign(info, singleKeys))
    signedDualKey[name] = yaml(sign(info, dualKeys))
  }
  // what the released PublishManager embeds: one derived key as a plain string, several as a list
  const feed = { provider: "generic", url: "https://example.com/updates", updaterCacheDirName: "app-updater" }
  return {
    generatedWith: "builder-util@27.0.0-alpha.9 + builder-util-runtime@10.0.0-alpha.8 (npm), see README.md",
    keys: {
      old: { privateKeyFile: oldKeyFile, publicKeyPem: oldKey.publicKeyPem, keyId: runtimeAlpha8.computeUpdateManifestKeyId(oldKey.publicKeyPem) },
      new: { privateKeyFile: newKeyFile, publicKeyPem: newKey.publicKeyPem, keyId: runtimeAlpha8.computeUpdateManifestKeyId(newKey.publicKeyPem) },
    },
    unsignedManifests: manifests,
    signedSingleKey,
    signedDualKey,
    appUpdateYml: {
      single: yaml({ ...feed, updateManifestPublicKey: signer.derivePublicKeyPem(singleKeys[0]) }),
      dual: yaml({ ...feed, updateManifestPublicKey: dualKeys.map(signer.derivePublicKeyPem) }),
    },
  }
}

// AppUpdater.verifyManifestSignature in electron-updater 7.0.0-alpha.8..alpha.10
function updaterVerify(runtime, appUpdateYml, latestYml) {
  const trusted = runtime.normalizePublicKeyList(load(appUpdateYml).updateManifestPublicKey)
  const info = load(latestYml)
  if (trusted.length === 0 || runtime.collectManifestSignatures(info).length === 0) {
    return { ok: false }
  }
  return runtime.verifyManifestSignatures(info, trusted)
}

const frozen = mode === "--check" ? JSON.parse(readFileSync(fixtureFile, "utf8")) : generate()
let checks = 0
for (const [runtimeName, runtime] of Object.entries(releasedRuntimes)) {
  for (const [keyName, key] of Object.entries(frozen.keys)) {
    if (runtime.computeUpdateManifestKeyId(key.publicKeyPem) !== key.keyId) {
      throw new Error(`${runtimeName}: key id of ${keyName} differs`)
    }
    if (signer.derivePublicKeyPem(signer.loadUpdateSigningKeys({ signingKey: key.privateKeyFile })[0]) !== key.publicKeyPem) {
      throw new Error(`${keyName}: public key does not match the private key file`)
    }
  }
  for (const [manifests, trustLists] of [
    [frozen.signedSingleKey, [frozen.appUpdateYml.single, frozen.appUpdateYml.dual]],
    [frozen.signedDualKey, [frozen.appUpdateYml.single, frozen.appUpdateYml.dual]],
  ]) {
    for (const [name, latestYml] of Object.entries(manifests)) {
      for (const trust of trustLists) {
        const result = updaterVerify(runtime, trust, latestYml)
        if (!result.ok || result.keyId !== frozen.keys.old.keyId) {
          throw new Error(`${runtimeName} rejected ${name}: ${JSON.stringify(result)}`)
        }
        checks++
      }
    }
  }
}
console.log(`released verifiers accepted every frozen manifest (${checks} checks); key ids ${frozen.keys.old.keyId} ${frozen.keys.new.keyId}`)
if (mode !== "--check") {
  writeFileSync(fixtureFile, JSON.stringify(frozen, null, 2) + "\n")
  console.log(`wrote ${fixtureFile}`)
}
