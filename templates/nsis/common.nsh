!include x64.nsh
!include WinVer.nsh

BrandingText "${PRODUCT_NAME} ${VERSION}"
ShowInstDetails nevershow
!ifdef BUILD_UNINSTALLER
  ShowUninstDetails nevershow
!endif
FileBufSize 64
Name "${PRODUCT_NAME}"
Unicode true

!define APP_EXECUTABLE_FILENAME "${PRODUCT_FILENAME}.exe"
!define UNINSTALL_FILENAME "Uninstall ${PRODUCT_FILENAME}.exe"

!macro check64BitAndSetRegView
  !ifdef APP_64
    ${IfNot} ${AtLeastWin7}
      MessageBox MB_OK "Windows 7 and above is required"
      Quit
    ${EndIf}

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