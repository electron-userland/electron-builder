!include multiUserUi.nsh

!ifndef BUILD_UNINSTALLER
  Function StartApp
    !insertmacro UAC_AsUser_ExecShell "" "$SMPROGRAMS\${PRODUCT_FILENAME}.lnk" "" "" ""
  FunctionEnd

  Function GuiInit
    !insertmacro UAC_PageElevation_OnGuiInit
  FunctionEnd

  !define MUI_FINISHPAGE_RUN
  !define MUI_FINISHPAGE_RUN_FUNCTION "StartApp"

  !define MUI_CUSTOMFUNCTION_GUIINIT GuiInit

  !insertmacro PAGE_INSTALL_MODE
  !insertmacro MUI_PAGE_INSTFILES
  !insertmacro MUI_PAGE_FINISH
!else
  !insertmacro PAGE_INSTALL_MODE
  !insertmacro MUI_UNPAGE_INSTFILES
!endif

!macro initMultiUser
  !insertmacro UAC_PageElevation_OnInit

  ${If} ${UAC_IsInnerInstance}
  ${AndIfNot} ${UAC_IsAdmin}
    # special return value for outer instance so it knows we did not have admin rights
    SetErrorLevel 0x666666
    Quit
  ${EndIf}

  !ifndef MULTIUSER_INIT_TEXT_ADMINREQUIRED
    !define MULTIUSER_INIT_TEXT_ADMINREQUIRED "$(^Caption) requires administrator privileges."
  !endif

  !ifndef MULTIUSER_INIT_TEXT_POWERREQUIRED
    !define MULTIUSER_INIT_TEXT_POWERREQUIRED "$(^Caption) requires at least Power User privileges."
  !endif

  !ifndef MULTIUSER_INIT_TEXT_ALLUSERSNOTPOSSIBLE
    !define MULTIUSER_INIT_TEXT_ALLUSERSNOTPOSSIBLE "Your user account does not have sufficient privileges to install $(^Name) for all users of this computer."
  !endif

  # checks registry for previous installation path (both for upgrading, reinstall, or uninstall)
  StrCpy $hasPerMachineInstallation "0"
  StrCpy $hasPerUserInstallation "0"

  # set installation mode to setting from a previous installation
  ReadRegStr $perMachineInstallationFolder HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation
  ${if} $perMachineInstallationFolder != ""
    StrCpy $hasPerMachineInstallation "1"
  ${endif}

  ReadRegStr $perUserInstallationFolder HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation
  ${if} $perUserInstallationFolder != ""
    StrCpy $hasPerUserInstallation "1"
  ${endif}

  ${if} $hasPerUserInstallation == "1"
   ${andif} $hasPerMachineInstallation == "0"
    !insertmacro setInstallModePerUser
  ${elseif} $hasPerUserInstallation == "0"
    ${andif} $hasPerMachineInstallation == "1"
    !insertmacro setInstallModePerAllUsers
  ${else}
    # if there is no installation, or there is both per-user and per-machine
    !ifdef INSTALL_MODE_PER_ALL_USERS
      !insertmacro setInstallModePerAllUsers
    !else
      !insertmacro setInstallModePerUser
    !endif
  ${endif}
!macroend

!include "langs.nsh"