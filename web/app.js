/* Legenda Fácil — timeline, corte, ímã, preview e legendas. */

"use strict";

const $ = (id) => document.getElementById(id);

const estado = {
  arquivo: null,
  duracao: 0,
  largura: 1920,
  altura: 1080,
  temAudio: true,
  tira: null,          // tirinha de miniaturas
  tiraQtd: 0,          // quantas miniaturas ela tem
  tiraLargura: 0,      // largura real da tirinha, em pixels
  segmentos: [],       // {id, inicio, fim} em tempo do vídeo ORIGINAL
  historico: [],
  zoom: 70,            // pixels por segundo
  zoomCaber: 70,       // o zoom em que o vídeo inteiro cabe na tela
  ima: true,
  posicao: 0,          // segundos na LINHA DO TEMPO
  escolhido: null,
  legendas: [],        // {inicio, fim, texto} em tempo da LINHA DO TEMPO
  tocando: false,
  ocupado: false,
  estilo: { tamanho: "grande", cor: "branca", idioma: "pt", altura: 0.075,
            maiusculas: false },
};

let proximoId = 1;
const video = $("video");

/* ------------------------------------------------------------- utilidades */
function fmt(s) {
  s = Math.max(0, s || 0);
  const m = Math.floor(s / 60);
  const seg = Math.floor(s % 60);
  return `${String(m).padStart(2, "0")}:${String(seg).padStart(2, "0")}`;
}

function duracaoTotal() {
  return estado.segmentos.reduce((t, s) => t + (s.fim - s.inicio), 0);
}

/** Onde cada pedaço começa na linha do tempo. */
function inicios() {
  const lista = [];
  let acc = 0;
  for (const s of estado.segmentos) {
    lista.push(acc);
    acc += s.fim - s.inicio;
  }
  return lista;
}

/** Converte tempo da linha do tempo para tempo do vídeo original. */
function paraFonte(t) {
  let acc = 0;
  for (let i = 0; i < estado.segmentos.length; i++) {
    const s = estado.segmentos[i];
    const d = s.fim - s.inicio;
    if (t < acc + d - 0.0001 || i === estado.segmentos.length - 1) {
      return { indice: i, tempo: s.inicio + Math.min(d, Math.max(0, t - acc)) };
    }
    acc += d;
  }
  return null;
}

function guardarHistorico() {
  estado.historico.push(JSON.stringify(estado.segmentos));
  if (estado.historico.length > 40) estado.historico.shift();
  $("btn-desfazer").disabled = estado.historico.length === 0 || estado.ocupado;
}

function avisar(texto, tipo) {
  document.querySelectorAll(".aviso").forEach((n) => n.remove());
  const caixa = document.createElement("div");
  caixa.className = "aviso" + (tipo ? " " + tipo : "");
  caixa.textContent = texto;
  document.body.appendChild(caixa);
  setTimeout(() => caixa.remove(), 3600);
}

/* ------------------------------------------------------------------ ponte */
const ponte = {
  async chamar(nome, ...args) {
    if (window.pywebview && window.pywebview.api && window.pywebview.api[nome]) {
      return await window.pywebview.api[nome](...args);
    }
    return await mockar(nome, args);
  },
};

/* Modo de teste no navegador, sem o Python por trás. */
async function mockar(nome, args) {
  if (nome === "abrir_video") {
    mockTarefa = {
      quanto: 1, pronto: true, texto: "Pronto",
      resultado: {
        arquivo: "exemplo.mp4", nome: "exemplo.mp4",
        duracao: 14.67, largura: 1080, altura: 1920, tem_audio: true,
        preview: "exemplo.mp4", tira: "tira.jpg", tira_qtd: 30,
      },
    };
    return { ok: true };
  }
  if (nome === "criar_legenda") {
    mockTarefa = { quanto: 0, texto: "Ouvindo o vídeo...", pronto: false };
    let p = 0;
    const timer = setInterval(() => {
      p += 0.12;
      mockTarefa.quanto = Math.min(0.99, p);
      if (p >= 1) {
        clearInterval(timer);
        mockTarefa = {
          quanto: 1, pronto: true, texto: "Pronto",
          resultado: [
            { inicio: 0.0, fim: 6.3, texto: "Olá pessoal, tudo bem? Hoje eu vou ensinar uma receita de bolo de cenoura muito fácil." },
            { inicio: 6.3, fim: 12.2, texto: "Primeiro, separe 3 cenouras médias, 4 ovos e 2 xícaras de açúcar." },
            { inicio: 12.2, fim: 14.6, texto: "Depois bata tudo no liquidificador." },
          ],
        };
      }
    }, 320);
    return { ok: true };
  }
  if (nome === "salvar") {
    mockTarefa = { quanto: 0, texto: "Montando...", pronto: false };
    let p = 0;
    const timer = setInterval(() => {
      p += 0.2;
      mockTarefa.quanto = Math.min(0.99, p);
      if (p >= 1) {
        clearInterval(timer);
        mockTarefa = { quanto: 1, pronto: true, resultado: "exemplo (com legenda).mp4" };
      }
    }, 300);
    return { ok: true };
  }
  if (nome === "progresso") return mockTarefa || { pronto: true };
  if (nome === "parar") { mockTarefa = { pronto: true, cancelado: true }; return { ok: true }; }
  return { ok: false, erro: "não implementado" };
}
let mockTarefa = null;

/* --------------------------------------------------------------- abrir */
let abrindoArquivo = false;

async function abrirVideo() {
  if (estado.ocupado || abrindoArquivo) return;
  abrindoArquivo = true;
  $("btn-abrir").disabled = true;
  let resposta;
  try {
    resposta = await ponte.chamar("abrir_video");
  } finally {
    abrindoArquivo = false;
    $("btn-abrir").disabled = false;
  }
  if (!resposta || !resposta.ok) {
    if (resposta && resposta.erro) avisar(resposta.erro, "erro");
    return;
  }
  if (resposta.cancelado) return;
  abrirTrabalho("Abrindo o vídeo", "Preparando a prévia...");
  acompanharTarefa((info) => aplicarVideo(info));
}

