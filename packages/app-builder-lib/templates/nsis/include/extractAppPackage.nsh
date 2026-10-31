!macro extractEmbeddedAppPackage
  !ifdef COMPRESS
    SetCompress off
  !endif

  Var /GLOBAL packageArch
  
  !insertmacro identify_package
  !insertmacro compute_files_for_current_arch

  !ifdef COMPRESS
    SetCompress "${COMPRESS}"
  !endif

  !insertmacro decompress
  !insertmacro custom_files_post_decompression
!macroend

!macro identify_package 
  !ifdef APP_32
    StrCpy $packageArch "32"
  !endif
  !ifdef APP_64
    ${if} ${RunningX64}
    ${OrIf} ${IsNativeARM64}
      StrCpy $packageArch "64"
    ${endif}
  !endif
  !ifdef APP_ARM64
    ${if} ${IsNativeARM64}
      StrCpy $packageArch "ARM64"
    ${endif}
  !endif
!macroend

!macro compute_files_for_current_arch
  ${if} $packageArch == "ARM64"
    !ifdef APP_ARM64
      !insertmacro arm64_app_files
    !endif
  ${elseif} $packageArch == "64"
    !ifdef APP_64
      !insertmacro x64_app_files
    !endif
  ${else}
    !ifdef APP_32
      !insertmacro ia32_app_files
    !endif
  ${endIf}
!macroend

!macro custom_files_post_decompression
  ${if} $packageArch == "ARM64"
    !ifmacrodef customFiles_arm64
      !insertmacro customFiles_arm64
    !endif
  ${elseif} $packageArch == "64"
    !ifmacrodef customFiles_x64
      !insertmacro customFiles_x64
    !endif
  ${else}
    !ifmacrodef customFiles_ia32
      !insertmacro customFiles_ia32
    !endif
  ${endIf}
!macroend

!macro arm64_app_files
  File /oname=$PLUGINSDIR\app-arm64.${COMPRESSION_METHOD} "${APP_ARM64}"
!macroend

!macro x64_app_files
  File /oname=$PLUGINSDIR\app-64.${COMPRESSION_METHOD} "${APP_64}"
!macroend

!macro ia32_app_files
  File /oname=$PLUGINSDIR\app-32.${COMPRESSION_METHOD} "${APP_32}"
!macroend

!macro decompress
  !ifdef ZIP_COMPRESSION
    nsisunz::Unzip "$PLUGINSDIR\app-$packageArch.zip" "$INSTDIR"
    Pop $R0
    ${if} $R0 != "success"
      MessageBox MB_OK|MB_ICONEXCLAMATION "$(decompressionFailed)$\n$R0" /SD IDOK
      SetErrorLevel 2
      Quit
    ${endif}
  !else
    !insertmacro extractUsing7za "$PLUGINSDIR\app-$packageArch.7z"
  !endif
!macroend

!macro extractUsing7za FILE
  Push $OUTDIR
  CreateDirectory "$PLUGINSDIR\7z-out"
  ClearErrors
  SetOutPath "$PLUGINSDIR\7z-out"
  !ifdef ONE_CLICK
    Push $R2
    Push $R3
    Push $R4
    Push $R5
    Push $R6
    Push $R7
    StrCpy $R4 0
    ${IfNot} ${Silent}
      FindWindow $R2 "#32770" "" $hwndparent
      FindWindow $R3 "#32770" "" $hwndparent $R2
      GetDlgItem $R2 $R2 1004
      GetDlgItem $R3 $R3 1001
      ${If} $R3 <> 0
        # SpiderBanner mirrors raw instruction-count positions from 1004. Detach it before extraction resets that scale.
        System::Call 'user32::GetClassLongW(p R2, i -24) p .R4'
      ${EndIf}
    ${EndIf}
    ${If} $R4 <> 0
      System::Call 'user32::SetWindowLongW(p R2, i -4, p R4)'
      SendMessage $R3 ${PBM_GETPOS} 0 0 $R4
      GetLabelAddress $R5 extract7zaProgress
      Nsis7z::ExtractWithCallback "${FILE}" $R5
      SendMessage $R3 ${PBM_SETPOS} 30000 0
      Goto extract7zaDone

      extract7zaProgress:
        Pop $R6
        Pop $R7
        ${If} $R7 != "0"
          IntOp $R5 30000 - $R4
          System::Int64Op $R6 * $R5
          Pop $R6
          System::Int64Op $R6 / $R7
          Pop $R6
          IntOp $R6 $R6 + $R4
          SendMessage $R3 ${PBM_GETPOS} 0 0 $R5
          ${If} $R6 > $R5
            SendMessage $R3 ${PBM_SETPOS} $R6 0
          ${EndIf}
        ${EndIf}
        Return
    ${EndIf}
  !endif
  Nsis7z::Extract "${FILE}"
  !ifdef ONE_CLICK
    extract7zaDone:
    Pop $R7
    Pop $R6
    Pop $R5
    Pop $R4
    Pop $R3
    Pop $R2
  !endif
  Pop $R0
  SetOutPath $R0

  # Retry counter
  StrCpy $R1 0

  LoopExtract7za:
    IntOp $R1 $R1 + 1

    # Attempt to copy files in atomic way
    CopyFiles /SILENT "$PLUGINSDIR\7z-out\*" $OUTDIR
    IfErrors 0 DoneExtract7za

    DetailPrint `Can't modify "${PRODUCT_NAME}"'s files.`
    ${if} $R1 < 5
      # Try copying a few times before asking for a user action.
      Goto RetryExtract7za
    ${else}
      MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "$(appCannotBeClosed)" /SD IDRETRY IDCANCEL AbortExtract7za
    ${endIf}

    # As an absolutely last resort after a few automatic attempts and user
    # intervention - we will just overwrite everything with `Nsis7z::Extract`
    # even though it is not atomic and will ignore errors.

    # Clear the temporary folder first to make sure we don't use twice as
    # much disk space.
    RMDir /r "$PLUGINSDIR\7z-out"

    Nsis7z::Extract "${FILE}"
    Goto DoneExtract7za

  AbortExtract7za:
    SetErrorLevel 2
    Quit

  RetryExtract7za:
    Sleep 1000
    Goto LoopExtract7za

  DoneExtract7za:
!macroend
