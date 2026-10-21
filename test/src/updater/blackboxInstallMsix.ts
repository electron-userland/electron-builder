import { execFileSync } from "child_process"
import { randomUUID } from "crypto"
import { homedir } from "os"
import path from "path"
import { existsSync, outputFile, remove } from "fs-extra"
import type { VmManager } from "app-builder-lib/src/vm/vm"
import { createLocalServer, getParallelsHostIP, sha256File, toVmHomePath } from "../helpers/launchAppCrossPlatform"

export interface MsixInstallResult {
  /** The Windows package family name, e.g. "TestApp_abcde12345xyz" — used to uninstall. */
  packageFamilyName: string
  /** SHA-1 thumbprint of the signing cert that was trusted, or empty if no extra trust was needed. */
  certThumbprint: string
  /** Full path to the installed app directory inside the Windows package cache. */
  installLocation: string
}

// ─── Parallels VM ────────────────────────────────────────────────────────────

/**
 * Delivers an MSIX (or .msixbundle) to the Parallels VM via HTTP, trusts its
 * signing cert, installs it, and returns the package identifiers needed for
 * verification and cleanup.
 *
 * Requires Developer Mode to be enabled on the VM (AllowDevelopmentWithoutDevLicense=1) so
 * that `Add-AppxPackage -AllowUnsigned` can install test-signed packages without cert trust.
 *
 * Runs as the logged-in user via `vm.exec()` (--current-user) because `Add-AppxPackage`
 * is a per-user operation that the Local System account cannot perform.
 */
export async function installMsixInVm(vm: VmManager, msixPath: string, identityName: string): Promise<MsixInstallResult> {
  const hostIP = getParallelsHostIP()
  if (!hostIP) {
    throw new Error("Cannot determine Parallels host IP — no prl*/bridge* interface found")
  }
  if (!/^[\d.]+$/.test(hostIP)) {
    throw new Error(`Unsafe hostIP: ${hostIP}`)
  }

  const expectedSha256 = await sha256File(msixPath)
  if (!/^[0-9a-f]{64}$/i.test(expectedSha256)) {
    throw new Error(`Unexpected SHA-256 value: ${expectedSha256}`)
  }

  const { server, port } = await createLocalServer(path.dirname(msixPath), "0.0.0.0")
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error(`Unsafe port: ${port}`)
  }

  const filename = encodeURIComponent(path.basename(msixPath))
  const scriptPath = path.join(homedir(), `.eb-msix-install-${randomUUID()}.ps1`)

  const psScript = [
    `$ErrorActionPreference = 'Stop'`,
    `$tmpDir = $null`,
    `try {`,
    `    $tmpDir = Join-Path $env:TEMP ([Guid]::NewGuid().ToString())`,
    `    New-Item -ItemType Directory -Path $tmpDir | Out-Null`,
    `    $dest = Join-Path $tmpDir 'package.msix'`,
    `    Invoke-WebRequest -Uri 'http://${hostIP}:${port}/${filename}' -OutFile $dest -UseBasicParsing`,
    `    $actualHash = (Get-FileHash $dest -Algorithm SHA256).Hash.ToLower()`,
    `    if ($actualHash -ne '${expectedSha256}') { Write-Error "Hash mismatch: $actualHash"; exit 1 }`,
    `    Write-Output 'HASH_OK:true'`,
    // Remove previous installation of the same package family to avoid version conflicts
    `    $existing = Get-AppxPackage -Name '${identityName}' -ErrorAction SilentlyContinue`,
    `    if ($existing) { Remove-AppxPackage -Package $existing.PackageFullName -ErrorAction SilentlyContinue }`,
    `    Unblock-File -Path $dest -ErrorAction SilentlyContinue`,
    // -AllowUnsigned requires Developer Mode (AllowDevelopmentWithoutDevLicense=1), which avoids
    // needing to add the test-signing cert to LocalMachine\TrustedPeople (requires UAC elevation).
    `    Add-AppxPackage -Path $dest -AllowUnsigned`,
    `    $pkg = Get-AppxPackage -Name '${identityName}'`,
    `    if (-not $pkg) { Write-Error 'Package not found after installation'; exit 1 }`,
    `    Write-Output "PFN:$($pkg.PackageFamilyName)"`,
    `    Write-Output "INSTALL_LOCATION:$($pkg.InstallLocation)"`,
    `    Write-Output "INSTALLED_VERSION:$($pkg.Version)"`,
    `} finally {`,
    `    if ($tmpDir) { Remove-Item $tmpDir -Recurse -Force -ErrorAction SilentlyContinue }`,
    `}`,
  ].join("\n")

  await outputFile(scriptPath, psScript)
  const winScriptPath = toVmHomePath(scriptPath)

  let output: string
  try {
    // Use --current-user: Add-AppxPackage cannot be called by the Local System account
    output = await vm.exec("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", winScriptPath], { timeout: 120_000 })
    console.log("[installMsixInVm] output:", output)
  } finally {
    server.close()
    await remove(scriptPath).catch(() => {})
  }

  const pfnMatch = output.match(/PFN:(\S+)/)
  const locationMatch = output.match(/INSTALL_LOCATION:(.+)/)

  if (!pfnMatch) {
    throw new Error(`PFN not found in output:\n${output}`)
  }

  return {
    packageFamilyName: pfnMatch[1].trim(),
    installLocation: locationMatch ? locationMatch[1].trim() : "",
    certThumbprint: "", // No cert added; Developer Mode allows -AllowUnsigned
  }
}

