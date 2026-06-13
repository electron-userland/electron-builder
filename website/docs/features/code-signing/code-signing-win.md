# Code Signing for Windows

Windows code signing is supported. If the configuration values are provided correctly in your package.json, then signing should be automatically executed.

:::tip
Windows is dual code-signed (SHA1 & SHA256 hashing algorithms).
:::

To sign an app on Windows, there are two types of certificates:

* EV Code Signing Certificate
* Code Signing Certificate

Both certificates work with auto-update. The regular (and often cheaper) Code Signing Certificate shows a warning during installation that goes away once enough users installed your application and you've built up trust. The EV Certificate has more trust and thus works immediately without any warnings. However, it is not possible to export the EV Certificate as it is bound to a physical USB dongle. Thus, you can't export the certificate for signing code on a CI, such as AppVeyor.

If you are using an EV Certificate, you need to provide [`certificateSubjectName`](#certificatesubjectname) in your win configuration.

If you use Windows 7, please ensure that [PowerShell](https://blogs.technet.microsoft.com/heyscriptingguy/2013/06/02/weekend-scripter-install-powershell-3-0-on-windows-7/) is updated to version 3.0.

If you are on Linux or Mac and you want sign a Windows app using EV Code Signing Certificate, please use [the guide for Unix systems](../../tutorials/code-signing-windows-apps-on-unix.md).

---

## Unified `win.sign` key

All Windows code signing is configured under a single `win.sign` key using a discriminated union with an explicit `type` field:

| `win.sign` value | Behavior |
|---|---|
| unset | Sign using credentials discovered from the environment (`WIN_CSC_LINK` / `CSC_LINK`) |
| `{ type: "signtool", ... }` | Sign with a local `.pfx`/`.p12` certificate file or Windows cert store |
| `{ type: "hsm", ... }` | Sign via Hardware Security Module / FIPS token (Windows only) — **Beta** |
| `{ type: "pkcs11", ... }` | Sign via PKCS#11 hardware token using osslsigncode (macOS/Linux CI) — **Beta** |
| `{ type: "azure", ... }` | Sign via Azure Trusted Signing cloud service — **Beta** |
| `false` or `null` | Disable signing (resedit resource editing still runs) |

Combining `win.sign: false` with `forceCodeSigning: true` is a configuration error and fails the build.

---

## Signtool Signing (`type: "signtool"`)

The standard signing mode. Signs executables with a local certificate file (`.pfx`/`.p12`) or a certificate from the Windows certificate store via `signtool.exe` (Wine on macOS/Linux).

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

1. `cscInfo` resolves the certificate from `certificateFile`, `certificateSha1`, `certificateSubjectName`, or the `WIN_CSC_LINK` env var.
2. For each file, `signtool.exe sign` is called twice in sequence: once for SHA1, once for SHA256 (`/as` nested signature).
3. On macOS/Linux, `signtool.exe` runs inside Wine using the `winCodeSign` toolset bundle.

### Configuration reference

{!./app-builder-lib.Interface.WindowsSigntoolSigningConfig.md!}

---

## HSM Signing (`type: "hsm"`) — Beta

:::warning[Beta feature]
HSM signing is available in v27 as a **beta** feature. The configuration interface is stable, but real-hardware test coverage is limited. Please [report issues](https://github.com/electron-userland/electron-builder/issues) if you encounter problems.
:::

Signs using a Hardware Security Module (HSM), FIPS-compliant token, or smart card via `signtool.exe`'s `/csp` (cryptographic service provider) and `/kc` (key container) flags. The private key never leaves the hardware; only the public certificate chain needs to be accessible to electron-builder.

**Platform:** Windows only. For macOS/Linux CI without a Windows VM, use [`type: "pkcs11"`](#pkcs11-signing-typepkcs11--beta) instead.

**Requirement:** `toolsets.winCodeSign` must be `"1.0.0"` or `"1.1.0"`. The legacy `"0.0.0"` toolset does not include the required signtool version.

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
  },
  "toolsets": {
    "winCodeSign": "1.1.0"
  }
}
```

### Execution flow

1. `signtool.exe sign` is invoked with `/csp <cryptoServiceProvider>` and `/kc <keyContainer>`.
2. The certificate is identified via `certificateFile`, `certificateSha1`, or `certificateSubjectName`.
3. The HSM performs the private-key operation; the resulting signature is embedded by signtool.
4. SHA256 signing only (no SHA1 dual-sign path for HSM).

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
The `signtool /dlib` Azure Trusted Signing integration introduced in v27 is a **beta** feature. The legacy PowerShell fallback (triggered when `toolsets.winCodeSign` is unset or `"0.0.0"`) remains available during the migration window. Please [report issues](https://github.com/electron-userland/electron-builder/issues) if you encounter problems.
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

Then configure `win.sign` and pin the `winCodeSign` toolset (required for the `/dlib` integration):

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
  },
  "toolsets": {
    "winCodeSign": "1.2.0"
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

If `toolsets.winCodeSign` is unset or below `"1.2.0"`, electron-builder automatically falls back to the v26 PowerShell `Invoke-TrustedSigning` integration and emits a deprecation warning. This fallback will be removed in a future release. To upgrade, add `"toolsets": { "winCodeSign": "1.2.0" }` to your config.

### Caveats

- The `Azure.CodeSigning.Dlib.dll` ships in the `winCodeSign` bundle starting from `1.2.0`. Setting `toolsets.winCodeSign: "1.2.0"` (or higher) is required for the new integration.
- The DLib is a framework-dependent .NET assembly: the **.NET 8 runtime (or later)** must be installed on the signing machine. On macOS/Linux, the *Windows* .NET runtime must be installed inside the Wine prefix (wine-mono is not sufficient).
- The DLib authenticates using the Azure environment variables at signing time — credentials are not embedded in config.
- Network connectivity to the Azure endpoint is required during the build. Rate limits or outages will fail the build.

### Configuration reference

{!./app-builder-lib.Interface.WindowsAzureSigningConfig.md!}
