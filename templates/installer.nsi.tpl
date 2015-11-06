!define APP_NAME "<%= name %>"
!define APP_DIR "${APP_NAME}"

Name "${APP_NAME}"

!include "MUI2.nsh"
!define MUI_ICON "icon.ico"

!addplugindir .
!include "nsProcess.nsh"


# define the resulting installer's name
OutFile "<%= out %>\${APP_NAME} Setup.exe"

# set the installation directory
InstallDir "$PROGRAMFILES\${APP_NAME}\"

# app dialogs
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES

!define MUI_FINISHPAGE_RUN_TEXT "Start ${APP_NAME}"
!define MUI_FINISHPAGE_RUN "$INSTDIR\${APP_NAME}.exe"

!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_LANGUAGE "English"


# default section start
Section
  SetShellVarContext all

  # delete the installed files
  RMDir /r $INSTDIR

  # define the path to which the installer should install
  SetOutPath $INSTDIR

  # specify the files to go in the output path
  File /r "<%= appPath %>\*"

  # specify icon to go in the output path
  File "icon.ico"

  # create the uninstaller
  WriteUninstaller "$INSTDIR\Uninstall ${APP_NAME}.exe"

  # create shortcuts in the start menu and on the desktop
  CreateDirectory "$SMPROGRAMS\${APP_DIR}"
  CreateShortCut "$SMPROGRAMS\${APP_DIR}\${APP_NAME}.lnk" "$INSTDIR\${APP_NAME}.exe"
  CreateShortCut "$SMPROGRAMS\${APP_DIR}\Uninstall ${APP_NAME}.lnk" "$INSTDIR\Uninstall ${APP_NAME}.exe"
  CreateShortCut "$DESKTOP\${APP_NAME}.lnk" "$INSTDIR\${APP_NAME}.exe"

  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" \
                   "DisplayName" "${APP_NAME}"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" \
                   "UninstallString" "$INSTDIR\Uninstall ${APP_NAME}.exe"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" \
                   "DisplayIcon" "$INSTDIR\icon.ico"
SectionEnd

# create a section to define what the uninstaller does
Section "Uninstall"

  ${nsProcess::FindProcess} "${APP_NAME}.exe" $R0

  ${If} $R0 == 0
      DetailPrint "${APP_NAME} is running. Closing it down..."
      ${nsProcess::KillProcess} "${APP_NAME}.exe" $R0
      DetailPrint "Waiting for ${APP_NAME} to close."
      Sleep 2000
  ${EndIf}

  ${nsProcess::Unload}

  SetShellVarContext all

  # delete the installed files
  RMDir /r $INSTDIR

  # delete the shortcuts
  delete "$SMPROGRAMS\${APP_DIR}\${APP_NAME}.lnk"
  delete "$SMPROGRAMS\${APP_DIR}\Uninstall ${APP_NAME}.lnk"
  rmDir  "$SMPROGRAMS\${APP_DIR}"
  delete "$DESKTOP\${APP_NAME}.lnk"


  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}"
SectionEnd