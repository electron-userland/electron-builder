/**
 * @module util-entitlements
 */

'use strict'

const { executeAppBuilderAsJson, executeAppBuilderAndWriteJson } = require("../out/util/appBuilder")

const os = require('os')
const path = require('path')

const util = require('./util')
const debuglog = util.debuglog
const getAppContentsPath = util.getAppContentsPath

let tmpFileCounter = 0

/**
 * This function returns a promise completing the entitlements automation: The process includes checking in `Info.plist` for `ElectronTeamID` or setting parsed value from identity, and checking in entitlements file for `com.apple.security.application-groups` or inserting new into array. A temporary entitlements file may be created to replace the input for any changes introduced.
 * @function
 * @param {Object} opts - Options.
 * @returns {Promise} Promise.
 */
async function preAutoEntitlements(opts) {
  // If entitlements file not provided, default will be used. Fixes #41
  const appInfoPath = path.join(getAppContentsPath(opts), 'Info.plist')

  debuglog('Automating entitlement app group...', '\n',
    '> Info.plist:', appInfoPath, '\n',
    '> Entitlements:', opts.entitlements)

  const plistContent = await executeAppBuilderAsJson(["decode-plist", "-f", opts.entitlements, "-f", appInfoPath])
  let entitlements = plistContent[0]
  if (!entitlements['com.apple.security.app-sandbox']) {
    // Only automate when app sandbox enabled by user
    return
  }

  const appInfo = plistContent[1]

  // Use ElectronTeamID in Info.plist if already specified
  if (appInfo.ElectronTeamID) {
    debuglog('`ElectronTeamID` found in `Info.plist`: ' + appInfo.ElectronTeamID)
  } else {
    // The team identifier in signing identity should not be trusted
    if (opts['provisioning-profile']) {
      appInfo.ElectronTeamID = opts['provisioning-profile'].message.Entitlements['com.apple.developer.team-identifier']
      debuglog('`ElectronTeamID` not found in `Info.plist`, use parsed from provisioning profile: ' + appInfo.ElectronTeamID)
    } else {
      appInfo.ElectronTeamID = opts.identity.name.substring(opts.identity.name.indexOf('(') + 1, opts.identity.name.lastIndexOf(')'))
      debuglog('`ElectronTeamID` not found in `Info.plist`, use parsed from signing identity: ' + appInfo.ElectronTeamID)
    }
    await executeAppBuilderAndWriteJson(["encode-plist"], {[appInfoPath]: appInfo})
    debuglog('`Info.plist` updated:', '\n', '> Info.plist:', appInfoPath)
  }

  const appIdentifier = appInfo.ElectronTeamID + '.' + appInfo.CFBundleIdentifier
  // Insert application identifier if not exists
  if (entitlements['com.apple.application-identifier']) {
    debuglog('`com.apple.application-identifier` found in entitlements file: ' + entitlements['com.apple.application-identifier'])
  } else {
    debuglog('`com.apple.application-identifier` not found in entitlements file, new inserted: ' + appIdentifier)
    entitlements['com.apple.application-identifier'] = appIdentifier
  }
  // Insert developer team identifier if not exists
  if (entitlements['com.apple.developer.team-identifier']) {
    debuglog('`com.apple.developer.team-identifier` found in entitlements file: ' + entitlements['com.apple.developer.team-identifier'])
  } else {
    debuglog('`com.apple.developer.team-identifier` not found in entitlements file, new inserted: ' + appInfo.ElectronTeamID)
    entitlements['com.apple.developer.team-identifier'] = appInfo.ElectronTeamID
  }
  // Init entitlements app group key to array if not exists
  if (!entitlements['com.apple.security.application-groups']) {
    entitlements['com.apple.security.application-groups'] = []
  }
  // Insert app group if not exists
  if (Array.isArray(entitlements['com.apple.security.application-groups']) && entitlements['com.apple.security.application-groups'].indexOf(appIdentifier) === -1) {
    debuglog('`com.apple.security.application-groups` not found in entitlements file, new inserted: ' + appIdentifier)
    entitlements['com.apple.security.application-groups'].push(appIdentifier)
  } else {
    debuglog('`com.apple.security.application-groups` found in entitlements file: ' + appIdentifier)
  }

  // Create temporary entitlements file
  const entitlementsPath = path.join(os.tmpdir(), `tmp-entitlements-${process.pid.toString(16)}-${(tmpFileCounter++).toString(16)}.plist`)
  opts.entitlements = entitlementsPath
  await executeAppBuilderAndWriteJson(["encode-plist"], {[entitlementsPath]: entitlements})
  debuglog('Entitlements file updated:', '\n', '> Entitlements:', entitlementsPath)
}

module.exports.preAutoEntitlements = preAutoEntitlements