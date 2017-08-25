!macro extractEmbeddedAppPackage
  !ifdef COMPRESS
    SetCompress off
  !endif

  !ifdef APP_32
    File /oname=$PLUGINSDIR\app-32.${COMPRESSION_METHOD} "${APP_32}"
  !endif
  !ifdef APP_64
    File /oname=$PLUGINSDIR\app-64.${COMPRESSION_METHOD} "${APP_64}"
  !endif

  !ifdef COMPRESS
    SetCompress "${COMPRESS}"
  !endif

  !ifdef APP_64
    ${if} ${RunningX64}
      !insertmacro doExtractEmbeddedAppPackage "64"
    ${else}
      !insertmacro doExtractEmbeddedAppPackage "32"
    ${endif}
  !else
    !insertmacro doExtractEmbeddedAppPackage "32"
  !endif
!macroend

!macro doExtractEmbeddedAppPackage ARCH
  !ifdef ZIP_COMPRESSION
    nsisunz::Unzip "$PLUGINSDIR\app-${ARCH}.zip" "$INSTDIR"
  !else
    !insertmacro extractUsing7za "$PLUGINSDIR\app-${ARCH}.7z"
  !endif
!macroend

!macro extractUsing7za FILE
  !ifdef SEVEN_ZIP_FILE
    # http://nsis.sourceforge.net/Tutorial:_Using_labels_in_macro%27s
    !define UniqueID ${__LINE__}
    extractAppFiles_${UniqueID}:
      ClearErrors
      nsExec::ExecToStack '"$PLUGINSDIR\7za.exe" x "${FILE}" -aoa -bb0 -o"$INSTDIR"'
      Pop $0 # return value/error/timeout
      Pop $1 # printed text, up to ${NSIS_MAX_STRLEN}

    ${if} $0 != "0"
      MessageBox MB_RETRYCANCEL "Failed to extract files: $0 $1" /SD IDCANCEL IDRETRY extractAppFiles_${UniqueID} IDCANCEL
      Quit
    ${endIf}
    !undef UniqueID
  !else
    Nsis7z::Extract "${FILE}"
  !endif
!macroend