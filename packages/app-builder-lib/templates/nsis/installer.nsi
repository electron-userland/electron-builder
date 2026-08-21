Var newStartMenuLink
Var oldStartMenuLink
Var newDesktopLink
Var oldDesktopLink
Var oldShortcutName
Var oldMenuDirectory

!include "common.nsh"
!include "MUI2.nsh"
!include "multiUser.nsh"
!include "allowOnlyOneInstallerInstance.nsh"

!ifdef BUILD_UNINSTALLER
  !ifmacrodef customUnInstallSection
    !define MUI_COMPONENTSPAGE_NODESC
    !insertmacro MUI_UNPAGE_COMPONENTS
  !endif
!endif

!ifdef INSTALL_MODE_PER_ALL_USERS
  !ifdef BUILD_UNINSTALLER
    RequestExecutionLevel user
  !else
    RequestExecutionLevel admin
  !endif
!else
  RequestExecutionLevel user
!endif

!ifdef BUILD_UNINSTALLER
  SilentInstall silent
!else
  Var appExe
  Var launchLink
!endif

!ifdef ONE_CLICK
  !include "oneClick.nsh"
!else
  !include "assistedInstaller.nsh"
!endif

!insertmacro addLangs

!ifmacrodef customHeader
  !insertmacro customHeader
!endif

Function .onInit
  Call setInstallSectionSpaceRequired

  SetOutPath $INSTDIR
  ${LogSet} on

  !ifmacrodef preInit
    !insertmacro preInit
  !endif

  !ifdef DISPLAY_LANG_SELECTOR
    !insertmacro MUI_LANGDLL_DISPLAY
  !endif

  !ifdef BUILD_UNINSTALLER
    WriteUninstaller "${UNINSTALLER_OUT_FILE}"
    !insertmacro quitSuccess
  !else
    !insertmacro check64BitAndSetRegView

    !ifdef ONE_CLICK
      !insertmacro ALLOW_ONLY_ONE_INSTALLER_INSTANCE
    !else
      ${IfNot} ${UAC_IsInnerInstance}
        !insertmacro ALLOW_ONLY_ONE_INSTALLER_INSTANCE
      ${EndIf}
    !endif

    !insertmacro initMultiUser

    !ifmacrodef customInit
      !insertmacro customInit
    !endif

    !ifmacrodef addLicenseFiles
      InitPluginsDir
      !insertmacro addLicenseFiles
    !endif
  !endif
FunctionEnd

!ifndef BUILD_UNINSTALLER
  !include "installUtil.nsh"
!endif

Section "install" INSTALL_SECTION_ID
  !ifndef BUILD_UNINSTALLER
    # If we're running a silent upgrade of a per-machine installation, elevate so extracting the new app will succeed.
    # For a non-silent install, the elevation will be triggered when the install mode is selected in the UI,
    # but that won't be executed when silent.
    !ifndef INSTALL_MODE_PER_ALL_USERS
      !ifndef ONE_CLICK
          ${if} $hasPerMachineInstallation == "1" # set in onInit by initMultiUser
          ${andIf} ${Silent}
            ${ifNot} ${UAC_IsAdmin}
              # hasPerMachineInstallation reflects where a previous install was
              # registered, not whether $INSTDIR (and its registry bookkeeping) are
              # actually writable right now -- a customInstall hook may have already
              # loosened this folder's ACL for the current user. (Chrome and Firefox
              # avoid this prompt differently, via a standing privileged service --
              # Google Update/Omaha and the Mozilla Maintenance Service, both running as
              # LocalSystem -- rather than loosening file permissions for the user; see
              # PR description for citations. This directory+registry writability check
              # is a simpler, narrower mechanism suited to apps that don't want to ship a
              # separate service.) Only actually elevate if a live check shows it's still
              # needed. Both must hold: registryAddInstallInfo writes
              # InstallLocation to SHELL_CONTEXT (HKLM here), and that WriteRegStr fails
              # silently when unelevated -- checking $INSTDIR alone would let this
              # section "succeed" while quietly wiping the per-machine registration that
              # the next launch's initMultiUser relies on.
              !insertmacro IsDirWritable $INSTDIR $R7
              !insertmacro IsRegKeyWritable HKLM "${INSTALL_REGISTRY_KEY}" $R8
              ${if} $R7 == "0"
              ${orIf} $R8 == "0"
                ShowWindow $HWNDPARENT ${SW_HIDE}
                !insertmacro UAC_RunElevated
                ${Switch} $0
                  ${Case} 0
                    ${Break}
                  ${Case} 1223 ;user aborted
                    ${Break}
                  ${Default}
                    MessageBox mb_IconStop|mb_TopMost|mb_SetForeground "Unable to elevate, error $0"
                    ${Break}
                ${EndSwitch}
                Quit
              ${endIf}
            ${else}
              !insertmacro setInstallModePerAllUsers
            ${endIf}
          ${endIf}
      !endif
    !endif
    !include "installSection.nsh"
  !endif
SectionEnd

Function setInstallSectionSpaceRequired
  !insertmacro setSpaceRequired ${INSTALL_SECTION_ID}
FunctionEnd

!ifdef BUILD_UNINSTALLER
  !include "uninstaller.nsh"
!endif