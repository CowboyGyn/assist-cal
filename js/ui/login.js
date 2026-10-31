// Login e cadastro (primeiro acesso) pelo celular: conversa com o Apps Script ligado à
// planilha de usuários e guarda a sessão no aparelho, para o app seguir funcionando offline.
import { LOGIN_URL, DIAS_SESSAO, WHATSAPP_SUPORTE, TERMOS_VERSAO } from "../config.js";
import { $ } from "./comum.js";

const CHAVE_SESSAO = "ateg-cal:sessao";
const TEMPO_LIMITE_MS = 20000;
const MIN_SENHA = 6;

const formLogin = $("formLogin");
const formCadastro = $("formCadastro");
const formEsqueci = $("formEsqueci");
const formNovaSenha = $("formNovaSenha");

// Tela de nova senha aberta: { celular } veio do e-mail; com senha, é a provisória da planilha.
let pedidoSenha = null;

export const loginAtivo = () => LOGIN_URL !== "";

export function sessaoAtual() {
  try {
    const s = JSON.parse(localStorage.getItem(CHAVE_SESSAO));
    if (s && typeof s.validoAte === "number" && s.validoAte > Date.now()) return s;
  } catch {
    // sem armazenamento ou dado inválido: trata como deslogado
  }
  return null;
}

export const precisaLogin = () => loginAtivo() && !sessaoAtual();

// Sessão sem o aceite da versão atual dos termos (inclui sessões antigas, sem o campo).
export function precisaAceite() {
  const s = sessaoAtual();
  return !!s && s.termos !== TERMOS_VERSAO;
}

function gravarSessao(sessao) {
  try {
    localStorage.setItem(CHAVE_SESSAO, JSON.stringify(sessao));
  } catch {
    // Sem armazenamento a sessão vale só enquanto a página estiver aberta.
  }
  return sessao;
}

function salvarSessao(nome, celular, termos, comprovante) {
  return gravarSessao({ nome, celular, termos, comprovante, validoAte: Date.now() + DIAS_SESSAO * 86400000 });
}

// O aceite vale na hora, mesmo offline; o registro na planilha é enviado quando houver internet.
export function aceitarTermos() {
  const s = sessaoAtual();
  if (!s) return;
  gravarSessao({ ...s, termos: TERMOS_VERSAO, termosEm: new Date().toISOString(), termosPendente: true });
  enviarAceitePendente();
}

export async function enviarAceitePendente() {
  const s = sessaoAtual();
  if (!s || !s.termosPendente || !navigator.onLine) return;
  try {
    const r = await chamarScript({
      acao: "aceite",
      celular: s.celular,
      comprovante: s.comprovante,
      versao: s.termos,
      quando: s.termosEm,
    });
    const atual = sessaoAtual();
    if (r.ok && atual && atual.celular === s.celular) {
      delete atual.termosPendente;
      gravarSessao(atual);
    }
  } catch {
    // Sem conexão com o script: tenta de novo na próxima abertura.
  }
}

export function sair() {
  try {
    localStorage.removeItem(CHAVE_SESSAO);
  } catch {
    // ignora
  }
}

// (62) 9 9117-6151 enquanto digita.
function formatarCelular(valor) {
  let d = valor.replace(/\D/g, "");
  if (d.startsWith("55") && d.length > 11) d = d.slice(2);
  d = d.slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  const ddd = d.slice(0, 2);
  const resto = d.slice(2);
  if (resto.length <= 4) return `(${ddd}) ${resto}`;
  if (d.length === 11) return `(${ddd}) ${resto[0]} ${resto.slice(1, 5)}-${resto.slice(5)}`;
  return `(${ddd}) ${resto.slice(0, 4)}-${resto.slice(4)}`;
}

// Cadastro novo: DDD + 9 + 8 dígitos. O login aceita também os números antigos, sem o 9.
function celularCompleto(valor) {
  const d = valor.replace(/\D/g, "").replace(/^55(?=\d{11})/, "").replace(/^0/, "");
  return /^[1-9]{2}9\d{8}$/.test(d);
}

