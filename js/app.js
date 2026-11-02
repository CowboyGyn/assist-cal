// Ponto de entrada: rotas por hash, indicador de conexão e service worker.
// Cada módulo cuida do seu formulário e resultado.
import { $ } from "./ui/comum.js";
import { TERMOS_VERSAO } from "./config.js";
import {
  iniciarLogin,
  precisaLogin,
  precisaAceite,
  aceitarTermos,
  enviarAceitePendente,
  sessaoAtual,
  sair,
} from "./ui/login.js";
import { registrarUso, enviarUso, versaoApp } from "./uso.js";
import "./ui/rebanho.js";
import "./ui/previsao.js";
import "./ui/corte.js";
import "./ui/volumoso.js";
import "./ui/agio.js";
import "./ui/capacidade.js";
import "./ui/silagem.js";
import "./ui/convite.js";

const ROTAS = {
  "": { tela: "tela-inicio", titulo: "ATeG Cal" },
  login: { tela: "tela-login", titulo: "ATeG Cal" },
  "rebanho-leite": { tela: "tela-rebanho-leite", titulo: "Rebanho ideal — leite" },
  "previsao-leite": { tela: "tela-previsao-leite", titulo: "Previsão de leite" },
  "rebanho-corte": { tela: "tela-rebanho-corte", titulo: "Rebanho ideal — corte" },
  "volumoso-seca": { tela: "tela-volumoso-seca", titulo: "Volumoso para a seca" },
  agio: { tela: "tela-agio", titulo: "Ágio de animais" },
  "capacidade-suporte": { tela: "tela-capacidade-suporte", titulo: "Capacidade de suporte" },
  "estoque-silagem": { tela: "tela-estoque-silagem", titulo: "Estoque de silagem" },
  termos: { tela: "tela-termos", titulo: "Termos e privacidade" },
};

// ---------- Rotas ----------

let appContado = false;

function contarAbertura(rota) {
  if (!appContado) {
    appContado = true;
    registrarUso("app", "abrir");
  }
  if (rota && rota !== "login" && ROTAS[rota]) registrarUso(rota, "abrir");
}

function navegar() {
  const rota = location.hash.replace(/^#\/?/, "");
  // Os termos abrem sempre (inclusive antes do login). Sem sessão, as outras rotas mostram o login;
  // com sessão sem aceite, mostram os termos para aceitar. Depois disso, volta para a rota pedida.
  const aceite = !precisaLogin() && precisaAceite();
  let destino;
  if (rota === "termos" || aceite) destino = ROTAS.termos;
  else if (precisaLogin()) destino = ROTAS.login;
  else destino = (rota !== "login" && ROTAS[rota]) || ROTAS[""];
  if (destino !== ROTAS.login && destino !== ROTAS.termos) contarAbertura(rota);

  $("avisoAceite").hidden = !aceite;
  $("formAceite").hidden = !aceite;
  $("btnFecharTermos").hidden = aceite;
  for (const tela of document.querySelectorAll(".tela")) {
    tela.hidden = tela.id !== destino.tela;
  }
  $("tituloTela").textContent = destino.titulo;
  document.title = destino.titulo === "ATeG Cal" ? "ATeG Cal" : `${destino.titulo} · ATeG Cal`;
  $("btnVoltar").hidden = ["tela-inicio", "tela-login", "tela-termos"].includes(destino.tela);
  mostrarUsuario();
  window.scrollTo(0, 0);
}

$("btnVoltar").addEventListener("click", () => {
  location.hash = "#/";
});
window.addEventListener("hashchange", navegar);

// ---------- Termos de uso ----------

$("versaoTermos").textContent = TERMOS_VERSAO;

// Leitura: volta para a tela de onde veio (login, cadastro ou início).
$("btnFecharTermos").addEventListener("click", () => {
  if (history.length > 1) history.back();
  else location.hash = "#/";
});

$("formAceite").addEventListener("submit", (e) => {
  e.preventDefault();
  const form = e.target;
  if (!form.elements.aceite.checked) {
    $("erroAceite").textContent = "Marque a caixa para aceitar e continuar.";
    $("erroAceite").hidden = false;
    return;
  }
  $("erroAceite").hidden = true;
  form.reset();
  aceitarTermos();
  if (location.hash.replace(/^#\/?/, "") === "termos") location.hash = "#/";
  else navegar();
});

$("btnRecusar").addEventListener("click", () => {
  sair();
  location.hash = "#/";
  navegar();
});

// ---------- Usuário ----------

function mostrarUsuario() {
  const sessao = sessaoAtual();
  $("capaUsuario").hidden = !sessao;
  if (sessao) $("nomeUsuario").textContent = sessao.nome.split(" ")[0] || sessao.celular;
}

iniciarLogin(navegar);
$("btnSair").addEventListener("click", () => {
  sair();
  location.hash = "#/";
  navegar();
});

// ---------- Offline ----------

function atualizarConexao() {
  $("seloOffline").hidden = navigator.onLine;
  if (navigator.onLine) {
    enviarAceitePendente();
    enviarUso();
  }
}
window.addEventListener("online", atualizarConexao);
window.addEventListener("offline", atualizarConexao);
atualizarConexao();

// ---------- Contagem de uso ----------

document.addEventListener("ateg-cal:uso", (e) => registrarUso(e.detail.modulo, e.detail.acao));
// Ao sair do app, tenta enviar o que ficou na fila.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") enviarUso();
});

// ---------- Início ----------

navegar();

async function mostrarVersao() {
  const versao = await versaoApp();
  if (!versao) return;
  $("versaoApp").textContent = `Versão ${versao.replace("ateg-cal-v", "")}`;
  $("versaoApp").hidden = false;
}
mostrarVersao();

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  // Quando uma versão nova do app assume, recarrega uma vez para mostrar as mudanças.
  // Na primeira instalação não há controle anterior, então não recarrega.
  if (navigator.serviceWorker.controller) {
    let recarregando = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (recarregando) return;
      recarregando = true;
      location.reload();
    });
  }
  navigator.serviceWorker
    .register("sw.js")
    .then((registro) => {
      // App instalado costuma ficar aberto em segundo plano: procura atualização ao voltar para ele.
      document.addEventListener("visibilitychange", () => {
        if (registro && document.visibilityState === "visible" && navigator.onLine) registro.update().catch(() => {});
      });
      return navigator.serviceWorker.ready;
    })
    .then(() => {
      $("capaOffline").hidden = false;
      mostrarVersao();
    })
    .catch(() => {
      // Sem service worker o app funciona normalmente, só não fica offline.
    });
}
