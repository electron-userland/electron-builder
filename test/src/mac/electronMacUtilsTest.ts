import { expect } from "vitest"
import { configureLocalhostAts } from "app-builder-lib/out/electron/electronMacUtils"

describe("electronMacUtils", () => {
  describe("configureLocalhostAts", () => {
    test("adds local networking, arbitrary loads and localhost exceptions to an empty plist", () => {
      const plist: any = {}
      configureLocalhostAts(plist)
      expect(plist.NSAppTransportSecurity.NSAllowsLocalNetworking).toBe(true)
      expect(plist.NSAppTransportSecurity.NSAllowsArbitraryLoads).toBe(true)
      expect(plist.NSAppTransportSecurity.NSExceptionDomains.localhost.NSTemporaryExceptionAllowsInsecureHTTPLoads).toBe(true)
      expect(plist.NSAppTransportSecurity.NSExceptionDomains["127.0.0.1"]).toEqual(plist.NSAppTransportSecurity.NSExceptionDomains.localhost)
    })

    test("still defaults NSAllowsArbitraryLoads to true when extendInfo sets other ATS keys but not this one", () => {
      const plist: any = { NSAppTransportSecurity: { NSAllowsArbitraryLoadsInWebContent: true } }
      configureLocalhostAts(plist)
      expect(plist.NSAppTransportSecurity.NSAllowsArbitraryLoads).toBe(true)
      expect(plist.NSAppTransportSecurity.NSAllowsArbitraryLoadsInWebContent).toBe(true)
    })

    test("keeps an explicit NSAllowsArbitraryLoads: false from extendInfo", () => {
      const plist: any = { NSAppTransportSecurity: { NSAllowsArbitraryLoads: false } }
      configureLocalhostAts(plist)
      expect(plist.NSAppTransportSecurity.NSAllowsArbitraryLoads).toBe(false)
      expect(plist.NSAppTransportSecurity.NSAllowsLocalNetworking).toBe(true)
      expect(plist.NSAppTransportSecurity.NSExceptionDomains.localhost).toBeDefined()
    })

    test("keeps an existing localhost exception", () => {
      const custom = { NSTemporaryExceptionAllowsInsecureHTTPLoads: false }
      const plist: any = { NSAppTransportSecurity: { NSExceptionDomains: { localhost: custom } } }
      configureLocalhostAts(plist)
      expect(plist.NSAppTransportSecurity.NSExceptionDomains.localhost).toBe(custom)
    })
  })
})
