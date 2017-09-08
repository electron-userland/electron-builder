!macro extractEmbeddedAppPackage
  !ifdef COMPRESS
    SetCompress off
  !endif

  Var /GLOBAL packageArch

  !ifdef APP_64
    StrCpy $packageArch "64"

    !ifdef APP_32
      ${if} ${RunningX64}
        File /oname=$PLUGINSDIR\app-64.${COMPRESSION_METHOD} "${APP_64}"
      ${else}
        StrCpy $packageArch "32"
        File /oname=$PLUGINSDIR\app-32.${COMPRESSION_METHOD} "${APP_32}"
      ${endIf}
    !else
      File /oname=$PLUGINSDIR\app-64.${COMPRESSION_METHOD} "${APP_64}"
    !endif
  !else
    StrCpy $packageArch "32"

    File /oname=$PLUGINSDIR\app-32.${COMPRESSION_METHOD} "${APP_32}"
  !endif

  !ifdef COMPRESS
    SetCompress "${COMPRESS}"
  !endif

  !ifdef ZIP_COMPRESSION
    nsisunz::Unzip "$PLUGINSDIR\app-$packageArch.zip" "$INSTDIR"
  !else
    !insertmacro extractUsing7za "$PLUGINSDIR\app-$packageArch.7z"
  !endif
!macroend

!macro extractUsing7za FILE
  Nsis7z::Extract "${FILE}"
!macroend