function aplicarVideo(r) {
  if (!r) return;
  estado.arquivo = r.arquivo;
  estado.duracao = r.duracao;
  estado.largura = r.largura;
  estado.altura = r.altura;
  estado.temAudio = r.tem_audio;
  estado.tira = r.tira || null;
  estado.tiraQtd = r.tira_qtd || 0;
  estado.tiraLargura = 0;
  if (estado.tira) {
    medirTira(estado.tira).then((largura) => {
      estado.tiraLargura = largura || 0;
      desenharSegmentos();
    });
  }
  estado.segmentos = [{ id: proximoId++, inicio: 0, fim: r.duracao }];
  estado.historico = [];
  estado.legendas = [];
  estado.posicao = 0;
  estado.escolhido = estado.segmentos[0].id;

  video.src = r.preview;
  video.load();
  $("tela").style.aspectRatio = `${r.largura} / ${r.altura}`;
  $("tela").classList.add("aparece");
  $("vazio").classList.add("some");

  ajustarZoomInicial();
  ligarBotoes(true);
  desenharTudo();
  desenharLegendas();
  if (!r.tem_audio) {
    avisar("Este vídeo não tem som — dá para cortar, mas não dá para criar legenda.", "erro");
  }
}

function ajustarZoomInicial() {
  const largura = Math.max(360, $("trilho").clientWidth - 40);
  estado.zoomCaber = Math.max(4, largura / Math.max(0.5, duracaoTotal() || estado.duracao));
  estado.zoom = estado.zoomCaber;
}

function caberNaTela() {
  if (!estado.arquivo) return;
  ajustarZoomInicial();
  $("trilho").scrollLeft = 0;
  desenharTudo();
}

function nivelDeZoom() {
  if (!estado.zoomCaber) return "100%";
  return Math.round((estado.zoom / estado.zoomCaber) * 100) + "%";
}

function ligarBotoes(ligado) {
  const ids = ["btn-salvar", "btn-play", "btn-comeco", "btn-legenda", "btn-cortar",
               "btn-apagar", "btn-ima", "btn-afastar", "btn-aproximar", "btn-caber",
               "btn-subir", "btn-descer", "btn-limpar"];
  for (const id of ids) $(id).disabled = !ligado || estado.ocupado;
  $("btn-legenda").disabled = !ligado || estado.ocupado || !estado.temAudio;
  $("btn-desfazer").disabled = !ligado || estado.ocupado || estado.historico.length === 0;
  $("btn-apagar").disabled = !ligado || estado.ocupado || estado.segmentos.length < 2;
  $("btn-limpar").disabled = !ligado || estado.ocupado || !estado.legendas.length;
  const alt = estado.estilo.altura || 0.075;
  $("btn-subir").disabled = !ligado || estado.ocupado || alt >= ALTURA_MAX - 0.001;
  $("btn-descer").disabled = !ligado || estado.ocupado || alt <= ALTURA_MIN + 0.001;
}

/* ------------------------------------------------------------- desenhar */
function desenharTudo() {
  if (window.__TESTE) mostrarDebug();
  salvarSessao();
  desenharRegua();
  desenharSegmentos();
  moverAgulha();
  atualizarRelogio();
  ligarBotoes(!!estado.arquivo);
}

function mostrarDebug() {
  let d = document.getElementById("dbg");
  if (!d) {
    d = document.createElement("div");
    d.id = "dbg";
    d.style.cssText = "position:fixed;left:6px;top:56px;z-index:99;background:#000;" +
      "color:#0f0;font:11px monospace;padding:6px;white-space:pre;max-width:330px;" +
      "border:1px solid #0f0;pointer-events:none;";
    document.body.appendChild(d);
  }
  d.textContent = "segs=" + JSON.stringify(estado.segmentos.map(
      (s) => [+s.inicio.toFixed(2), +s.fim.toFixed(2)])) +
    "\ntotal=" + duracaoTotal().toFixed(2) +
    "  pos=" + estado.posicao.toFixed(2) +
    "\nzoom=" + estado.zoom.toFixed(1) + "  hist=" + estado.historico.length +
    "\nult=" + (window.__ult || "-");
}

function desenharRegua() {
  const regua = $("regua");
  regua.innerHTML = "";
  const total = duracaoTotal();
  const largura = Math.max(total * estado.zoom, $("trilho").clientWidth);
  regua.style.width = largura + "px";
  $("pista").style.width = largura + "px";

  const passos = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
  const passo = passos.find((p) => p * estado.zoom >= 76) || 600;
  for (let t = 0; t <= total + 0.001; t += passo) {
    const marca = document.createElement("div");
    marca.className = "marca-tempo";
    marca.style.left = t * estado.zoom + "px";
    marca.textContent = fmt(t);
    regua.appendChild(marca);
  }
}

function desenharSegmentos() {
  const caixa = $("segmentos");
  caixa.innerHTML = "";
  const partidas = inicios();
  estado.segmentos.forEach((s, i) => {
    const d = s.fim - s.inicio;
    const el = document.createElement("div");
    el.className = "seg" + (s.id === estado.escolhido ? " escolhido" : "");
    el.dataset.id = s.id;
    el.style.left = partidas[i] * estado.zoom + "px";
    el.style.width = Math.max(14, d * estado.zoom) + "px";
    preencherMiniaturas(el, s, Math.max(14, d * estado.zoom),
                        partidas[i] * estado.zoom);
    const nome = document.createElement("div");
    nome.className = "seg-nome";
    nome.textContent = `${i + 1}  ·  ${fmt(d)}`;
    el.appendChild(nome);

    const esq = document.createElement("div");
    esq.className = "puxador esq";
    esq.dataset.lado = "esq";
    const dir = document.createElement("div");
    dir.className = "puxador dir";
    dir.dataset.lado = "dir";
    el.appendChild(esq);
    el.appendChild(dir);

    caixa.appendChild(el);
  });
}

/** Mede a tirinha uma vez, para saber o tamanho certo de cada miniatura. */
function medirTira(url) {
  return new Promise((pronto) => {
    const imagem = new Image();
    imagem.onload = () => pronto(imagem.naturalWidth);
    imagem.onerror = () => pronto(0);
    imagem.src = url;
  });
}

/** Enche o pedaço com miniaturas do tamanho natural, sem esticar nada.
 *  Só monta as que estão aparecendo na tela — senão, com muito zoom,
 *  seriam milhares de pedacinhos e o programa travava. */
