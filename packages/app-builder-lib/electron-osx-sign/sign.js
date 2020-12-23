/**
 * @module sign
 */

'use strict'

const path = require('path')
const fs = require('fs')
const semver = require('semver')

const util = require('./util')
const debuglog = util.debuglog
const debugwarn = util.debugwarn
const getAppContentsPath = util.getAppContentsPath
const execFileAsync = util.execFileAsync
const validateOptsAppAsync = util.validateOptsAppAsync
const validateOptsPlatformAsync = util.validateOptsPlatformAsync
const walkAsync = util.walkAsync
const Identity = require('./util-identities').Identity
const findIdentitiesAsync = require('./util-identities').findIdentitiesAsync
const ProvisioningProfile = require('./util-provisioning-profiles').ProvisioningProfile
const preEmbedProvisioningProfile = require('./util-provisioning-profiles').preEmbedProvisioningProfile
const preAutoEntitlements = require('./util-entitlements').preAutoEntitlements

const osRelease = require('os').release()

/**
 * This function returns a promise validating opts.binaries, the additional binaries to be signed along with the discovered enclosed components.
 * @function
 * @param {Object} opts - Options.
 * @returns {Promise} Promise.
 */
function validateOptsBinariesAsync (opts) {
  return new Promise(function (resolve, reject) {
    if (opts.binaries) {
      if (!Array.isArray(opts.binaries)) {
        reject(new Error('Additional binaries should be an Array.'))
        return
      }
      // TODO: Presence check for binary files, reject if any does not exist
    }
    resolve()
  })
}

/**
 * This function returns a promise validating all options passed in opts.
 * @function
 * @param {Object} opts - Options.
 * @returns {Promise} Promise.
 */
function validateSignOptsAsync (opts) {
  if (opts.ignore && !(opts.ignore instanceof Array)) {
    opts.ignore = [opts.ignore]
  }

  if (opts['provisioning-profile']) {
    if (typeof opts['provisioning-profile'] !== 'string' && !(opts['provisioning-profile'] instanceof ProvisioningProfile)) return Promise.reject(new Error('Path to provisioning profile should be a string or a ProvisioningProfile object.'))
  }

  if (opts['type']) {
    if (opts['type'] !== 'development' && opts['type'] !== 'distribution') return Promise.reject(new Error('Type must be either `development` or `distribution`.'))
  } else {
    opts['type'] = 'distribution'
  }

  return Promise.all([
    validateOptsAppAsync(opts),
    validateOptsPlatformAsync(opts),
    validateOptsBinariesAsync(opts),
  ])
}

/**
 * This function returns a promise verifying the code sign of application bundle.
 * @function
 * @param {Object} opts - Options.
 * @returns {Promise} Promise resolving output.
 */
async function verifySignApplicationAsync (opts) {
  // Verify with codesign
  const semver = require('semver')
  debuglog('Verifying application bundle with codesign...')

  await execFileAsync('codesign', [
    '--verify',
    '--deep'
  ]
    .concat(
      opts['strict-verify'] !== false &&
      semver.gte(osRelease, '15.0.0') >= 0 // Strict flag since darwin 15.0.0 --> OS X 10.11.0 El Capitan
        ? ['--strict' +
        (opts['strict-verify']
          ? '=' + opts['strict-verify'] // Array should be converted to a comma separated string
          : '')]
        : [],
      ['--verbose=2', opts.app]))

  // Additionally test Gatekeeper acceptance for darwin platform
  if (opts.platform === 'darwin' && opts['gatekeeper-assess'] !== false) {
    debuglog('Verifying Gatekeeper acceptance for darwin platform...')
    await execFileAsync('spctl', [
      '--assess',
      '--type', 'execute',
      '--verbose',
      '--ignore-cache',
      '--no-cache',
      opts.app
    ])
  }
}

/**
 * This function returns a promise codesigning only.
 * @function
 * @param {Object} opts - Options.
 * @returns {Promise} Promise.
 */
