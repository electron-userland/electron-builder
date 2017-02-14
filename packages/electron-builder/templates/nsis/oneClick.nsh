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

  !ifdef LICENSE_FILE
    Function licensePre
      ${if} ${Updated}
        Abort
      ${endif}
    FunctionEnd

    !define MUI_PAGE_CUSTOMFUNCTION_PRE licensePre
    !insertmacro MUI_PAGE_LICENSE "${LICENSE_FILE}"
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