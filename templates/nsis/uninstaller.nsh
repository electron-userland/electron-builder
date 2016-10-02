Function un.onInit
  !insertmacro check64BitAndSetRegView

  ${IfNot} ${Silent}
    MessageBox MB_OKCANCEL "Are you sure you want to uninstall ${PRODUCT_NAME}?" IDOK +2
    Quit

    !ifdef ONE_CLICK
      # one-click installer executes uninstall section in the silent mode, but we must show message dialog if silent mode was not explicitly set by user (using /S flag)
      !insertmacro CHECK_APP_RUNNING "uninstall"
      SetSilent silent
    !endif
  ${endIf}

  !insertmacro initMultiUser

  !ifmacrodef customUnInit
    !insertmacro customUnInit
  !endif
FunctionEnd

Section "un.install"
  !ifndef ONE_CLICK
    # for boring installer we check it here to show progress
    !insertmacro CHECK_APP_RUNNING "uninstall"
  !endif

  StrCpy $startMenuLink "$SMPROGRAMS\${PRODUCT_FILENAME}.lnk"
  StrCpy $desktopLink "$DESKTOP\${PRODUCT_FILENAME}.lnk"

  WinShell::UninstAppUserModelId "${APP_ID}"
  WinShell::UninstShortcut "$startMenuLink"
  WinShell::UninstShortcut "$desktopLink"

  Delete "$startMenuLink"
  Delete "$desktopLink"

  !ifmacrodef unregisterFileAssociations
    !insertmacro unregisterFileAssociations
  !endif

  # delete the installed files
  RMDir /r $INSTDIR

  ClearErrors
  ${GetParameters} $R0
  ${GetOptions} $R0 "--delete-app-data" $R1
  ${IfNot} ${Errors}
    # electron always uses per user app data
    ${if} $installMode == "all"
      SetShellVarContext current
    ${endif}
    RMDir /r "$APPDATA\${PRODUCT_FILENAME}"
    ${if} $installMode == "all"
      SetShellVarContext all
    ${endif}
  ${EndIf}

  DeleteRegKey SHCTX "${UNINSTALL_REGISTRY_KEY}"
  DeleteRegKey SHCTX "${INSTALL_REGISTRY_KEY}"

  !ifmacrodef customUnInstall
    !insertmacro customUnInstall
  !endif

  !insertmacro quitSuccess
SectionEnd