!macro extractEmbeddedAppPackage
  !ifdef COMPRESS
    SetCompress off
  !endif

  Var /GLOBAL packageArch

  !ifdef APP_64
  	!ifdef APP_ARM64
      StrCpy $packageArch "ARM64"
	  !else
      StrCpy $packageArch "64"
	  !endif

    !insertmacro compute_files_for_current_arch
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

!macro compute_files_for_current_arch
  !ifdef APP_32
    !ifdef APP_ARM64
      ${if} ${IsNativeARM64}
        !insertmacro arm64_app_files
      ${elseif} ${RunningX64}
        !insertmacro x64_app_files
      ${else}
        !insertmacro ia32_app_files
      ${endIf}
    !else
      ${if} ${RunningX64}
        !insertmacro x64_app_files
      ${else}
        !insertmacro ia32_app_files
      ${endIf}
    !endif
  !else
    !ifdef APP_ARM64
      ${if} ${IsNativeARM64}
        !insertmacro arm64_app_files
      ${else}
        !insertmacro x64_app_files
      ${endIf}
    !else
      !insertmacro x64_app_files
    !endif
  !endif
!macroend

!macro arm64_app_files
  File /oname=$PLUGINSDIR\app-arm64.${COMPRESSION_METHOD} "${APP_ARM64}"
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