/**
 * Uninstalls an MSIX package from the VM and optionally removes the trusted cert.
 */
export async function uninstallMsixInVm(vm: VmManager, packageFamilyName: string, _certThumbprint: string): Promise<void> {
  // No cert cleanup needed since we use -AllowUnsigned (Developer Mode) and don't add certs.
  // Run as current user because Remove-AppxPackage is also a per-user operation.
  const psCommand = `$pkg = Get-AppxPackage | Where-Object { $_.PackageFamilyName -eq '${packageFamilyName}' } | Select-Object -First 1; if ($pkg) { Remove-AppxPackage -Package $pkg.PackageFullName -ErrorAction SilentlyContinue }`
  await vm.exec("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", psCommand]).catch(() => {})
}

/**
 * Launches the installed MSIX app directly from its install location and waits
 * for it to emit "APP_VERSION:<n.n.n>" on stdout, then kills it.
 * Returns the version string.
 */
export async function launchMsixAppInVm(vm: VmManager, installLocation: string, exeName: string, timeoutMs = 30_000): Promise<string> {
  const exePath = `${installLocation}\\app\\${exeName}`
  const psCommand = `$proc = Start-Process -FilePath '${exePath}' -PassThru -NoNewWindow; Start-Sleep -Seconds 5; Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue; Write-Output 'LAUNCHED:true'`
  const output = await vm.exec("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", psCommand], { timeout: timeoutMs })
  return output
}

// ─── native Windows ───────────────────────────────────────────────────────────

// bounds a PowerShell that hangs (e.g. a deployment that never completes); installing a large package takes a minute or two
const POWERSHELL_TIMEOUT_MS = 5 * 60 * 1000

/**
 * Runs `script` with Windows PowerShell and returns its stdout; throws with the script, stdout and stderr when it fails. `env` passes values to
 * the script as environment variables, e.g. a secret that must not be on the command line.
 *
 * PSModulePath is removed from the environment in every casing (Windows variable names are case-insensitive, the keys of a copy of process.env
 * are not), as in windowsExecutableCodeSignatureVerifier.ts. Without it, module auto-loading fails on Windows Server 2025 runners (see
 * helpers/windowsSignedFixture.ts), so the modules the scripts use are imported by their $PSHOME path (Management and Utility for cmdlets such
 * as Join-Path and Sort-Object), and certificates go through X509Store, not the Cert: drive.
 */
