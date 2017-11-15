!include "common.nsh"
!include "extractAppPackage.nsh"

WindowIcon Off
AutoCloseWindow True
RequestExecutionLevel ${REQUEST_EXECUTION_LEVEL}

SilentInstall silent

Function .onInit
  !insertmacro check64BitAndSetRegView
FunctionEnd

Section
  StrCpy $INSTDIR $PLUGINSDIR\app
	SetOutPath $INSTDIR

	!insertmacro extractEmbeddedAppPackage

  System::Call 'Kernel32::SetEnvironmentVariable(t, t)i ("PORTABLE_EXECUTABLE_DIR", "$EXEDIR").r0'
  ${StdUtils.GetAllParameters} $R0 0
	ExecWait "$INSTDIR\${APP_EXECUTABLE_FILENAME} $R0"

  SetOutPath $PLUGINSDIR
	RMDir /r $INSTDIR
SectionEnd