function preencherMiniaturas(el, s, larguraPx, deslocamento) {
  if (!estado.tira || !estado.tiraLargura || !estado.tiraQtd) return;
  const largMini = estado.tiraLargura / estado.tiraQtd;
  if (largMini < 4) return;
  const quantas = Math.max(1, Math.ceil(larguraPx / largMini));
  const dur = Math.max(0.001, s.fim - s.inicio);

  const trilho = $("trilho");
  const folga = 300;
  const de = trilho.scrollLeft - deslocamento - folga;
  const ate = trilho.scrollLeft + trilho.clientWidth - deslocamento + folga;
  const k0 = Math.max(0, Math.floor(de / largMini));
  const k1 = Math.min(quantas, Math.ceil(ate / largMini));

  for (let k = k0; k < k1; k++) {
    const tempo = s.inicio + ((k * largMini) / larguraPx) * dur;
    const indice = Math.min(estado.tiraQtd - 1, Math.max(0,
      Math.round((tempo / Math.max(0.001, estado.duracao)) * (estado.tiraQtd - 1))));
    const mini = document.createElement("div");
    mini.className = "mini";
    mini.style.left = (k * largMini) + "px";
    mini.style.width = largMini + "px";
    mini.style.backgroundImage = `url("${estado.tira}")`;
    mini.style.backgroundSize = `${estado.tiraLargura}px 100%`;
    mini.style.backgroundPosition = `${-indice * largMini}px 0`;
    el.appendChild(mini);
  }
}

function moverAgulha() {
  $("agulha").style.left = (estado.posicao * estado.zoom) + "px";
}

/* Durante o arrasto, junta vários pedidos de desenho num só por quadro.
   Sem isso a tela era redesenhada dezenas de vezes por segundo e travava. */
let desenhoPedido = null;

function desenharEmBreve() {
  if (desenhoPedido) return;
  desenhoPedido = requestAnimationFrame(() => {
    desenhoPedido = null;
    desenharRegua();
    desenharSegmentos();
    moverAgulha();
    atualizarRelogio();
  });
}

function atualizarRelogio() {
  $("relogio").textContent = `${fmt(estado.posicao)} / ${fmt(duracaoTotal())}`;
  const nivel = $("zoom-nivel");
  if (nivel) nivel.textContent = nivelDeZoom();
}

/* --------------------------------------------------------------- tocar */
function aplicarPosicao() {
  const alvo = paraFonte(estado.posicao);
  if (!alvo) return;
  if (Math.abs(video.currentTime - alvo.tempo) > 0.08) {
    video.currentTime = alvo.tempo;
  }
  moverAgulha();
  atualizarRelogio();
  mostrarLegendaPreview();
}

function tocarPausar() {
  if (!estado.arquivo) return;
  if (estado.tocando) {
    video.pause();
  } else {
    if (estado.posicao >= duracaoTotal() - 0.05) estado.posicao = 0;
    aplicarPosicao();
    video.play().catch(() => {});
  }
}

video.addEventListener("play", () => {
  estado.tocando = true;
  $("ico-play").textContent = "⏸";
  $("txt-play").textContent = "PAUSAR";
  requestAnimationFrame(acompanhar);
});
video.addEventListener("pause", () => {
  estado.tocando = false;
  $("ico-play").textContent = "▶";
  $("txt-play").textContent = "TOCAR";
});

function acompanhar() {
  if (!estado.tocando) return;
  const partidas = inicios();
  const alvo = paraFonte(estado.posicao);
  if (!alvo) return;
  let i = alvo.indice;
  const s = estado.segmentos[i];
  if (!s) return;

  if (video.currentTime >= s.fim - 0.02) {
    if (i + 1 < estado.segmentos.length) {
      i += 1;
      estado.posicao = partidas[i];
      video.currentTime = estado.segmentos[i].inicio;
    } else {
      video.pause();
      estado.posicao = duracaoTotal();
      moverAgulha();
      atualizarRelogio();
      return;
    }
  } else if (video.currentTime < s.inicio - 0.25) {
    video.currentTime = s.inicio;
  } else {
    estado.posicao = partidas[i] + (video.currentTime - s.inicio);
  }
  moverAgulha();
  atualizarRelogio();
  mostrarLegendaPreview();
  garantirVisivel();
  requestAnimationFrame(acompanhar);
}

function garantirVisivel() {
  const trilho = $("trilho");
  const x = estado.posicao * estado.zoom;
  if (x < trilho.scrollLeft + 40 || x > trilho.scrollLeft + trilho.clientWidth - 60) {
    trilho.scrollLeft = Math.max(0, x - trilho.clientWidth * 0.45);
  }
}

/* ----------------------------------------------------- legenda no preview */
function mostrarLegendaPreview() {
  const caixa = $("legenda-preview");
  const atual = estado.legendas.find(
    (l) => estado.posicao >= l.inicio - 0.02 && estado.posicao <= l.fim + 0.02);
  if (!atual) { caixa.textContent = ""; return; }
  const fatores = { medio: 0.048, grande: 0.062, gigante: 0.082 };
  const alturaTela = video.clientHeight || 360;
  caixa.style.fontSize = (alturaTela * (fatores[estado.estilo.tamanho] || 0.062)) + "px";
  caixa.style.bottom = ((estado.estilo.altura || 0.075) * 100).toFixed(1) + "%";
  caixa.className = "legenda-preview" + (estado.estilo.cor === "amarela" ? " amarela" : "");
  caixa.textContent = estado.estilo.maiusculas
    ? atual.texto.toUpperCase() : atual.texto;
  marcarFalaAtiva(atual);
}

/* ------------------------------------------------- altura e limpeza da legenda */
const ALTURA_MIN = 0.02;
const ALTURA_MAX = 0.80;
const ALTURA_PASSO = 0.045;

function nomeDaAltura(v) {
  if (v < 0.09) return "(embaixo)";
  if (v < 0.22) return "(um pouco acima)";
  if (v < 0.42) return "(no meio de baixo)";
  if (v < 0.60) return "(no meio)";
  if (v < 0.72) return "(bem em cima)";
  return "(no alto)";
}

function mudarAltura(passo) {
  if (!estado.arquivo) return;
  const atual = estado.estilo.altura || 0.075;
  estado.estilo.altura = Math.min(ALTURA_MAX, Math.max(ALTURA_MIN, atual + passo));
  $("altura-nome").textContent = nomeDaAltura(estado.estilo.altura);
  $("btn-subir").disabled = estado.ocupado || estado.estilo.altura >= ALTURA_MAX - 0.001;
  $("btn-descer").disabled = estado.ocupado || estado.estilo.altura <= ALTURA_MIN + 0.001;
  mostrarLegendaPreview();
  salvarSessao();
  if (!estado.legendas.length) {
    avisar("A altura vale para quando a legenda estiver pronta.", "");
  }
}

