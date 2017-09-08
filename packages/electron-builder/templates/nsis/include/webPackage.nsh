!macro downloadApplicationFiles
  Var /GLOBAL packageUrl
  Var /GLOBAL packageArch

  StrCpy $packageUrl "${APP_PACKAGE_URL}"
  StrCpy $packageArch "${APP_PACKAGE_URL}"

  !ifdef APP_PACKAGE_URL_IS_INCOMLETE
    !ifdef APP_64_NAME
      !ifdef APP_32_NAME
        ${if} ${RunningX64}
          StrCpy $packageUrl "$packageUrl/${APP_64_NAME}"
        ${else}
          StrCpy $packageUrl "$packageUrl/${APP_32_NAME}"
        ${endif}
      !else
        StrCpy $packageUrl "$packageUrl/${APP_64_NAME}"
      !endif
    !else
      StrCpy $packageUrl "$packageUrl/${APP_32_NAME}"
    !endif
  !endif

  ${if} ${RunningX64}
    StrCpy $packageArch "64"
  ${else}
    StrCpy $packageArch "32"
  ${endif}

  download:
  inetc::get /USERAGENT "electron-builder (Mozilla)" /header "X-Arch: $packageArch" /RESUME "" "$packageUrl" "$PLUGINSDIR\package.7z" /END
  Pop $0
  ${if} $0 == "Cancelled"
    quit
  ${elseif} $0 != "OK"
    Messagebox MB_RETRYCANCEL|MB_ICONEXCLAMATION "Unable to download application package from $packageUrl (status: $0).$\r$\n$\r$\nPlease check you Internet connection and retry." IDRETRY download
    Quit
  ${endif}

  StrCpy $packageFile "$PLUGINSDIR\package.7z"
!macroend