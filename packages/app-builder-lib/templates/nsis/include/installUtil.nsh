!macro moveFile FROM TO
  ClearErrors
  Rename `${FROM}` `${TO}`
  ${if} ${errors}
    # not clear - can NSIS rename on another drive or not, so, in case of error, just copy
    ClearErrors
    !insertmacro copyFile `${FROM}` `${TO}`
    Delete `${FROM}`
  ${endif}
!macroend

!macro copyFile FROM TO
  ${StdUtils.GetParentPath} $R5 `${TO}`
  CreateDirectory `$R5`
  ClearErrors
  CopyFiles /SILENT `${FROM}` `${TO}`
!macroend

Function GetInQuotes
  Exch $R0
  Push $R1
  Push $R2
  Push $R3

   StrCpy $R2 -1
   IntOp $R2 $R2 + 1
    StrCpy $R3 $R0 1 $R2
    StrCmp $R3 "" 0 +3
     StrCpy $R0 ""
     Goto Done
    StrCmp $R3 '"' 0 -5

   IntOp $R2 $R2 + 1
   StrCpy $R0 $R0 "" $R2

   StrCpy $R2 0
   IntOp $R2 $R2 + 1
    StrCpy $R3 $R0 1 $R2
    StrCmp $R3 "" 0 +3
     StrCpy $R0 ""
     Goto Done
    StrCmp $R3 '"' 0 -5

   StrCpy $R0 $R0 $R2
   Done:

  Pop $R3
  Pop $R2
  Pop $R1
  Exch $R0
FunctionEnd

!macro GetInQuotes Var Str
  Push "${Str}"
  Call GetInQuotes
  Pop "${Var}"
!macroend

Function GetFileParent
  Exch $R0
  Push $R1
  Push $R2
  Push $R3

  StrCpy $R1 0
  StrLen $R2 $R0

  loop:
    IntOp $R1 $R1 + 1
    IntCmp $R1 $R2 get 0 get
    StrCpy $R3 $R0 1 -$R1
    StrCmp $R3 "\" get
  Goto loop

  get:
    StrCpy $R0 $R0 -$R1

    Pop $R3
    Pop $R2
    Pop $R1
    Exch $R0
FunctionEnd

Var /GLOBAL isTryToKeepShortcuts

!macro setIsTryToKeepShortcuts
  StrCpy $isTryToKeepShortcuts "true"
  !ifdef allowToChangeInstallationDirectory
    ${ifNot} ${isUpdated}
      StrCpy $isTryToKeepShortcuts "false"
    ${endIf}
  !endif
!macroend

# https://nsis-dev.github.io/NSIS-Forums/html/t-172971.html
!macro readReg VAR ROOT_KEY SUB_KEY NAME
  ${if} "${ROOT_KEY}" == "SHELL_CONTEXT"
    ReadRegStr "${VAR}" SHELL_CONTEXT "${SUB_KEY}" "${NAME}"
  ${elseif} "${ROOT_KEY}" == "HKEY_CURRENT_USER"
    ReadRegStr "${VAR}" HKEY_CURRENT_USER "${SUB_KEY}" "${NAME}"
  ${elseif} "${ROOT_KEY}" == "HKEY_LOCAL_MACHINE"
    ReadRegStr "${VAR}" HKEY_LOCAL_MACHINE "${SUB_KEY}" "${NAME}"
  ${else}
    MessageBox MB_OK "Unsupported ${ROOT_KEY}"
  ${endif}
!macroend

# http://stackoverflow.com/questions/24595887/waiting-for-nsis-uninstaller-to-finish-in-nsis-installer-either-fails-or-the-uni
Function uninstallOldVersion
  Var /GLOBAL uninstallerFileName
  Var /GLOBAL installationDir
  Var /GLOBAL uninstallString
  Var /GLOBAL rootKey

  ClearErrors
  Exch $rootKey

  !insertmacro readReg $uninstallString "$rootKey" "${UNINSTALL_REGISTRY_KEY}" UninstallString
  ${if} $uninstallString == ""
    !ifdef UNINSTALL_REGISTRY_KEY_2
      !insertmacro readReg $uninstallString "$rootKey" "${UNINSTALL_REGISTRY_KEY_2}" UninstallString
    !endif
    ${if} $uninstallString == ""
      Goto Done
    ${endif}
  ${endif}

  # uninstaller should be copied out of app installation dir (because this dir will be deleted), so, extract uninstaller file name
  !insertmacro GetInQuotes $uninstallerFileName "$uninstallString"

  !insertmacro readReg $installationDir "$rootKey" "${INSTALL_REGISTRY_KEY}" InstallLocation
  ${if} $installationDir == ""
  ${andIf} $uninstallerFileName != ""
    # https://github.com/electron-userland/electron-builder/issues/735#issuecomment-246918567
    Push $uninstallerFileName
    Call GetFileParent
    Pop $installationDir
  ${endif}

  ${if} $installationDir == ""
  ${andIf} $uninstallerFileName == ""
    Goto Done
  ${endif}

  !insertmacro copyFile "$uninstallerFileName" "$PLUGINSDIR\old-uninstaller.exe"
  StrCpy $uninstallerFileName "$PLUGINSDIR\old-uninstaller.exe"

  ${if} $installMode == "CurrentUser"
  ${orIf} $rootKey == "HKEY_CURRENT_USER"
    StrCpy $0 "/currentuser"
  ${else}
    StrCpy $0 "/allusers"
  ${endif}

  !insertMacro setIsTryToKeepShortcuts

  ${if} $isTryToKeepShortcuts == "true"
    !insertmacro readReg $R5 "$rootKey" "${INSTALL_REGISTRY_KEY}" KeepShortcuts
    # if true, it means that old uninstaller supports --keep-shortcuts flag
    ${if} $R5 == "true"
    ${andIf} ${FileExists} "$appExe"
      StrCpy $0 "$0 --keep-shortcuts"
    ${endIf}
  ${endIf}

  ${if} ${isDeleteAppData}
    StrCpy $0 "$0 --delete-app-data"
  ${else}
    # always pass --updated flag - to ensure that if DELETE_APP_DATA_ON_UNINSTALL is defined, user data will be not removed
    StrCpy $0 "$0 --updated"
  ${endif}

  ExecWait '"$uninstallerFileName" /S /KEEP_APP_DATA $0 _?=$installationDir' $R0
  ${if} $R0 != 0
    DetailPrint `Aborting, uninstall was not successful. Uninstaller error code: $R0.`
    SetErrorLevel 5
    Abort "Cannot uninstall"
  ${endif}
  Done:
FunctionEnd

!macro uninstallOldVersion ROOT_KEY
  Push "${ROOT_KEY}"
  Call uninstallOldVersion
!macroend