/** Pergunta simples, com dois botões grandes. Devolve true/false. */
function perguntar(titulo, texto, textoSim, textoNao) {
  return new Promise((responder) => {
    $("pergunta-titulo").textContent = titulo;
    $("pergunta-texto").textContent = texto;
    $("pergunta-sim").querySelector("span").textContent = textoSim || "SIM";
    $("pergunta-nao").querySelector("span").textContent = textoNao || "NÃO";
    $("pergunta").classList.remove("escondido");
    const fechar = (resposta) => {
      $("pergunta").classList.add("escondido");
      $("pergunta-sim").onclick = null;
      $("pergunta-nao").onclick = null;
      responder(resposta);
    };
    $("pergunta-sim").onclick = () => fechar(true);
    $("pergunta-nao").onclick = () => fechar(false);
  });
}

async function apagarTodasLegendas() {
  if (estado.ocupado || !estado.legendas.length) return;
  const quantas = estado.legendas.length;
  const certeza = await perguntar(
    "Apagar todas as legendas?",
    "Vão sumir as " + quantas + " falas, inclusive as que você corrigiu à mão. " +
    "Depois é só apertar CRIAR LEGENDA AUTOMÁTICA para fazer tudo de novo.",
    "SIM, APAGAR TUDO", "NÃO, DEIXA ASSIM");
  if (!certeza) return;
  estado.legendas = [];
  desenharLegendas();
  mostrarLegendaPreview();
  ligarBotoes(!!estado.arquivo);
  avisar("Legendas apagadas.", "bom");
}

/* ------------------------------------------------------------ ferramentas */
function pontosDeIma() {
  const pontos = [0, duracaoTotal()];
  const partidas = inicios();
  partidas.forEach((p) => pontos.push(p));
  pontos.push(estado.posicao);
  return pontos;
}

function grudar(t) {
  if (!estado.ima) return t;
  const limite = 9 / estado.zoom;   // ~9 pixels
  let melhor = t, dist = limite;
  for (const p of pontosDeIma()) {
    const d = Math.abs(p - t);
    if (d < dist) { dist = d; melhor = p; }
  }
  return melhor;
}

function cortarAqui() {
  window.__ult = "cortarAqui";
  if (!estado.arquivo || estado.ocupado) return;
  const alvo = paraFonte(estado.posicao);
  if (!alvo) return;
  const s = estado.segmentos[alvo.indice];
  const minimo = 0.15;
  if (alvo.tempo - s.inicio < minimo || s.fim - alvo.tempo < minimo) {
    avisar("Mova a agulha para o meio de um pedaço antes de cortar.", "erro");
    return;
  }
  guardarHistorico();
  const novo = { id: proximoId++, inicio: alvo.tempo, fim: s.fim };
  s.fim = alvo.tempo;
  estado.segmentos.splice(alvo.indice + 1, 0, novo);
  estado.escolhido = novo.id;
  desenharTudo();
  avisar("Cortado! Agora são " + estado.segmentos.length + " pedaços.", "bom");
}

function apagarPedaco() {
  window.__ult = "apagarPedaco";
  if (estado.segmentos.length < 2 || estado.ocupado) return;
  const i = estado.segmentos.findIndex((s) => s.id === estado.escolhido);
  if (i < 0) { avisar("Clique em um pedaço da linha do tempo primeiro.", "erro"); return; }
  guardarHistorico();
  estado.segmentos.splice(i, 1);
  estado.escolhido = (estado.segmentos[Math.min(i, estado.segmentos.length - 1)] || {}).id;
  estado.posicao = Math.min(estado.posicao, duracaoTotal());
  estado.legendas = [];
  desenharTudo();
  desenharLegendas();
  aplicarPosicao();
  avisar("Pedaço apagado.", "bom");
}

function desfazer() {
  window.__ult = "desfazer";
  if (!estado.historico.length || estado.ocupado) return;
  estado.segmentos = JSON.parse(estado.historico.pop());
  estado.posicao = Math.min(estado.posicao, duracaoTotal());
  desenharTudo();
  aplicarPosicao();
  avisar("Desfeito.", "bom");
}

function trocarIma() {
  estado.ima = !estado.ima;
  $("btn-ima").classList.toggle("ligado", estado.ima);
  $("txt-ima").textContent = estado.ima ? "ÍMÃ LIGADO" : "ÍMÃ DESLIGADO";
  $("altura-nome").textContent = nomeDaAltura(estado.estilo.altura || 0.075);
  $("op-caixa").querySelectorAll(".op").forEach((o) => {
    o.classList.toggle("ativo",
      (o.dataset.valor === "alta") === !!estado.estilo.maiusculas);
  });
}

/** Dá zoom mantendo parado o ponto que está debaixo do mouse (ou a agulha). */
function mudarZoom(fator, ancoraCliente) {
  if (!estado.arquivo) return;
  const trilho = $("trilho");
  const caixa = $("segmentos").getBoundingClientRect();
  const x = (ancoraCliente === undefined)
    ? estado.posicao * estado.zoom
    : ancoraCliente - caixa.left;
  const tempoFixo = x / estado.zoom;
  const ondeNaTela = x - trilho.scrollLeft;

  const minimo = Math.max(3, estado.zoomCaber * 0.5);
  estado.zoom = Math.max(minimo, Math.min(estado.zoomCaber * 40, estado.zoom * fator));
  desenharTudo();
  trilho.scrollLeft = Math.max(0, tempoFixo * estado.zoom - ondeNaTela);
}

/* ------------------------------------------------- arrastar na linha do tempo */
let arraste = null;

function posicaoNoTrilho(evento) {
  const caixa = $("segmentos").getBoundingClientRect();
  return evento.clientX - caixa.left;
}

function mostrarGuia(x) {
  let guia = document.querySelector(".guia-ima");
  if (x === null) { if (guia) guia.remove(); return; }
  if (!guia) {
    guia = document.createElement("div");
    guia.className = "guia-ima";
    $("segmentos").appendChild(guia);
  }
  guia.style.left = x + "px";
}

