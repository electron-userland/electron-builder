!ifdef RUN_AFTER_FINISH
  !ifndef BUILD_UNINSTALLER
    Function StartApp
      !ifdef INSTALL_MODE_PER_ALL_USERS
        !include UAC.nsh
        !insertmacro UAC_AsUser_ExecShell "" "$SMPROGRAMS\${PRODUCT_FILENAME}.lnk" "" "" ""
      !else
        ExecShell "" "$SMPROGRAMS\${PRODUCT_FILENAME}.lnk"
      !endif
    FunctionEnd
  !endif
!endif

!insertmacro MUI_PAGE_INSTFILES
!ifdef BUILD_UNINSTALLER
  !insertmacro MUI_UNPAGE_INSTFILES
!endif

!insertmacro MUI_LANGUAGE "English"

!macro initMultiUser
  !ifdef INSTALL_MODE_PER_ALL_USERS
    !insertmacro setInstallModePerAllUsers
  !else
    !insertmacro setInstallModePerUser
  !endif
!macroend