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
    StrCmp $R0 "success" +3
      MessageBox MB_OK|MB_ICONEXCLAMATION "$(decompressionFailed)$\n$R0"
      Quit
  !else
    !insertmacro extractUsing7za "$PLUGINSDIR\app-$packageArch.7z"
  !endif
!macroend

!macro extractUsing7za FILE
  Push $OUTDIR
  CreateDirectory "$PLUGINSDIR\7z-out"
  ClearErrors
  SetOutPath "$PLUGINSDIR\7z-out"
  Nsis7z::Extract "${FILE}"
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
    Quit

  RetryExtract7za:
    Sleep 1000
    Goto LoopExtract7za

  DoneExtract7za:
!macroend
