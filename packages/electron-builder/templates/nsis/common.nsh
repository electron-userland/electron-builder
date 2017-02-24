!include x64.nsh
!include WinVer.nsh

BrandingText "${PRODUCT_NAME} ${VERSION}"
ShowInstDetails nevershow
!ifdef BUILD_UNINSTALLER
  ShowUninstDetails nevershow
!endif
FileBufSize 64
Name "${PRODUCT_NAME}"

!define APP_EXECUTABLE_FILENAME "${PRODUCT_FILENAME}.exe"
!define UNINSTALL_FILENAME "Uninstall ${PRODUCT_FILENAME}.exe"

!macro check64BitAndSetRegView
  ${IfNot} ${AtLeastWin7}
    MessageBox MB_OK "Windows 7 and above is required"
    Quit
  ${EndIf}

  !ifdef APP_64
    ${If} ${RunningX64}
      SetRegView 64
    ${Else}
      !ifndef APP_32
        MessageBox MB_OK|MB_ICONEXCLAMATION "64-bit Windows is required"
        Quit
      !endif
    ${EndIf}
  !endif
!macroend

# avoid exit code 2
!macro quitSuccess
  SetErrorLevel 0
  Quit
!macroend

!macro setLinkVars
  StrCpy $desktopLink "$DESKTOP\${PRODUCT_FILENAME}.lnk"
  !ifdef MENU_FILENAME
    StrCpy $startMenuLink "$SMPROGRAMS\${MENU_FILENAME}\${PRODUCT_FILENAME}.lnk"
  !else
    StrCpy $startMenuLink "$SMPROGRAMS\${PRODUCT_FILENAME}.lnk"
  !endif
!macroend

!macro _Updated _a _b _t _f
  ClearErrors
  ${GetParameters} $R9
  ${GetOptions} $R9 "--updated" $R8
  IfErrors `${_f}` `${_t}`
!macroend
!define Updated `"" Updated ""`

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
    Nsis7z::Extract "$PLUGINSDIR\app-${ARCH}.7z"
  !endif
!macroend