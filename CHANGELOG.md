**Here changelog only for previous major releases.**
To see changes for current major release, please use [GiHub releases](https://github.com/electron-userland/electron-builder/releases).

<a name="6.7.7"></a>
## [6.7.7](https://github.com/electron-userland/electron-builder/compare/v6.7.6...v6.7.7) (2016-09-16)


### Bug Fixes

* **nsis:** handle unquoted UninstallString #735 ([77f3277](https://github.com/electron-userland/electron-builder/commit/77f3277))



<a name="6.7.6"></a>
## [6.7.6](https://github.com/electron-userland/electron-builder/compare/v6.7.5...v6.7.6) (2016-09-15)


### Bug Fixes

* **nsis:** apostrophe in product name ([63c67ef](https://github.com/electron-userland/electron-builder/commit/63c67ef)), closes [#750](https://github.com/electron-userland/electron-builder/issues/750)



<a name="6.7.5"></a>
## [6.7.5](https://github.com/electron-userland/electron-builder/compare/v6.7.4...v6.7.5) (2016-09-14)


### Bug Fixes

* **nsis:** _? must be last #735 ([517a90b](https://github.com/electron-userland/electron-builder/commit/517a90b))



<a name="6.7.4"></a>
## [6.7.4](https://github.com/electron-userland/electron-builder/compare/v6.7.3...v6.7.4) (2016-09-14)


### Bug Fixes

* **mac:** throw sign error correctly ([cca23b4](https://github.com/electron-userland/electron-builder/commit/cca23b4)), closes [#737](https://github.com/electron-userland/electron-builder/issues/737)
* **nsis:** get InstallLocation from UninstallerString if not found #735 ([431922e](https://github.com/electron-userland/electron-builder/commit/431922e))



<a name="6.7.3"></a>
## [6.7.3](https://github.com/electron-userland/electron-builder/compare/v6.7.2...v6.7.3) (2016-09-11)


### Bug Fixes

* proxy config from npm #585 ([29f6436](https://github.com/electron-userland/electron-builder/commit/29f6436))
* **nsis:** correct fix of #722 (NSIS Installer Not Working on Second Invocation) ([e35933d](https://github.com/electron-userland/electron-builder/commit/e35933d)), closes [#722](https://github.com/electron-userland/electron-builder/issues/722)



<a name="6.7.2"></a>
## [6.7.2](https://github.com/electron-userland/electron-builder/compare/v6.7.1...v6.7.2) (2016-09-11)


### Bug Fixes

* Build fails with TimeOut exception: proxy ([dd61408](https://github.com/electron-userland/electron-builder/commit/dd61408)), closes [#585](https://github.com/electron-userland/electron-builder/issues/585)



<a name="6.7.1"></a>
## [6.7.1](https://github.com/electron-userland/electron-builder/compare/v6.7.0...v6.7.1) (2016-09-10)


### Bug Fixes

* **nsis:** remove old < 6.4.1 versions ([cb538c1](https://github.com/electron-userland/electron-builder/commit/cb538c1)), closes [#735](https://github.com/electron-userland/electron-builder/issues/735)



<a name="6.7.0"></a>
# [6.7.0](https://github.com/electron-userland/electron-builder/compare/v6.6.1...v6.7.0) (2016-09-10)


### Features

* Hidden 'dotfiles' within an extraResources folder aren't copied ([7877f71](https://github.com/electron-userland/electron-builder/commit/7877f71)), closes [#733](https://github.com/electron-userland/electron-builder/issues/733)



<a name="6.6.1"></a>
## [6.6.1](https://github.com/electron-userland/electron-builder/compare/v6.6.0...v6.6.1) (2016-09-09)


### Bug Fixes

* **nsis:** no app icon in Add/Remove program ([e6c1efe](https://github.com/electron-userland/electron-builder/commit/e6c1efe)), closes [#738](https://github.com/electron-userland/electron-builder/issues/738)



<a name="6.6.0"></a>
# [6.6.0](https://github.com/electron-userland/electron-builder/compare/v6.5.2...v6.6.0) (2016-09-09)


### Features

* support CFBundleTypeRole for MacOS CFBundleURLTypes ([888581a](https://github.com/electron-userland/electron-builder/commit/888581a)), closes [#736](https://github.com/electron-userland/electron-builder/issues/736)



<a name="6.5.2"></a>
## [6.5.2](https://github.com/electron-userland/electron-builder/compare/v6.5.1...v6.5.2) (2016-09-08)


### Bug Fixes

* Version `6.3.5` makes build pass even when it fails ([a1b2b0e](https://github.com/electron-userland/electron-builder/commit/a1b2b0e)), closes [#721](https://github.com/electron-userland/electron-builder/issues/721)
* **mas:** Warning when using entitlements.mas.plist ([5031116](https://github.com/electron-userland/electron-builder/commit/5031116)), closes [#729](https://github.com/electron-userland/electron-builder/issues/729)



<a name="6.5.1"></a>
## [6.5.1](https://github.com/electron-userland/electron-builder/compare/v6.5.0...v6.5.1) (2016-09-07)


### Bug Fixes

* **nsis:** uninstaller path should be not quoted #722 ([63ee4cf](https://github.com/electron-userland/electron-builder/commit/63ee4cf))



<a name="6.5.0"></a>
# [6.5.0](https://github.com/electron-userland/electron-builder/compare/v6.4.1...v6.5.0) (2016-09-07)


### Bug Fixes

* Cleanup fail after build ([2e35205](https://github.com/electron-userland/electron-builder/commit/2e35205)), closes [#724](https://github.com/electron-userland/electron-builder/issues/724)
* **nsis:** finally — NSIS Installer Not Working on Second Invocation ([211d63f](https://github.com/electron-userland/electron-builder/commit/211d63f)), closes [#722](https://github.com/electron-userland/electron-builder/issues/722)


### Features

* **linux:** Categories desktop entry ([87616c0](https://github.com/electron-userland/electron-builder/commit/87616c0)), closes [#727](https://github.com/electron-userland/electron-builder/issues/727) [#641](https://github.com/electron-userland/electron-builder/issues/641)



<a name="6.4.1"></a>
## [6.4.1](https://github.com/electron-userland/electron-builder/compare/v6.4.0...v6.4.1) (2016-09-04)


### Bug Fixes

* NSIS Installer Not Working on Second Invocation ([0f1869b](https://github.com/electron-userland/electron-builder/commit/0f1869b))
* NSIS Installer Not Working on Second Invocation #722 ([1b90ec6](https://github.com/electron-userland/electron-builder/commit/1b90ec6))



<a name="6.4.0"></a>
# [6.4.0](https://github.com/electron-userland/electron-builder/compare/v6.3.5...v6.4.0) (2016-09-02)


### Features

* bintray publisher ([138e8e2](https://github.com/electron-userland/electron-builder/commit/138e8e2)), closes [#577](https://github.com/electron-userland/electron-builder/issues/577)



<a name="6.3.5"></a>
## [6.3.5](https://github.com/electron-userland/electron-builder/compare/v6.3.4...v6.3.5) (2016-09-02)


### Bug Fixes

* incorrect log message "ci detected" ([eb827ea](https://github.com/electron-userland/electron-builder/commit/eb827ea))



<a name="6.3.4"></a>
## [6.3.4](https://github.com/electron-userland/electron-builder/compare/v6.3.3...v6.3.4) (2016-09-02)


### Bug Fixes

* **squirrel.windows:** remove RELEASES because Squirrel.Windows doesn't check ([0c592e8](https://github.com/electron-userland/electron-builder/commit/0c592e8)), closes [#713](https://github.com/electron-userland/electron-builder/issues/713)



<a name="6.3.3"></a>
## [6.3.3](https://github.com/electron-userland/electron-builder/compare/v6.3.2...v6.3.3) (2016-09-01)


### Bug Fixes

* **squirrel.windows:** use GH_TOKEN ([e102e3e](https://github.com/electron-userland/electron-builder/commit/e102e3e)), closes [#714](https://github.com/electron-userland/electron-builder/issues/714)



<a name="6.3.2"></a>
## [6.3.2](https://github.com/electron-userland/electron-builder/compare/v6.3.1...v6.3.2) (2016-09-01)


### Bug Fixes

* **mac:** build mac targets on non-macOs ([1398af4](https://github.com/electron-userland/electron-builder/commit/1398af4))
* **squirrel.windows:** The base package release does not exist ([3b1ad57](https://github.com/electron-userland/electron-builder/commit/3b1ad57)), closes [#713](https://github.com/electron-userland/electron-builder/issues/713)



<a name="6.3.1"></a>
## [6.3.1](https://github.com/electron-userland/electron-builder/compare/v6.3.0...v6.3.1) (2016-08-30)


### Bug Fixes

* **nsis:** NSIS perMachine fails if UAC prompt is enabled ([b739f42](https://github.com/electron-userland/electron-builder/commit/b739f42)), closes [#712](https://github.com/electron-userland/electron-builder/issues/712)
* **nsis:** set locale id for legalTrademarks ([91addfe](https://github.com/electron-userland/electron-builder/commit/91addfe)), closes [#672](https://github.com/electron-userland/electron-builder/issues/672)



<a name="6.3.0"></a>
# [6.3.0](https://github.com/electron-userland/electron-builder/compare/v6.2.0...v6.3.0) (2016-08-29)


### Bug Fixes

* **nsis:** no custom icon ([b7b18bc](https://github.com/electron-userland/electron-builder/commit/b7b18bc))


### Features

* **nsis:** boring per-machine only installer ([a4eeade](https://github.com/electron-userland/electron-builder/commit/a4eeade))



<a name="6.2.0"></a>
# [6.2.0](https://github.com/electron-userland/electron-builder/compare/v6.1.0...v6.2.0) (2016-08-29)


### Features

* **mac:** rename electron.icns to productName.icns ([8fa482e](https://github.com/electron-userland/electron-builder/commit/8fa482e))



<a name="6.1.0"></a>
# [6.1.0](https://github.com/electron-userland/electron-builder/compare/v6.0.3...v6.1.0) (2016-08-29)


### Features

* A crossplatform way to create file associations ([f8840e1](https://github.com/electron-userland/electron-builder/commit/f8840e1)), closes [#409](https://github.com/electron-userland/electron-builder/issues/409)



<a name="6.0.3"></a>
## [6.0.3](https://github.com/electron-userland/electron-builder/compare/v6.0.2...v6.0.3) (2016-08-29)


### Bug Fixes

* **squirrel.windows:** stdout maxBuffer exceeded ([0b84868](https://github.com/electron-userland/electron-builder/commit/0b84868)), closes [#709](https://github.com/electron-userland/electron-builder/issues/709)



<a name="6.0.2"></a>
## [6.0.2](https://github.com/electron-userland/electron-builder/compare/v6.0.1...v6.0.2) (2016-08-27)


### Bug Fixes

* pattern **/*.js still copies all files ([51309bf](https://github.com/electron-userland/electron-builder/commit/51309bf)), closes [#701](https://github.com/electron-userland/electron-builder/issues/701)



<a name="6.0.1"></a>
## [6.0.1](https://github.com/electron-userland/electron-builder/compare/v6.0.0...v6.0.1) (2016-08-27)


### Bug Fixes

* close write steam on finish ([a6b7573](https://github.com/electron-userland/electron-builder/commit/a6b7573)), closes [#706](https://github.com/electron-userland/electron-builder/issues/706)



<a name="6.0.0"></a>
# [6.0.0](https://github.com/electron-userland/electron-builder/compare/v5.35.0...v6.0.0) (2016-08-27)


### Bug Fixes

* add undocumented dereference as workaround of #675 ([9fe326d](https://github.com/electron-userland/electron-builder/commit/9fe326d))
* rename linux to linux-unpacked #670 ([5d404ea](https://github.com/electron-userland/electron-builder/commit/5d404ea))


### Features

* set AppImage as default target for Linux ([8f55a2d](https://github.com/electron-userland/electron-builder/commit/8f55a2d))


### BREAKING CHANGES

* default target for Linux changed from `deb` to `AppImage`



<a name="5.35.0"></a>
# [5.35.0](https://github.com/electron-userland/electron-builder/compare/v5.34.1...v5.35.0) (2016-08-26)


### Features

* support from/to paths in file patterns for extraFiles and extraResources ([308438f](https://github.com/electron-userland/electron-builder/commit/308438f)), closes [#650](https://github.com/electron-userland/electron-builder/issues/650)



<a name="5.34.1"></a>
## [5.34.1](https://github.com/electron-userland/electron-builder/compare/v5.34.0...v5.34.1) (2016-08-22)


### Bug Fixes

* auto-unpack doesn't create file parent dirs ([26c8360](https://github.com/electron-userland/electron-builder/commit/26c8360)), closes [#689](https://github.com/electron-userland/electron-builder/issues/689)



<a name="5.34.0"></a>
# [5.34.0](https://github.com/electron-userland/electron-builder/compare/v5.33.0...v5.34.0) (2016-08-22)


### Bug Fixes

* Getting AppVeyor to Generate an Installer (Build Artifacts) ([bc9d437](https://github.com/electron-userland/electron-builder/commit/bc9d437)), closes [#674](https://github.com/electron-userland/electron-builder/issues/674)


### Features

* custom app scheme ([b7121c5](https://github.com/electron-userland/electron-builder/commit/b7121c5)), closes [#575](https://github.com/electron-userland/electron-builder/issues/575)



<a name="5.33.0"></a>
# [5.33.0](https://github.com/electron-userland/electron-builder/compare/v5.32.1...v5.33.0) (2016-08-22)


### Features

* add node-gyp-rebuild #683 ([e3a5899](https://github.com/electron-userland/electron-builder/commit/e3a5899))



<a name="5.32.1"></a>
## [5.32.1](https://github.com/electron-userland/electron-builder/compare/v5.32.0...v5.32.1) (2016-08-20)


### Bug Fixes

* XDG_DATA_DIRS is missing when starting AppImage on Fedora 24 ([92d4895](https://github.com/electron-userland/electron-builder/commit/92d4895)), closes [#682](https://github.com/electron-userland/electron-builder/issues/682)



<a name="5.32.0"></a>
# [5.32.0](https://github.com/electron-userland/electron-builder/compare/v5.31.1...v5.32.0) (2016-08-20)


### Features

* nodeGypRebuild ([6d433ad](https://github.com/electron-userland/electron-builder/commit/6d433ad)), closes [#683](https://github.com/electron-userland/electron-builder/issues/683)



<a name="5.31.1"></a>
## [5.31.1](https://github.com/electron-userland/electron-builder/compare/v5.31.0...v5.31.1) (2016-08-20)


### Bug Fixes

* pass --build-from-source to force native dep compilation ([ef5f146](https://github.com/electron-userland/electron-builder/commit/ef5f146)), closes [#647](https://github.com/electron-userland/electron-builder/issues/647)



<a name="5.31.0"></a>
# [5.31.0](https://github.com/electron-userland/electron-builder/compare/v5.30.0...v5.31.0) (2016-08-20)


### Features

* **nsis:** per-machine installer automatically removes per-user installation ([834434c](https://github.com/electron-userland/electron-builder/commit/834434c)), closes [#621](https://github.com/electron-userland/electron-builder/issues/621) [#672](https://github.com/electron-userland/electron-builder/issues/672)



<a name="5.30.0"></a>
# [5.30.0](https://github.com/electron-userland/electron-builder/compare/v5.29.0...v5.30.0) (2016-08-19)


### Features

* **nsis:** one-click installer automatically removes old version #621 ([682ddde](https://github.com/electron-userland/electron-builder/commit/682ddde))



<a name="5.29.0"></a>
# [5.29.0](https://github.com/electron-userland/electron-builder/compare/v5.28.2...v5.29.0) (2016-08-17)


### Features

* **nsis:** per-machine installer automatically removes old version #621 ([2c3d8c2](https://github.com/electron-userland/electron-builder/commit/2c3d8c2))



<a name="5.28.2"></a>
## [5.28.2](https://github.com/electron-userland/electron-builder/compare/v5.28.1...v5.28.2) (2016-08-17)


### Bug Fixes

* skip rcedit for .msi installer ([d40e0b5](https://github.com/electron-userland/electron-builder/commit/d40e0b5)), closes [#677](https://github.com/electron-userland/electron-builder/issues/677)



<a name="5.28.1"></a>
## [5.28.1](https://github.com/electron-userland/electron-builder/compare/v5.28.0...v5.28.1) (2016-08-17)


### Bug Fixes

* disable dual-signing for .msi installer ([903148b](https://github.com/electron-userland/electron-builder/commit/903148b))



<a name="5.28.0"></a>
# [5.28.0](https://github.com/electron-userland/electron-builder/compare/v5.27.0...v5.28.0) (2016-08-16)


### Features

* **nsis:** custom icon for file association #409 ([09497cc](https://github.com/electron-userland/electron-builder/commit/09497cc))



<a name="5.27.0"></a>
# [5.27.0](https://github.com/electron-userland/electron-builder/compare/v5.26.0...v5.27.0) (2016-08-16)


### Features

* NSIS sign uninstaller ([17c0a82](https://github.com/electron-userland/electron-builder/commit/17c0a82)), closes [#526](https://github.com/electron-userland/electron-builder/issues/526)



<a name="5.26.0"></a>
# [5.26.0](https://github.com/electron-userland/electron-builder/compare/v5.25.1...v5.26.0) (2016-08-12)


### Bug Fixes

* Build fails due to peer dependency errors ([fcecbf0](https://github.com/electron-userland/electron-builder/commit/fcecbf0)), closes [#611](https://github.com/electron-userland/electron-builder/issues/611)
* Do not trash old build artifacts ([361b369](https://github.com/electron-userland/electron-builder/commit/361b369)), closes [#586](https://github.com/electron-userland/electron-builder/issues/586)
* do not required email for all Linux targets ([ddfa6fc](https://github.com/electron-userland/electron-builder/commit/ddfa6fc))


### Features

* Changing build attributes for different environment ([b9d0139](https://github.com/electron-userland/electron-builder/commit/b9d0139)), closes [#639](https://github.com/electron-userland/electron-builder/issues/639)



<a name="5.25.1"></a>
## [5.25.1](https://github.com/electron-userland/electron-builder/compare/v5.25.0...v5.25.1) (2016-08-12)


### Bug Fixes

* Bump electron-wininstaller-fixed to Squirrel 1.4.4 ([8008734](https://github.com/electron-userland/electron-builder/commit/8008734))



<a name="5.25.0"></a>
# [5.25.0](https://github.com/electron-userland/electron-builder/compare/v5.24.1...v5.25.0) (2016-08-11)


### Bug Fixes

* remove outdated license check ([8665ef4](https://github.com/electron-userland/electron-builder/commit/8665ef4))


### Features

* bundle osslsigncode for Linux ([fc8d6c6](https://github.com/electron-userland/electron-builder/commit/fc8d6c6))



<a name="5.24.1"></a>
## [5.24.1](https://github.com/electron-userland/electron-builder/compare/v5.24.0...v5.24.1) (2016-08-10)


### Bug Fixes

* Some files in app.asar get corrupted ([ee2f7c8](https://github.com/electron-userland/electron-builder/commit/ee2f7c8)), closes [#662](https://github.com/electron-userland/electron-builder/issues/662)



<a name="5.24.0"></a>
# [5.24.0](https://github.com/electron-userland/electron-builder/compare/v5.23.2...v5.24.0) (2016-08-09)


### Features

* **nsis:** multilang installer ([50d27bf](https://github.com/electron-userland/electron-builder/commit/50d27bf)), closes [#643](https://github.com/electron-userland/electron-builder/issues/643) [#646](https://github.com/electron-userland/electron-builder/issues/646)
*  EV certificate code signing (custom /n and /tr) ([e008c19](https://github.com/electron-userland/electron-builder/commit/e008c19)), closes [#627](https://github.com/electron-userland/electron-builder/issues/627) [#590](https://github.com/electron-userland/electron-builder/issues/590)
*  remove OriginalFilename, add LegalTrademarks, add ProductVersion for NSIS ([6a906ac](https://github.com/electron-userland/electron-builder/commit/6a906ac)), closes [#655](https://github.com/electron-userland/electron-builder/issues/655)



<a name="5.23.2"></a>
## [5.23.2](https://github.com/electron-userland/electron-builder/compare/v5.23.1...v5.23.2) (2016-08-05)


### Bug Fixes

* **AppImage:** app bin detection ([06def89](https://github.com/electron-userland/electron-builder/commit/06def89))



<a name="5.23.1"></a>
## [5.23.1](https://github.com/electron-userland/electron-builder/compare/v5.23.0...v5.23.1) (2016-08-05)


### Bug Fixes

* one-click CHECK_APP_RUNNING before SetSilent ([282fc72](https://github.com/electron-userland/electron-builder/commit/282fc72))
* one-click installer — Uninstall Confirm Dialog Option for One-click Windows NSIS #618 ([b3c49cb](https://github.com/electron-userland/electron-builder/commit/b3c49cb))



<a name="5.23.0"></a>
# [5.23.0](https://github.com/electron-userland/electron-builder/compare/v5.22.2...v5.23.0) (2016-08-04)


### Features

* prevent error "Unable to find a valid app" ([1778a8d](https://github.com/electron-userland/electron-builder/commit/1778a8d)), closes [#633](https://github.com/electron-userland/electron-builder/issues/633)
* support electron package https://github.com/electron-userland/electron-prebuilt/issues/160 ([aa0682f](https://github.com/electron-userland/electron-builder/commit/aa0682f))



<a name="5.22.2"></a>
## [5.22.2](https://github.com/electron-userland/electron-builder/compare/v5.22.1...v5.22.2) (2016-08-04)


### Bug Fixes

* Can't build on OSX (x64) since electron-builder 5.19.0 ([753cd08](https://github.com/electron-userland/electron-builder/commit/753cd08)), closes [#635](https://github.com/electron-userland/electron-builder/issues/635)



<a name="5.22.1"></a>
## [5.22.1](https://github.com/electron-userland/electron-builder/compare/v5.20.0...v5.22.1) (2016-08-02)


### Bug Fixes

* AppImage does not run when invoked in unpacked form ([9731225](https://github.com/electron-userland/electron-builder/commit/9731225)), closes [#592](https://github.com/electron-userland/electron-builder/issues/592)
* Failing to sign the Windows build on Linux ([a6a0cd6](https://github.com/electron-userland/electron-builder/commit/a6a0cd6)), closes [#578](https://github.com/electron-userland/electron-builder/issues/578)
* NSIS Installer hangs when being run silently ([d0a4f90](https://github.com/electron-userland/electron-builder/commit/d0a4f90)), closes [#616](https://github.com/electron-userland/electron-builder/issues/616)
* Windows NSIS One-Click Setup Launched while App already running in background ([918a6c0](https://github.com/electron-userland/electron-builder/commit/918a6c0)), closes [#617](https://github.com/electron-userland/electron-builder/issues/617)
* don't take in account just directory `app` without `package.json` ([3418239](https://github.com/electron-userland/electron-builder/commit/3418239))
* extraMetadata — deep assign ([6a5c4bb](https://github.com/electron-userland/electron-builder/commit/6a5c4bb))


### Features

* --extraMetadata for conditional compilation ([da700d4](https://github.com/electron-userland/electron-builder/commit/da700d4)), closes [#494](https://github.com/electron-userland/electron-builder/issues/494)
* Uninstall Confirm Dialog Option for One-click Windows NSIS ([e99047d](https://github.com/electron-userland/electron-builder/commit/e99047d)), closes [#618](https://github.com/electron-userland/electron-builder/issues/618)



<a name="5.20.0"></a>
# [5.20.0](https://github.com/electron-userland/electron-builder/compare/v5.19.1...v5.20.0) (2016-07-29)


### Features

* Make sure compiled app has same hash on different computers ([d773077](https://github.com/electron-userland/electron-builder/commit/d773077)), closes [#604](https://github.com/electron-userland/electron-builder/issues/604)



<a name="5.19.1"></a>
## [5.19.1](https://github.com/electron-userland/electron-builder/compare/v5.19.0...v5.19.1) (2016-07-29)


### Bug Fixes

* Certificate file for sign was gone (provides with file://) under windows ([04a88b0](https://github.com/electron-userland/electron-builder/commit/04a88b0)), closes [#619](https://github.com/electron-userland/electron-builder/issues/619)



<a name="5.19.0"></a>
# [5.19.0](https://github.com/electron-userland/electron-builder/compare/v5.18.0...v5.19.0) (2016-07-28)


### Features

* don't pack into asar node module that contains executable/binary files ([e975881](https://github.com/electron-userland/electron-builder/commit/e975881)), closes [#602](https://github.com/electron-userland/electron-builder/issues/602)



<a name="5.18.0"></a>
# [5.18.0](https://github.com/electron-userland/electron-builder/compare/v5.17.1...v5.18.0) (2016-07-28)


### Bug Fixes

* remove "Warning: homepage" ([0fd6a3e](https://github.com/electron-userland/electron-builder/commit/0fd6a3e))


### Features

* NSIS script customization — script option ([a807b17](https://github.com/electron-userland/electron-builder/commit/a807b17)), closes [#583](https://github.com/electron-userland/electron-builder/issues/583)



<a name="5.17.1"></a>
## [5.17.1](https://github.com/electron-userland/electron-builder/compare/v5.17.0...v5.17.1) (2016-07-27)


### Bug Fixes

* do not use scoped asara package ([c53074c](https://github.com/electron-userland/electron-builder/commit/c53074c)), closes [#610](https://github.com/electron-userland/electron-builder/issues/610)



<a name="5.17.0"></a>
# [5.17.0](https://github.com/electron-userland/electron-builder/compare/v5.16.0...v5.17.0) (2016-07-27)


### Features

* NSIS script customization #583 ([63beaaf](https://github.com/electron-userland/electron-builder/commit/63beaaf))



<a name="5.16.0"></a>
# [5.16.0](https://github.com/electron-userland/electron-builder/compare/v5.15.0...v5.16.0) (2016-07-22)


### Features

* exclude **/node_modules/*/{README.md,README,readme.md,readme,test} by default ([5895583](https://github.com/electron-userland/electron-builder/commit/5895583)), closes [#591](https://github.com/electron-userland/electron-builder/issues/591) [#606](https://github.com/electron-userland/electron-builder/issues/606)
* exclude extraResources/extraFiles for one-package dir ([3aaf025](https://github.com/electron-userland/electron-builder/commit/3aaf025)), closes [#599](https://github.com/electron-userland/electron-builder/issues/599)



<a name="5.15.0"></a>
# [5.15.0](https://github.com/electron-userland/electron-builder/compare/v5.14.2...v5.15.0) (2016-07-21)


### Features

* **Linux:** app icon is not required ([ec0bda5](https://github.com/electron-userland/electron-builder/commit/ec0bda5)), closes [#593](https://github.com/electron-userland/electron-builder/issues/593)



<a name="5.14.2"></a>
## [5.14.2](https://github.com/electron-userland/electron-builder/compare/v5.14.1...v5.14.2) (2016-07-20)


### Bug Fixes

* **nsis:** fix all nsis warnings ([9a3fd5e](https://github.com/electron-userland/electron-builder/commit/9a3fd5e))



<a name="5.14.1"></a>
## [5.14.1](https://github.com/electron-userland/electron-builder/compare/v5.14.0...v5.14.1) (2016-07-19)


### Bug Fixes

* **AppImage:** AppImage should have arch in filename ([e7d4f76](https://github.com/electron-userland/electron-builder/commit/e7d4f76)), closes [#594](https://github.com/electron-userland/electron-builder/issues/594)



<a name="5.14.0"></a>
# [5.14.0](https://github.com/electron-userland/electron-builder/compare/v5.13.1...v5.14.0) (2016-07-18)


### Features

* file associations ([fd1e7da](https://github.com/electron-userland/electron-builder/commit/fd1e7da)), closes [#563](https://github.com/electron-userland/electron-builder/issues/563)



<a name="5.13.1"></a>
## [5.13.1](https://github.com/electron-userland/electron-builder/compare/v5.13.0...v5.13.1) (2016-07-14)


### Bug Fixes

* win codesign on windows 7 ([d78c69c](https://github.com/electron-userland/electron-builder/commit/d78c69c)), closes [#581](https://github.com/electron-userland/electron-builder/issues/581) [#584](https://github.com/electron-userland/electron-builder/issues/584)



<a name="5.13.0"></a>
# [5.13.0](https://github.com/electron-userland/electron-builder/compare/v5.12.1...v5.13.0) (2016-07-13)


### Features

* **Squirrel.Windows:** Automatic remoteReleases configuration ([d6aa555](https://github.com/electron-userland/electron-builder/commit/d6aa555)), closes [#561](https://github.com/electron-userland/electron-builder/issues/561)
* **nsis:** run after finish flag for one-click installer ([50039ea](https://github.com/electron-userland/electron-builder/commit/50039ea)), closes [#574](https://github.com/electron-userland/electron-builder/issues/574)



<a name="5.12.1"></a>
## [5.12.1](https://github.com/electron-userland/electron-builder/compare/v5.12.0...v5.12.1) (2016-07-11)


### Bug Fixes

* **nsis:** per machine boring installer ([1bd32a7](https://github.com/electron-userland/electron-builder/commit/1bd32a7)), closes [#564](https://github.com/electron-userland/electron-builder/issues/564)



<a name="5.12.0"></a>
# [5.12.0](https://github.com/electron-userland/electron-builder/compare/v5.11.3...v5.12.0) (2016-07-09)


### Bug Fixes

* **nsis:** install per current user even if run as administrator ([a01f481](https://github.com/electron-userland/electron-builder/commit/a01f481))


### Features

* **nsis:** per machine one-click installer #564 ([9f52848](https://github.com/electron-userland/electron-builder/commit/9f52848))



<a name="5.11.3"></a>
## [5.11.3](https://github.com/electron-userland/electron-builder/compare/v5.11.2...v5.11.3) (2016-07-09)


### Bug Fixes

* **AppImage:** bundle xorriso ([a1bf645](https://github.com/electron-userland/electron-builder/commit/a1bf645))



<a name="5.11.2"></a>
## [5.11.2](https://github.com/electron-userland/electron-builder/compare/v5.11.1...v5.11.2) (2016-07-07)


### Bug Fixes

* **AppImage:** do not pack into archive, add `.AppImage` suffix ([f59c7bd](https://github.com/electron-userland/electron-builder/commit/f59c7bd))



<a name="5.11.1"></a>
## [5.11.1](https://github.com/electron-userland/electron-builder/compare/v5.11.0...v5.11.1) (2016-07-07)


### Bug Fixes

* **nsis:** ia32 Extracting wrong archive ([56b3450](https://github.com/electron-userland/electron-builder/commit/56b3450)), closes [#567](https://github.com/electron-userland/electron-builder/issues/567)



<a name="5.11.0"></a>
# [5.11.0](https://github.com/electron-userland/electron-builder/compare/v5.10.5...v5.11.0) (2016-07-07)


### Bug Fixes

* AppImage desktop icons ([9a69286](https://github.com/electron-userland/electron-builder/commit/9a69286))
* **AppImage:** use app name as a executable name ([159446b](https://github.com/electron-userland/electron-builder/commit/159446b))


### Features

* Build AppImage for Linux ([a9afdd4](https://github.com/electron-userland/electron-builder/commit/a9afdd4)), closes [#504](https://github.com/electron-userland/electron-builder/issues/504)
* multi-cert p12 ([de01c6d](https://github.com/electron-userland/electron-builder/commit/de01c6d)), closes [#560](https://github.com/electron-userland/electron-builder/issues/560)
* **mac:** Add build-version override property ([0b0ed62](https://github.com/electron-userland/electron-builder/commit/0b0ed62)), closes [#565](https://github.com/electron-userland/electron-builder/issues/565)



<a name="5.10.5"></a>
## [5.10.5](https://github.com/electron-userland/electron-builder/compare/v5.10.4...v5.10.5) (2016-07-03)


### Bug Fixes

* CSC_INSTALLER_KEY_PASSWORD environment variable isn't picked up #560 ([3fdd1f8](https://github.com/electron-userland/electron-builder/commit/3fdd1f8))
* CSC_INSTALLER_LINK environment variable isn't picked up #560 ([1c2632d](https://github.com/electron-userland/electron-builder/commit/1c2632d))



<a name="5.10.4"></a>
## [5.10.4](https://github.com/electron-userland/electron-builder/compare/v5.10.3...v5.10.4) (2016-07-02)


### Bug Fixes

* non-English characters confuse rcedit: Unable to load file on windows build (from linux) ([233fafe](https://github.com/electron-userland/electron-builder/commit/233fafe)), closes [#384](https://github.com/electron-userland/electron-builder/issues/384)



<a name="5.10.3"></a>
## [5.10.3](https://github.com/electron-userland/electron-builder/compare/v5.10.2...v5.10.3) (2016-07-01)


### Bug Fixes

* Ignore .DS_Store Files ([152b987](https://github.com/electron-userland/electron-builder/commit/152b987)), closes [#545](https://github.com/electron-userland/electron-builder/issues/545)
* dereference copied app files only for windows targets ([bf2aafb](https://github.com/electron-userland/electron-builder/commit/bf2aafb))



<a name="5.10.2"></a>
## [5.10.2](https://github.com/electron-userland/electron-builder/compare/v5.10.1...v5.10.2) (2016-06-28)


### Bug Fixes

* **nsis:** installerHeaderIcon ([00e8da8](https://github.com/electron-userland/electron-builder/commit/00e8da8)), closes [#525](https://github.com/electron-userland/electron-builder/issues/525)



<a name="5.10.1"></a>
## [5.10.1](https://github.com/electron-userland/electron-builder/compare/v5.10.0...v5.10.1) (2016-06-27)


### Bug Fixes

* Build failing when productName contains a slash ([726e574](https://github.com/electron-userland/electron-builder/commit/726e574)), closes [#539](https://github.com/electron-userland/electron-builder/issues/539)



<a name="5.10.0"></a>
# [5.10.0](https://github.com/electron-userland/electron-builder/compare/v5.9.0...v5.10.0) (2016-06-26)


### Features

* **publisher:** Check that tag name starts with "v" #340 ([bb71621](https://github.com/electron-userland/electron-builder/commit/bb71621))



<a name="5.9.0"></a>
# [5.9.0](https://github.com/electron-userland/electron-builder/compare/v5.8.0...v5.9.0) (2016-06-26)


### Features

* **nsis:** Different Icon for installer / App ? (Windows) ([65650ea](https://github.com/electron-userland/electron-builder/commit/65650ea)), closes [#525](https://github.com/electron-userland/electron-builder/issues/525)



<a name="5.8.0"></a>
# [5.8.0](https://github.com/electron-userland/electron-builder/compare/v5.7.0...v5.8.0) (2016-06-26)


### Bug Fixes

* **mas:** cannot find mas installer ([5ba6276](https://github.com/electron-userland/electron-builder/commit/5ba6276)), closes [#535](https://github.com/electron-userland/electron-builder/issues/535)


### Features

* **nsis:** 32 bit + 64 bit installer ([bbd0bd6](https://github.com/electron-userland/electron-builder/commit/bbd0bd6)), closes [#528](https://github.com/electron-userland/electron-builder/issues/528) [#536](https://github.com/electron-userland/electron-builder/issues/536)



<a name="5.7.0"></a>
# [5.7.0](https://github.com/electron-userland/electron-builder/compare/v5.6.3...v5.7.0) (2016-06-24)


### Bug Fixes

* don't throw release must be a draft if onTag policy was guessed ([26c89f0](https://github.com/electron-userland/electron-builder/commit/26c89f0))


### Features

* **nsis:** MUI_HEADERIMAGE #525 ([3f43c0a](https://github.com/electron-userland/electron-builder/commit/3f43c0a))



<a name="5.6.3"></a>
## [5.6.3](https://github.com/electron-userland/electron-builder/compare/v5.6.2...v5.6.3) (2016-06-23)


### Bug Fixes

* Installation Has Failed - Seems to be an issue with the RELEASES file ([7c84f5f](https://github.com/electron-userland/electron-builder/commit/7c84f5f)), closes [#534](https://github.com/electron-userland/electron-builder/issues/534)



<a name="5.6.2"></a>
## [5.6.2](https://github.com/electron-userland/electron-builder/compare/v5.6.1...v5.6.2) (2016-06-23)


### Bug Fixes

* Creating an MSI on Windows fails ([d1ee7de](https://github.com/electron-userland/electron-builder/commit/d1ee7de)), closes [#485](https://github.com/electron-userland/electron-builder/issues/485)



<a name="5.6.1"></a>
## [5.6.1](https://github.com/electron-userland/electron-builder/compare/v5.6.0...v5.6.1) (2016-06-22)


### Bug Fixes

* `build --target dir` doesn't work ([f880157](https://github.com/electron-userland/electron-builder/commit/f880157)), closes [#531](https://github.com/electron-userland/electron-builder/issues/531)



<a name="5.6.0"></a>
# [5.6.0](https://github.com/electron-userland/electron-builder/compare/v5.5.0...v5.6.0) (2016-06-21)


### Features

* specified icon not being used when generating osx build ([74388bb](https://github.com/electron-userland/electron-builder/commit/74388bb)), closes [#519](https://github.com/electron-userland/electron-builder/issues/519)



<a name="5.5.0"></a>
# [5.5.0](https://github.com/electron-userland/electron-builder/compare/v5.4.4...v5.5.0) (2016-06-19)


### Features

* finish NSIS installer look and feel ([e50e3c8](https://github.com/electron-userland/electron-builder/commit/e50e3c8))



<a name="5.4.4"></a>
## [5.4.4](https://github.com/electron-userland/electron-builder/compare/v5.4.3...v5.4.4) (2016-06-17)


### Bug Fixes

* NSIS LZMA compression is slower and worse then external 7z compression ([e1e6d67](https://github.com/electron-userland/electron-builder/commit/e1e6d67))
* ignore dev deps if ignore func specified ([0944985](https://github.com/electron-userland/electron-builder/commit/0944985))
* validate bin checksum ([0f9d2e1](https://github.com/electron-userland/electron-builder/commit/0f9d2e1))


### Performance Improvements

* create asar without intermediate copy ([95c8a0c](https://github.com/electron-userland/electron-builder/commit/95c8a0c))



<a name="5.4.3"></a>
## [5.4.3](https://github.com/electron-userland/electron-builder/compare/v5.4.2...v5.4.3) (2016-06-16)


### Bug Fixes

* allow passing absolute and relative path as userAppDir option (#515) ([df096f0](https://github.com/electron-userland/electron-builder/commit/df096f0))



<a name="5.4.2"></a>
## [5.4.2](https://github.com/electron-userland/electron-builder/compare/v5.4.1...v5.4.2) (2016-06-16)


### Bug Fixes

* ignore com.apple.idms.appleid.prd. certs ([b69d3ab](https://github.com/electron-userland/electron-builder/commit/b69d3ab)), closes [#510](https://github.com/electron-userland/electron-builder/issues/510)



<a name="5.4.1"></a>
## [5.4.1](https://github.com/electron-userland/electron-builder/compare/v5.4.0...v5.4.1) (2016-06-14)


### Bug Fixes

* don't use deb default deps for other targets #502 ([c3679e7](https://github.com/electron-userland/electron-builder/commit/c3679e7))



<a name="5.4.0"></a>
# [5.4.0](https://github.com/electron-userland/electron-builder/compare/v5.3.0...v5.4.0) (2016-06-14)


### Features

* NSIS target (#495) ([d8762db](https://github.com/electron-userland/electron-builder/commit/d8762db)), closes [#472](https://github.com/electron-userland/electron-builder/issues/472) [#493](https://github.com/electron-userland/electron-builder/issues/493)



<a name="5.3.0"></a>
# [5.3.0](https://github.com/electron-userland/electron-builder/compare/v5.2.1...v5.3.0) (2016-06-14)


### Features

* adding dot asar option (#496) ([3fc7a89](https://github.com/electron-userland/electron-builder/commit/3fc7a89))



<a name="5.2.1"></a>
## [5.2.1](https://github.com/electron-userland/electron-builder/compare/v5.2.0...v5.2.1) (2016-06-12)


### Bug Fixes

* don't try to build OS X x64 ([ee64432](https://github.com/electron-userland/electron-builder/commit/ee64432))



<a name="5.2.0"></a>
# [5.2.0](https://github.com/electron-userland/electron-builder/compare/v5.1.0...v5.2.0) (2016-06-11)


### Features

* Ability to set author/CompanyName programmatically ([63c2529](https://github.com/electron-userland/electron-builder/commit/63c2529)), closes [#455](https://github.com/electron-userland/electron-builder/issues/455)
* Add Ability to Create Pre-Releases and Releases ([e5b0c04](https://github.com/electron-userland/electron-builder/commit/e5b0c04)), closes [#446](https://github.com/electron-userland/electron-builder/issues/446)



<a name="5.1.0"></a>
# [5.1.0](https://github.com/electron-userland/electron-builder/compare/v5.0.3...v5.1.0) (2016-06-10)


### Bug Fixes

* Builder attempts to sign OSX app even though no signing is specified ([24f6045](https://github.com/electron-userland/electron-builder/commit/24f6045)), closes [#481](https://github.com/electron-userland/electron-builder/issues/481) [#484](https://github.com/electron-userland/electron-builder/issues/484)


### Features

* Windows targets `7z`, `zip`, `tar.xz`, `tar.lz`, `tar.gz`, `tar.bz2` ([1c983d4](https://github.com/electron-userland/electron-builder/commit/1c983d4))



<a name="5.0.3"></a>
## [5.0.3](https://github.com/electron-userland/electron-builder/compare/v5.0.2...v5.0.3) (2016-06-10)


### Bug Fixes

* Asar: true failing on Windows for electron-builder 5.x ([317a330](https://github.com/electron-userland/electron-builder/commit/317a330)), closes [#482](https://github.com/electron-userland/electron-builder/issues/482)



<a name="5.0.2"></a>
## [5.0.2](https://github.com/electron-userland/electron-builder/compare/v5.0.1...v5.0.2) (2016-06-09)


### Bug Fixes

* mas target — Identity name is specified, but no valid identity with this name in the keychain ([b091a13](https://github.com/electron-userland/electron-builder/commit/b091a13)), closes [#479](https://github.com/electron-userland/electron-builder/issues/479)



<a name="5.0.1"></a>
## [5.0.1](https://github.com/electron-userland/electron-builder/compare/v5.0.0...v5.0.1) (2016-06-09)


### Bug Fixes

* restore `--platform` and `--arch` CLI ([7f9e6e3](https://github.com/electron-userland/electron-builder/commit/7f9e6e3))



<a name="5.0.0"></a>
# [5.0.0](https://github.com/electron-userland/electron-builder/compare/v4.2.6...v5.0.0) (2016-06-08)


### Bug Fixes

* efficient implementation of copy extra files/resources ([5853514](https://github.com/electron-userland/electron-builder/commit/5853514))


### Features

* Development dependencies are never copied in any case ([6d4ab11](https://github.com/electron-userland/electron-builder/commit/6d4ab11))
* files option ([0f7624d](https://github.com/electron-userland/electron-builder/commit/0f7624d))


### BREAKING CHANGES

* prune by default, hidden files are not copied by default anymore



<a name="4.2.6"></a>
## [4.2.6](https://github.com/electron-userland/electron-builder/compare/v4.2.5...v4.2.6) (2016-06-06)


### Bug Fixes

* OS X code signing — cert type prefix must be added, restore non-Apple cert support ([97e16a2](https://github.com/electron-userland/electron-builder/commit/97e16a2)), closes [#458](https://github.com/electron-userland/electron-builder/issues/458)



<a name="4.2.5"></a>
## [4.2.5](https://github.com/electron-userland/electron-builder/compare/v4.2.4...v4.2.5) (2016-06-06)


### Bug Fixes

* Fallback to CSC_KEY_PASSWORD if certificatePassword not given ([aea6505](https://github.com/electron-userland/electron-builder/commit/aea6505)), closes [#475](https://github.com/electron-userland/electron-builder/issues/475)



<a name="4.2.4"></a>
## [4.2.4](https://github.com/electron-userland/electron-builder/compare/v4.2.3...v4.2.4) (2016-06-06)


### Bug Fixes

* Squirrel-packed executable not signed ([eb10afb](https://github.com/electron-userland/electron-builder/commit/eb10afb)), closes [#449](https://github.com/electron-userland/electron-builder/issues/449)



<a name="4.2.3"></a>
## [4.2.3](https://github.com/electron-userland/electron-builder/compare/v4.2.2...v4.2.3) (2016-06-05)


### Bug Fixes

* building windows 32 bit and 64 bit simultaneously ([cec4b3d](https://github.com/electron-userland/electron-builder/commit/cec4b3d)), closes [#470](https://github.com/electron-userland/electron-builder/issues/470)



<a name="4.2.2"></a>
## [4.2.2](https://github.com/electron-userland/electron-builder/compare/v4.2.1...v4.2.2) (2016-06-03)


### Bug Fixes

* 4.2.1 Doesn't Include `.node` Files ([12ba8b7](https://github.com/electron-userland/electron-builder/commit/12ba8b7)), closes [#468](https://github.com/electron-userland/electron-builder/issues/468)



<a name="4.2.1"></a>
## [4.2.1](https://github.com/electron-userland/electron-builder/compare/v4.2.0...v4.2.1) (2016-06-03)


### Bug Fixes

* Application entry can't be found ([a7b2932](https://github.com/electron-userland/electron-builder/commit/a7b2932)), closes [#371](https://github.com/electron-userland/electron-builder/issues/371)
* icudtl.dat: file changed as we read it ([567c813](https://github.com/electron-userland/electron-builder/commit/567c813)), closes [#460](https://github.com/electron-userland/electron-builder/issues/460)
* warn "It is not possible to build OS X app on Windows" ([f6c47f7](https://github.com/electron-userland/electron-builder/commit/f6c47f7)), closes [#422](https://github.com/electron-userland/electron-builder/issues/422)



<a name="4.2.0"></a>
# [4.2.0](https://github.com/electron-userland/electron-builder/compare/v4.1.0...v4.2.0) (2016-06-02)


### Bug Fixes

* Don´t throw error if Release is not a Draft and build triggered by Tag ([0f060c1](https://github.com/electron-userland/electron-builder/commit/0f060c1)), closes [#429](https://github.com/electron-userland/electron-builder/issues/429)
* entitlements file names according to new electron-osx-sign conventions ([ecdff3c](https://github.com/electron-userland/electron-builder/commit/ecdff3c))
* log github publisher user and project #425 ([c2c3ef6](https://github.com/electron-userland/electron-builder/commit/c2c3ef6))
* move npmRebuild to build ([1110596](https://github.com/electron-userland/electron-builder/commit/1110596))
* update electron-osx-sign to 0.4 beta ([bf93b24](https://github.com/electron-userland/electron-builder/commit/bf93b24))
* windows codesign on Linux ([7166580](https://github.com/electron-userland/electron-builder/commit/7166580))


### Features

* `--dist` by default ([ae3f1bb](https://github.com/electron-userland/electron-builder/commit/ae3f1bb)), closes [#413](https://github.com/electron-userland/electron-builder/issues/413)


### BREAKING CHANGES

* See new entitlements paths in the wiki



<a name="4.1.0"></a>
# [4.1.0](https://github.com/electron-userland/electron-builder/compare/v4.0.0...v4.1.0) (2016-05-30)


### Features

* user-friendly MAS code signing ([fe53388](https://github.com/electron-userland/electron-builder/commit/fe53388))



<a name="4.0.0"></a>
# [4.0.0](https://github.com/electron-userland/electron-builder/compare/v3.27.0...v4.0.0) (2016-05-29)


### Features

* `--dist` by default and remove this flag in favour of `--target=dir #413 ([a5e4571](https://github.com/electron-userland/electron-builder/commit/a5e4571))
* extraFiles ([ca120e3](https://github.com/electron-userland/electron-builder/commit/ca120e3))
* option to skip installAppDependencies ([67ed60b](https://github.com/electron-userland/electron-builder/commit/67ed60b)), closes [#442](https://github.com/electron-userland/electron-builder/issues/442)


### BREAKING CHANGES

* `extraResources` copying files to `resources` on Linux/Windows, not to root directory as before. To copy to the root please use new option `extraFiles`.
* `appDir` CLI is removed — use [directories.app](https://github.com/electron-userland/electron-builder/wiki/Options#MetadataDirectories-app) in the development package.json. `sign` CLI is removed — use [build.osx.identity](https://github.com/electron-userland/electron-builder/wiki/Options#OsXBuildOptions-identity) in the development package.json.



<a name="3.27.0"></a>
# [3.27.0](https://github.com/electron-userland/electron-builder/compare/v3.26.3...v3.27.0) (2016-05-26)


### Features

* **windows:** specification of signing algorithms (#435) ([73e7c14](https://github.com/electron-userland/electron-builder/commit/73e7c14)), closes [#374](https://github.com/electron-userland/electron-builder/issues/374) [#416](https://github.com/electron-userland/electron-builder/issues/416)
* support finding electron version in build.electronVersion or electron-prebuilt-compile ([4c1f06d](https://github.com/electron-userland/electron-builder/commit/4c1f06d))



<a name="3.26.3"></a>
## [3.26.3](https://github.com/electron-userland/electron-builder/compare/v3.26.2...v3.26.3) (2016-05-23)


### Bug Fixes

* import bundled certs into login.keychain ([bffbbf1](https://github.com/electron-userland/electron-builder/commit/bffbbf1)), closes [#398](https://github.com/electron-userland/electron-builder/issues/398)



<a name="3.26.2"></a>
## [3.26.2](https://github.com/electron-userland/electron-builder/compare/v3.26.1...v3.26.2) (2016-05-23)


### Bug Fixes

* check that description is not empty ([a3bbb3f](https://github.com/electron-userland/electron-builder/commit/a3bbb3f)), closes [#392](https://github.com/electron-userland/electron-builder/issues/392)



<a name="3.26.1"></a>
## [3.26.1](https://github.com/electron-userland/electron-builder/compare/v3.26.0...v3.26.1) (2016-05-23)


### Bug Fixes

* forbid name in the build ([e4eefb2](https://github.com/electron-userland/electron-builder/commit/e4eefb2)), closes [#360](https://github.com/electron-userland/electron-builder/issues/360)



<a name="3.26.0"></a>
# [3.26.0](https://github.com/electron-userland/electron-builder/compare/v3.25.0...v3.26.0) (2016-05-23)


### Features

* **linux:** sh, rpm, freebsd, pacman, p5p, apk, 7z, zip, tar.xz, tar.gz, tar.bz2, tar.lz ([50d31f1](https://github.com/electron-userland/electron-builder/commit/50d31f1)), closes [#414](https://github.com/electron-userland/electron-builder/issues/414)



<a name="3.25.0"></a>
# [3.25.0](https://github.com/electron-userland/electron-builder/compare/v3.24.0...v3.25.0) (2016-05-18)


### Bug Fixes

* Trouble building delta package for Squirrel.Windows on OSX ([cc8278a](https://github.com/electron-userland/electron-builder/commit/cc8278a)), closes [#407](https://github.com/electron-userland/electron-builder/issues/407)


### Features

* **osx:** Optional DMG background ([4088b13](https://github.com/electron-userland/electron-builder/commit/4088b13))
* The function to be run after pack (but before pack into distributable format and sign) ([7f32573](https://github.com/electron-userland/electron-builder/commit/7f32573)), closes [#397](https://github.com/electron-userland/electron-builder/issues/397)
* check asar existence and integrity (#401) ([4a9af55](https://github.com/electron-userland/electron-builder/commit/4a9af55))



<a name="3.24.0"></a>
# [3.24.0](https://github.com/electron-userland/electron-builder/compare/v3.23.0...v3.24.0) (2016-05-15)


### Features

* **linux:** Install libappindicator1 and libnotify as a dependency of the linux package ([05baad5](https://github.com/electron-userland/electron-builder/commit/05baad5))



<a name="3.23.0"></a>
# [3.23.0](https://github.com/electron-userland/electron-builder/compare/v3.22.2...v3.23.0) (2016-05-14)


### Features

* bundle Certum cert ([2e0894f](https://github.com/electron-userland/electron-builder/commit/2e0894f)), closes [#398](https://github.com/electron-userland/electron-builder/issues/398)



<a name="3.22.2"></a>
## [3.22.2](https://github.com/electron-userland/electron-builder/compare/v3.22.1...v3.22.2) (2016-05-14)


### Bug Fixes

* **linux:** use full path in .desktop file (#405) ([1164ca1](https://github.com/electron-userland/electron-builder/commit/1164ca1))
* incorrect nupkg file if created on windows ([a5a23ae](https://github.com/electron-userland/electron-builder/commit/a5a23ae)), closes [#402](https://github.com/electron-userland/electron-builder/issues/402) [#351](https://github.com/electron-userland/electron-builder/issues/351)



<a name="3.22.1"></a>
## [3.22.1](https://github.com/electron-userland/electron-builder/compare/v3.22.0...v3.22.1) (2016-05-13)


### Bug Fixes

* win ia32 out dir name — unexpanded $arch ([8d9b952](https://github.com/electron-userland/electron-builder/commit/8d9b952))



<a name="3.22.0"></a>
# [3.22.0](https://github.com/electron-userland/electron-builder/compare/v3.21.0...v3.22.0) (2016-05-13)


### Features

* revert "Releases file for Windows not uploaded to Github #190" ([079989a](https://github.com/electron-userland/electron-builder/commit/079989a))



<a name="3.21.0"></a>
# [3.21.0](https://github.com/electron-userland/electron-builder/compare/v3.20.0...v3.21.0) (2016-05-12)


### Bug Fixes

* Cannot upload prerelease version ([05121df](https://github.com/electron-userland/electron-builder/commit/05121df)), closes [#395](https://github.com/electron-userland/electron-builder/issues/395)


### Features

* Squirrel.Windows doesn't escape " in the description ([6977557](https://github.com/electron-userland/electron-builder/commit/6977557)), closes [#378](https://github.com/electron-userland/electron-builder/issues/378)



<a name="3.20.0"></a>
# [3.20.0](https://github.com/electron-userland/electron-builder/compare/v3.19.0...v3.20.0) (2016-05-11)


### Bug Fixes

* http download to destination if no parent dirs created ([b5505fc](https://github.com/electron-userland/electron-builder/commit/b5505fc))


### Features

* dual code-sign windows app + timestamped ([b71d2f3](https://github.com/electron-userland/electron-builder/commit/b71d2f3))



<a name="3.19.0"></a>
# [3.19.0](https://github.com/electron-userland/electron-builder/compare/v3.18.0...v3.19.0) (2016-05-10)


### Features

* Code signing windows app using SHA256 ([032ba05](https://github.com/electron-userland/electron-builder/commit/032ba05)), closes [#386](https://github.com/electron-userland/electron-builder/issues/386)



<a name="3.18.0"></a>
# [3.18.0](https://github.com/electron-userland/electron-builder/compare/v3.17.1...v3.18.0) (2016-05-09)


### Bug Fixes

* user-friendly error message "Error: buffer is not ico" ([7ac6ca2](https://github.com/electron-userland/electron-builder/commit/7ac6ca2)), closes [#349](https://github.com/electron-userland/electron-builder/issues/349)


### Features

* base64-encoded P12 file instead of https link ([3ab0e57](https://github.com/electron-userland/electron-builder/commit/3ab0e57))
* cleanup unused fpm versions ([633d006](https://github.com/electron-userland/electron-builder/commit/633d006))
* use self-contained fpm on Linux — don't need to install ruby anymore ([7d5b747](https://github.com/electron-userland/electron-builder/commit/7d5b747))



<a name="3.17.1"></a>
## [3.17.1](https://github.com/electron-userland/electron-builder/compare/v3.17.0...v3.17.1) (2016-05-05)


### Bug Fixes

* bundle StartSSL certs ([16d3805](https://github.com/electron-userland/electron-builder/commit/16d3805))
* osx code sign regression ([2d0f5f1](https://github.com/electron-userland/electron-builder/commit/2d0f5f1)), closes [#377](https://github.com/electron-userland/electron-builder/issues/377)



<a name="3.17.0"></a>
# [3.17.0](https://github.com/electron-userland/electron-builder/compare/v3.16.1...v3.17.0) (2016-05-04)


### Features

* use self-containe fpm on OS X — don't need to install ruby anymore ([e7cee5e](https://github.com/electron-userland/electron-builder/commit/e7cee5e))



<a name="3.16.1"></a>
## [3.16.1](https://github.com/electron-userland/electron-builder/compare/v3.16.0...v3.16.1) (2016-05-03)


### Bug Fixes

* check wine version ([d77c8da](https://github.com/electron-userland/electron-builder/commit/d77c8da)), closes [#352](https://github.com/electron-userland/electron-builder/issues/352)



<a name="3.16.0"></a>
# [3.16.0](https://github.com/electron-userland/electron-builder/compare/v3.15.0...v3.16.0) (2016-05-02)


### Features

* add Jenkins build number support (#373) ([eebe882](https://github.com/electron-userland/electron-builder/commit/eebe882))



<a name="3.15.0"></a>
# [3.15.0](https://github.com/electron-userland/electron-builder/compare/v3.14.0...v3.15.0) (2016-05-02)


### Features

* iconUrl git-lfs support, os x identity/installerIdentity options ([974f7f3](https://github.com/electron-userland/electron-builder/commit/974f7f3)), closes [#332](https://github.com/electron-userland/electron-builder/issues/332)
* osx entitlements location by convention ([af1165b](https://github.com/electron-userland/electron-builder/commit/af1165b))



<a name="3.14.0"></a>
# [3.14.0](https://github.com/electron-userland/electron-builder/compare/v3.13.1...v3.14.0) (2016-04-29)


### Features

* build mas + other targets, osx 7z ([c46e1f5](https://github.com/electron-userland/electron-builder/commit/c46e1f5))



<a name="3.13.1"></a>
## [3.13.1](https://github.com/electron-userland/electron-builder/compare/v3.13.0...v3.13.1) (2016-04-28)


### Bug Fixes

* statFileInPackage in platformPackager.js creates wrong path ([7373131](https://github.com/electron-userland/electron-builder/commit/7373131)), closes [#365](https://github.com/electron-userland/electron-builder/issues/365)



<a name="3.13.0"></a>
# [3.13.0](https://github.com/electron-userland/electron-builder/compare/v3.12.0...v3.13.0) (2016-04-28)


### Bug Fixes

* add debug log to investigate "Cannot build app with 3.6.2+" #360 ([1970550](https://github.com/electron-userland/electron-builder/commit/1970550))


### Features

* DMG — use bzip2 compression (old: 40MB, new: 36MB) ([e0c3b92](https://github.com/electron-userland/electron-builder/commit/e0c3b92))



<a name="3.12.0"></a>
# [3.12.0](https://github.com/electron-userland/electron-builder/compare/v3.11.0...v3.12.0) (2016-04-27)


### Bug Fixes

* Windows shortcut doesn't work when `productName` contains a space ([f99d61e](https://github.com/electron-userland/electron-builder/commit/f99d61e)), closes [#339](https://github.com/electron-userland/electron-builder/issues/339)


### Features

* check application package ([27faf73](https://github.com/electron-userland/electron-builder/commit/27faf73)), closes [#303](https://github.com/electron-userland/electron-builder/issues/303)



<a name="3.11.0"></a>
# [3.11.0](https://github.com/electron-userland/electron-builder/compare/v3.10.0...v3.11.0) (2016-04-25)


### Features

* mac app store ([260ca0b](https://github.com/electron-userland/electron-builder/commit/260ca0b)), closes [#332](https://github.com/electron-userland/electron-builder/issues/332)



<a name="3.10.0"></a>
# [3.10.0](https://github.com/electron-userland/electron-builder/compare/v3.9.0...v3.10.0) (2016-04-23)


### Features

* import startssl certs by default ([0f19455](https://github.com/electron-userland/electron-builder/commit/0f19455))



<a name="3.9.0"></a>
# [3.9.0](https://github.com/electron-userland/electron-builder/compare/v3.8.0...v3.9.0) (2016-04-21)


### Features

* build.osx.target to specify dmg, zip or both ([23df6a1](https://github.com/electron-userland/electron-builder/commit/23df6a1)), closes [#322](https://github.com/electron-userland/electron-builder/issues/322)



<a name="3.8.0"></a>
# [3.8.0](https://github.com/electron-userland/electron-builder/compare/v3.7.0...v3.8.0) (2016-04-20)


### Features

* accept multiple default app dirs ([ea5f842](https://github.com/electron-userland/electron-builder/commit/ea5f842)), closes [#344](https://github.com/electron-userland/electron-builder/issues/344)



<a name="3.7.0"></a>
# [3.7.0](https://github.com/electron-userland/electron-builder/compare/v3.6.3...v3.7.0) (2016-04-20)


### Features

* Windows code signing from OS X ([9134f61](https://github.com/electron-userland/electron-builder/commit/9134f61)), closes [#314](https://github.com/electron-userland/electron-builder/issues/314)



<a name="3.6.3"></a>
## [3.6.3](https://github.com/electron-userland/electron-builder/compare/v3.6.2...v3.6.3) (2016-04-19)


### Bug Fixes

* Looks for linux homepage in the development package.json not in the application package.json ([3da6893](https://github.com/electron-userland/electron-builder/commit/3da6893)), closes [#334](https://github.com/electron-userland/electron-builder/issues/334)



<a name="3.6.2"></a>
## [3.6.2](https://github.com/electron-userland/electron-builder/compare/v3.6.1...v3.6.2) (2016-04-19)


### Bug Fixes

* get rid of nuget to pack win ([c987439](https://github.com/electron-userland/electron-builder/commit/c987439))



<a name="3.6.1"></a>
## [3.6.1](https://github.com/electron-userland/electron-builder/compare/v3.6.0...v3.6.1) (2016-04-17)


### Bug Fixes

* deb package description according to spec ([3c6ec3f](https://github.com/electron-userland/electron-builder/commit/3c6ec3f)), closes [#327](https://github.com/electron-userland/electron-builder/issues/327)



<a name="3.6.0"></a>
# [3.6.0](https://github.com/electron-userland/electron-builder/compare/v3.5.2...v3.6.0) (2016-04-16)


### Bug Fixes

* check that noMsi specified as bool ([8266b22](https://github.com/electron-userland/electron-builder/commit/8266b22)), closes [#316](https://github.com/electron-userland/electron-builder/issues/316)


### Features

* Allow to specify custom build-version for electron-packager ([c866084](https://github.com/electron-userland/electron-builder/commit/c866084)), closes [#323](https://github.com/electron-userland/electron-builder/issues/323)



<a name="3.5.2"></a>
## [3.5.2](https://github.com/electron-userland/electron-builder/compare/v3.5.1...v3.5.2) (2016-04-15)


### Bug Fixes

* check that electron-packager create out directory ([e015b61](https://github.com/electron-userland/electron-builder/commit/e015b61)), closes [#301](https://github.com/electron-userland/electron-builder/issues/301)



<a name="3.5.1"></a>
## [3.5.1](https://github.com/electron-userland/electron-builder/compare/v3.5.0...v3.5.1) (2016-04-14)


### Bug Fixes

* Error while creating delta nupkg for Windows: System.DllNotFoundException: msdelta.dl #294 ([574add7](https://github.com/electron-userland/electron-builder/commit/574add7)), closes [#294](https://github.com/electron-userland/electron-builder/issues/294)



<a name="3.5.0"></a>
# [3.5.0](https://github.com/electron-userland/electron-builder/compare/v3.4.0...v3.5.0) (2016-04-10)


### Features

* if build/install-spinner.gif exists, set loadingGif to it ([85a6fba](https://github.com/electron-userland/electron-builder/commit/85a6fba)), closes [#292](https://github.com/electron-userland/electron-builder/issues/292)



<a name="3.4.0"></a>
# [3.4.0](https://github.com/electron-userland/electron-builder/compare/v3.3.1...v3.4.0) (2016-04-09)


### Features

* Ability to customize the output directory ([78bddc7](https://github.com/electron-userland/electron-builder/commit/78bddc7)), closes [#272](https://github.com/electron-userland/electron-builder/issues/272)



<a name="3.3.1"></a>
## [3.3.1](https://github.com/electron-userland/electron-builder/compare/v3.3.0...v3.3.1) (2016-04-08)


### Bug Fixes

* vendor/osx/7za seems to be broken ([422a032](https://github.com/electron-userland/electron-builder/commit/422a032)), closes [#296](https://github.com/electron-userland/electron-builder/issues/296)



<a name="3.3.0"></a>
# [3.3.0](https://github.com/electron-userland/electron-builder/compare/v3.2.0...v3.3.0) (2016-04-05)


### Features

* use 7za to produce Squirrel.mac zip (smaller size — the same time to compress) ([2dd5d7c](https://github.com/electron-userland/electron-builder/commit/2dd5d7c))



<a name="3.2.0"></a>
# [3.2.0](https://github.com/electron-userland/electron-builder/compare/v3.1.2...v3.2.0) (2016-04-02)


### Features

* Linux deb — specify license, package url #242 ([c62683a](https://github.com/electron-userland/electron-builder/commit/c62683a))



<a name="3.1.2"></a>
## [3.1.2](https://github.com/electron-userland/electron-builder/compare/v3.1.1...v3.1.2) (2016-04-01)


### Bug Fixes

* Windows installer metadata is incorrect #278 ([b151ffc](https://github.com/electron-userland/electron-builder/commit/b151ffc)), closes [#278](https://github.com/electron-userland/electron-builder/issues/278)
* check windows icon to avoid unclear error messages in the 3rd-part tools ([6ad853d](https://github.com/electron-userland/electron-builder/commit/6ad853d)), closes [#243](https://github.com/electron-userland/electron-builder/issues/243)



<a name="3.1.0"></a>
# [3.1.0](https://github.com/electron-userland/electron-builder/compare/v3.0.2...v3.1.0) (2016-03-25)


### Features

* prefix dist: as marker to package in a distributable format ([fa7cc85](https://github.com/electron-userland/electron-builder/commit/fa7cc85)), closes [#267](https://github.com/electron-userland/electron-builder/issues/267)



<a name="3.0.2"></a>
## [3.0.2](https://github.com/electron-userland/electron-builder/compare/v3.0.1...v3.0.2) (2016-03-25)


### Bug Fixes

* Error publishing to github when building on travis #261 ([92f7a38](https://github.com/electron-userland/electron-builder/commit/92f7a38)), closes [#261](https://github.com/electron-userland/electron-builder/issues/261)



<a name="3.0.1"></a>
## [3.0.1](https://github.com/electron-userland/electron-builder/compare/v3.0.0...v3.0.1) (2016-03-24)


### Bug Fixes

* copy extra resources to NuGet package ([65d8126](https://github.com/electron-userland/electron-builder/commit/65d8126)), closes [#230](https://github.com/electron-userland/electron-builder/issues/230)



<a name="3.0.0"></a>
# [3.0.0](https://github.com/electron-userland/electron-builder/compare/v2.11.0...v3.0.0) (2016-03-23)


### Bug Fixes

* Linux build fails at icon conversion #239 ([c778e2b](https://github.com/electron-userland/electron-builder/commit/c778e2b)), closes [#239](https://github.com/electron-userland/electron-builder/issues/239)
* Problems downloading electron #180 ([0265db9](https://github.com/electron-userland/electron-builder/commit/0265db9)), closes [#180](https://github.com/electron-userland/electron-builder/issues/180)
* update winstaller to fix build windows on OS X ([c2bd66b](https://github.com/electron-userland/electron-builder/commit/c2bd66b))
* zip, dmg and exe filenames do not use productName as intended ([bfca0a7](https://github.com/electron-userland/electron-builder/commit/bfca0a7))


### Code Refactoring

* remove deprecated API (<2.8) ([eadd09b](https://github.com/electron-userland/electron-builder/commit/eadd09b))


### Features

* copy extra resources to packaged app ([cbe3ff8](https://github.com/electron-userland/electron-builder/commit/cbe3ff8))
* linux icons from custom dir, generate missing from ICNS ([7ac4b84](https://github.com/electron-userland/electron-builder/commit/7ac4b84))
* remove support of `build` in the application package.json ([46dbfe1](https://github.com/electron-userland/electron-builder/commit/46dbfe1)), closes [#251](https://github.com/electron-userland/electron-builder/issues/251)


### BREAKING CHANGES

* `build` is allowed since 3.0 only in the development package.json
* Deprecated <2.8 API has been removed



<a name="2.9.5"></a>
## [2.9.5](https://github.com/electron-userland/electron-builder/compare/v2.9.4...v2.9.5) (2016-03-13)


### Bug Fixes

* Windows nupkg downloaded twice each time / also keeps downloading latest release #234 ([3c90af6](https://github.com/electron-userland/electron-builder/commit/3c90af6)), closes [#234](https://github.com/electron-userland/electron-builder/issues/234)



<a name="2.9.4"></a>
## [2.9.4](https://github.com/electron-userland/electron-builder/compare/v2.9.3...v2.9.4) (2016-03-13)


### Bug Fixes

* Github publishing not working on Linux #229 ([841f397](https://github.com/electron-userland/electron-builder/commit/841f397))
* delete release again if failed with "405 Not Allowed" (3 times) ([ebf783c](https://github.com/electron-userland/electron-builder/commit/ebf783c))
* ignore newline when parsing common name in .p12 certificates ([dee8303](https://github.com/electron-userland/electron-builder/commit/dee8303))
* npm install doesn't rebuild native dependencies if arch changed — rebuild must be used ([5bcc95a](https://github.com/electron-userland/electron-builder/commit/5bcc95a))
* reupload again if failed with "502 Bad Gateway" (3 times) ([f131e33](https://github.com/electron-userland/electron-builder/commit/f131e33))



<a name="2.9.0"></a>
# [2.9.0](https://github.com/electron-userland/electron-builder/compare/v2.8.6...v2.9.0) (2016-03-09)


### Bug Fixes

* **windows:** Releases file for Windows not uploaded to Github ([9f4fba9](https://github.com/electron-userland/electron-builder/commit/9f4fba9)), closes [#190](https://github.com/electron-userland/electron-builder/issues/190)
* **windows:** do not rename artifacts twice ([9c87ffd](https://github.com/electron-userland/electron-builder/commit/9c87ffd))
* Getting "no such file or directory, rename ..." #208 ([1b6012e](https://github.com/electron-userland/electron-builder/commit/1b6012e)), closes [#208](https://github.com/electron-userland/electron-builder/issues/208)


### Features

* Allow custom .p12 certificates ([6918916](https://github.com/electron-userland/electron-builder/commit/6918916)), closes [#216](https://github.com/electron-userland/electron-builder/issues/216)
* use productName from app/package.json if present #204 ([5d376e1](https://github.com/electron-userland/electron-builder/commit/5d376e1)), closes [#204](https://github.com/electron-userland/electron-builder/issues/204) [#223](https://github.com/electron-userland/electron-builder/issues/223)



<a name="2.8.4"></a>
## [2.8.4](https://github.com/electron-userland/electron-builder/compare/v2.8.3...v2.8.4) (2016-03-03)


### Bug Fixes

* Configure build resources directory #184 ([5df87d3](https://github.com/electron-userland/electron-builder/commit/5df87d3)), closes [#184](https://github.com/electron-userland/electron-builder/issues/184) [#196](https://github.com/electron-userland/electron-builder/issues/196)



<a name="2.8.3"></a>
## [2.8.3](https://github.com/electron-userland/electron-builder/compare/v2.8.2...v2.8.3) (2016-02-25)


### Bug Fixes

* **nsis:** error on win when APP_OUT_FILE has spaces ([f4e1b41](https://github.com/electron-userland/electron-builder/commit/f4e1b41))



<a name="2.8.2"></a>
## [2.8.2](https://github.com/electron-userland/electron-builder/compare/v2.8.1...v2.8.2) (2016-02-23)


### Bug Fixes

* remove unused dependency lodash.camelcase ([c7be41b](https://github.com/electron-userland/electron-builder/commit/c7be41b))



<a name="2.8.1"></a>
## [2.8.1](https://github.com/electron-userland/electron-builder/compare/v2.8.0...v2.8.1) (2016-02-23)


### Bug Fixes

* move read-package-json to production dependencies ([ac10716](https://github.com/electron-userland/electron-builder/commit/ac10716))



<a name="2.8.0"></a>
# [2.8.0](https://github.com/electron-userland/electron-builder/compare/v2.7.2...v2.8.0) (2016-02-23)


### Features

* use read-package-json as a correct fix of Linux maintainer .deb package field ([3fba451](https://github.com/electron-userland/electron-builder/commit/3fba451))