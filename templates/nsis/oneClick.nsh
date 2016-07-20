!ifdef RUN_AFTER_FINISH
  Function StartApp
    !ifdef INSTALL_MODE_PER_ALL_USERS
      !include UAC.nsh
      !insertmacro UAC_AsUser_ExecShell "" "$SMPROGRAMS\${PRODUCT_FILENAME}.lnk" "" "" ""
    !else
      ExecShell "" "$SMPROGRAMS\${PRODUCT_FILENAME}.lnk"
    !endif
  FunctionEnd
!endif

SilentUnInstall silent
AutoCloseWindow true
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "English"

!ifdef INSTALL_MODE_PER_ALL_USERS
  RequestExecutionLevel admin
!else
  RequestExecutionLevel user
!endif