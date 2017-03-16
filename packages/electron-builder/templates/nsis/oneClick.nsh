!ifndef BUILD_UNINSTALLER
  !ifdef RUN_AFTER_FINISH
    !include StdUtils.nsh
    Function StartApp
      !ifdef INSTALL_MODE_PER_ALL_USERS
        ${StdUtils.ExecShellAsUser} $0 "$SMPROGRAMS\${PRODUCT_FILENAME}.lnk" "open" ""
      !else
        ${if} ${Updated}
          ExecShell "" "$SMPROGRAMS\${PRODUCT_FILENAME}.lnk" "--updated"
        ${else}
          ExecShell "" "$SMPROGRAMS\${PRODUCT_FILENAME}.lnk"
        ${endif}
      !endif
    FunctionEnd
  !endif

  !ifmacrodef licensePage
    !insertmacro licensePageHelper
    !insertmacro licensePage
  !endif
!endif

!insertmacro MUI_PAGE_INSTFILES
!ifdef BUILD_UNINSTALLER
  !insertmacro MUI_UNPAGE_INSTFILES
!endif

!ifdef MULTI_LANGUAGE_INSTALLER
  !include "langs.nsh"
!else
  !insertmacro MUI_LANGUAGE "English"
!endif

!macro initMultiUser
  !ifdef INSTALL_MODE_PER_ALL_USERS
    !insertmacro setInstallModePerAllUsers
  !else
    !insertmacro setInstallModePerUser
  !endif
!macroend