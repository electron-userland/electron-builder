# Keep the downloaded package and the adjacent package's filename/hash in sync.
!macro selectWebPackage FILE HASH
  !ifdef APP_64_NAME
    !ifdef APP_32_NAME
      ${if} ${RunningX64}
        StrCpy ${FILE} "${APP_64_NAME}"
        StrCpy ${HASH} "${APP_64_HASH}"
      ${else}
        StrCpy ${FILE} "${APP_32_NAME}"
        StrCpy ${HASH} "${APP_32_HASH}"
      ${endif}
    !else
      StrCpy ${FILE} "${APP_64_NAME}"
      StrCpy ${HASH} "${APP_64_HASH}"
    !endif
  !else ifdef APP_32_NAME
    StrCpy ${FILE} "${APP_32_NAME}"
    StrCpy ${HASH} "${APP_32_HASH}"
  !else ifdef APP_ARM64_NAME
    StrCpy ${FILE} "${APP_ARM64_NAME}"
    StrCpy ${HASH} "${APP_ARM64_HASH}"
  !endif

  !ifdef APP_ARM64_NAME
    ${if} ${IsNativeARM64}
      StrCpy ${FILE} "${APP_ARM64_NAME}"
      StrCpy ${HASH} "${APP_ARM64_HASH}"
    ${endif}
  !endif
!macroend

!macro downloadApplicationFiles
  Var /GLOBAL packageUrl
  Var /GLOBAL packageArch

  StrCpy $packageUrl "${APP_PACKAGE_URL}"
  StrCpy $packageArch "${APP_PACKAGE_URL}"

  !ifdef APP_PACKAGE_URL_IS_INCOMPLETE
    !insertmacro selectWebPackage $0 $1
    StrCpy $packageUrl "$packageUrl/$0"
  !endif

  ${if} ${IsNativeARM64}
    StrCpy $packageArch "ARM64"
  ${elseif} ${IsNativeAMD64}
    StrCpy $packageArch "64"
  ${else}
    StrCpy $packageArch "32"
  ${endif}

  # Only an interactive run passes /RESUME: after a connection error NScurl will resume the transfer on retry.
  # A silent run gets the error back and ends below.
  download:
  ${if} ${Silent}
    NScurl::http GET "$packageUrl" "$PLUGINSDIR\package.7z" /USERAGENT "electron-builder (Mozilla)" /HEADER "X-Arch: $packageArch" /SILENT /CANCEL /END
  ${else}
    NScurl::http GET "$packageUrl" "$PLUGINSDIR\package.7z" /USERAGENT "electron-builder (Mozilla)" /HEADER "X-Arch: $packageArch" /RESUME /CANCEL /END
  ${endif}
  Pop $0

  # A cancelled download ends the installation with exit code 2, like the other aborts of the web installer.
  ${if} $0 == "Cancel"
    SetErrorLevel 2
    Quit
  ${endif}

  ${if} $0 != "OK"
    # try without proxy
    ${if} ${Silent}
      NScurl::http GET "$packageUrl" "$PLUGINSDIR\package.7z" /USERAGENT "electron-builder (Mozilla)" /HEADER "X-Arch: $packageArch" /PROXY "none" /SILENT /CANCEL /END
    ${else}
      NScurl::http GET "$packageUrl" "$PLUGINSDIR\package.7z" /USERAGENT "electron-builder (Mozilla)" /HEADER "X-Arch: $packageArch" /PROXY "none" /RESUME /CANCEL /END
    ${endif}
    Pop $0
  ${endif}

  ${if} $0 == "Cancel"
    SetErrorLevel 2
    Quit
  ${elseif} $0 != "OK"
    # A silent run doesn't retry: it cancels and exits with code 2, like the other aborts of the web installer.
    MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "Unable to download application package from $packageUrl (status: $0).$\r$\n$\r$\nPlease check your internet connection and retry." /SD IDCANCEL IDRETRY download
    SetErrorLevel 2
    Quit
  ${endif}

  StrCpy $packageFile "$PLUGINSDIR\package.7z"
!macroend
