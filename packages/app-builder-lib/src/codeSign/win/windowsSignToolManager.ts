// All implementations live in signtoolBaseSignManager.ts.
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
} from "./signtoolBaseSignManager.js"