function runWindowsPowerShell(script: string, env: Record<string, string> = {}): string {
  const fullScript = [
    "$ErrorActionPreference = 'Stop'",
    "$ProgressPreference = 'SilentlyContinue'",
    `foreach ($module in 'Microsoft.PowerShell.Management', 'Microsoft.PowerShell.Utility', 'Appx') { Import-Module "$PSHOME\\Modules\\$module" }`,
    script,
  ].join("\n")
  const processEnv: NodeJS.ProcessEnv = { ...process.env, ...env }
  for (const key of Object.keys(processEnv)) {
    if (key.toLowerCase() === "psmodulepath") {
      delete processEnv[key]
    }
  }
  const args = ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", Buffer.from(fullScript, "utf16le").toString("base64")]
  try {
    return execFileSync("powershell.exe", args, { encoding: "utf8", env: processEnv, stdio: ["ignore", "pipe", "pipe"], timeout: POWERSHELL_TIMEOUT_MS })
  } catch (err: any) {
    const reason = err.status == null ? (err.signal ?? err.code) : `exit code ${err.status}`
    throw new Error(`PowerShell failed (${reason}):\n${script}\n--- stdout ---\n${err.stdout ?? ""}\n--- stderr ---\n${err.stderr ?? ""}`)
  }
}

// a PowerShell single-quoted string: the ASCII and Unicode (U+2018–U+201B) single quotes PowerShell accepts are doubled
function psQuote(value: string): string {
  return `'${value.replace(/['\u2018\u2019\u201A\u201B]/g, "$&$&")}'`
}

/** The value of the `<key>:<value>` line a script wrote. */
function readOutputValue(output: string, key: string): string {
  const value = new RegExp(`^${key}:(\\S+)`, "m").exec(output)?.[1]
  if (value == null) {
    throw new Error(`No ${key} in the PowerShell output:\n${output}`)
  }
  return value
}

// Windows installs a package whose signing certificate is in LocalMachine\TrustedPeople; writing to it needs elevation
const OPEN_TRUSTED_PEOPLE_STORE = [
  "$store = [System.Security.Cryptography.X509Certificates.X509Store]::new([System.Security.Cryptography.X509Certificates.StoreName]::TrustedPeople, [System.Security.Cryptography.X509Certificates.StoreLocation]::LocalMachine)",
  "$store.Open([System.Security.Cryptography.X509Certificates.OpenFlags]::ReadWrite)",
]

/**
 * Trusts the certificate of a code-signing identity (a base64 PKCS#12, e.g. from getWindowsSigningIdentity) for package installs on native Windows:
 * adds its public part to LocalMachine\TrustedPeople (needs elevation). Returns its thumbprint for removeTrustedCertificateNative.
 */
export function trustCertificateNative(p12Base64: string, password: string): string {
  const output = runWindowsPowerShell(
    [
      // [string]: an empty password may arrive as $null
      "$pfx = [System.Security.Cryptography.X509Certificates.X509Certificate2]::new([Convert]::FromBase64String($env:EB_TEST_P12_BASE64), [string]$env:EB_TEST_P12_PASSWORD)",
      "$cert = [System.Security.Cryptography.X509Certificates.X509Certificate2]::new($pfx.RawData)",
      ...OPEN_TRUSTED_PEOPLE_STORE,
      "$store.Add($cert)",
      "$store.Close()",
      'Write-Output "THUMBPRINT:$($cert.Thumbprint)"',
    ].join("\n"),
    // not in the script: the password is a secret, and a PKCS#12 with its chain can exceed the length of a command line
    { EB_TEST_P12_BASE64: p12Base64, EB_TEST_P12_PASSWORD: password }
  )
  return readOutputValue(output, "THUMBPRINT")
}

/** Removes a certificate that trustCertificateNative added to LocalMachine\TrustedPeople. */
export function removeTrustedCertificateNative(thumbprint: string): void {
  if (!/^[0-9A-F]{40}$/i.test(thumbprint)) {
    throw new Error(`Not a certificate thumbprint: ${thumbprint}`)
  }
  runWindowsPowerShell(
    [
      ...OPEN_TRUSTED_PEOPLE_STORE,
      `foreach ($cert in $store.Certificates.Find([System.Security.Cryptography.X509Certificates.X509FindType]::FindByThumbprint, '${thumbprint}', $false)) { $store.Remove($cert) }`,
      "$store.Close()",
    ].join("\n")
  )
}

