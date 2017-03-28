!ifndef BUILD_UNINSTALLER
  !ifdef RUN_AFTER_FINISH
    !include StdUtils.nsh
    !macro StartApp
      Var /GLOBAL startAppArgs
      ${if} ${Updated}
        StrCpy $startAppArgs "--updated"
      ${else}
        StrCpy $startAppArgs ""
      ${endif}
    
      !ifdef INSTALL_MODE_PER_ALL_USERS
        ${StdUtils.ExecShellAsUser} $0 $startMenuLink "open" "$startAppArgs"
      !else
        ExecShell "" "$startMenuLink" "$startAppArgs"
      !endif
    !macroend
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