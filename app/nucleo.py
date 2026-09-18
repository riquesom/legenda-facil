# -*- coding: utf-8 -*-
"""
Nucleo do Legenda Facil: ler video, cortar, transcrever e queimar legenda.

Nada aqui depende da interface grafica, para ficar facil de testar.
"""

import os
import re
import sys
import shutil
import subprocess
import threading

IS_WIN = sys.platform.startswith("win")
IS_MAC = sys.platform == "darwin"


class Cancelado(Exception):
    """Levantada quando a pessoa aperta PARAR."""


class ErroAmigavel(Exception):
    """Erro com mensagem que pode ser mostrada direto para a pessoa."""


# ----------------------------------------------------------------------------
# Onde estao os arquivos que vem dentro do programa
# ----------------------------------------------------------------------------
def pasta_recursos():
    """Funciona rodando pelo codigo ou dentro do aplicativo empacotado."""
    embutido = getattr(sys, "_MEIPASS", None)
    if embutido:
        return embutido
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def caminho_ffmpeg():
    nome = "ffmpeg.exe" if IS_WIN else "ffmpeg"
    junto = os.path.join(pasta_recursos(), "recursos", nome)
    if os.path.isfile(junto):
        return junto
    try:
        import imageio_ffmpeg
        caminho = imageio_ffmpeg.get_ffmpeg_exe()
        if caminho and os.path.isfile(caminho):
            return caminho
    except Exception:
        pass
    do_sistema = shutil.which("ffmpeg")
    if do_sistema:
        return do_sistema
    raise ErroAmigavel("O programa de vídeo não foi encontrado. "
                       "Instale o Legenda Fácil novamente.")


def caminho_modelo():
    """Pasta do modelo de legenda que vem junto com o programa."""
    for tentativa in (
        os.path.join(pasta_recursos(), "modelo", "small"),
        os.path.join(pasta_recursos(), "modelo"),
    ):
        if os.path.isfile(os.path.join(tentativa, "model.bin")):
            return tentativa
    return "small"  # ultimo recurso: baixa da internet


def _sem_janela_preta():
    """No Windows, evita piscar uma janela preta a cada comando."""
    if not IS_WIN:
        return {}
    info = subprocess.STARTUPINFO()
    info.dwFlags |= subprocess.STARTF_USESHOWWINDOW
    return {"startupinfo": info, "creationflags": subprocess.CREATE_NO_WINDOW}


# ----------------------------------------------------------------------------
# Tempo
# ----------------------------------------------------------------------------
def mostrar_tempo(segundos):
    segundos = max(0, int(round(segundos or 0)))
    horas, resto = divmod(segundos, 3600)
    minutos, segs = divmod(resto, 60)
    if horas:
        return "%d:%02d:%02d" % (horas, minutos, segs)
    return "%02d:%02d" % (minutos, segs)


def ler_tempo(texto):
    """Aceita '90', '1:30' ou '00:01:30' e devolve segundos. Vazio vira None."""
    texto = (texto or "").strip().replace(",", ".")
    if not texto:
        return None
    if not re.fullmatch(r"\d+(\.\d+)?(:\d+(\.\d+)?){0,2}", texto):
        raise ErroAmigavel("Não entendi o tempo \"%s\".\n\n"
                           "Escreva assim: 1:30  (1 minuto e 30 segundos)" % texto)
    total = 0.0
    for parte in texto.split(":"):
        total = total * 60 + float(parte)
    return total


# ----------------------------------------------------------------------------
# Informacoes do video
# ----------------------------------------------------------------------------
def info_video(caminho):
    """Duracao, tamanho da imagem (ja virado) e se tem som."""
    duracao = 0.0
    tem_audio = False
    try:
        import av
        with av.open(caminho) as arquivo:
            if arquivo.duration:
                duracao = float(arquivo.duration) / 1000000.0
            trilhas_video = [t for t in arquivo.streams if t.type == "video"]
            tem_audio = any(t.type == "audio" for t in arquivo.streams)
            if not trilhas_video:
                raise ErroAmigavel("Este arquivo não tem imagem de vídeo.")
            if duracao <= 0:
                trilha = trilhas_video[0]
                if trilha.duration and trilha.time_base:
                    duracao = float(trilha.duration * trilha.time_base)
    except ErroAmigavel:
        raise
    except Exception as erro:
        raise ErroAmigavel("Não consegui abrir este vídeo.\n\n%s" % erro)

    largura, altura = _tamanho_real(caminho)
    return {"duracao": duracao, "largura": largura,
            "altura": altura, "tem_audio": tem_audio}


