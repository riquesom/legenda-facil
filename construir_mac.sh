#!/bin/bash
# Monta o Legenda Fácil para macOS: aplicativo + instalador .dmg
set -e
cd "$(dirname "$0")"

VERSAO="1.0"
APP="dist/Legenda Fácil.app"
DMG="LegendaFacil-${VERSAO}-mac.dmg"

echo "==> 1/5  Preparando o ambiente"
if [ ! -d ".venv" ]; then
  PY=""
  for c in python3.13 python3.12 python3.11 python3; do
    if command -v "$c" >/dev/null 2>&1 && "$c" -c "import tkinter" 2>/dev/null; then PY="$c"; break; fi
  done
  [ -z "$PY" ] && PY="python3"
  "$PY" -m venv .venv
fi
.venv/bin/pip install --quiet --upgrade pip
.venv/bin/pip install --quiet -r requirements.txt pyinstaller huggingface_hub

echo "==> 2/5  Baixando o modelo de voz (só na primeira vez)"
.venv/bin/python baixar_modelo.py

echo "==> 3/5  Empacotando o aplicativo"
rm -rf build dist
.venv/bin/pyinstaller --noconfirm --clean LegendaFacil.spec

echo "==> 4/5  Assinando (assinatura simples, local)"
codesign --force --deep --sign - "$APP" 2>/dev/null || \
  echo "    (aviso: não deu para assinar; o app funciona igual)"

echo "==> 5/5  Montando o instalador .dmg"
rm -rf .dmg_tmp "$DMG"
mkdir -p .dmg_tmp
cp -R "$APP" .dmg_tmp/
ln -s /Applications ".dmg_tmp/Aplicativos"
hdiutil create -volname "Legenda Fácil" -srcfolder .dmg_tmp \
  -ov -format UDZO "$DMG" >/dev/null
rm -rf .dmg_tmp

echo
echo "PRONTO!"
echo "  Aplicativo: $APP"
echo "  Instalador: $DMG  ($(du -h "$DMG" | cut -f1))"
