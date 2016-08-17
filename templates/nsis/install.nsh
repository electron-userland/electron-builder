${IfNot} ${Silent}
  SetDetailsPrint none

  !ifdef ONE_CLICK
    !ifdef HEADER_ICO
      SpiderBanner::Show /MODERN /ICON "$PLUGINSDIR\installerHeaderico.ico"
    !else
      SpiderBanner::Show /MODERN
   !endif
  !endif
${endif}

!insertmacro CHECK_APP_RUNNING "install"

${if} $installMode == "all"
  ReadRegStr $R0 HKEY_LOCAL_MACHINE "${UNINSTALL_REGISTRY_KEY}" UninstallString
  ${if} $R0 != ""
    ExecWait "$R0 /S"
  ${endif}
${endif}

RMDir /r $INSTDIR
SetOutPath $INSTDIR

!ifdef APP_64
  ${If} ${RunningX64}
    Nsis7z::Extract "$PLUGINSDIR\app-64.7z"
  ${Else}
    Nsis7z::Extract "$PLUGINSDIR\app-32.7z"
  ${endif}
!else
  Nsis7z::Extract "$PLUGINSDIR\app-32.7z"
!endif

File "/oname=${UNINSTALL_FILENAME}" "${UNINSTALLER_OUT_FILE}"

!insertmacro registryAddInstallInfo

StrCpy $startMenuLink "$SMPROGRAMS\${PRODUCT_FILENAME}.lnk"
StrCpy $desktopLink "$DESKTOP\${PRODUCT_FILENAME}.lnk"

# create shortcuts in the start menu and on the desktop
# shortcut for uninstall is bad cause user can choose this by mistake during search, so, we don't add it
CreateShortCut "$startMenuLink" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0 "" "" "${APP_DESCRIPTION}"
CreateShortCut "$desktopLink" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0 "" "" "${APP_DESCRIPTION}"

WinShell::SetLnkAUMI "$startMenuLink" "${APP_ID}"
WinShell::SetLnkAUMI "$desktopLink" "${APP_ID}"

!ifmacrodef registerFileAssociations
  !insertmacro registerFileAssociations
!endif

!ifmacrodef customInstall
  !insertmacro customInstall
!endif

${IfNot} ${Silent}
  !ifdef ONE_CLICK
    # otherwise app window will be in backround
    HideWindow
    !ifdef RUN_AFTER_FINISH
      Call StartApp
    !endif
  !endif
${EndIf}