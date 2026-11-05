// Convite pelo WhatsApp: envia o link do app com os cards de como instalar.
// Onde o celular compartilha imagens, abre a janela de compartilhar, em que a pessoa escolhe o
// WhatsApp. Nos outros casos, abre o WhatsApp só com o texto, com os cards como links.
import { APP_URL } from "../config.js";
import { $, avisarUso } from "./comum.js";

const CARTOES = ["instalar-android.png", "instalar-iphone.png"];

const TEXTO = `Olá! Conheça o Assist Cal, calculadora zootécnica para leite e corte que funciona no celular, até sem internet.

Acesse: ${APP_URL}`;

const TEXTO_COM_LINKS = `${TEXTO}

Como instalar no Android: ${APP_URL}convite/${CARTOES[0]}
Como instalar no iPhone: ${APP_URL}convite/${CARTOES[1]}`;

// As imagens são lidas antes do toque: o Safari só libera o compartilhar logo depois do toque.
let arquivos = null;

async function carregarCartoes() {
  if (!navigator.canShare) return;
  try {
    const lista = await Promise.all(
      CARTOES.map(async (nome) => {
        const resposta = await fetch(`convite/${nome}`);
        if (!resposta.ok) throw new Error(nome);
        return new File([await resposta.blob()], nome, { type: "image/png" });
      }),
    );
    if (navigator.canShare({ files: lista })) arquivos = lista;
  } catch {
    // Sem as imagens, o convite segue só com o texto.
  }
}

function abrirWhatsApp() {
  const url = `https://wa.me/?text=${encodeURIComponent(TEXTO_COM_LINKS)}`;
  if (!window.open(url, "_blank")) location.href = url;
}

async function convidar() {
  if (arquivos) {
    try {
      await navigator.share({ files: arquivos, text: TEXTO });
      avisarUso("convite", "enviar");
      return;
    } catch (erro) {
      if (erro.name === "AbortError") return; // a pessoa fechou a janela de compartilhar
    }
  }
  abrirWhatsApp();
  avisarUso("convite", "enviar");
}

carregarCartoes();
$("btnConvidar").addEventListener("click", convidar);
