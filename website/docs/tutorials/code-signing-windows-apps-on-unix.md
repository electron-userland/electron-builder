---
title: "Code Signing Windows Apps on Unix"
---

:::info[Only for EV code signing certificates]

Described setup and configuration is required only if you have EV code signing certificate. The regular certificates supported [out of the box](../features/code-signing/code-signing.md#windows).
:::

:::tip[v27: use the built-in PKCS#11 mode]
As of v27, electron-builder ships a first-class cross-platform PKCS#11 signing mode — set `win.sign: { type: "pkcs11", pkcs11Module, pkcs11KeyUri, certificateFile }` and it signs via the bundled `osslsigncode` on macOS/Linux with no custom script. See [Windows Code Signing → PKCS#11](../features/code-signing/code-signing-win.md#pkcs11-signing-type-pkcs11-beta). The manual JSign / custom `sign.js` approach below remains available as a fallback for setups the built-in mode doesn't cover.
:::

Signing Windows apps on Unix is supported. You need an application that can sign code using [PKCS#11](https://en.wikipedia.org/wiki/PKCS_11). Two common options are JSign (Java-based) and osslsigncode (C-based).

## Signing with JSign (Java)

Install [JSign](https://github.com/ebourg/jsign/releases) and configure it for your PKCS#11 hardware token.
Refer to the [JSign documentation](https://ebourg.github.io/jsign/) for setup instructions.

## Signing with osslsigncode (macOS / Linux)

Install [osslsigncode](https://github.com/mtrojnar/osslsigncode) via your package manager or build from source.
On Ubuntu: `sudo apt install osslsigncode`. On macOS with Homebrew: `brew install osslsigncode`.
Refer to the [osslsigncode README](https://github.com/mtrojnar/osslsigncode#readme) for full setup.

## Remarks

Please consider the following when things are not working.

- Make sure you use the correct PKCS 11 engine and module. If you get `no slot with a token was found` or some errors
  like `sc connect card error` and `Card is invalid or cannot be handled` you are not using the correct module, make
  sure you use correct one.
- If you compiled OpenSSL yourself, make sure you use an engine that is also compiled for OpenSSL. Otherwise you
  will run into *compatibility* issues.
- Use the `osslsigncode` which is mentioned in the list of URLs. There are many more forks/version to be found. The one
  included here is the actually maintained library, requires OpenSSL 1.1.

## Integrate signing with Electron Builder

Depending on the method you have chosen, you can automate the signing process by creating a `sign.js` file. Then point
to this file in your `package.json`.

package.json
```
...
    "win": {
      "target": "nsis",
      "sign": {
        "type": "signtool",
        "sign": "./sign.js",
        "publisherName": "CN=My Company, O=My Company, C=US"
      }
    },
...
```

sign.js
```js
exports.default = async function(configuration) {
  // do not include passwords or other sensitive data in the file
  // rather create environment variables with sensitive data
  const CERTIFICATE_NAME = process.env.WINDOWS_SIGN_CERTIFICATE_NAME;
  const TOKEN_PASSWORD = process.env.WINDOWS_SIGN_TOKEN_PASSWORD;

  require("child_process").execSync(
    // your commande here ! For exemple and with JSign :
    `java -jar jsign-2.1.jar --keystore hardwareToken.cfg --storepass "${TOKEN_PASSWORD}" --storetype PKCS11 --tsaurl http://timestamp.digicert.com --alias "${CERTIFICATE_NAME}" "${configuration.path}"`,
    {
      stdio: "inherit"
    }
  );
};
```

electron-builder cannot read the certificate on your token, so `publisherName` (in `package.json` above) must be set to its subject: it is written to `app-update.yml` and electron-updater checks every downloaded update against it, and an `nsis` build with a publish configuration (including one inferred from a GitHub `repository`) fails without it. Copy the subject from an executable your hook has already signed (a previous release, or `win-unpacked` from an `electron-builder --win dir` build, which does not write `app-update.yml`) instead of typing it by hand, because every component you list (`CN`, `O`, `C`, …) must match exactly: run `osslsigncode verify -in <App>.exe` and take the `Subject:` line under "Signer's certificate" (printed as `/C=US/ST=California/O=My Company, Inc./CN=My Company, Inc.`). Keep only `CN`, `O` and `C` and write them as `CN="My Company, Inc.", O="My Company, Inc.", C=US` — OpenSSL names some other components differently from Windows (`ST` instead of `S`, for example), and a value that contains a comma must be wrapped in double quotes. On Windows, `(Get-AuthenticodeSignature .\dist\win-unpacked\<App>.exe).SignerCertificate.Subject` prints it in the form to use as-is. Set `win.verifyUpdateCodeSignature: false` instead only if your updates are not Authenticode-signed or you don't use electron-updater.
