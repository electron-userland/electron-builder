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

# Exercise selection, file lookup, staging, hashing, HTTP and the order of these and the uninstall; stop before installing an app.
# --replace-local-package: the fixture writes other content to the local package while the installer runs; the installer keeps using its own copy.
!macro replaceLocalPackage
  ${StdUtils.GetParameter} $R1 "replace-local-package" ""
  ${if} $R1 != ""
    FileOpen $R0 "$R1" w
    FileWrite $R0 "replaced package"
    FileClose $R0
  ${endIf}
!macroend
!macro hashFile OUT TYPE FILE
  !insertmacro replaceLocalPackage
  !insertmacro _StdU_HashFile ${OUT} "${TYPE}" "${FILE}"
!macroend
!undef StdUtils.HashFile
!define StdUtils.HashFile "!insertmacro hashFile"
!macroundef extractUsing7za
!macro extractUsing7za FILE
  !insertmacro replaceLocalPackage
  FileOpen $R0 "$EXEDIR\result.txt" w
  FileWrite $R0 "${FILE}$\n$1$\n$packageUrl"
  FileClose $R0
!macroend
!macro moveFile FROM TO
  Delete "$EXEDIR\stored.7z"
  Rename "${FROM}" "$EXEDIR\stored.7z"
  SetErrorLevel 0
  Quit
!macroend

Section
  InitPluginsDir
  ${StdUtils.GetParameter} $R8 "arch" "ARM64"
  StrCpy $installMode "current"
  # INSTALL_APPLICATION_FILES_ONLY: a script that inserts only installApplicationFiles, which then prepares the package itself.
  !ifndef INSTALL_APPLICATION_FILES_ONLY
    !insertmacro prepareWebPackage
    # Stands in for uninstallOldVersion in installSection.nsh: removes the installed version the test writes before each run.
    Delete "$EXEDIR\installed.txt"
  !endif
  !insertmacro installApplicationFiles
SectionEnd
