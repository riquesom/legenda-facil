# -*- coding: utf-8 -*-
"""Servidor local pequeno que entrega a tela e os vídeos para a janela.

Fica preso em 127.0.0.1 (só esta máquina) e entende pedidos parciais,
que é o que o player usa para adiantar e voltar o vídeo.
"""

import hashlib
import http.server
import json
import mimetypes
import os
import socket
import threading
import urllib.parse

MODO_DEV = False

mimetypes.add_type("video/mp4", ".mp4")
mimetypes.add_type("text/javascript", ".js")


class Manipulador(http.server.BaseHTTPRequestHandler):
    raiz_web = ""
    raiz_midia = ""
    protocol_version = "HTTP/1.1"

    def log_message(self, *_args):
        pass  # não sujar o terminal

    def do_GET(self):
        if urllib.parse.urlparse(self.path).path == "/__versao":
            self._responder_versao()
            return
        self._entregar(True)

    def _responder_versao(self):
        """Diz se a tela mudou no disco (usado só no modo dev)."""
        marcas = []
        try:
            for nome in sorted(os.listdir(self.raiz_web)):
                caminho = os.path.join(self.raiz_web, nome)
                if os.path.isfile(caminho):
                    marcas.append("%s:%s" % (nome, os.path.getmtime(caminho)))
        except OSError:
            pass
        corpo = json.dumps({
            "dev": MODO_DEV,
            "versao": hashlib.md5("|".join(marcas).encode()).hexdigest(),
        }).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(corpo)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(corpo)

    def do_HEAD(self):
        self._entregar(False)

    def _resolver(self):
        caminho = urllib.parse.unquote(urllib.parse.urlparse(self.path).path)
        if caminho in ("", "/"):
            caminho = "/index.html"
        if caminho.startswith("/midia/"):
            base, relativo = self.raiz_midia, caminho[len("/midia/"):]
        else:
            base, relativo = self.raiz_web, caminho.lstrip("/")
        base = os.path.abspath(base)
        destino = os.path.abspath(os.path.join(base, relativo))
        if destino != base and not destino.startswith(base + os.sep):
            return None  # tentativa de sair da pasta
        return destino

    def _entregar(self, com_corpo):
        destino = self._resolver()
        if not destino or not os.path.isfile(destino):
            self.send_error(404, "não encontrado")
            return

        tamanho = os.path.getsize(destino)
        tipo = mimetypes.guess_type(destino)[0] or "application/octet-stream"
        inicio, fim, parcial = 0, tamanho - 1, False

        faixa = self.headers.get("Range")
        if faixa and faixa.startswith("bytes=") and tamanho:
            try:
                de, _, ate = faixa[6:].split(",")[0].partition("-")
                if de:
                    inicio = int(de)
                    fim = int(ate) if ate else tamanho - 1
                else:
                    inicio = max(0, tamanho - int(ate))
                    fim = tamanho - 1
                fim = min(fim, tamanho - 1)
                parcial = 0 <= inicio <= fim
            except ValueError:
                parcial = False

        if parcial:
            self.send_response(206)
            self.send_header("Content-Range", "bytes %d-%d/%d" % (inicio, fim, tamanho))
        else:
            inicio, fim = 0, tamanho - 1
            self.send_response(200)

        quantos = fim - inicio + 1
        self.send_header("Content-Type", tipo)
        self.send_header("Content-Length", str(quantos))
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()

        if not com_corpo:
            return
        try:
            with open(destino, "rb") as arquivo:
                arquivo.seek(inicio)
                restante = quantos
                while restante > 0:
                    pedaco = arquivo.read(min(256 * 1024, restante))
                    if not pedaco:
                        break
                    self.wfile.write(pedaco)
                    restante -= len(pedaco)
        except (BrokenPipeError, ConnectionResetError):
            pass  # o player fechou a conexão, normal ao adiantar o vídeo


class Servidor(http.server.ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def porta_livre():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def iniciar(raiz_web, raiz_midia, dev=False):
    global MODO_DEV
    MODO_DEV = dev
    Manipulador.raiz_web = raiz_web
    Manipulador.raiz_midia = raiz_midia
    porta = porta_livre()
    servidor = Servidor(("127.0.0.1", porta), Manipulador)
    threading.Thread(target=servidor.serve_forever, daemon=True).start()
    return porta, servidor
