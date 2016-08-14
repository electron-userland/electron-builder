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

AutoCloseWindow true
!insertmacro MUI_PAGE_INSTFILES
!ifdef BUILD_UNINSTALLER
  !insertmacro MUI_UNPAGE_INSTFILES
!endif

!insertmacro MUI_LANGUAGE "English"

!ifdef INSTALL_MODE_PER_ALL_USERS
  RequestExecutionLevel admin
!else
  RequestExecutionLevel user
!endif

!macro initMultiUser UNINSTALLER_FUNCPREFIX
  !ifdef INSTALL_MODE_PER_ALL_USERS
    !ifdef BUILD_UNINSTALLER
      Call un.installMode.AllUsers
    !else
      Call installMode.AllUsers
    !endif
  !else
    !ifdef BUILD_UNINSTALLER
      Call un.installMode.CurrentUser
    !else
      Call installMode.CurrentUser
    !endif
  !endif
!macroend