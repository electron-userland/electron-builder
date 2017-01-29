!ifdef RUN_AFTER_FINISH
  !ifndef BUILD_UNINSTALLER
    !include StdUtils.nsh
    Function StartApp
      !ifdef INSTALL_MODE_PER_ALL_USERS
        ${StdUtils.ExecShellAsUser} $0 "$SMPROGRAMS\${PRODUCT_FILENAME}.lnk" "open" ""
      !else
        ${GetParameters} $R0
        ${GetOptions} $R0 "--update" $R1
        ${ifNot} ${Errors}
          ExecShell "" "$SMPROGRAMS\${PRODUCT_FILENAME}.lnk" "--updated"
        ${else}
          ExecShell "" "$SMPROGRAMS\${PRODUCT_FILENAME}.lnk"
        ${endif}
      !endif
    FunctionEnd
  !endif
!endif


!ifdef LICENSE_FILE

  Function licensePre
      ${GetParameters} $R0
      ${GetOptions} $R0 "--update" $R1
      ${IfNot} ${Errors}
        Abort
      ${endif}
  FunctionEnd

  !define MUI_PAGE_CUSTOMFUNCTION_PRE licensePre
  !insertmacro MUI_PAGE_LICENSE "${LICENSE_FILE}"
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