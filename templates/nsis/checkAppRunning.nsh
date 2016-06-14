!macro CHECK_APP_RUNNING MODE
  ${nsProcess::FindProcess} "${APP_EXECUTABLE_FILENAME}" $R0
  ${If} $R0 == 0
    MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION "${PRODUCT_NAME} is running. $\r$\nClick OK to close it and continue with ${MODE}." /SD IDCANCEL IDOK doStopProcess
      Abort
      doStopProcess:
        DetailPrint "Closing running ${PRODUCT_NAME} ..."
        ${nsProcess::KillProcess} "${APP_EXECUTABLE_FILENAME}" $R0
        DetailPrint "Waiting for ${PRODUCT_NAME} to close."
        Sleep 2000
  ${EndIf}
  ${nsProcess::Unload}
!macroend