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

  download:
  inetc::get /USERAGENT "electron-builder (Mozilla)" /HEADER "X-Arch: $packageArch" /RESUME "" "$packageUrl" "$PLUGINSDIR\package.7z" /END
  Pop $0

  ${if} $0 == "Cancelled"
    Quit
  ${endif}

  ${if} $0 != "OK"
    # try without proxy
    inetc::get /NOPROXY /USERAGENT "electron-builder (Mozilla)" /HEADER "X-Arch: $packageArch" /RESUME "" "$packageUrl" "$PLUGINSDIR\package.7z" /END
    Pop $0
  ${endif}

  ${if} $0 == "Cancelled"
    quit
  ${elseif} $0 != "OK"
    Messagebox MB_RETRYCANCEL|MB_ICONEXCLAMATION "Unable to download application package from $packageUrl (status: $0).$\r$\n$\r$\nPlease check your internet connection and retry." IDRETRY download
    Quit
  ${endif}

  StrCpy $packageFile "$PLUGINSDIR\package.7z"
!macroend
