!include "common.nsh"
!include "MUI2.nsh"
!include "NsisMultiUser.nsh"
!include "nsProcess.nsh"
!include "allowOnlyOneInstallerInstace.nsh"
!include "checkAppRunning.nsh"
!include x64.nsh

Function StartApp
  ExecShell "" "$SMPROGRAMS\${PRODUCT_NAME}.lnk"
FunctionEnd

!ifdef ONE_CLICK
  AutoCloseWindow true
  !insertmacro MUI_PAGE_INSTFILES
  !insertmacro MUI_UNPAGE_INSTFILES
!else
  !include "boring-installer.nsh"
!endif

Var startMenuLink
Var desktopLink

Function .onInit
  !insertmacro MULTIUSER_INIT
  !insertmacro ALLOW_ONLY_ONE_INSTALLER_INSTACE

  InitPluginsDir

  ${If} ${RunningX64}
    !ifdef APP_64
      SetRegView 64
    !endif
  ${Else}
    !ifndef APP_32
      MessageBox MB_OK|MB_ICONEXCLAMATION "64-bit Windows is required."
      Quit
    !endif
  ${EndIf}

  SetCompress off
  !ifdef APP_32
    File /oname=$PLUGINSDIR\app-32.7z "${APP_32}"
  !endif
  !ifdef APP_64
    File /oname=$PLUGINSDIR\app-64.7z "${APP_64}"
  !endif
  SetCompress "${COMPRESS}"
FunctionEnd

Function un.onInit
  !insertmacro MULTIUSER_UNINIT
FunctionEnd

# default section start
Section "install"
  SetDetailsPrint none

  !ifdef ONE_CLICK
    !ifdef HEADER_ICO
      SpiderBanner::Show /MODERN /ICON "${HEADER_ICO}"
    !else
      SpiderBanner::Show /MODERN
   !endif
  !endif

  !insertmacro CHECK_APP_RUNNING "install"

  RMDir /r $INSTDIR
  SetOutPath $INSTDIR

  ${If} ${RunningX64}
    Nsis7z::Extract "$PLUGINSDIR\app-64.7z"
  ${Else}
    Nsis7z::Extract "$PLUGINSDIR\app-32.7z"
  ${EndIf}

#  <% if(fileAssociation){ %>
    # specify file association
#    ${registerExtension} "$INSTDIR\${PRODUCT_NAME}.exe" "<%= fileAssociation.extension %>" "<%= fileAssociation.fileType %>"
#  <% } %>

  WriteUninstaller "${UNINSTALL_FILENAME}"
  !insertmacro MULTIUSER_RegistryAddInstallInfo

  StrCpy $startMenuLink "$SMPROGRAMS\${PRODUCT_NAME}.lnk"
  StrCpy $desktopLink "$DESKTOP\${PRODUCT_NAME}.lnk"

  # create shortcuts in the start menu and on the desktop
  # shortcut for uninstall is bad cause user can choose this by mistake during search, so, we don't add it
  CreateShortCut "$startMenuLink" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0 "" "" "${APP_DESCRIPTION}"
  CreateShortCut "$desktopLink" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0 "" "" "${APP_DESCRIPTION}"

  WinShell::SetLnkAUMI "$startMenuLink" "${APP_ID}"
  WinShell::SetLnkAUMI "$desktopLink" "${APP_ID}"

  !ifdef ONE_CLICK
    # otherwise app window will be in backround
    HideWindow
    Call StartApp
  !endif
SectionEnd

Section "un.install"
  !insertmacro CHECK_APP_RUNNING "uninstall"

  StrCpy $startMenuLink "$SMPROGRAMS\${PRODUCT_NAME}.lnk"
  StrCpy $desktopLink "$DESKTOP\${PRODUCT_NAME}.lnk"

  WinShell::UninstAppUserModelId "${APP_ID}"
  WinShell::UninstShortcut "$startMenuLink"
  WinShell::UninstShortcut "$$desktopLink"

  Delete "$startMenuLink"
  Delete "$desktopLink"

  # delete the installed files
  RMDir /r $INSTDIR

  RMDir /r "$APPDATA\${PRODUCT_NAME}"

  !insertmacro MULTIUSER_RegistryRemoveInstallInfo

  !ifdef ONE_CLICK
    # strange, AutoCloseWindow true doesn't work for uninstaller, so, just quit
    Quit
  !endif
SectionEnd