#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Desenha o ícone do programa (.png, .icns no Mac e .ico no Windows)."""
import os
import subprocess
import sys

from PIL import Image, ImageDraw

AQUI = os.path.join(os.path.dirname(os.path.abspath(__file__)), "recursos")
L = 1024


def desenhar():
    img = Image.new("RGBA", (L, L), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    raio = int(L * 0.225)
    d.rounded_rectangle([0, 0, L - 1, L - 1], radius=raio, fill=(24, 40, 66, 255))
    d.rounded_rectangle([0, 0, L - 1, int(L * 0.62)], radius=raio,
                        fill=(31, 72, 132, 255))
    d.rectangle([0, int(L * 0.40), L - 1, int(L * 0.62)], fill=(31, 72, 132, 255))

    fw, fh = int(L * 0.062), int(L * 0.052)
    for i in range(5):
        y = int(L * 0.075) + i * int(L * 0.105)
        for x in (int(L * 0.045), L - int(L * 0.045) - fw):
            d.rounded_rectangle([x, y, x + fw, y + fh], radius=int(fh * 0.28),
                                fill=(14, 24, 41, 255))

    cx, cy, r = L * 0.5, L * 0.345, L * 0.135
    d.polygon([(cx - r * 0.62, cy - r), (cx - r * 0.62, cy + r), (cx + r * 0.95, cy)],
              fill=(255, 255, 255, 255))

    bx0, bx1 = int(L * 0.175), int(L * 0.825)
    for topo, largura in ((0.70, 1.0), (0.795, 0.72)):
        y, h = int(L * topo), int(L * 0.062)
        meio, metade = (bx0 + bx1) / 2, (bx1 - bx0) * largura / 2
        d.rounded_rectangle([int(meio - metade), y, int(meio + metade), y + h],
                            radius=int(h * 0.45), fill=(255, 255, 255, 255))
    d.rounded_rectangle([int(L * 0.175), int(L * 0.885), int(L * 0.55),
                         int(L * 0.885) + int(L * 0.062)],
                        radius=int(L * 0.062 * 0.45), fill=(255, 216, 77, 255))
    return img


def main():
    os.makedirs(AQUI, exist_ok=True)
    img = desenhar()
    img.save(os.path.join(AQUI, "icone.png"))
    img.save(os.path.join(AQUI, "icone.ico"),
             sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64),
                    (128, 128), (256, 256)])
    print("icone.png e icone.ico prontos")

    if sys.platform == "darwin":
        pasta = os.path.join(AQUI, "icone.iconset")
        os.makedirs(pasta, exist_ok=True)
        for tam in (16, 32, 64, 128, 256, 512, 1024):
            img.resize((tam, tam), Image.LANCZOS).save(
                os.path.join(pasta, "icon_%dx%d.png" % (tam, tam)))
            if tam <= 512:
                img.resize((tam * 2, tam * 2), Image.LANCZOS).save(
                    os.path.join(pasta, "icon_%dx%d@2x.png" % (tam, tam)))
        subprocess.run(["iconutil", "-c", "icns", pasta,
                        "-o", os.path.join(AQUI, "icone.icns")], check=True)
        print("icone.icns pronto")
    return 0


if __name__ == "__main__":
    sys.exit(main())