$("segmentos").addEventListener("pointerdown", (evento) => {
  if (estado.ocupado) return;
  const alvo = evento.target.closest(".seg");
  if (!alvo) return;
  const id = Number(alvo.dataset.id);
  const lado = evento.target.dataset.lado || null;
  estado.escolhido = id;
  desenharSegmentos();
  ligarBotoes(true);

  const indice = estado.segmentos.findIndex((s) => s.id === id);
  const s = estado.segmentos[indice];
  arraste = {
    id, lado, indice,
    xInicial: posicaoNoTrilho(evento),
    inicioOrig: s.inicio,
    fimOrig: s.fim,
    partida: inicios()[indice],
    moveu: false,
  };
  $("segmentos").setPointerCapture(evento.pointerId);
  evento.preventDefault();
});

$("segmentos").addEventListener("pointermove", (evento) => {
  if (!arraste) return;
  const x = posicaoNoTrilho(evento);
  const dx = x - arraste.xInicial;
  if (Math.abs(dx) > 4) arraste.moveu = true;
  const s = estado.segmentos.find((v) => v.id === arraste.id);
  if (!s) return;

  if (arraste.lado) {
    encurtar(s, dx);
  } else {
    arrastarPedaco(s, dx, x);
  }
});

function encurtar(s, dx) {
  window.__ult = "encurtar:" + arraste.lado;
  const dt = dx / estado.zoom;
  const minimo = 0.2;
  if (arraste.lado === "esq") {
    let novo = Math.min(Math.max(0, arraste.inicioOrig + dt), s.fim - minimo);
    if (estado.ima) {
      const direita = arraste.partida + (s.fim - novo);
      const grudado = grudar(direita);
      if (Math.abs(grudado - direita) > 0.0001) {
        novo = Math.max(0, Math.min(s.fim - minimo, s.fim - (grudado - arraste.partida)));
        mostrarGuia(grudado * estado.zoom);
      } else { mostrarGuia(null); }
    }
    s.inicio = novo;
  } else {
    let novo = Math.max(Math.min(estado.duracao, arraste.fimOrig + dt), s.inicio + minimo);
    if (estado.ima) {
      const direita = arraste.partida + (novo - s.inicio);
      const grudado = grudar(direita);
      if (Math.abs(grudado - direita) > 0.0001) {
        novo = Math.min(estado.duracao, Math.max(s.inicio + minimo,
               s.inicio + (grudado - arraste.partida)));
        mostrarGuia(grudado * estado.zoom);
      } else { mostrarGuia(null); }
    }
    s.fim = novo;
  }
  desenharEmBreve();
}

function arrastarPedaco(s, dx, x) {
  window.__ult = "arrastar";
  const el = $("segmentos").querySelector(`.seg[data-id="${s.id}"]`);
  if (!el) return;
  el.classList.add("arrastando");
  el.style.left = (arraste.partida * estado.zoom + dx) + "px";

  const destino = indiceDestino(x);
  arraste.destino = destino;
  const outros = estado.segmentos.filter((v) => v.id !== s.id);
  let antes = 0;
  for (let i = 0; i < destino; i++) antes += (outros[i].fim - outros[i].inicio);
  let fantasma = document.querySelector(".fantasma");
  if (!fantasma) {
    fantasma = document.createElement("div");
    fantasma.className = "fantasma";
    $("segmentos").appendChild(fantasma);
  }
  fantasma.style.left = antes * estado.zoom + "px";
  fantasma.style.width = Math.max(14, (s.fim - s.inicio) * estado.zoom) + "px";
  if (estado.ima) mostrarGuia(antes * estado.zoom);
}

function indiceDestino(x) {
  const s = estado.segmentos.find((v) => v.id === arraste.id);
  const largura = (s.fim - s.inicio) * estado.zoom;
  const centro = x - arraste.xInicial + arraste.partida * estado.zoom + largura / 2;
  const outros = estado.segmentos.filter((v) => v.id !== arraste.id);
  let acc = 0;
  for (let i = 0; i < outros.length; i++) {
    const d = (outros[i].fim - outros[i].inicio) * estado.zoom;
    if (centro < acc + d / 2) return i;
    acc += d;
  }
  return outros.length;
}

function soltar() {
  window.__ult = "soltar";
  if (!arraste) return;
  const guardado = arraste;
  arraste = null;
  document.querySelectorAll(".fantasma").forEach((n) => n.remove());
  mostrarGuia(null);

  if (guardado.moveu) {
    const s = estado.segmentos.find((v) => v.id === guardado.id);
    if (guardado.lado) {
      const antes = JSON.stringify(estado.segmentos.map((v) =>
        v.id === guardado.id ? { ...v, inicio: guardado.inicioOrig, fim: guardado.fimOrig } : v));
      estado.historico.push(antes);
      estado.legendas = [];
      desenharLegendas();
    } else if (typeof guardado.destino === "number" && s) {
      guardarHistorico();
      const i = estado.segmentos.findIndex((v) => v.id === guardado.id);
      estado.segmentos.splice(i, 1);
      estado.segmentos.splice(guardado.destino, 0, s);
      estado.legendas = [];
      desenharLegendas();
    }
  }
  estado.posicao = Math.min(estado.posicao, duracaoTotal());
  desenharTudo();
  aplicarPosicao();
}

$("segmentos").addEventListener("pointerup", soltar);
$("segmentos").addEventListener("pointercancel", soltar);

/* --------------------------------------------------------- mover a agulha */
let puxandoAgulha = false;

function agulhaPara(evento) {
  window.__ult = "agulha";
  const caixa = $("segmentos").getBoundingClientRect();
  let t = (evento.clientX - caixa.left) / estado.zoom;
  t = Math.max(0, Math.min(duracaoTotal(), t));
  if (estado.ima) {
    const pontos = [0, duracaoTotal(), ...inicios()];
    const limite = 9 / estado.zoom;
    for (const p of pontos) {
      if (Math.abs(p - t) < limite) { t = p; break; }
    }
  }
  estado.posicao = t;
  aplicarPosicao();
}

["regua", "trilho"].forEach((id) => {
  $(id).addEventListener("pointerdown", (evento) => {
    if (estado.ocupado || !estado.arquivo) return;
    if (evento.target.closest(".seg")) return;
    puxandoAgulha = true;
    agulhaPara(evento);
  });
});
window.addEventListener("pointermove", (evento) => {
  if (puxandoAgulha) agulhaPara(evento);
});

let rolagemPedida = null;
$("trilho").addEventListener("scroll", () => {
  if (arraste || rolagemPedida) return;
  rolagemPedida = requestAnimationFrame(() => {
    rolagemPedida = null;
    desenharSegmentos();
  });
});
window.addEventListener("pointerup", () => { puxandoAgulha = false; });