/** A pipeline of the installed packages named `identityName` of the current user, highest version first. */
function installedPackages(identityName: string): string {
  return `Get-AppxPackage -Name ${psQuote(identityName)} | Sort-Object { [version]$_.Version } -Descending`
}

/** Removes every installed package named `identityName` (any version) of the current user. */
export function removeMsixPackagesNative(identityName: string): void {
  runWindowsPowerShell(`${installedPackages(identityName)} | ForEach-Object { Remove-AppxPackage -Package $_.PackageFullName }`)
}

export interface InstalledMsixPackage {
  /** e.g. `TestAppMsixUpdate_by1eqepggsspe` */
  readonly packageFamilyName: string
  /** the 4-part package version, e.g. `1.0.0.0` */
  readonly version: string
  /** how Windows classifies the package signature: `Developer`, `Enterprise`, `None`, `Store` or `System` */
  readonly signatureKind: string
}

/**
 * Installs a signed .msix / .msixbundle on native Windows as a user does (`Add-AppxPackage -Path`), so its signing certificate has to be trusted
 * (trustCertificateNative). An installed package of the same name is removed first.
 */
export function addMsixPackageNative(packagePath: string, identityName: string): InstalledMsixPackage {
  const output = runWindowsPowerShell(
    [
      `${installedPackages(identityName)} | ForEach-Object { Remove-AppxPackage -Package $_.PackageFullName }`,
      `Add-AppxPackage -Path ${psQuote(packagePath)}`,
      `$pkg = ${installedPackages(identityName)} | Select-Object -First 1`,
      `if (-not $pkg) { throw ${psQuote(`Package ${identityName} is not installed after Add-AppxPackage`)} }`,
      'Write-Output "PFN:$($pkg.PackageFamilyName)"',
      'Write-Output "VERSION:$($pkg.Version)"',
      'Write-Output "SIGNATURE_KIND:$($pkg.SignatureKind)"',
    ].join("\n")
  )
  return { packageFamilyName: readOutputValue(output, "PFN"), version: readOutputValue(output, "VERSION"), signatureKind: readOutputValue(output, "SIGNATURE_KIND") }
}

/** The version of the installed package named `identityName` (the highest one when several are installed), or `null` when none is. */
export function getMsixPackageVersionNative(identityName: string): string | null {
  const output = runWindowsPowerShell([`$pkg = ${installedPackages(identityName)} | Select-Object -First 1`, 'if ($pkg) { Write-Output "VERSION:$($pkg.Version)" }'].join("\n"))
  return /^VERSION:(\S+)/m.exec(output)?.[1] ?? null
}

/** Waits until Windows has created the app execution alias `aliasPath` (in `%LOCALAPPDATA%\Microsoft\WindowsApps`) of an installed package. */
export async function waitForAppExecutionAlias(aliasPath: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  // an alias is a reparse point; existsSync reads its attributes without opening it
  while (!existsSync(aliasPath)) {
    if (Date.now() > deadline) {
      throw new Error(`The app execution alias ${aliasPath} does not exist ${timeoutMs} ms after the install`)
    }
    await new Promise(resolve => setTimeout(resolve, 500))
  }
}

/**
 * Installs an MSIX / .msixbundle on native Windows by extracting it to a loose layout and
 * registering it (`Add-AppxPackage -Register AppxManifest.xml`) — the standard dev-loop install,
 * which needs only Developer Mode (AllowDevelopmentWithoutDevLicense=1): NOT admin and NOT a
 * trusted signature. (A packed .msix cannot be deployed via `-AllowUnsigned` — 0x80073D2B, its
 * content requires a trusted signature — and trusting the self-signed test cert in LocalMachine
 * would require UAC elevation.)
 */
