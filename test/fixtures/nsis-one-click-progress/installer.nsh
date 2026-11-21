# No application is installed by this fixture. Only the real installSection banner setup runs.
!macro setLinkVars
  StrCpy $installMode "current"
  StrCpy $newStartMenuLink ""
!macroend
!macro setIsTryToKeepShortcuts
  StrCpy $isTryToKeepShortcuts "false"
!macroend
!macro prepareWebPackage
!macroend
!macro uninstallOldVersion context
!macroend
!macro handleUninstallResult context
!macroend
!macro installApplicationFiles
!macroend
!macro registryAddInstallInfo
!macroend
!macro addStartMenuLink keep
!macroend
!macro addDesktopLink keep
!macroend
!macro StartApp
!macroend
!macro quitSuccess
  Quit
!macroend

!macro recordBanner
  System::Call 'user32::IsWindow(p r2) i .r5'
  # Inspect each control's own visibility style: the parent can still be in its initial show transition.
  System::Call 'user32::GetWindowLong(p r2, i -16) i .r6'
  IntOp $6 $6 & 0x10000000
  IntOp $6 $6 >> 28
  System::Call 'user32::GetWindowLong(p r3, i -16) i .r7'
  IntOp $7 $7 & 0x10000000
  IntOp $7 $7 >> 28
  FileWrite $9 "$5,$6,$7$\r$\n"
!macroend

!macro CHECK_APP_RUNNING
  # This is the first hook after the production banner setup, before any installation side effects.
  FileOpen $9 "$EXEDIR\result.txt" w
  ${IfNot} ${Silent}
    ShowWindow $hwndparent ${SW_SHOW}
    FindWindow $1 "#32770" "" $hwndparent
    FindWindow $2 "#32770" "" $hwndparent $1
    GetDlgItem $3 $2 1000
    GetDlgItem $2 $2 1001
    GetDlgItem $4 $1 1004
    !insertmacro recordBanner
    SendMessage $2 ${PBM_GETPOS} 0 0 $8
    FileWrite $9 "$8$\r$\n"
    SetOutPath "$EXEDIR\extracted"
  ${Else}
    SetOutPath "$EXEDIR\extracted-silent"
  ${EndIf}
  StrCpy $R2 "preserved-2"
  StrCpy $R3 "preserved-3"
  StrCpy $R4 "preserved-4"
  StrCpy $R5 "preserved-5"
  StrCpy $R6 "preserved-6"
  StrCpy $R7 "preserved-7"
  !insertmacro extractUsing7za "$EXEDIR\payload.7z"
  FileOpen $8 "$EXEDIR\registers.txt" w
  FileWrite $8 "$R2,$R3,$R4,$R5,$R6,$R7"
  FileClose $8
  ${IfNot} ${Silent}
    !insertmacro recordBanner
    SendMessage $2 ${PBM_GETPOS} 0 0 $8
    FileWrite $9 "$8$\r$\n"
    # Instruction-count updates after extraction must no longer reset the banner.
    SendMessage $4 ${PBM_SETPOS} 0 0
    !insertmacro recordBanner
    SendMessage $2 ${PBM_GETPOS} 0 0 $8
    FileWrite $9 "$8$\r$\n"
  ${Else}
    FileWrite $9 "silent$\r$\n"
  ${EndIf}
  FileClose $9
  SetErrorLevel 0
  Quit
!macroend