/* -------------------------------------------------------------- legendas */
function desenharLegendas() {
  salvarSessao();
  const limpar = $("btn-limpar");
  if (limpar) limpar.disabled = estado.ocupado || !estado.legendas.length;
  const lista = $("lista-legendas");
  lista.innerHTML = "";
  if (!estado.legendas.length) {
    const vazia = document.createElement("div");
    vazia.className = "lista-vazia";
    vazia.innerHTML = "Ainda não há legenda.<br>Use o botão verde acima.";
    lista.appendChild(vazia);
    return;
  }
  estado.legendas.forEach((fala, i) => {
    const el = document.createElement("div");
    el.className = "fala";
    el.dataset.i = i;
    const tempo = document.createElement("div");
    tempo.className = "fala-tempo";
    tempo.textContent = `${fmt(fala.inicio)} – ${fmt(fala.fim)}`;
    const texto = document.createElement("div");
    texto.className = "fala-texto";
    texto.textContent = fala.texto;
    el.appendChild(tempo);
    el.appendChild(texto);
    el.addEventListener("click", () => editarFala(i, el, texto));
    lista.appendChild(el);
  });
}

function editarFala(i, el, texto) {
  if (el.querySelector(".fala-edit")) return;
  estado.posicao = Math.min(duracaoTotal(), estado.legendas[i].inicio);
  aplicarPosicao();

  const area = document.createElement("textarea");
  area.className = "fala-edit";
  area.rows = 2;
  area.value = estado.legendas[i].texto;
  texto.replaceWith(area);
  area.focus();
  area.setSelectionRange(area.value.length, area.value.length);

  const terminar = () => {
    estado.legendas[i].texto = area.value.trim();
    desenharLegendas();
    mostrarLegendaPreview();
  };
  area.addEventListener("blur", terminar);
  area.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); area.blur(); }
    if (e.key === "Escape") { area.value = estado.legendas[i].texto; area.blur(); }
  });
}

function marcarFalaAtiva(atual) {
  const i = estado.legendas.indexOf(atual);
  document.querySelectorAll(".fala").forEach((n) => {
    n.classList.toggle("tocando", Number(n.dataset.i) === i);
  });
}

/* ---------------------------------------------------------- tarefas longas */
function abrirTrabalho(titulo, texto) {
  $("trabalho-titulo").textContent = titulo;
  $("trabalho-texto").textContent = texto || "";
  $("barra-dentro").style.width = "0%";
  $("trabalhando").classList.remove("escondido");
}

function fecharTrabalho() {
  $("trabalhando").classList.add("escondido");
}

function acompanharTarefa(aoTerminar) {
  estado.ocupado = true;
  ligarBotoes(!!estado.arquivo);
  const relogio = setInterval(async () => {
    let p;
    try { p = await ponte.chamar("progresso"); } catch (e) { return; }
    if (!p) return;
    if (p.texto) $("trabalho-texto").textContent = p.texto;
    if (typeof p.quanto === "number") {
      $("barra-dentro").style.width = (p.quanto * 100).toFixed(1) + "%";
    }
    if (p.pronto) {
      clearInterval(relogio);
      estado.ocupado = false;
      fecharTrabalho();
      ligarBotoes(!!estado.arquivo);
      if (p.erro) { avisar(p.erro, "erro"); return; }
      if (p.cancelado) { avisar("Parado.", ""); return; }
      aoTerminar(p.resultado);
    }
  }, 300);
}

function pedacosParaPython() {
  return estado.segmentos.map((s) => ({ inicio: s.inicio, fim: s.fim }));
}

async function criarLegenda() {
  if (!estado.arquivo || estado.ocupado || !estado.temAudio) return;
  if (video && !video.paused) video.pause();
  abrirTrabalho("Criando a legenda", "Preparando...");
  const r = await ponte.chamar("criar_legenda", pedacosParaPython(), estado.estilo.idioma);
  if (!r || !r.ok) {
    fecharTrabalho();
    avisar((r && r.erro) || "Não consegui criar a legenda.", "erro");
    return;
  }
  acompanharTarefa((resultado) => {
    estado.legendas = (resultado || []).map((l) => ({
      inicio: l.inicio, fim: l.fim, texto: l.texto }));
    desenharLegendas();
    mostrarLegendaPreview();
    if (!estado.legendas.length) {
      avisar("Não consegui entender nenhuma fala neste vídeo.", "erro");
    } else {
      avisar(`Legenda pronta: ${estado.legendas.length} falas.`, "bom");
    }
  });
}

async function salvarVideo() {
  if (!estado.arquivo || estado.ocupado) return;
  if (video && !video.paused) video.pause();
  abrirTrabalho("Salvando o vídeo", "Montando...");
  const r = await ponte.chamar("salvar", pedacosParaPython(), estado.legendas, estado.estilo);
  if (!r || !r.ok) {
    fecharTrabalho();
    avisar((r && r.erro) || "Não consegui salvar.", "erro");
    return;
  }
  acompanharTarefa((caminho) => {
    avisar("Pronto! Vídeo salvo: " + caminho, "bom");
  });
}


/* ------------------------------------------------- guardar e voltar depois */
let tempoSessao = null;

function retratoDaSessao() {
  return {
    segmentos: estado.segmentos.map((s) => ({ inicio: s.inicio, fim: s.fim })),
    legendas: estado.legendas,
    posicao: estado.posicao,
    estilo: estado.estilo,
    zoom: estado.zoom,
    ima: estado.ima,
  };
}

function salvarSessao(agora) {
  if (!estado.arquivo) return Promise.resolve();
  if (!(window.pywebview && window.pywebview.api)) return Promise.resolve();
  if (agora) return ponte.chamar("guardar_sessao", retratoDaSessao());
  clearTimeout(tempoSessao);
  tempoSessao = setTimeout(
    () => ponte.chamar("guardar_sessao", retratoDaSessao()), 400);
  return Promise.resolve();
}

