# Legenda Fácil

Editor de vídeo simples, no estilo CapCut, que **corta o vídeo** e **cria a
legenda sozinho**, em português. Pensado para quem não tem intimidade com
computador: botões grandes, tudo escrito por extenso, nada de ícone sem nome.

Roda **offline**. Depois de instalado não precisa de internet, nem de conta,
nem de mensalidade.

---

## O que a pessoa faz na prática

1. **ABRIR VÍDEO** — escolhe o arquivo.
2. **Corta**, se quiser: arrasta a agulha, aperta **CORTAR AQUI** (a tesourinha),
   arrasta os pedaços para trocar a ordem, **APAGAR PEDAÇO** tira o que não presta.
   O **ÍMÃ** faz os pedaços grudarem certinho na hora de arrastar.
3. **CRIAR LEGENDA AUTOMÁTICA** — o programa ouve e escreve.
4. Clica em qualquer fala da lista para **corrigir uma palavra errada**.
5. **SALVAR VÍDEO PRONTO** — grava na mesma pasta do vídeo original, com a
   legenda já queimada na imagem (aparece em qualquer celular, WhatsApp,
   Instagram, TV).

Também sai um arquivo `.srt` junto, para quem quiser usar a legenda separada.

---

## Como montar os instaladores

### macOS (.dmg)

```bash
./construir_mac.sh
```

Gera `LegendaFacil-1.0-mac.dmg`. A pessoa abre o `.dmg` e arrasta o programa
para a pasta Aplicativos. Só isso.

### Windows (.exe)

O instalador do Windows **precisa ser montado no Windows** — não dá para gerar
a partir do Mac. Há duas formas:

**A) Sem ter um PC Windows (recomendado):** suba este projeto para o GitHub e
rode a ação *Instalador do Windows* (aba **Actions** → **Run workflow**). Em uns
15 minutos o `LegendaFacil-Instalador.exe` fica pronto para baixar. É de graça.

**B) Num PC Windows:** dois cliques em `construir_windows.bat`.

Antes é preciso ter instalado:
[Python 3.12](https://python.org) (marcando *Add Python to PATH*) e o
[Inno Setup 6](https://jrsoftware.org/isdl.php). O script faz o resto sozinho
e deixa o resultado em `Output\LegendaFacil-Instalador.exe`.

---

## Aviso importante sobre assinatura digital

O programa não está assinado com certificado pago da Apple nem da Microsoft.
Na **primeira vez** que outra pessoa abrir, o sistema vai reclamar:

- **Mac:** clicar com o botão direito no programa → **Abrir** → **Abrir** de novo.
  Só na primeira vez.
- **Windows:** vai aparecer "O Windows protegeu o computador" →
  **Mais informações** → **Executar assim mesmo**.

Para acabar com esses avisos é preciso comprar um certificado:
Apple Developer (US$ 99/ano) ou um certificado de assinatura de código no
Windows. Aí é só assinar e notarizar o pacote.

---

## Por dentro

| Parte | O que é |
|---|---|
| `main.py` | abre a janela nativa |
| `app/nucleo.py` | corte, emenda, legenda `.ass`, ffmpeg |
| `app/ponte.py` | liga a tela ao Python |
| `app/servidor.py` | servidor local (só 127.0.0.1) que entrega o vídeo |
| `web/` | a tela (HTML, CSS, JavaScript) |
| `modelo/small/` | o modelo que reconhece a fala |

- **Janela nativa:** pywebview (WKWebView no Mac, WebView2 no Windows).
- **Vídeo:** ffmpeg embutido, com libass para queimar a legenda.
- **Voz:** faster-whisper, modelo `small`, rodando na CPU.
  No teste ficou **3,8× mais rápido que o tempo real** e acertou 100% de um
  trecho em português.

### Rodar sem empacotar (para mexer no código)

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt huggingface_hub
.venv/bin/python baixar_modelo.py
.venv/bin/python main.py
```

Para testar só a tela no navegador, sem o Python por trás:

```bash
cd web && python3 -m http.server 8777
```

e abrir `http://127.0.0.1:8777/teste.html` — ele roda sozinho os testes da
linha do tempo (corte, arrastar, encurtar, desfazer).