function signApplicationAsync (opts) {
  const appContentsPath = getAppContentsPath(opts)
  return walkAsync(appContentsPath)
    .then(async function (childPaths) {
      function ignoreFilePath (opts, filePath) {
        if (opts.ignore) {
          return opts.ignore.some(function (ignore) {
            if (typeof ignore === 'function') {
              return ignore(filePath)
            }
            return filePath.match(ignore)
          })
        }
        return false
      }

      if (opts.binaries) {
        // Accept absolute paths for external binaries, else resolve relative paths from the artifact's app Contents path.
        const userDefinedBinaries = opts.binaries.map(function (destination) { return fs.existsSync(destination) ? destination : path.resolve(appContentsPath, destination)})
        // Insert at front to prioritize signing. We still sort by depth next
        childPaths = userDefinedBinaries.concat(childPaths)
        debuglog('Signing addtional user-defined binaries: ' + JSON.stringify(userDefinedBinaries, null, 1))
      }

      /**
       * Sort the child paths by how deep they are in the file tree.  Some arcane apple
       * logic expects the deeper files to be signed first otherwise strange errors get
       * thrown our way
       */
      childPaths = childPaths.sort((a, b) => {
        const aDepth = a.split(path.sep).length
        const bDepth = b.split(path.sep).length
        return bDepth - aDepth
      })


      const args = [
        '--sign', opts.identity.hash || opts.identity.name,
        '--force'
      ]
      if (opts.keychain) {
        args.push('--keychain', opts.keychain)
      }
      if (opts.requirements) {
        args.push('--requirements', opts.requirements)
      }
      if (opts.timestamp) {
        args.push('--timestamp=' + opts.timestamp)
      } else {
        args.push('--timestamp')
      }
      if (opts['signature-size']) {
        if (Number.isInteger(opts['signature-size']) && opts['signature-size'] > 0) {
          args.push('--signature-size', opts['signature-size'])
        } else {
          debugwarn(`Invalid value provided for --signature-size (${opts['signature-size']}). Must be a positive integer.`)
        }
      }

      let optionsArguments = []

      if (opts['signature-flags']) {
        if (Array.isArray(opts['signature-flags'])) {
          optionsArguments = [...opts['signature-flags']]
        } else {
          const flags = opts['signature-flags'].split(',').map(function (flag) { return flag.trim() })
          optionsArguments = [...flags]
        }
      }

      if (opts.hardenedRuntime || opts['hardened-runtime'] || optionsArguments.includes('runtime')) {
        // Hardened runtime since darwin 17.7.0 --> macOS 10.13.6
        if (semver.gte(osRelease, '17.7.0') >= 0) {
          optionsArguments.push('runtime')
        } else {
          // Remove runtime if passed in with --signature-flags
          debuglog('Not enabling hardened runtime, current macOS version too low, requires 10.13.6 and higher')
          optionsArguments = optionsArguments.filter(function (element, index) { return element !== 'runtime' })
        }
      }

      if (opts['restrict']) {
        optionsArguments.push('restrict')
        debugwarn('This flag is to be deprecated, consider using --signature-flags=restrict instead')
      }

      if (optionsArguments.length) {
        args.push('--options', [...new Set(optionsArguments)].join(','))
      }

      if (opts.entitlements) {
        // Sign with entitlements
        for (const filePath of childPaths) {
          if (ignoreFilePath(opts, filePath)) {
            debuglog('Skipped... ' + filePath)
            continue
          }
          debuglog('Signing... ' + filePath)
          let entitlementsFile = opts['entitlements-inherit']
          if (filePath.includes('Library/LoginItems')) {
            entitlementsFile = opts['entitlements-loginhelper']
          }

          await execFileAsync('codesign', args.concat('--entitlements', entitlementsFile, filePath))
        }
        debuglog('Signing... ' + opts.app)
        await execFileAsync('codesign', args.concat('--entitlements', opts.entitlements, opts.app))
      } else {
        for (const filePath of childPaths) {
          if (ignoreFilePath(opts, filePath)) {
            debuglog('Skipped... ' + filePath)
            continue
          }

          debuglog('Signing... ' + filePath)
          await execFileAsync('codesign', args.concat(filePath))
        }

        debuglog('Signing... ' + opts.app)
        await execFileAsync('codesign', args.concat(opts.app))
      }

      // Verify code sign
      debuglog('Verifying...')
      await verifySignApplicationAsync(opts)
      debuglog('Verified.')

      // Check entitlements if applicable
      if (opts.entitlements) {
        debuglog('Displaying entitlements...')
        const result = await execFileAsync('codesign', [
          '--display',
          '--entitlements', ':-', // Write to standard output and strip off the blob header
          opts.app
        ])
        debuglog('Entitlements:', '\n', result)
      }
    })
}

/**
 * This function returns a promise signing the application.
 * @function
 * @param {mixed} opts - Options.
 * @returns {Promise} Promise.
 */