function aplicarOpcoesNaTela() {
  const pares = [["op-tamanho", "tamanho"], ["op-cor", "cor"],
                 ["op-idioma", "idioma"]];
  for (const [id, chave] of pares) {
    $(id).querySelectorAll(".op").forEach((o) => {
      o.classList.toggle("ativo", o.dataset.valor === estado.estilo[chave]);
    });
  }
  $("btn-ima").classList.toggle("ligado", estado.ima);
  $("txt-ima").textContent = estado.ima ? "ÍMÃ LIGADO" : "ÍMÃ DESLIGADO";
  $("altura-nome").textContent = nomeDaAltura(estado.estilo.altura || 0.075);
  $("op-caixa").querySelectorAll(".op").forEach((o) => {
    o.classList.toggle("ativo",
      (o.dataset.valor === "alta") === !!estado.estilo.maiusculas);
  });
}

async function restaurar() {
  let r;
  try { r = await ponte.chamar("estado_atual"); } catch (e) { return; }
  if (!r || !r.video) return;
  aplicarVideo(r.video);
  const s = r.sessao;
  if (!s || !s.segmentos || !s.segmentos.length) return;
  estado.segmentos = s.segmentos.map(
    (x) => ({ id: proximoId++, inicio: x.inicio, fim: x.fim }));
  estado.legendas = s.legendas || [];
  if (s.estilo) estado.estilo = s.estilo;
  if (s.zoom) estado.zoom = s.zoom;
  estado.ima = s.ima !== false;
  estado.escolhido = estado.segmentos[0].id;
  estado.posicao = Math.min(s.posicao || 0, duracaoTotal());
  aplicarOpcoesNaTela();
  desenharTudo();
  desenharLegendas();
  aplicarPosicao();
}

/* --------------------------------- modo dev: recarrega quando eu editar */
let versaoDaTela = null;

async function olharMudancas() {
  let r;
  try {
    r = await fetch("/__versao", { cache: "no-store" }).then((x) => x.json());
  } catch (e) { return; }
  if (!r || !r.dev) return;
  versaoDaTela = r.versao;
  marcarModoDev();
  setInterval(async () => {
    try {
      const novo = await fetch("/__versao", { cache: "no-store" })
        .then((x) => x.json());
      if (novo.versao !== versaoDaTela) {
        await salvarSessao(true);
        location.reload();
      }
    } catch (e) { /* servidor reiniciando, tenta de novo */ }
  }, 1200);
}

function marcarModoDev() {
  if (document.getElementById("selo-dev")) return;
  const selo = document.createElement("div");
  selo.id = "selo-dev";
  selo.textContent = "MODO DEV";
  selo.style.cssText = "position:fixed;right:10px;bottom:8px;z-index:70;" +
    "background:#F0B429;color:#14161C;font:700 11px/1 -apple-system,sans-serif;" +
    "padding:5px 9px;border-radius:6px;letter-spacing:.7px;pointer-events:none;" +
    "opacity:.9;";
  document.body.appendChild(selo);
}

/* ------------------------------------------------------------------ início */
function ligarOpcoes(id, chave) {
  $(id).addEventListener("click", (evento) => {
    const botao = evento.target.closest(".op");
    if (!botao) return;
    $(id).querySelectorAll(".op").forEach((o) => o.classList.remove("ativo"));
    botao.classList.add("ativo");
    estado.estilo[chave] = botao.dataset.valor;
    mostrarLegendaPreview();
  });
}

function iniciar() {
  $("btn-abrir").addEventListener("click", abrirVideo);
  $("btn-salvar").addEventListener("click", salvarVideo);
  $("btn-legenda").addEventListener("click", criarLegenda);
  $("btn-play").addEventListener("click", tocarPausar);
  $("btn-comeco").addEventListener("click", () => {
    estado.posicao = 0; aplicarPosicao(); $("trilho").scrollLeft = 0;
  });
  $("btn-cortar").addEventListener("click", cortarAqui);
  $("btn-apagar").addEventListener("click", apagarPedaco);
  $("btn-desfazer").addEventListener("click", desfazer);
  $("btn-ima").addEventListener("click", trocarIma);
  $("btn-aproximar").addEventListener("click", () => mudarZoom(1.4));
  $("btn-afastar").addEventListener("click", () => mudarZoom(1 / 1.4));
  $("btn-caber").addEventListener("click", caberNaTela);
  $("btn-subir").addEventListener("click", () => mudarAltura(ALTURA_PASSO));
  $("btn-descer").addEventListener("click", () => mudarAltura(-ALTURA_PASSO));
  $("btn-limpar").addEventListener("click", apagarTodasLegendas);

  // zoom com a rodinha do mouse (Ctrl) ou com a pinça do trackpad
  $("trilho").addEventListener("wheel", (e) => {
    if (!estado.arquivo) return;
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      mudarZoom(e.deltaY < 0 ? 1.13 : 1 / 1.13, e.clientX);
    }
  }, { passive: false });
  $("btn-parar").addEventListener("click", () => ponte.chamar("parar"));

  ligarOpcoes("op-tamanho", "tamanho");
  ligarOpcoes("op-cor", "cor");
  ligarOpcoes("op-idioma", "idioma");
  $("op-caixa").addEventListener("click", (evento) => {
    const botao = evento.target.closest(".op");
    if (!botao) return;
    $("op-caixa").querySelectorAll(".op").forEach((o) => o.classList.remove("ativo"));
    botao.classList.add("ativo");
    estado.estilo.maiusculas = botao.dataset.valor === "alta";
    mostrarLegendaPreview();
    salvarSessao();
  });

  document.addEventListener("keydown", (e) => {
    if (e.target.matches("textarea, input")) return;
    if (e.code === "Space") { e.preventDefault(); tocarPausar(); }
    if ((e.metaKey || e.ctrlKey) && (e.key === "r" || e.key === "R")) {
      e.preventDefault();
      salvarSessao(true).then(() => location.reload());
    }
    if (e.key === "s" || e.key === "S") cortarAqui();
    if (e.key === "Delete" || e.key === "Backspace") apagarPedaco();
    if (e.key === "+" || e.key === "=") mudarZoom(1.4);
    if (e.key === "-" || e.key === "_") mudarZoom(1 / 1.4);
    if (e.key === "0") caberNaTela();
  });

  window.addEventListener("resize", () => {
    desenharTudo();
    mostrarLegendaPreview();
  });
  video.addEventListener("loadedmetadata", () => {
    aplicarPosicao();
    mostrarLegendaPreview();
  });
  video.addEventListener("seeked", mostrarLegendaPreview);

  desenharTudo();
  olharMudancas();
  if (window.pywebview && window.pywebview.api) {
    restaurar();
  } else {
    window.addEventListener("pywebviewready", restaurar);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", iniciar);
} else {
  iniciar();
}

