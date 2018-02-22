Function un.onInit
  !insertmacro check64BitAndSetRegView

  ${IfNot} ${Silent}
    !ifdef ONE_CLICK
      MessageBox MB_OKCANCEL "$(areYouSureToUninstall)" IDOK +2
      Quit

      # one-click installer executes uninstall section in the silent mode, but we must show message dialog if silent mode was not explicitly set by user (using /S flag)
      !insertmacro CHECK_APP_RUNNING
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
    # for assisted installer we check it here to show progress
    !insertmacro CHECK_APP_RUNNING
  !endif

  !insertmacro setLinkVars

  ${ifNot} ${isKeepShortcuts}
    WinShell::UninstAppUserModelId "${APP_ID}"

    !ifndef DO_NOT_CREATE_DESKTOP_SHORTCUT
      WinShell::UninstShortcut "$oldDesktopLink"
      Delete "$oldDesktopLink"
    !endif

    !ifndef DO_NOT_CREATE_START_MENU_SHORTCUT
      WinShell::UninstShortcut "$oldStartMenuLink"

      Delete "$oldStartMenuLink"
      ReadRegStr $R1 SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" MenuDirectory
      ${ifNot} $R1 == ""
        RMDir "$SMPROGRAMS\$R1"
      ${endIf}
    !endif
  ${endIf}

  # refresh the desktop
  System::Call 'shell32::SHChangeNotify(i, i, i, i) v (0x08000000, 0, 0, 0)'

  !ifmacrodef unregisterFileAssociations
    !insertmacro unregisterFileAssociations
  !endif

  # delete the installed files
  !ifmacrodef customRemoveFiles
    !insertmacro customRemoveFiles
  !else
    RMDir /r $INSTDIR
  !endif

  Var /GLOBAL isDeleteAppData
  StrCpy $isDeleteAppData "0"

  ClearErrors
  ${GetParameters} $R0
  ${GetOptions} $R0 "--delete-app-data" $R1
  ${if} ${Errors}
    !ifdef DELETE_APP_DATA_ON_UNINSTALL
      ${ifNot} ${isUpdated}
        StrCpy $isDeleteAppData "1"
      ${endif}
    !endif
  ${else}
    StrCpy $isDeleteAppData "1"
  ${endIf}

  ${if} $isDeleteAppData == "1"
    # electron always uses per user app data
    ${if} $installMode == "all"
      SetShellVarContext current
    ${endif}
    RMDir /r "$APPDATA\${APP_FILENAME}"
    !ifdef APP_PRODUCT_FILENAME
      RMDir /r "$APPDATA\${APP_PRODUCT_FILENAME}"
    !endif
    ${if} $installMode == "all"
      SetShellVarContext all
    ${endif}
  ${endif}

  DeleteRegKey SHCTX "${UNINSTALL_REGISTRY_KEY}"
  DeleteRegKey SHCTX "${INSTALL_REGISTRY_KEY}"

  !ifmacrodef customUnInstall
    !insertmacro customUnInstall
  !endif

  !ifdef ONE_CLICK
    !insertmacro quitSuccess
  !endif
SectionEnd
