@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
echo.
echo   Legenda Facil - montando o instalador do Windows
echo.

echo ==^> 1/5  Preparando o ambiente
if not exist .venv (
  python -m venv .venv
  if errorlevel 1 (
    echo    ERRO: Python nao encontrado. Instale em https://python.org
    echo    ^(marque "Add Python to PATH" na instalacao^)
    exit /b 1
  )
)
call .venv\Scripts\activate.bat
python -m pip install --quiet --upgrade pip
pip install --quiet -r requirements.txt pyinstaller pythonnet huggingface_hub
if errorlevel 1 exit /b 1

echo ==^> 2/5  Baixando o modelo de voz ^(so na primeira vez, ~460 MB^)
python baixar_modelo.py
if errorlevel 1 exit /b 1

echo ==^> 3/5  Empacotando o programa
if exist build rmdir /s /q build
if exist dist rmdir /s /q dist
pyinstaller --noconfirm --clean LegendaFacil.spec
if errorlevel 1 exit /b 1

echo ==^> 4/5  Baixando o componente WebView2
curl.exe -L -o webview2.exe "https://go.microsoft.com/fwlink/p/?LinkId=2124703"

echo ==^> 5/5  Montando o instalador
set "ISCC=C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
if not exist "%ISCC%" set "ISCC=C:\Program Files\Inno Setup 6\ISCC.exe"
if not exist "%ISCC%" (
  echo.
  echo    Falta o Inno Setup 6. Baixe de graca em:
  echo    https://jrsoftware.org/isdl.php
  echo    Depois rode este arquivo de novo.
  exit /b 1
)
"%ISCC%" instalador.iss
if errorlevel 1 exit /b 1

echo.
echo   PRONTO!  O instalador esta em:  Output\LegendaFacil-Instalador.exe
echo.
endlocal
