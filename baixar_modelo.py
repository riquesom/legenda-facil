#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Baixa o modelo de reconhecimento de voz que vai dentro do programa.

Roda uma vez antes de empacotar. Depois disso o programa funciona
sem internet nenhuma.
"""
import os
import shutil
import sys

DESTINO = os.path.join(os.path.dirname(os.path.abspath(__file__)), "modelo", "small")


def main():
    if os.path.isfile(os.path.join(DESTINO, "model.bin")):
        print("Modelo já está aqui:", DESTINO)
        return 0
    from huggingface_hub import snapshot_download
    print("Baixando o modelo (uns 460 MB, só desta vez)...")
    snapshot_download("Systran/faster-whisper-small", local_dir=DESTINO)
    for lixo in (".cache", "README.md", ".gitattributes"):
        alvo = os.path.join(DESTINO, lixo)
        if os.path.isdir(alvo):
            shutil.rmtree(alvo, ignore_errors=True)
        elif os.path.isfile(alvo):
            os.remove(alvo)
    total = sum(os.path.getsize(os.path.join(DESTINO, f))
                for f in os.listdir(DESTINO))
    print("Pronto: %.0f MB em %s" % (total / 1e6, DESTINO))
    return 0


if __name__ == "__main__":
    sys.exit(main())
