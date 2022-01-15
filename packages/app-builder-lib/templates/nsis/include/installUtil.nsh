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

Function handleUninstallResult
  Var /GLOBAL rootKey_uninstallResult
  Exch $rootKey_uninstallResult

  ${if} "$rootKey_uninstallResult" == "SHELL_CONTEXT"
    !ifmacrodef customUnInstallCheck
      !insertmacro customUnInstallCheck
      Return
    !endif
  ${elseif} "$rootKey_uninstallResult" == "HKEY_CURRENT_USER"
    !ifmacrodef customUnInstallCheckCurrentUser
      !insertmacro customUnInstallCheckCurrentUser
      Return
    !endif
  ${endif}

  IfErrors 0 +3
  DetailPrint `Uninstall was not successful. Not able to launch uninstaller!`
  Return

  ${if} $R0 != 0
    MessageBox MB_OK|MB_ICONEXCLAMATION "$(uninstallFailed): $R0"
    DetailPrint `Uninstall was not successful. Uninstaller error code: $R0.`
    SetErrorLevel 2
    Quit
  ${endif}
FunctionEnd

!macro handleUninstallResult ROOT_KEY
  Push "${ROOT_KEY}"
  Call handleUninstallResult
!macroend

# http://stackoverflow.com/questions/24595887/waiting-for-nsis-uninstaller-to-finish-in-nsis-installer-either-fails-or-the-uni
Function uninstallOldVersion
  Var /GLOBAL uninstallerFileName
  Var /Global uninstallerFileNameTemp
  Var /GLOBAL installationDir
  Var /GLOBAL uninstallString
  Var /GLOBAL rootKey

  ClearErrors
  Exch $rootKey

  Push 0
  Pop $R0

  !insertmacro readReg $uninstallString "$rootKey" "${UNINSTALL_REGISTRY_KEY}" UninstallString
  ${if} $uninstallString == ""
    !ifdef UNINSTALL_REGISTRY_KEY_2
      !insertmacro readReg $uninstallString "$rootKey" "${UNINSTALL_REGISTRY_KEY_2}" UninstallString
    !endif
    ${if} $uninstallString == ""
      ClearErrors
      Return
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
    ClearErrors
    Return
  ${endif}

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

  StrCpy $uninstallerFileNameTemp "$PLUGINSDIR\old-uninstaller.exe"
  !insertmacro copyFile "$uninstallerFileName" "$uninstallerFileNameTemp"

  # Retry counter
  StrCpy $R5 0

  UninstallLoop:
    IntOp $R5 $R5 + 1

    ${if} $R5 > 5
      MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "$(appCannotBeClosed)" /SD IDCANCEL IDRETRY OneMoreAttempt
      Return
    ${endIf}

  OneMoreAttempt:
    ExecWait '"$uninstallerFileNameTemp" /S /KEEP_APP_DATA $0 _?=$installationDir' $R0
    ifErrors TryInPlace CheckResult

    TryInPlace:
      # the execution failed - might have been caused by some group policy restrictions
      # we try to execute the uninstaller in place
      ExecWait '"$uninstallerFileName" /S /KEEP_APP_DATA $0 _?=$installationDir' $R0
      ifErrors DoesNotExist

    CheckResult:
      ${if} $R0 == 0
        Return
      ${endIf}

    Sleep 1000
    Goto UninstallLoop

  DoesNotExist:
    SetErrors
FunctionEnd

!macro uninstallOldVersion ROOT_KEY
  Push "${ROOT_KEY}"
  Call uninstallOldVersion
!macroend