def _tamanho_real(caminho):
    """Pega o tamanho da imagem decodificando um quadro.

    Assim o video de celular gravado em pe ja vem com a medida certa,
    sem precisar adivinhar a rotacao.
    """
    import tempfile
    from PIL import Image
    with tempfile.TemporaryDirectory() as pasta:
        quadro = os.path.join(pasta, "q.png")
        resultado = subprocess.run(
            [caminho_ffmpeg(), "-y", "-nostdin", "-loglevel", "error",
             "-i", caminho, "-frames:v", "1", "-vsync", "0", quadro],
            capture_output=True, text=True, **_sem_janela_preta())
        if resultado.returncode != 0 or not os.path.isfile(quadro):
            raise ErroAmigavel("Não consegui ler a imagem deste vídeo.\n\n"
                               + (resultado.stderr or "").strip()[:400])
        with Image.open(quadro) as imagem:
            return imagem.width, imagem.height


# ----------------------------------------------------------------------------
# Arquivo de legenda (.ass) que sera queimado no video
# ----------------------------------------------------------------------------
NOME_DA_FONTE = "Arial"

CORES_LEGENDA = {
    "branca": "&H00FFFFFF",
    "amarela": "&H0000E8FF",
}

TAMANHOS_LEGENDA = {
    "medio": 0.048,
    "grande": 0.062,
    "gigante": 0.082,
}


