#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Cria o vídeo de exemplo usado pela página de teste da interface.

Depois disso, rode:  cd web && python3 -m http.server 8777
e abra http://127.0.0.1:8777/teste.html
"""
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from app.nucleo import caminho_ffmpeg  # noqa: E402

WEB = os.path.join(os.path.dirname(os.path.abspath(__file__)), "web")
DURACAO = 14.67
MINIATURAS = 30


def main():
    ff = caminho_ffmpeg()
    video = os.path.join(WEB, "exemplo.mp4")
    tira = os.path.join(WEB, "tira.jpg")

    print("Criando o vídeo de exemplo (vertical, como o de celular)...")
    subprocess.run([
        ff, "-y", "-loglevel", "error",
        "-f", "lavfi", "-i", "testsrc2=size=1080x1920:rate=30:duration=%s" % DURACAO,
        "-f", "lavfi", "-i", "sine=frequency=300:duration=%s" % DURACAO,
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "30",
        "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", video], check=True)

    print("Criando a tirinha de miniaturas...")
    subprocess.run([
        ff, "-y", "-loglevel", "error", "-i", video,
        "-vf", "fps=%.6f,scale=-1:84,tile=%dx1" % (MINIATURAS / DURACAO, MINIATURAS),
        "-frames:v", "1", "-q:v", "4", tira], check=True)

    print("Pronto: %.1f MB" % (os.path.getsize(video) / 1e6))
    return 0


if __name__ == "__main__":
    sys.exit(main())
