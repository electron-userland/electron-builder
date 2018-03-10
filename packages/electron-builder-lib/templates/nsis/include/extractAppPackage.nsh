!macro extractEmbeddedAppPackage
  !ifdef COMPRESS
    SetCompress off
  !endif

  Var /GLOBAL packageArch

  !ifdef APP_64
    StrCpy $packageArch "64"

    !ifdef APP_32
      ${if} ${RunningX64}
        !insertmacro x64_app_files
      ${else}
        !insertmacro ia32_app_files
      ${endIf}
    !else
      !insertmacro x64_app_files
    !endif
  !else
    !insertmacro ia32_app_files
  !endif

  !ifdef COMPRESS
    SetCompress "${COMPRESS}"
  !endif

  !ifdef ZIP_COMPRESSION
    nsisunz::Unzip "$PLUGINSDIR\app-$packageArch.zip" "$INSTDIR"
  !else
    !insertmacro extractUsing7za "$PLUGINSDIR\app-$packageArch.7z"
  !endif

  # after decompression
  ${if} $packageArch == "64"
    !ifmacrodef customFiles_x64
      !insertmacro customFiles_x64
    !endif
  ${else}
    !ifmacrodef customFiles_ia32
      !insertmacro customFiles_ia32
    !endif
  ${endIf}
!macroend

!macro x64_app_files
  File /oname=$PLUGINSDIR\app-64.${COMPRESSION_METHOD} "${APP_64}"
!macroend

!macro ia32_app_files
  StrCpy $packageArch "32"
  File /oname=$PLUGINSDIR\app-32.${COMPRESSION_METHOD} "${APP_32}"
!macroend

!macro extractUsing7za FILE
  Nsis7z::Extract "${FILE}"
!macroend