const signAsync = module.exports.signAsync = function (opts) {
  return validateSignOptsAsync(opts)
    .then(function () {
      // Determine identity for signing
      let promise
      if (opts.identity) {
        debuglog('`identity` passed in arguments.')
        if (opts['identity-validation'] === false) {
          if (!(opts.identity instanceof Identity)) {
            opts.identity = new Identity(opts.identity)
          }
          return Promise.resolve()
        }
        promise = findIdentitiesAsync(opts, opts.identity)
      } else {
        debugwarn('No `identity` passed in arguments...')
        if (opts.platform === 'mas') {
          if (opts.type === 'distribution') {
            debuglog('Finding `3rd Party Mac Developer Application` certificate for signing app distribution in the Mac App Store...')
            promise = findIdentitiesAsync(opts, '3rd Party Mac Developer Application:')
          } else {
            debuglog('Finding `Mac Developer` certificate for signing app in development for the Mac App Store signing...')
            promise = findIdentitiesAsync(opts, 'Mac Developer:')
          }
        } else {
          debuglog('Finding `Developer ID Application` certificate for distribution outside the Mac App Store...')
          promise = findIdentitiesAsync(opts, 'Developer ID Application:')
        }
      }
      return promise
        .then(function (identities) {
          if (identities.length > 0) {
            // Identity(/ies) found
            if (identities.length > 1) {
              debugwarn('Multiple identities found, will use the first discovered.')
            } else {
              debuglog('Found 1 identity.')
            }
            opts.identity = identities[0]
          } else {
            // No identity found
            return Promise.reject(new Error('No identity found for signing.'))
          }
        })
    })
    .then(function () {
      // Determine entitlements for code signing
      let filePath
      if (opts.platform === 'mas') {
        // To sign apps for Mac App Store, an entitlements file is required, especially for app sandboxing (as well some other services).
        // Fallback entitlements for sandboxing by default: Note this may cause troubles while running an signed app due to missing keys special to the project.
        // Further reading: https://developer.apple.com/library/mac/documentation/Miscellaneous/Reference/EntitlementKeyReference/Chapters/EnablingAppSandbox.html
        if (!opts.entitlements) {
          filePath = path.join(__dirname, 'default.entitlements.mas.plist')
          debugwarn('No `entitlements` passed in arguments:', '\n',
            '* Sandbox entitlements are required for Mac App Store distribution, your codesign entitlements file is default to:', filePath)
          opts.entitlements = filePath
        }
        if (!opts['entitlements-inherit']) {
          filePath = path.join(__dirname, 'default.entitlements.mas.inherit.plist')
          debugwarn('No `entitlements-inherit` passed in arguments:', '\n',
            '* Sandbox entitlements file for enclosing app files is default to:', filePath)
          opts['entitlements-inherit'] = filePath
        }
      } else {
        // Not necessary to have entitlements for non Mac App Store distribution
        if (!opts.entitlements) {
          debugwarn('No `entitlements` passed in arguments:', '\n',
            '* Provide `entitlements` to specify entitlements file for codesign.')
        } else {
          // If entitlements is provided as a flag, fallback to default
          if (opts.entitlements === true) {
            filePath = path.join(__dirname, 'default.entitlements.darwin.plist')
            debugwarn('`entitlements` not specified in arguments:', '\n',
              '* Provide `entitlements` to specify entitlements file for codesign.', '\n',
              '* Sandbox entitlements file for enclosing app files is default to:', filePath)
            opts.entitlements = filePath
          }
          if (!opts['entitlements-inherit']) {
            filePath = path.join(__dirname, 'default.entitlements.darwin.inherit.plist')
            debugwarn('No `entitlements-inherit` passed in arguments:', '\n',
              '* Sandbox entitlements file for enclosing app files is default to:', filePath)
            opts['entitlements-inherit'] = filePath
          }
        }
      }
      if (!opts['entitlements-loginhelper']) {
        filePath = opts.entitlements
        debugwarn('No `entitlements-loginhelper` passed in arguments:', '\n',
          '* Sandbox entitlements file for login helper is default to:', filePath)
        opts['entitlements-loginhelper'] = filePath
      }
    })
    .then(async function () {
      // Pre-sign operations
      const preSignOperations = []

      if (opts['pre-embed-provisioning-profile'] === false) {
        debugwarn('Pre-sign operation disabled for provisioning profile embedding:', '\n',
          '* Enable by setting `pre-embed-provisioning-profile` to `true`.')
      } else {
        debuglog('Pre-sign operation enabled for provisioning profile:', '\n',
          '* Disable by setting `pre-embed-provisioning-profile` to `false`.')
        preSignOperations.push(preEmbedProvisioningProfile)
      }

      if (opts['pre-auto-entitlements'] === false) {
        debugwarn('Pre-sign operation disabled for entitlements automation.')
      } else {
        debuglog('Pre-sign operation enabled for entitlements automation with versions >= `1.1.1`:', '\n',
          '* Disable by setting `pre-auto-entitlements` to `false`.')
        if (opts.entitlements && (!opts.version || semver.gte(opts.version, '1.1.1') >= 0)) {
          // Enable Mac App Store sandboxing without using temporary-exception, introduced in Electron v1.1.1. Relates to electron#5601
          preSignOperations.push(preAutoEntitlements)
        }
      }

      for (const preSignOperation of preSignOperations) {
        await preSignOperation(opts)
      }
    })
    .then(function () {
      debuglog('Signing application...', '\n',
        '> Application:', opts.app, '\n',
        '> Platform:', opts.platform, '\n',
        '> Entitlements:', opts.entitlements, '\n',
        '> Child entitlements:', opts['entitlements-inherit'], '\n',
        '> Additional binaries:', opts.binaries, '\n',
        '> Identity:', opts.identity)
      return signApplicationAsync(opts)
    })
    .then(function () {
      // Post-sign operations
      debuglog('Application signed.')
    })
}

/**
 * This function is a normal callback implementation.
 * @function
 * @param {Object} opts - Options.
 * @param {RequestCallback} cb - Callback.
 */
module.exports.sign = function (opts, cb) {
  signAsync(opts)
    .then(function () {
      debuglog('Application signed: ' + opts.app)
      if (cb) cb()
    })
    .catch(function (err) {
      debuglog('Sign failed:')
      if (err.message) debuglog(err.message)
      else if (err.stack) debuglog(err.stack)
      else debuglog(err)
      if (cb) cb(err)
    })
}
