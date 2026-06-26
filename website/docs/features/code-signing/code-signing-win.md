# Code Signing for Windows

Windows code signing is supported and runs automatically once you configure a signing method — or simply provide signing credentials through environment variables. electron-builder signs every executable and installer it produces so that Windows SmartScreen and your auto-updater can verify your app's publisher and confirm it hasn't been tampered with.

:::tip[Dual signing]
By default each binary is dual-signed with both SHA-1 and SHA-256 (`signingHashAlgorithms: ["sha1", "sha256"]`) so it validates on legacy as well as modern Windows. A few targets are fixed: `.msi` is single-signed and AppX/MSIX is SHA-256 only.
:::

## Choosing a signing method

electron-builder offers several signing backends, selected by the `type` field of `win.sign` (detailed in the table below). Pick based on where your private key lives and which OS your build runs on:

- **Certificate file or Windows store** (`signtool`, the default) — a `.pfx`/`.p12` file or a certificate already in the Windows certificate store. Signs with Microsoft `signtool.exe` on Windows and `osslsigncode` on macOS/Linux.
- **Hardware Security Module / FIPS token** (`hsm`) — the key stays in hardware, accessed through a Windows cryptographic service provider. Windows only.
- **PKCS#11 hardware token** (`pkcs11`) — a smart card, USB HSM, or network token reached through a PKCS#11 module. Runs on macOS/Linux via `osslsigncode`.
- **Azure Trusted Signing** (`azure`) — Microsoft's cloud signing service; no local key to manage. Works on any OS.

### OV vs. EV certificates

For file- or store-based signing you need a Windows code signing certificate from a CA (DigiCert, Sectigo, SSL.com, …). They come in two grades:

- **OV (Organization Validation)** — the common, lower-cost option. New publishers see a SmartScreen "unknown publisher" warning during install that fades as your download reputation grows. OV certificates export to a `.pfx`, so they work in CI with the `signtool` method.
- **EV (Extended Validation)** — earns SmartScreen reputation immediately, but its private key is bound to a hardware token and **cannot** be exported to a file. Identify an EV certificate by `certificateSubjectName` or `certificateSha1` rather than a file path, and sign with the `hsm` (Windows) or `pkcs11` (macOS/Linux) method — or switch to `azure` to avoid managing hardware at all.

Both grades work with auto-update.

:::tip[Signing without a Windows machine]
You don't need Windows to sign a Windows app. The default `signtool` method signs file-based certificates with `osslsigncode` on macOS/Linux, and the `pkcs11` and `azure` methods are designed for non-Windows CI. See also [Code Signing Windows Apps on Unix](../../tutorials/code-signing-windows-apps-on-unix.md).
:::

---

## Unified `win.sign` key

All Windows code signing is configured under a single `win.sign` key using a discriminated union with an explicit `type` field:

| `win.sign` value | Behavior | Platforms |
|---|---|---|
| unset | Sign using credentials discovered from the environment — `WIN_CSC_LINK` / `CSC_LINK` with `WIN_CSC_KEY_PASSWORD` / `CSC_KEY_PASSWORD` | all |
| `{ type: "signtool", ... }` | Local `.pfx`/`.p12` certificate file or Windows certificate store | Windows (`signtool.exe`) · macOS/Linux (`osslsigncode`) |
| `{ type: "hsm", ... }` | Hardware Security Module / FIPS token via a Windows CSP — **Beta** | Windows only |
| `{ type: "pkcs11", ... }` | PKCS#11 hardware token via `osslsigncode` — **Beta** | macOS/Linux |
| `{ type: "azure", ... }` | Azure Trusted Signing cloud service — **Beta** | all (`signtool /dlib`, Wine on macOS/Linux) |
| `false` or `null` | Disable signing (resedit resource editing still runs) | all |

Combining `win.sign: false` with `forceCodeSigning: true` is a configuration error and fails the build.

---

## Signtool Signing (`type: "signtool"`)

The standard signing mode, and the default when `win.sign` is unset. Signs with a local certificate file (`.pfx`/`.p12`) or a certificate from the Windows certificate store, using Microsoft `signtool.exe` on Windows and `osslsigncode` on macOS/Linux.

### Setup

Set environment variables (recommended for CI):

```bash
WIN_CSC_LINK=/path/to/cert.pfx          # or base64-encoded file contents
WIN_CSC_KEY_PASSWORD=your-cert-password
```

