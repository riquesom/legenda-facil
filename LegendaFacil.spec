# -*- mode: python ; coding: utf-8 -*-
"""Receita de empacotamento do Legenda Fácil."""

import sys
from PyInstaller.utils.hooks import (collect_data_files, collect_dynamic_libs,
                                     collect_submodules)

EH_MAC = sys.platform == "darwin"

dados = [
    # só os arquivos que o programa usa de verdade (nada de teste)
    ("web/index.html", "web"),
    ("web/estilo.css", "web"),
    ("web/app.js", "web"),
    ("modelo/small", "modelo/small"),
    ("recursos/icone.png", "recursos"),
]
dados += collect_data_files("faster_whisper")      # modelo de silêncio (VAD)
dados += collect_data_files("imageio_ffmpeg")      # o ffmpeg que vai junto

binarios = []
for pacote in ("ctranslate2", "onnxruntime", "av", "tokenizers"):
    try:
        binarios += collect_dynamic_libs(pacote)
    except Exception:
        pass

escondidos = ["av", "ctranslate2", "onnxruntime", "tokenizers", "faster_whisper",
              "imageio_ffmpeg", "PIL.Image"]
escondidos += collect_submodules("webview")

a = Analysis(
    ["main.py"],
    pathex=["."],
    binaries=binarios,
    datas=dados,
    hiddenimports=escondidos,
    hookspath=[],
    runtime_hooks=[],
    excludes=["matplotlib", "scipy", "pandas", "IPython", "pytest",
              "torch", "transformers", "notebook"],
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz, a.scripts, [],
    exclude_binaries=True,
    name="LegendaFacil",
    debug=False,
    strip=False,
    upx=False,
    console=False,
    icon="recursos/icone.icns" if EH_MAC else "recursos/icone.ico",
)

col = COLLECT(
    exe, a.binaries, a.datas,
    strip=False, upx=False, name="LegendaFacil",
)

if EH_MAC:
    app = BUNDLE(
        col,
        name="Legenda Fácil.app",
        icon="recursos/icone.icns",
        bundle_identifier="br.com.legendafacil.app",
        info_plist={
            "CFBundleName": "Legenda Fácil",
            "CFBundleDisplayName": "Legenda Fácil",
            "CFBundleShortVersionString": "1.0",
            "CFBundleVersion": "1.0",
            "NSHighResolutionCapable": True,
            "LSMinimumSystemVersion": "11.0",
            "LSApplicationCategoryType": "public.app-category.video",
            "NSAppTransportSecurity": {"NSAllowsLocalNetworking": True},
        },
    )