/* --------------------------------------------------- teste automático (dev) */
function rodarTestes() {
  const saida = document.createElement("pre");
  saida.id = "saida-teste";
  saida.style.cssText = "position:fixed;inset:0;z-index:999;background:#000;color:#0f0;" +
    "font:12px monospace;padding:16px;overflow:auto;white-space:pre-wrap;";
  document.body.appendChild(saida);
  const linhas = [];
  let falhas = 0;

  const seg = () => estado.segmentos.map(
    (s) => [+s.inicio.toFixed(2), +s.fim.toFixed(2)]);

  function conferir(nome, obtido, esperado) {
    const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
    if (!ok) falhas++;
    linhas.push((ok ? "OK   " : "FALHA") + "  " + nome +
      "\n        obtido=" + JSON.stringify(obtido) +
      (ok ? "" : "\n        esperad=" + JSON.stringify(esperado)));
  }

  function conferirVerdade(nome, cond, extra) {
    if (!cond) falhas++;
    linhas.push((cond ? "OK   " : "FALHA") + "  " + nome + "\n        " + extra);
  }

  function esperar(cond, ms) {
    const limite = Date.now() + (ms || 5000);
    return new Promise((pronto) => {
      const olhar = () => {
        if (cond()) return pronto(true);
        if (Date.now() > limite) return pronto(false);
        setTimeout(olhar, 60);
      };
      olhar();
    });
  }

  (async () => {
    try {
      abrirVideo();
      const chegou = await esperar(() => estado.arquivo && estado.segmentos.length);
      conferirVerdade("abrir o vídeo", chegou, "arquivo=" + estado.arquivo);
      conferir("começa com 1 pedaço inteiro", seg(), [[0, 14.67]]);

      estado.posicao = 6; cortarAqui();
      conferir("cortar em 6s", seg(), [[0, 6], [6, 14.67]]);
      conferir("o total não muda ao cortar", +duracaoTotal().toFixed(2), 14.67);

      estado.posicao = 3; cortarAqui();
      conferir("cortar de novo em 3s", seg(), [[0, 3], [3, 6], [6, 14.67]]);

      conferir("paraFonte(0)", paraFonte(0), { indice: 0, tempo: 0 });
      conferir("paraFonte(4)", paraFonte(4), { indice: 1, tempo: 4 });
      conferir("paraFonte(8)", paraFonte(8), { indice: 2, tempo: 8 });

      estado.escolhido = estado.segmentos[1].id; apagarPedaco();
      conferir("apagar o pedaço do meio", seg(), [[0, 3], [6, 14.67]]);
      conferir("o total encolhe", +duracaoTotal().toFixed(2), 11.67);
      conferir("paraFonte(4) pula o buraco", paraFonte(4), { indice: 1, tempo: 7 });

      desfazer();
      conferir("desfazer traz os 3 de volta", seg(), [[0, 3], [3, 6], [6, 14.67]]);

      const primeiro = estado.segmentos[0];
      arraste = { id: primeiro.id, lado: null, indice: 0, xInicial: 0,
                  inicioOrig: primeiro.inicio, fimOrig: primeiro.fim,
                  partida: 0, moveu: true, destino: 2 };
      soltar();
      conferir("arrastar o 1º para o fim", seg(), [[3, 6], [6, 14.67], [0, 3]]);

      estado.ima = false;
      const a1 = estado.segmentos[0];
      arraste = { id: a1.id, lado: "dir", indice: 0, xInicial: 0,
                  inicioOrig: a1.inicio, fimOrig: a1.fim, partida: 0, moveu: true };
      encurtar(a1, -1 * estado.zoom);
      conferir("encurtar 1s pela direita", +estado.segmentos[0].fim.toFixed(2), 5);
      soltar();

      const a2 = estado.segmentos[0];
      arraste = { id: a2.id, lado: "esq", indice: 0, xInicial: 0,
                  inicioOrig: a2.inicio, fimOrig: a2.fim, partida: 0, moveu: true };
      encurtar(a2, 0.5 * estado.zoom);
      conferir("encurtar 0,5s pela esquerda", +estado.segmentos[0].inicio.toFixed(2), 3.5);
      soltar();

      const a3 = estado.segmentos[0];
      arraste = { id: a3.id, lado: "esq", indice: 0, xInicial: 0,
                  inicioOrig: a3.inicio, fimOrig: a3.fim, partida: 0, moveu: true };
      encurtar(a3, 999 * estado.zoom);
      conferir("não deixa a borda inverter",
               +(estado.segmentos[0].fim - estado.segmentos[0].inicio).toFixed(2), 0.2);
      soltar();

      // ---------------- desempenho da linha do tempo ----------------
      await esperar(() => estado.tiraLargura > 0, 3000);
      conferirVerdade("tirinha medida", estado.tiraLargura > 0,
                      estado.tiraLargura + "px em " + estado.tiraQtd + " miniaturas");

      estado.segmentos = [{ id: proximoId++, inicio: 0, fim: 14.67 }];
      caberNaTela();
      const nCaber = document.querySelectorAll(".mini").length;
      conferirVerdade("vídeo inteiro na tela", nCaber > 0 && nCaber < 200,
                      nCaber + " miniaturas");

      estado.zoom = estado.zoomCaber * 40;
      $("trilho").scrollLeft = 0;
      desenharSegmentos();
      const nMax = document.querySelectorAll(".mini").length;
      conferirVerdade("zoom de 40x continua leve (sem o conserto seriam ~1000)",
                      nMax > 0 && nMax < 250, nMax + " miniaturas");

      const t0 = performance.now();
      for (let i = 0; i < 30; i++) desenharSegmentos();
      const porQuadro = (performance.now() - t0) / 30;
      conferirVerdade("rápido o bastante para arrastar sem travar",
                      porQuadro < 16,
                      porQuadro.toFixed(2) + " ms por quadro (limite 16 = 60 fps)");
    } catch (erro) {
      falhas++;
      linhas.push("ERRO NO TESTE: " + erro + "\n" + (erro.stack || ""));
    }
    linhas.push("");
    linhas.push(falhas === 0 ? ">>> TODOS OS TESTES PASSARAM" : ">>> " + falhas + " FALHA(S)");
    saida.textContent = linhas.join("\n");
  })();
}

if (location.search.indexOf("teste=1") >= 0 ||
    location.hash.indexOf("teste") >= 0 || window.__TESTE) {
  window.addEventListener("load", rodarTestes);
}