def tempo_ass(segundos):
    segundos = max(0.0, float(segundos))
    horas = int(segundos // 3600)
    minutos = int((segundos % 3600) // 60)
    return "%d:%02d:%05.2f" % (horas, minutos, segundos % 60)


def tempo_srt(segundos):
    segundos = max(0.0, float(segundos))
    horas = int(segundos // 3600)
    minutos = int((segundos % 3600) // 60)
    segs = int(segundos % 60)
    milis = min(999, int(round((segundos - int(segundos)) * 1000)))
    return "%02d:%02d:%02d,%03d" % (horas, minutos, segs, milis)


def quebrar_em_linhas(texto, max_caracteres):
    linhas = []
    atual = ""
    for palavra in texto.split():
        if not atual:
            atual = palavra
        elif len(atual) + 1 + len(palavra) <= max_caracteres:
            atual += " " + palavra
        else:
            linhas.append(atual)
            atual = palavra
    if atual:
        linhas.append(atual)
    return linhas or [""]


def montar_blocos(legendas, max_caracteres, linhas_por_vez=2):
    """Parte falas compridas em pedacos curtos, como o CapCut mostra."""
    blocos = []
    for fala in legendas:
        texto = " ".join((fala.get("texto") or "").split())
        if not texto:
            continue
        inicio = float(fala["inicio"])
        fim = max(float(fala["fim"]), inicio + 0.4)
        linhas = quebrar_em_linhas(texto, max_caracteres)
        total = sum(len(l) for l in linhas) or 1
        marca = inicio
        for i in range(0, len(linhas), linhas_por_vez):
            grupo = linhas[i:i + linhas_por_vez]
            fatia = (fim - inicio) * (sum(len(l) for l in grupo) / total)
            blocos.append({
                "inicio": marca,
                "fim": min(fim, marca + max(0.5, fatia)),
                "texto": "\\N".join(grupo),
            })
            marca += fatia
    return blocos


def _limpar_para_ass(texto):
    return (texto.replace("{", "(").replace("}", ")")
                 .replace("\r", "").replace("\n", "\\N"))


ALTURA_PADRAO = 0.075      # distância do rodapé, em fração da altura do vídeo
ALTURA_MINIMA = 0.02
ALTURA_MAXIMA = 0.80


def escrever_ass(caminho, legendas, largura, altura, tamanho, cor,
                 altura_legenda=ALTURA_PADRAO, maiusculas=False):
    if maiusculas:
        legendas = [dict(f, texto=(f.get("texto") or "").upper()) for f in legendas]
    tam_fonte = max(16, int(altura * TAMANHOS_LEGENDA.get(tamanho, 0.062)))
    contorno = max(2, int(round(tam_fonte * 0.11)))
    sombra = max(1, int(round(tam_fonte * 0.045)))
    fracao = min(ALTURA_MAXIMA, max(ALTURA_MINIMA, float(altura_legenda)))
    margem_baixo = int(altura * fracao)
    margem_lado = int(largura * 0.055)
    util = max(200, largura - 2 * margem_lado)
    # letra maiúscula é mais larga, então cabe menos por linha
    largura_media = 0.57 if maiusculas else 0.50
    max_caracteres = max(12, min(42, int(util / (tam_fonte * largura_media))))

    blocos = montar_blocos(legendas, max_caracteres)

    cabecalho = (
        "[Script Info]\n"
        "ScriptType: v4.00+\n"
        "PlayResX: %d\n"
        "PlayResY: %d\n"
        "WrapStyle: 0\n"
        "ScaledBorderAndShadow: yes\n"
        "YCbCr Matrix: None\n"
        "\n"
        "[V4+ Styles]\n"
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, "
        "OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, "
        "ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, "
        "Alignment, MarginL, MarginR, MarginV, Encoding\n"
        "Style: Padrao,%s,%d,%s,&H000000FF,&H00000000,&H78000000,-1,0,0,0,"
        "100,100,0,0,1,%d,%d,2,%d,%d,%d,1\n"
        "\n"
        "[Events]\n"
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, "
        "Effect, Text\n"
    ) % (largura, altura, NOME_DA_FONTE, tam_fonte,
         CORES_LEGENDA.get(cor, CORES_LEGENDA["branca"]),
         contorno, sombra, margem_lado, margem_lado, margem_baixo)

    with open(caminho, "w", encoding="utf-8") as arquivo:
        arquivo.write(cabecalho)
        for bloco in blocos:
            arquivo.write("Dialogue: 0,%s,%s,Padrao,,0,0,0,,%s\n" % (
                tempo_ass(bloco["inicio"]), tempo_ass(bloco["fim"]),
                _limpar_para_ass(bloco["texto"])))
    return len(blocos)


def escrever_srt(caminho, legendas):
    numero = 0
    with open(caminho, "w", encoding="utf-8") as arquivo:
        for fala in legendas:
            texto = " ".join((fala.get("texto") or "").split())
            if not texto:
                continue
            numero += 1
            arquivo.write("%d\n%s --> %s\n%s\n\n" % (
                numero, tempo_srt(fala["inicio"]),
                tempo_srt(fala["fim"]), texto))


# ----------------------------------------------------------------------------
# Rodar o ffmpeg mostrando o quanto ja andou
# ----------------------------------------------------------------------------
_PADRAO_TEMPO = re.compile(r"out_time_us=(\d+)")


def rodar_ffmpeg(argumentos, total, ao_progredir, cancelou,
                 pasta=None, registrar=None):
    comando = [caminho_ffmpeg(), "-y", "-nostdin", "-hide_banner",
               "-loglevel", "error", "-progress", "pipe:1", "-nostats"]
    comando += argumentos

    processo = subprocess.Popen(
        comando, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        text=True, cwd=pasta, bufsize=1, **_sem_janela_preta())
    if registrar:
        registrar(processo)

    erros = []

    def juntar_erros():
        try:
            for linha in processo.stderr:
                erros.append(linha)
        except Exception:
            pass

    leitor = threading.Thread(target=juntar_erros, daemon=True)
    leitor.start()

    try:
        for linha in processo.stdout:
            if cancelou():
                processo.kill()
                raise Cancelado()
            achou = _PADRAO_TEMPO.match(linha.strip())
            if achou and total > 0:
                ao_progredir(min(0.99, (int(achou.group(1)) / 1000000.0) / total))
    finally:
        try:
            processo.stdout.close()
        except Exception:
            pass
        processo.wait()
        leitor.join(timeout=2)
        if registrar:
            registrar(None)

    if cancelou():
        raise Cancelado()
    if processo.returncode != 0:
        detalhe = "".join(erros[-8:]).strip()[:500]
        raise ErroAmigavel("Deu um problema ao trabalhar no vídeo.\n\n" + detalhe)


def extrair_audio(video, destino, inicio, duracao, registrar=None):
    argumentos = []
    if inicio:
        argumentos += ["-ss", "%.3f" % inicio]
    if duracao:
        argumentos += ["-t", "%.3f" % duracao]
    argumentos += ["-i", video, "-vn", "-ac", "1", "-ar", "16000",
                   "-c:a", "pcm_s16le", destino]
    rodar_ffmpeg(argumentos, duracao or 0, lambda _: None,
                 lambda: False, registrar=registrar)


# ----------------------------------------------------------------------------
# Escrever a legenda ouvindo o audio
# ----------------------------------------------------------------------------
def transcrever(audio, idioma, duracao, ao_progredir, cancelou, ao_avisar=None):
    from faster_whisper import WhisperModel

    if ao_avisar:
        ao_avisar("Preparando o reconhecimento de voz...")
    modelo = WhisperModel(
        caminho_modelo(), device="cpu", compute_type="int8",
        cpu_threads=max(2, (os.cpu_count() or 4) // 2))
    if cancelou():
        raise Cancelado()

    if ao_avisar:
        ao_avisar("Ouvindo o vídeo e escrevendo as palavras...")
    segmentos, _info = modelo.transcribe(
        audio,
        language=idioma,
        vad_filter=True,
        beam_size=1,
        condition_on_previous_text=False)

    falas = []
    for pedaco in segmentos:
        if cancelou():
            raise Cancelado()
        texto = (pedaco.text or "").strip()
        if texto:
            falas.append({"inicio": float(pedaco.start),
                          "fim": float(pedaco.end),
                          "texto": texto})
        if duracao > 0:
            ao_progredir(min(0.99, float(pedaco.end) / duracao))
    return falas


# ----------------------------------------------------------------------------
# Montar o video final
# ----------------------------------------------------------------------------
def montar_video(video, saida, inicio, duracao, legendas, largura, altura,
                 tamanho, cor, ao_progredir, cancelou, registrar=None):
    import tempfile
    with tempfile.TemporaryDirectory() as pasta:
        argumentos = []
        if inicio:
            argumentos += ["-ss", "%.3f" % inicio]
        if duracao:
            argumentos += ["-t", "%.3f" % duracao]
        argumentos += ["-i", os.path.abspath(video)]

        if legendas:
            escrever_ass(os.path.join(pasta, "leg.ass"), legendas,
                         largura, altura, tamanho, cor)
            # o ffmpeg roda dentro da pasta, entao o nome curto sempre funciona
            argumentos += ["-vf", "subtitles=leg.ass"]

        argumentos += ["-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
                       "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k",
                       "-movflags", "+faststart", os.path.abspath(saida)]

        rodar_ffmpeg(argumentos, duracao or 0, ao_progredir, cancelou,
                     pasta=pasta, registrar=registrar)


# ----------------------------------------------------------------------------
# Arquivos e pastas
# ----------------------------------------------------------------------------
def nome_de_saida(entrada, sufixo=" (com legenda)", extensao=".mp4"):
    pasta = os.path.dirname(os.path.abspath(entrada))
    if not os.access(pasta, os.W_OK):
        pasta = os.path.join(os.path.expanduser("~"), "Desktop")
        if not os.path.isdir(pasta):
            pasta = os.path.expanduser("~")
    nome = os.path.splitext(os.path.basename(entrada))[0]
    tentativa = os.path.join(pasta, nome + sufixo + extensao)
    contador = 2
    while os.path.exists(tentativa):
        tentativa = os.path.join(pasta, "%s%s %d%s"
                                 % (nome, sufixo, contador, extensao))
        contador += 1
    return tentativa


def mostrar_na_pasta(caminho):
    try:
        if IS_MAC:
            subprocess.Popen(["open", "-R", caminho])
        elif IS_WIN:
            subprocess.Popen(["explorer", "/select,", os.path.normpath(caminho)])
        else:
            subprocess.Popen(["xdg-open", os.path.dirname(caminho)])
    except Exception:
        pass


def abrir_arquivo(caminho):
    try:
        if IS_MAC:
            subprocess.Popen(["open", caminho])
        elif IS_WIN:
            os.startfile(caminho)  # noqa: S606
        else:
            subprocess.Popen(["xdg-open", caminho])
    except Exception:
        pass


# ----------------------------------------------------------------------------
# Vários pedaços: juntar tudo num vídeo só
# ----------------------------------------------------------------------------
def normalizar_pedacos(pedacos, duracao):
    """Confere os pedaços vindos da tela e devolve uma lista limpa."""
    limpos = []
    for item in (pedacos or []):
        inicio = max(0.0, float(item.get("inicio", 0.0)))
        fim = float(item.get("fim", 0.0))
        if duracao > 0:
            fim = min(fim, duracao)
        if fim - inicio >= 0.05:
            limpos.append({"inicio": inicio, "fim": fim})
    if not limpos:
        raise ErroAmigavel("Não sobrou nenhum pedaço de vídeo.\n\n"
                           "Use o botão DESFAZER e tente de novo.")
    return limpos


def duracao_total(pedacos):
    return sum(p["fim"] - p["inicio"] for p in pedacos)


def _filtro(pedacos, com_audio, com_legenda):
    """Monta o filtro do ffmpeg que corta e emenda os pedaços."""
    partes = []
    for i, p in enumerate(pedacos):
        partes.append("[0:v]trim=start=%.3f:end=%.3f,setpts=PTS-STARTPTS[v%d]"
                      % (p["inicio"], p["fim"], i))
        if com_audio:
            partes.append("[0:a]atrim=start=%.3f:end=%.3f,asetpts=PTS-STARTPTS[a%d]"
                          % (p["inicio"], p["fim"], i))
    entradas = "".join("[v%d][a%d]" % (i, i) if com_audio else "[v%d]" % i
                       for i in range(len(pedacos)))
    partes.append("%sconcat=n=%d:v=1:a=%d[vc]%s"
                  % (entradas, len(pedacos), 1 if com_audio else 0,
                     "[ac]" if com_audio else ""))
    saida_video = "[vc]"
    if com_legenda:
        partes.append("[vc]subtitles=leg.ass[vs]")
        saida_video = "[vs]"
    return ";".join(partes), saida_video


def extrair_audio_editado(video, destino, pedacos, ao_progredir, cancelou,
                          registrar=None):
    """Tira só o som, já com os cortes aplicados, pronto para a transcrição."""
    partes = []
    for i, p in enumerate(pedacos):
        partes.append("[0:a]atrim=start=%.3f:end=%.3f,asetpts=PTS-STARTPTS[a%d]"
                      % (p["inicio"], p["fim"], i))
    entradas = "".join("[a%d]" % i for i in range(len(pedacos)))
    partes.append("%sconcat=n=%d:v=0:a=1[ac]" % (entradas, len(pedacos)))
    argumentos = ["-i", video, "-filter_complex", ";".join(partes),
                  "-map", "[ac]", "-ac", "1", "-ar", "16000",
                  "-c:a", "pcm_s16le", destino]
    rodar_ffmpeg(argumentos, duracao_total(pedacos), ao_progredir, cancelou,
                 registrar=registrar)


def montar_video_editado(video, saida, pedacos, legendas, largura, altura,
                         tamanho, cor, tem_audio, ao_progredir, cancelou,
                         registrar=None, altura_legenda=ALTURA_PADRAO,
                         maiusculas=False):
    import tempfile
    with tempfile.TemporaryDirectory() as pasta:
        com_legenda = bool(legendas)
        if com_legenda:
            escrever_ass(os.path.join(pasta, "leg.ass"), legendas,
                         largura, altura, tamanho, cor, altura_legenda,
                         maiusculas)
        filtro, saida_video = _filtro(pedacos, tem_audio, com_legenda)

        argumentos = ["-i", os.path.abspath(video),
                      "-filter_complex", filtro, "-map", saida_video]
        if tem_audio:
            argumentos += ["-map", "[ac]", "-c:a", "aac", "-b:a", "192k"]
        argumentos += ["-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
                       "-pix_fmt", "yuv420p", "-movflags", "+faststart",
                       os.path.abspath(saida)]
        rodar_ffmpeg(argumentos, duracao_total(pedacos), ao_progredir,
                     cancelou, pasta=pasta, registrar=registrar)


# ----------------------------------------------------------------------------
# Prévia leve e tirinha de miniaturas para a linha do tempo
# ----------------------------------------------------------------------------
def fazer_previa(video, destino, altura_alvo=540, ao_progredir=None,
                 cancelou=None, registrar=None, duracao=0):
    """Versão leve do vídeo, só para tocar na tela sem travar."""
    argumentos = ["-i", video,
                  "-vf", "scale=-2:%d:force_original_aspect_ratio=decrease" % altura_alvo,
                  "-c:v", "libx264", "-preset", "veryfast", "-crf", "28",
                  "-pix_fmt", "yuv420p", "-movflags", "+faststart"]
    argumentos += ["-c:a", "aac", "-b:a", "128k", destino]
    rodar_ffmpeg(argumentos, duracao, ao_progredir or (lambda _p: None),
                 cancelou or (lambda: False), registrar=registrar)


def fazer_tirinha(video, destino, duracao, quantidade=None, altura=84):
    """Tirinha com várias miniaturas lado a lado, usada na linha do tempo."""
    if duracao <= 0:
        duracao = 1.0
    if quantidade is None:
        quantidade = int(max(10, min(60, round(duracao))))
    taxa = quantidade / duracao
    argumentos = ["-i", video,
                  "-vf", "fps=%.6f,scale=-1:%d,tile=%dx1" % (taxa, altura, quantidade),
                  "-frames:v", "1", "-q:v", "4", destino]
    try:
        rodar_ffmpeg(argumentos, 0, lambda _p: None, lambda: False)
    except Exception:
        return 0
    return quantidade if os.path.isfile(destino) else 0
