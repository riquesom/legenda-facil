# -*- coding: utf-8 -*-
"""Ponte entre a tela (JavaScript) e o Python que faz o trabalho pesado."""

import os
import threading
import traceback

from . import nucleo
from .nucleo import (
    Cancelado, ErroAmigavel, duracao_total, escrever_srt,
    extrair_audio_editado, fazer_previa, fazer_tirinha, info_video,
    montar_video_editado, mostrar_na_pasta, nome_de_saida, normalizar_pedacos,
    transcrever,
)

TIPOS = ("Vídeos (*.mp4;*.mov;*.m4v;*.avi;*.mkv;*.webm;*.wmv;*.flv;*.mpg;*.mpeg;*.3gp)",
         "Todos os arquivos (*.*)")


class Ponte:
    def __init__(self, pasta_trabalho):
        self.janela = None
        self.pasta = pasta_trabalho
        self.video = None
        self.info = None
        self.versao = 0
        self.processo = None
        self.pedido_parar = False
        self._trava = threading.Lock()
        self.tarefa = {"pronto": True, "quanto": 0.0, "texto": "",
                       "resultado": None, "erro": None, "cancelado": False}
        self.sessao = None
        self.ultimo_video = None
        self.dialogo_aberto = False

    # ------------------------------------------------------------ interno
    def _por(self, **campos):
        with self._trava:
            self.tarefa.update(campos)

    def _andamento(self, quanto):
        self._por(quanto=max(0.0, min(1.0, float(quanto))))

    def _texto(self, texto):
        self._por(texto=texto)

    def _cancelou(self):
        return self.pedido_parar

    def _registrar(self, processo):
        self.processo = processo

    def _iniciar(self, trabalho, texto=""):
        self.pedido_parar = False
        self.processo = None
        with self._trava:
            self.tarefa = {"pronto": False, "quanto": 0.0, "texto": texto,
                           "resultado": None, "erro": None, "cancelado": False}

        def alvo():
            try:
                resultado = trabalho()
                self._por(pronto=True, quanto=1.0, resultado=resultado)
            except Cancelado:
                self._por(pronto=True, cancelado=True, texto="Parado.")
            except ErroAmigavel as erro:
                self._por(pronto=True, erro=str(erro))
            except Exception as erro:  # noqa: BLE001
                detalhe = traceback.format_exc()[-500:]
                self._por(pronto=True,
                          erro="Aconteceu um erro inesperado.\n%s" % erro,
                          texto=detalhe)
            finally:
                self.processo = None

        threading.Thread(target=alvo, daemon=True).start()

    # ------------------------------------------------- chamados pela tela
    def progresso(self):
        with self._trava:
            return dict(self.tarefa)

    def parar(self):
        self.pedido_parar = True
        processo = self.processo
        if processo is not None:
            try:
                processo.kill()
            except Exception:
                pass
        return {"ok": True}

    def abrir_video(self):
        # evita abrir duas janelas de arquivo empilhadas
        if self.dialogo_aberto:
            return {"ok": True, "cancelado": True}
        self.dialogo_aberto = True
        try:
            import webview
            try:
                tipo = webview.FileDialog.OPEN          # pywebview novo
            except AttributeError:
                tipo = webview.OPEN_DIALOG              # pywebview antigo
            escolhidos = self.janela.create_file_dialog(
                tipo, allow_multiple=False, file_types=TIPOS)
        except Exception as erro:  # noqa: BLE001
            return {"ok": False,
                    "erro": "Não consegui abrir a janela de arquivos.\n%s" % erro}
        finally:
            self.dialogo_aberto = False
        if not escolhidos:
            return {"ok": True, "cancelado": True}
        caminho = escolhidos[0] if isinstance(escolhidos, (list, tuple)) else escolhidos
        self._iniciar(lambda: self._preparar(caminho), "Lendo o vídeo...")
        return {"ok": True}

    def _preparar(self, caminho):
        self._texto("Lendo o vídeo...")
        dados = info_video(caminho)
        if self._cancelou():
            raise Cancelado()

        self.versao += 1
        previa = os.path.join(self.pasta, "previa%d.mp4" % self.versao)
        tira = os.path.join(self.pasta, "tira%d.jpg" % self.versao)

        self._texto("Preparando a prévia para tocar na tela...")
        fazer_previa(caminho, previa, 540, self._andamento, self._cancelou,
                     self._registrar, dados["duracao"])
        if self._cancelou():
            raise Cancelado()

        self._texto("Montando as miniaturas da linha do tempo...")
        quantas = fazer_tirinha(caminho, tira, dados["duracao"])

        self.video = caminho
        self.info = dados
        self.sessao = None
        self.ultimo_video = {
            "arquivo": caminho,
            "nome": os.path.basename(caminho),
            "duracao": dados["duracao"],
            "largura": dados["largura"],
            "altura": dados["altura"],
            "tem_audio": dados["tem_audio"],
            "preview": "/midia/previa%d.mp4" % self.versao,
            "tira": ("/midia/tira%d.jpg" % self.versao) if quantas else None,
            "tira_qtd": quantas,
        }
        return self.ultimo_video

    def criar_legenda(self, pedacos, idioma):
        if not self.video:
            return {"ok": False, "erro": "Abra um vídeo primeiro."}
        if not self.info.get("tem_audio"):
            return {"ok": False, "erro": "Este vídeo não tem som."}
        self._iniciar(lambda: self._legendar(pedacos, idioma), "Preparando...")
        return {"ok": True}

    def _legendar(self, pedacos, idioma):
        limpos = normalizar_pedacos(pedacos, self.info["duracao"])
        total = duracao_total(limpos)
        audio = os.path.join(self.pasta, "som.wav")

        self._texto("Separando o som do vídeo...")
        extrair_audio_editado(self.video, audio, limpos,
                              lambda q: self._andamento(q * 0.12),
                              self._cancelou, self._registrar)
        if self._cancelou():
            raise Cancelado()

        falas = transcrever(
            audio, None if idioma == "auto" else idioma, total,
            lambda q: self._andamento(0.12 + 0.87 * q),
            self._cancelou, self._texto)
        try:
            os.remove(audio)
        except OSError:
            pass
        return [{"inicio": f["inicio"], "fim": f["fim"], "texto": f["texto"]}
                for f in falas]

    def salvar(self, pedacos, legendas, estilo):
        if not self.video:
            return {"ok": False, "erro": "Abra um vídeo primeiro."}
        self._iniciar(lambda: self._salvar(pedacos, legendas, estilo or {}),
                      "Montando o vídeo...")
        return {"ok": True}

    def _salvar(self, pedacos, legendas, estilo):
        limpos = normalizar_pedacos(pedacos, self.info["duracao"])
        falas = []
        for item in (legendas or []):
            texto = (item.get("texto") or "").strip()
            if texto:
                falas.append({"inicio": float(item["inicio"]),
                              "fim": float(item["fim"]), "texto": texto})

        saida = nome_de_saida(self.video)
        self._texto("Montando o vídeo final. Isso pode demorar alguns minutos...")
        montar_video_editado(
            self.video, saida, limpos, falas,
            self.info["largura"], self.info["altura"],
            estilo.get("tamanho", "grande"), estilo.get("cor", "branca"),
            self.info["tem_audio"], self._andamento, self._cancelou,
            self._registrar,
            altura_legenda=float(estilo.get("altura", 0.075)),
            maiusculas=bool(estilo.get("maiusculas")))

        if falas:
            try:
                escrever_srt(os.path.splitext(saida)[0] + ".srt", falas)
            except Exception:
                pass
        mostrar_na_pasta(saida)
        return os.path.basename(saida)

    def guardar_sessao(self, dados):
        """Guarda o que está na tela, para voltar igual depois de recarregar."""
        self.sessao = dados
        return {"ok": True}

    def estado_atual(self):
        """Devolve o vídeo aberto e o trabalho em andamento (modo dev)."""
        return {"video": self.ultimo_video, "sessao": self.sessao}

    def abrir_pasta_do_resultado(self):
        if self.video:
            mostrar_na_pasta(self.video)
        return {"ok": True}
