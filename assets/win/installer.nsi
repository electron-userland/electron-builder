Name "Loopline Systems"
BrandingText "aluxian.com"

!include "MUI2.nsh"
!define MUI_ICON "icon.ico"

!addplugindir .
!include "nsProcess.nsh"


# define the resulting installer's name:
OutFile "..\..\dist\win\Loopline Systems Setup.exe"

# set the installation directory
InstallDir "$PROGRAMFILES\Loopline Systems\"

# app dialogs
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES

!define MUI_FINISHPAGE_RUN_TEXT "Start Loopline Systems"
!define MUI_FINISHPAGE_RUN "$INSTDIR\Loopline Systems.exe"

!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_LANGUAGE "English"

!define APP_NAME "Loopline Systems"
!define APP_DIR "Loopline Systems"
!define COMPANY_NAME "Loopline Systems GmbH"

# default section start
Section
  SetShellVarContext all

  # delete the installed files
  RMDir /r $INSTDIR

  # define the path to which the installer should install
  SetOutPath $INSTDIR

  # specify the files to go in the output path
  File /r "..\..\dist\win\Loopline Systems-win32\*"

  # create the uninstaller
  WriteUninstaller "$INSTDIR\Uninstall Loopline Systems.exe"

  # create shortcuts in the start menu and on the desktop
  CreateDirectory "$SMPROGRAMS\${APP_DIR}"
  CreateShortCut "$SMPROGRAMS\${APP_DIR}\${APP_NAME}.lnk" "$INSTDIR\${APP_NAME}.exe"
  CreateShortCut "$SMPROGRAMS\${APP_DIR}\Uninstall Loopline Systems.lnk" "$INSTDIR\Uninstall Loopline Systems.exe"
  CreateShortCut "$DESKTOP\Loopline Systems.lnk" "$INSTDIR\${APP_NAME}.exe"

  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" "DisplayName" "NSIS ${APP_NAME}"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" "UninstallString" '"$INSTDIR\Uninstall Loopline Systems.exe.exe"'
SectionEnd

# create a section to define what the uninstaller does
Section "Uninstall"

  ${nsProcess::FindProcess} "${APP_NAME}.exe" $R0

  ${If} $R0 == 0
      DetailPrint "Loopline Systems is running. Closing it down..."
      ${nsProcess::KillProcess} "${APP_NAME}.exe" $R0
      DetailPrint "Waiting for Loopline Systems to close."
      Sleep 2000
  ${EndIf}

  ${nsProcess::Unload}

  SetShellVarContext all

  # delete the installed files
  RMDir /r $INSTDIR

  # delete the shortcuts
  delete "$SMPROGRAMS\${APP_DIR}\Loopline Systems.lnk"
  delete "$SMPROGRAMS\${APP_DIR}\Uninstall Loopline Systems.lnk"
  rmDir  "$SMPROGRAMS\${APP_DIR}"
  delete "$DESKTOP\Loopline Systems.lnk"

  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}"


SectionEnd