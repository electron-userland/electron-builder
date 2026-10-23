/**
 * Adds the App Transport Security entries that electron-updater's local update proxy needs: local networking, and
 * plain-HTTP exceptions for `localhost` and `127.0.0.1`.
 *
 * `NSAllowsArbitraryLoads` is set to `true` only when the app has not set it already, for example through
 * `mac.extendInfo`, so an explicit `false` is kept.
 */
export function configureLocalhostAts(appPlist: any): void {
  // https://bencoding.com/2015/07/20/app-transport-security-and-localhost/
  let ats = appPlist.NSAppTransportSecurity
  if (ats == null) {
    ats = {}
    appPlist.NSAppTransportSecurity = ats
  }

  ats.NSAllowsLocalNetworking = true
  // https://github.com/electron-userland/electron-builder/issues/3377#issuecomment-446035814
  if (ats.NSAllowsArbitraryLoads == null) {
    ats.NSAllowsArbitraryLoads = true
  }

  let exceptionDomains = ats.NSExceptionDomains
  if (exceptionDomains == null) {
    exceptionDomains = {}
    ats.NSExceptionDomains = exceptionDomains
  }

  if (exceptionDomains.localhost == null) {
    const allowHttp = {
      NSTemporaryExceptionAllowsInsecureHTTPSLoads: false,
      NSIncludesSubdomains: false,
      NSTemporaryExceptionAllowsInsecureHTTPLoads: true,
      NSTemporaryExceptionMinimumTLSVersion: "1.0",
      NSTemporaryExceptionRequiresForwardSecrecy: false,
    }
    exceptionDomains.localhost = allowHttp
    exceptionDomains["127.0.0.1"] = allowHttp
  }
}
