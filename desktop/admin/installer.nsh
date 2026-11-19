!macro customInstall
  ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "HYMN Admin OS"
  ${If} $0 == ""
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "HYMN Admin OS" '"$INSTDIR\HYMN Admin OS.exe" --background'
  ${EndIf}
!macroend
!macro customUnInstall
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "HYMN Admin OS"
!macroend