async function chamarScript(dados) {
  const controle = new AbortController();
  const limite = setTimeout(() => controle.abort(), TEMPO_LIMITE_MS);
  try {
    // text/plain evita a verificação CORS prévia, que o Apps Script não atende.
    const resp = await fetch(LOGIN_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(dados),
      signal: controle.signal,
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.json();
  } finally {
    clearTimeout(limite);
  }
}

// Envia ao script com o botão em "carregando"; trata erros de conexão e de resposta.
async function enviar(form, dados, textoCarregando, aoConfirmar) {
  const erro = form.querySelector(".erro");
  const botao = form.querySelector("button[type=submit]");
  const textoBotao = botao.textContent;
  if (!navigator.onLine) {
    return mostrarErro(erro, "Sem internet. O primeiro acesso precisa de conexão; depois o app funciona offline.");
  }
  botao.disabled = true;
  botao.textContent = textoCarregando;
  try {
    // A primeira chamada ao Apps Script às vezes falha enquanto ele "acorda": tenta de novo uma vez.
    // O cadastro não repete, para não duplicar a linha caso a primeira tenha sido gravada.
    const r = dados.acao === "login"
      ? await chamarScript(dados).catch(() => chamarScript(dados))
      : await chamarScript(dados);
    if (!r.ok) return mostrarErro(erro, r.erro || "Não foi possível concluir.");
    aoConfirmar(r);
  } catch {
    mostrarErro(erro, "Não foi possível conectar. Verifique a internet e tente de novo.");
  } finally {
    botao.disabled = false;
    botao.textContent = textoBotao;
  }
}

// ---------- Municípios por UF (lista do IBGE guardada no app) ----------

let municipiosPorUf = null;

async function carregarMunicipios() {
  if (!municipiosPorUf) {
    const resp = await fetch("js/dados/municipios.json");
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    municipiosPorUf = await resp.json();
  }
  return municipiosPorUf;
}

async function preencherMunicipios() {
  const campo = formCadastro.elements.municipio;
  const uf = formCadastro.elements.uf.value;
  campo.disabled = true;
  try {
    const nomes = (await carregarMunicipios())[uf] ?? [];
    const opcao = (valor, texto = valor) => {
      const o = document.createElement("option");
      o.value = valor;
      o.textContent = texto;
      return o;
    };
    campo.replaceChildren(opcao("", "Selecione o município"), ...nomes.map((n) => opcao(n)));
    // Estado com um só município (DF) já vem escolhido.
    if (nomes.length === 1) campo.value = nomes[0];
    campo.disabled = false;
  } catch {
    campo.replaceChildren(new Option("Não foi possível carregar a lista", ""));
  }
}

function mostrarErro(erro, msg) {
  erro.textContent = msg;
  erro.hidden = false;
}

function mostrarBloco(qual) {
  $("blocoEntrar").hidden = qual !== "entrar";
  $("blocoCadastro").hidden = qual !== "cadastro";
  $("blocoEsqueci").hidden = qual !== "esqueci";
  $("blocoNovaSenha").hidden = qual !== "novaSenha";
  for (const erro of document.querySelectorAll("#tela-login .erro")) erro.hidden = true;
  window.scrollTo(0, 0);
}

function limparFormularios() {
  pedidoSenha = null;
  for (const form of [formLogin, formCadastro, formEsqueci, formNovaSenha]) {
    form.reset();
    for (const campo of form.querySelectorAll(".senha input")) campo.type = "password";
    for (const botao of form.querySelectorAll(".ver-senha")) botao.setAttribute("aria-pressed", "false");
  }
  // O reset volta a UF para GO: a lista de municípios precisa acompanhar.
  if (formCadastro.elements.municipio.options.length > 1) preencherMunicipios();
}

function abrirNovaSenha(pedido) {
  pedidoSenha = pedido;
  const provisoria = !!pedido.senha;
  $("textoNovaSenha").textContent = provisoria
    ? "Esta senha é provisória. Crie uma senha sua para continuar."
    : "Se o celular estiver cadastrado, o código chega ao e-mail em alguns minutos. Veja também o spam.";
  $("campoCodigo").hidden = provisoria;
  $("blocoNovaSenha").querySelector(".whats-senha").hidden = provisoria;
  formNovaSenha.reset();
  mostrarBloco("novaSenha");
  (provisoria ? formNovaSenha.elements.nova : formNovaSenha.elements.codigo).focus();
}

function pedirSenhaWhatsApp() {
  const celular = (pedidoSenha ? pedidoSenha.celular : formEsqueci.elements.celular.value).trim();
  const texto = `Olá! Esqueci minha senha do ATeG Cal.${celular ? ` Meu celular cadastrado é ${celular}.` : ""}`;
  window.open(`https://wa.me/${WHATSAPP_SUPORTE}?text=${encodeURIComponent(texto)}`, "_blank", "noopener");
}

// aoEntrar(sessao) é chamado depois de um login ou cadastro bem-sucedido.
export function iniciarLogin(aoEntrar) {
  for (const campo of document.querySelectorAll('#tela-login input[type="tel"]')) {
    campo.addEventListener("input", (e) => {
      e.target.value = formatarCelular(e.target.value);
    });
  }

  // Botão de olho: mostra ou esconde a senha do campo ao lado.
  for (const botao of document.querySelectorAll("#tela-login .ver-senha")) {
    botao.addEventListener("click", (e) => {
      e.preventDefault();
      const campo = botao.parentElement.querySelector("input");
      const mostrar = campo.type === "password";
      campo.type = mostrar ? "text" : "password";
      botao.setAttribute("aria-pressed", String(mostrar));
      botao.setAttribute("aria-label", mostrar ? "Esconder senha" : "Mostrar senha");
      campo.focus();
    });
  }

  $("btnPrimeiroAcesso").addEventListener("click", () => {
    // Aproveita o celular já digitado no login.
    if (!formCadastro.elements.celular.value) formCadastro.elements.celular.value = formLogin.elements.celular.value;
    if (formCadastro.elements.municipio.options.length <= 1) preencherMunicipios();
    mostrarBloco("cadastro");
    formCadastro.elements.nome.focus();
  });
  $("btnJaTenho").addEventListener("click", () => mostrarBloco("entrar"));
  formCadastro.elements.uf.addEventListener("change", preencherMunicipios);

  $("btnEsqueci").addEventListener("click", () => {
    formEsqueci.elements.celular.value = formLogin.elements.celular.value;
    mostrarBloco("esqueci");
    formEsqueci.elements.celular.focus();
  });
  for (const botao of document.querySelectorAll(".whats-senha")) botao.addEventListener("click", pedirSenhaWhatsApp);
  for (const botao of document.querySelectorAll(".voltar-entrar")) {
    botao.addEventListener("click", () => {
      pedidoSenha = null;
      formNovaSenha.reset();
      mostrarBloco("entrar");
    });
  }

  const concluir = (nome, celular, termos, comprovante) => {
    limparFormularios();
    mostrarBloco("entrar");
    aoEntrar(salvarSessao(nome, celular, termos, comprovante));
  };

  formLogin.addEventListener("submit", (e) => {
    e.preventDefault();
    const erro = $("erroLogin");
    erro.hidden = true;
    const celular = formLogin.elements.celular.value.trim();
    const senha = formLogin.elements.senha.value;
    if (celular.replace(/\D/g, "").length < 10) return mostrarErro(erro, "Informe o celular com DDD.");
    if (!senha) return mostrarErro(erro, "Informe a senha.");
    enviar(formLogin, { acao: "login", celular, senha }, "Entrando…", (r) => {
      if (r.trocarSenha) abrirNovaSenha({ celular, senha });
      else concluir(r.nome || "", celular, r.termos || "", r.comprovante);
    });
  });

  formEsqueci.addEventListener("submit", (e) => {
    e.preventDefault();
    const erro = $("erroEsqueci");
    erro.hidden = true;
    const celular = formEsqueci.elements.celular.value.trim();
    if (celular.replace(/\D/g, "").length < 10) return mostrarErro(erro, "Informe o celular com DDD.");
    enviar(formEsqueci, { acao: "esqueci", celular }, "Enviando…", () => abrirNovaSenha({ celular }));
  });

  formNovaSenha.addEventListener("submit", (e) => {
    e.preventDefault();
    const erro = $("erroNovaSenha");
    erro.hidden = true;
    const f = formNovaSenha.elements;
    const { celular, senha } = pedidoSenha;
    const codigo = f.codigo.value.trim();
    const nova = f.nova.value.trim();
    if (!senha && !/^\d{6}$/.test(codigo)) return mostrarErro(erro, "Informe o código de 6 dígitos.");
    if (nova.length < MIN_SENHA) return mostrarErro(erro, `A senha deve ter pelo menos ${MIN_SENHA} caracteres.`);
    if (nova !== f.confirmacao.value.trim()) return mostrarErro(erro, "As senhas não conferem.");
    const dados = senha ? { acao: "trocarSenha", celular, senha, nova } : { acao: "redefinir", celular, codigo, nova };
    enviar(formNovaSenha, dados, "Salvando…", (r) => concluir(r.nome || "", celular, r.termos || "", r.comprovante));
  });

  formCadastro.addEventListener("submit", (e) => {
    e.preventDefault();
    const erro = $("erroCadastro");
    erro.hidden = true;
    const f = formCadastro.elements;
    const dados = {
      acao: "cadastro",
      nome: f.nome.value.trim(),
      celular: f.celular.value.trim(),
      email: f.email.value.trim(),
      municipio: f.municipio.value,
      uf: f.uf.value,
      funcao: f.funcao.value,
      senha: f.senha.value,
      termos: TERMOS_VERSAO,
    };
    const falha = (msg, campo) => {
      mostrarErro(erro, msg);
      f[campo].focus();
    };
    if (dados.nome.split(" ").filter(Boolean).length < 2) return falha("Informe o nome completo.", "nome");
    if (!celularCompleto(dados.celular)) return falha("Informe o celular completo, com DDD e o 9 na frente: (62) 9 0000-0000.", "celular");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dados.email)) return falha("Informe um e-mail válido.", "email");
    if (!dados.municipio) return falha("Selecione o município.", "municipio");
    if (!dados.funcao) return falha("Selecione a função.", "funcao");
    if (dados.senha.trim().length < MIN_SENHA) return falha(`A senha deve ter pelo menos ${MIN_SENHA} caracteres.`, "senha");
    if (dados.senha !== f.confirmacao.value) return falha("As senhas não conferem.", "confirmacao");
    if (!f.aceite.checked) return falha("Para se cadastrar, aceite os Termos de uso e a Política de privacidade.", "aceite");
    enviar(formCadastro, dados, "Cadastrando…", (r) => {
      concluir(r.nome || dados.nome, dados.celular, TERMOS_VERSAO, r.comprovante);
      // Confirma o aceite também pela ação própria: garante o registro mesmo com script antigo.
      aceitarTermos();
    });
  });
}