Or specify the certificate directly in config:

```jsonc
{
  "win": {
    "sign": {
      "type": "signtool",
      "certificateFile": "cert.pfx",
      "certificatePassword": "...",
      "signingHashAlgorithms": ["sha256"]
    }
  }
}
```

For EV certificates (bound to a USB dongle), identify by subject name instead:

```jsonc
{
  "win": {
    "sign": {
      "type": "signtool",
      "certificateSubjectName": "My Company, Inc."
    }
  }
}
```

### Execution flow

1. The certificate is resolved from `certificateFile` (or the `WIN_CSC_LINK` / `CSC_LINK` env var), or looked up in the Windows certificate store by `certificateSubjectName` / `certificateSha1`.
2. Each file is signed once per entry in `signingHashAlgorithms` — by default SHA-1, then SHA-256 with the second signature appended as a nested signature.
3. On Windows the signer is Microsoft `signtool.exe`; on macOS/Linux it is `osslsigncode` from the `winCodeSign` toolset bundle — no Wine or Windows VM is involved. Note: certificate-store lookups (`certificateSubjectName` / `certificateSha1`) read the Windows store and therefore require Windows (or the bundled Windows VM), whereas file-based signing works on any platform.

### Configuration reference

{!./app-builder-lib.Interface.WindowsSigntoolSigningConfig.md!}

---

## HSM Signing (`type: "hsm"`) — Beta

