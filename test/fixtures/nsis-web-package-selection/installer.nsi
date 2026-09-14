Unicode true
RequestExecutionLevel user
SilentInstall silent
!include LogicLib.nsh
!include StdUtils.nsh

# Simulate the native machine without replacing NSIS's runtime branching.
!define IsNativeARM64 '$R8 == "ARM64"'
!define IsNativeAMD64 '$R8 == "64"'
!define RunningX64 '$R8 != "32"'
!define APP_PACKAGE_STORE_FILE "unused.7z"
!define UNINSTALL_FILENAME "unused.exe"
Var installMode
!include installer.nsh

# Exercise selection, file lookup, hashing and HTTP; stop before installing an app.
!macroundef extractUsing7za
!macro extractUsing7za FILE
  FileOpen $R0 "$EXEDIR/result.txt" w
  FileWrite $R0 "$packageFile$\n$1$\n$packageUrl"
  FileClose $R0
  Quit
!macroend
!macro moveFile FROM TO
!macroend

Section
  InitPluginsDir
  ${StdUtils.GetParameter} $R8 "arch" "ARM64"
  StrCpy $installMode "current"
  !insertmacro installApplicationFiles
SectionEnd
