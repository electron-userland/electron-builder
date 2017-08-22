!ifndef BUILD_UNINSTALLER
  !ifdef RUN_AFTER_FINISH
    !macro StartApp
      Var /GLOBAL startAppArgs
      ${if} ${isUpdated}
        StrCpy $startAppArgs "--updated"
      ${else}
        StrCpy $startAppArgs ""
      ${endif}

      !ifdef INSTALL_MODE_PER_ALL_USERS
        ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "$startAppArgs"
      !else
        ExecShell "" "$launchLink" "$startAppArgs"
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

!macro initMultiUser
  !ifdef INSTALL_MODE_PER_ALL_USERS
    !insertmacro setInstallModePerAllUsers
  !else
    !insertmacro setInstallModePerUser
  !endif
!macroend