:::warning[Beta feature]
HSM signing is available in v27 as a **beta** feature. The configuration interface is stable, but real-hardware test coverage is limited. Please [report issues](https://github.com/electron-userland/electron-builder/issues) if you encounter problems.
:::

Signs using a Hardware Security Module (HSM), FIPS-compliant token, or smart card via `signtool.exe`'s `/csp` (cryptographic service provider) and `/kc` (key container) flags. The private key never leaves the hardware; only the public certificate chain needs to be accessible to electron-builder.

**Platform:** Windows only. For macOS/Linux CI without a Windows VM, use [`type: "pkcs11"`](#pkcs11-signing-typepkcs11--beta) instead.

**Requirement:** a modern `winCodeSign` toolset, which is the default — you do not need to pin a version. Only an explicit legacy pin (`toolsets.winCodeSign: "0.0.0"`) is unsupported, because it predates the required signtool version.

### Setup

1. Install the CSP driver for your HSM/token on the build machine. Examples:
   - Google Cloud KMS: the [Cloud KMS Windows CNG Provider](https://cloud.google.com/kms/docs/reference/code-signing).
   - Smart card / FIPS token: `"Microsoft Base Smart Card Crypto Provider"` (built into Windows).
2. Obtain the certificate chain file (`.crt`, `.cer`, or `.pfx` — public key only).
3. Configure electron-builder:

```jsonc
{
  "win": {
    "sign": {
      "type": "hsm",
      "cryptoServiceProvider": "Google Cloud KMS Provider",
      "keyContainer": "projects/my-project/locations/us-east1/keyRings/my-ring/cryptoKeys/my-key/cryptoKeyVersions/1",
      "certificateFile": "chain.crt"
    }
  }
}
```

The default `winCodeSign` toolset already supports HSM signing, so no `toolsets` pin is needed.

### Execution flow

1. `signtool.exe sign` is invoked with `/csp <cryptoServiceProvider>` and `/kc <keyContainer>`.
2. The certificate is identified via `certificateFile`, `certificateSha1`, or `certificateSubjectName`.
3. The HSM performs the private-key operation; the resulting signature is embedded by signtool.
4. By default the file is dual-signed (SHA-1, then SHA-256), the same as the `signtool` mode — the HSM performs a key operation for each pass. Set `signingHashAlgorithms: ["sha256"]` to produce a single SHA-256 signature instead.

### Caveats

- **Windows only.** The `/csp` and `/kc` flags are signtool-specific. On macOS/Linux, use `type: "pkcs11"`.
- The CSP driver must be installed on the machine where the build runs (not available in most cloud CI environments without extra setup).
- `certificateFile`, `certificateSha1`, or `certificateSubjectName` must be provided — HSM signing requires a certificate identifier (unlike signtool where the cert can be embedded in the token implicitly).

### Configuration reference

{!./app-builder-lib.Interface.WindowsHsmSigningConfig.md!}

---

## PKCS#11 Signing (`type: "pkcs11"`) — Beta

:::warning[Beta feature]
PKCS#11 signing is available in v27 as a **beta** feature. The configuration interface is stable, but real-hardware test coverage is limited. Please [report issues](https://github.com/electron-userland/electron-builder/issues) if you encounter problems.
:::

Signs using a PKCS#11 hardware token via `osslsigncode`. Unlike HSM signing, this works on macOS and Linux without a Windows VM, making it suitable for cloud CI environments where a physical token is accessible via network HSM or PKCS#11-over-network software.

**Platform:** macOS and Linux only (uses `osslsigncode`). On Windows, use [`type: "hsm"`](#hsm-signing-typehsm--beta) instead.

### Setup

1. Install the PKCS#11 shared library for your token. Examples:
   - OpenSC (smart cards): `sudo apt install opensc` or `brew install opensc`
   - SoftHSM (testing): `sudo apt install softhsm2`
   - AWS CloudHSM: the CloudHSM PKCS#11 library
2. Confirm the module path and key URI using `pkcs11-tool --list-objects` or your provider's tooling.
3. Configure electron-builder:

```jsonc
{
  "win": {
    "sign": {
      "type": "pkcs11",
      "pkcs11Module": "/usr/lib/x86_64-linux-gnu/opensc-pkcs11.so",
      "pkcs11KeyUri": "pkcs11:token=MyToken;object=MyKey;type=private"
    }
  }
}
```

With an optional external certificate chain file (if the token does not carry the full chain):

```jsonc
{
  "win": {
    "sign": {
      "type": "pkcs11",
      "pkcs11Module": "/usr/lib/x86_64-linux-gnu/opensc-pkcs11.so",
      "pkcs11KeyUri": "pkcs11:token=MyToken;object=MyKey;type=private",
      "certificateFile": "chain.crt"
    }
  }
}
```

### Token PIN

| Scenario | How to supply the PIN |
|---|---|
| `certificateFile` set | `WIN_CSC_KEY_PASSWORD` or `CSC_KEY_PASSWORD` env var |
| No `certificateFile` (token holds cert) | Same env vars, or embed directly in the URI: `pkcs11:...?pin-value=<pin>` |

### Execution flow

1. `osslsigncode sign` is invoked with `-pkcs11module` and `-key` (the RFC 7512 URI).
2. If `certificateFile` is set, `-certs` is added for the chain; otherwise the cert embedded in the token is used.
3. If a PIN is available via env var, `-pass` is appended.
4. SHA1 and SHA256 signing are performed in sequence (like signtool dual-sign).

### Caveats

- **macOS/Linux only.** Throws `InvalidConfigurationError` when called on Windows; use `type: "hsm"` on Windows.
- The `osslsigncode` binary is bundled in the `winCodeSign` toolset — no manual installation needed.
- The PKCS#11 shared library (`.so` / `.dylib`) must be installed separately on the build machine.
- Network or USB token latency can make large builds slow. Consider signing only final installers rather than every intermediate `.exe`.

### Configuration reference

{!./app-builder-lib.Interface.WindowsPkcs11SigningConfig.md!}

---

## Azure Trusted Signing (`type: "azure"`) — Beta

:::warning[Beta feature]
The `signtool /dlib` Azure Trusted Signing integration introduced in v27 is a **beta** feature. It is the default path on current toolsets; the legacy PowerShell fallback remains available only when you explicitly pin `toolsets.winCodeSign` below `"1.3.0"` (see [Legacy PowerShell fallback](#legacy-powershell-fallback) below). Please [report issues](https://github.com/electron-userland/electron-builder/issues) if you encounter problems.
:::

Microsoft's cloud-based code signing service. No certificate file or private key is managed locally — authentication is via Azure Entra ID environment variables and signing is performed by the Azure service.

### Azure account setup

If you do not already have an Azure setup and only want to use their code signing service, set up an Azure "Trusted Signing Account" using [this quickstart guide](https://learn.microsoft.com/en-us/azure/trusted-signing/quickstart). Then, [set up an "App registration"](https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app) in Azure, follow the steps to create a "Secret" for it, and [assign the role "Trusted Signing Certificate Profile Signer" to the App registration](https://learn.microsoft.com/en-us/azure/trusted-signing/tutorial-assign-roles) (note, the App registration is considered a "service principal" and you will need to type its name into the search bar to find it in the web panel).

### Setup

Set the required environment variables (descriptions from [Azure.Identity — EnvironmentCredential](https://learn.microsoft.com/en-us/dotnet/api/azure.identity.environmentcredential?view=azure-dotnet#definition)):

| Env var | Description |
|---|---|
| `AZURE_TENANT_ID` | Your Azure AD Tenant ID; found in the Entra ID portal |
| `AZURE_CLIENT_ID` | Application (Client) ID of your App registration — not the object ID |
| `AZURE_CLIENT_SECRET` | Value of the Secret you created — not the secret's ID |
| `AZURE_CLIENT_CERTIFICATE_PATH` | Required if using your own certificate for authentication |
| `AZURE_CLIENT_SEND_CERTIFICATE_CHAIN` | Required if using your own certificate for authentication |
| `AZURE_USERNAME` | Microsoft Entra account username (for interactive/password flows) |
| `AZURE_PASSWORD` | Microsoft Entra account password (for interactive/password flows) |
| `AZURE_FEDERATED_TOKEN_FILE` | For workload identity federation (e.g. GitHub Actions OIDC) |

:::tip
If you use the minimal setup with an "App registration" as described above, only `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, and `AZURE_CLIENT_SECRET` are needed.
:::

Then configure `win.sign`. The default toolset already ships the `/dlib` integration, so **no `winCodeSign` pin is required**:

```jsonc
{
  "win": {
    "sign": {
      "type": "azure",
      "publisherName": "CN=My Company, O=My Company, C=US",
      "endpoint": "https://weu.codesigning.azure.net/",
      "codeSigningAccountName": "my-trusted-signing-account",
      "certificateProfileName": "my-cert-profile"
    }
  }
}
```

### Execution flow

1. electron-builder writes a `metadata.json` file containing `Endpoint`, `CodeSigningAccountName`, `CertificateProfileName`, and any `additionalMetadata` fields.
2. `signtool.exe sign /dlib Azure.CodeSigning.Dlib.dll /dmdf metadata.json` is invoked. The DLib authenticates to Azure using `DefaultAzureCredential` (reads the env vars above automatically).
3. On macOS/Linux, `signtool.exe` runs inside Wine using the `winCodeSign` toolset bundle — no separate Windows VM required.

### Extra metadata fields

Use `additionalMetadata` to pass extra fields verbatim into `metadata.json`. This covers DLib-specific options not exposed as typed fields:

```jsonc
{
  "win": {
    "sign": {
      "type": "azure",
      "endpoint": "https://weu.codesigning.azure.net/",
      "codeSigningAccountName": "my-account",
      "certificateProfileName": "my-profile",
      "publisherName": "CN=My Company",
      "additionalMetadata": {
        "ExcludeCredentials": "ManagedIdentityCredential",
        "CorrelationId": "my-build-run-id"
      }
    }
  }
}
```

### Legacy PowerShell fallback

The default toolset (`winCodeSign` unset, `null`, or `"latest"`) resolves to the newest bundle (`1.3.0`+) and uses the modern `signtool /dlib` path. Only if you **explicitly** pin `toolsets.winCodeSign` below `"1.3.0"` (for example `"1.2.1"`, or the legacy `"0.0.0"`) does electron-builder fall back to the v26 PowerShell `Invoke-TrustedSigning` integration and emit a deprecation warning. This fallback will be removed in a future release, so avoid pinning an older toolset unless you specifically need it.

### Caveats

- The `ats-bundle` (containing `Azure.CodeSigning.Dlib.dll` and its native dependency closure) and the `dotnet-runtime` bundle ship with `winCodeSign "1.3.0"` and later — which is the default. They are downloaded automatically on first use; no manual setup or toolset pin is required.
- The DLib is a mixed-mode .NET 8 assembly: electron-builder automatically downloads and provides the **.NET 8 runtime** via the separate `dotnet-runtime` bundle — no manual runtime installation is required.
- The DLib authenticates using the Azure environment variables at signing time — credentials are not embedded in config.
- Network connectivity to the Azure endpoint is required during the build. Rate limits or outages will fail the build.

### Configuration reference

{!./app-builder-lib.Interface.WindowsAzureSigningConfig.md!}
