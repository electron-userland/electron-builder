// Backward-compatibility shim. All implementations have moved to dedicated files:
//   SigntoolSignManager → signtoolBaseSignManager.ts
//   HsmSignManager     → hsmSignManager.ts
//   Pkcs11SignManager  → pkcs11SignManager.ts
// WindowsSignToolManager is preserved as an alias for SigntoolSignManager.
export {
  CertificateFromStoreInfo,
  CertificateInfo,
  CustomWindowsSign,
  CustomWindowsSignTaskConfiguration,
  FileCodeSigningInfo,
  getSigntoolFamilyConfig,
  SigntoolSignManager as WindowsSignToolManager,
  WindowsSignTaskConfiguration,
  WindowsSignToolOptions,
} from "./signtoolBaseSignManager"
