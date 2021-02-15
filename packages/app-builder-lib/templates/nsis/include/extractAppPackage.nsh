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
  !else
    !insertmacro extractUsing7za "$PLUGINSDIR\app-$packageArch.7z"
  !endif
!macroend

!macro extractUsing7za FILE
    Nsis7z::Extract "${FILE}"
!macroend