export function installMsixNative(msixPath: string, identityName: string): MsixInstallResult {
  const layoutDir = path.join(require("os").tmpdir(), `eb-msix-reg-${randomUUID()}`)
  const psScript = [
    `Add-Type -AssemblyName System.IO.Compression.FileSystem`,
    `$src = '${msixPath.replace(/'/g, "''")}'`,
    `$layout = '${layoutDir.replace(/'/g, "''")}'`,
    `$bundleEx = $null`,
    // A .msixbundle is a container of per-arch .msix packages; register the x64 inner package.
    `if ($src.ToLower().EndsWith('.msixbundle')) {`,
    `    $bundleEx = Join-Path $env:TEMP ('eb-msix-bundle-' + [Guid]::NewGuid().ToString())`,
    `    [System.IO.Compression.ZipFile]::ExtractToDirectory($src, $bundleEx)`,
    `    $inner = Get-ChildItem $bundleEx -Filter *.msix | Where-Object { $_.Name -match 'x64' } | Select-Object -First 1`,
    `    if (-not $inner) { $inner = Get-ChildItem $bundleEx -Filter *.msix | Select-Object -First 1 }`,
    `    if (-not $inner) { Write-Error 'No inner .msix found in bundle'; exit 1 }`,
    `    $src = $inner.FullName`,
    `}`,
    // Extract the package to a loose layout (Add-AppxPackage -Register tolerates AppxBlockMap.xml etc.).
    `if (Test-Path $layout) { Remove-Item $layout -Recurse -Force }`,
    `[System.IO.Compression.ZipFile]::ExtractToDirectory($src, $layout)`,
    `if ($bundleEx) { Remove-Item $bundleEx -Recurse -Force -ErrorAction SilentlyContinue }`,
    // Remove any prior registration of the same package family to avoid version conflicts.
    `$existing = Get-AppxPackage -Name '${identityName}' -ErrorAction SilentlyContinue`,
    `if ($existing) { Remove-AppxPackage -Package $existing.PackageFullName -ErrorAction SilentlyContinue }`,
    `Add-AppxPackage -Register (Join-Path $layout 'AppxManifest.xml')`,
    `$pkg = Get-AppxPackage -Name '${identityName}'`,
    `if (-not $pkg) { Write-Error "Package '${identityName}' not found after registration"; exit 1 }`,
    `Write-Output "PFN:$($pkg.PackageFamilyName)"`,
    `Write-Output "INSTALL_LOCATION:$($pkg.InstallLocation)"`,
  ].join("\n")

  let output: string
  try {
    output = runWindowsPowerShell(psScript)
  } catch (err: any) {
    throw new Error(`MSIX install failed: ${err.message}`)
  }
  const pfnMatch = output.match(/PFN:(\S+)/)
  const locationMatch = output.match(/INSTALL_LOCATION:(.+)/)
  if (!pfnMatch) {
    throw new Error(`PFN not found in powershell output:\n${output}`)
  }
  return {
    packageFamilyName: pfnMatch[1].trim(),
    installLocation: locationMatch ? locationMatch[1].trim() : "",
    certThumbprint: "", // registration uses no signature/cert
  }
}

export function uninstallMsixNative(packageFamilyName: string, _certThumbprint: string): void {
  // Remove the package and the loose layout it was registered from (its InstallLocation — an
  // eb-msix-reg-* temp dir). No cert cleanup needed: registration uses no signature/cert.
  const lines = [
    `$pkg = Get-AppxPackage | Where-Object { $_.PackageFamilyName -eq '${packageFamilyName}' } | Select-Object -First 1`,
    `if ($pkg) {`,
    `  $loc = $pkg.InstallLocation`,
    `  Remove-AppxPackage -Package $pkg.PackageFullName -ErrorAction SilentlyContinue`,
    `  if ($loc -and (Split-Path $loc -Leaf).StartsWith('eb-msix-reg-')) { Remove-Item -LiteralPath $loc -Recurse -Force -ErrorAction SilentlyContinue }`,
    `}`,
  ]
  runWindowsPowerShell(lines.join("\n"))
}
