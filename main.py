#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Legenda Fácil — abre a janela do programa."""

import atexit
import multiprocessing
import os
import shutil
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def avisar_erro_grave(mensagem):
    try:
        import tkinter as tk
        from tkinter import messagebox
        raiz = tk.Tk()
        raiz.withdraw()
        messagebox.showerror("Legenda Fácil", mensagem)
        raiz.destroy()
    except Exception:
        sys.stderr.write(mensagem + "\n")


def main():
    multiprocessing.freeze_support()
    try:
        import webview
        from app import servidor
        from app.nucleo import pasta_recursos
        from app.ponte import Ponte
    except Exception:
        import traceback
        avisar_erro_grave("O programa não conseguiu iniciar.\n\n"
                          + traceback.format_exc()[-900:])
        raise

    pasta_web = os.path.join(pasta_recursos(), "web")
    if not os.path.isfile(os.path.join(pasta_web, "index.html")):
        avisar_erro_grave("Faltam arquivos do programa.\n\nInstale novamente "
                          "o Legenda Fácil.")
        return 1

    trabalho = tempfile.mkdtemp(prefix="legendafacil_")
    atexit.register(lambda: shutil.rmtree(trabalho, ignore_errors=True))

    dev = ("--dev" in sys.argv) or os.environ.get("LF_DEV") == "1"
    porta, _servidor = servidor.iniciar(pasta_web, trabalho, dev=dev)
    ponte = Ponte(trabalho)
    janela = webview.create_window(
        "Legenda Fácil",
        "http://127.0.0.1:%d/index.html" % porta,
        js_api=ponte,
        width=1280, height=880, min_size=(880, 620),
        background_color="#14161C",
        text_select=dev,
    )
    ponte.janela = janela
    if dev:
        sys.stderr.write("Legenda Fácil em MODO DEV — porta %d\n" % porta)
    webview.start(debug=dev)
    return 0


if __name__ == "__main__":
    sys.exit(main() or 0)
