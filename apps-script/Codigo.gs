/**
 * Assist Cal — login e cadastro pelo celular usando a planilha de usuários.
 *
 * Este script roda na conta Google do dono da planilha. O app envia os dados;
 * o script confere/grava na planilha e responde só { ok, nome } ou { ok: false, erro }.
 * A planilha e as senhas nunca vão para o celular do usuário.
 *
 * Colunas reconhecidas pelo cabeçalho (linha 1, qualquer ordem, maiúsculas ou não):
 *   Nome | Celular (ou Telefone, Número, WhatsApp) | Senha | Ativo ("não" bloqueia)
 *   Município | UF (ou uma só "Município/UF") | E-mail | Função | Cadastro em
 * As colunas que faltarem são criadas no primeiro cadastro feito pelo app.
 *
 * Histórico de versões (aumente VERSAO a cada mudança e publique uma "Nova versão"):
 *   1.0.0 — 27/10/2026 — login por celular e senha, bloqueio após 5 tentativas.
 *   1.1.0 — 27/10/2026 — "Primeiro acesso": cadastro pelo app, liberado na hora,
 *                        com aviso por e-mail ao dono da planilha.
 *   1.2.0 — 28/10/2026 — contagem de uso dos módulos nas abas "Uso" e "Resumo de uso".
 *   1.3.0 — 28/10/2026 — aceite dos Termos de uso: colunas "Termos aceitos em" e
 *                        "Versão dos termos", gravadas no cadastro e pela ação "aceite".
 *   1.4.0 — 29/10/2026 — contagem de uso do módulo "Volumoso para a seca".
 *   1.5.0 — 31/10/2026 — contagem dos convites enviados pelo WhatsApp; fórmulas do
 *                        "Resumo de uso" corrigidas para planilha em português.
 *   1.6.0 — 31/10/2026 — cadastro exige celular completo (DDD + 9 + 8 dígitos).
 *   1.7.0 — 31/10/2026 — cadastro recusa e-mail já usado por outro cadastro.
 *   1.8.0 — 31/10/2026 — contagem de uso do módulo "Ágio de animais".
 *   1.9.0 — 31/10/2026 — novo cadastro entra logo após o último celular, sem deixar
 *                        linhas vazias quando há algo solto abaixo da tabela; a aba
 *                        ganha linhas novas quando as existentes acabam.
 *   1.10.0 — 31/10/2026 — erro interno vira resposta com a mensagem, em vez de falha de
 *                        conexão no app.
 *   1.11.0 — 31/10/2026 — cadastro e aceite não mudam o formato das células: a tabela
 *                        da planilha recusa isso em colunas com tipo.
 *   1.12.0 — 31/10/2026 — senhas guardadas protegidas (irreversíveis); recuperação por
 *                        código no e-mail; senha provisória escrita na planilha pede
 *                        troca no login; texto digitado nunca vira fórmula na planilha.
 *   1.13.0 — 31/10/2026 — aceite e contagem de uso exigem comprovante de sessão, emitido
 *                        no login: só o celular não basta para gravar em nome de alguém.
 *   1.14.0 — 31/10/2026 — contagem de uso do módulo "Capacidade de suporte".
 *   1.15.0 — 02/11/2026 — contagem de uso do módulo "Estoque de silagem".
 *   1.16.0 — 05/11/2026 — nome do app trocado de "ATeG Cal" para "Assist Cal" nos e-mails e mensagens.
 *   1.17.0 — 05/11/2026 — "Resumo de uso" mostra quantos usuários já usam o endereço novo
 *                        (/assist-cal/), pela coluna "Versão do app" da aba Uso.
 *   1.18.0 — 05/11/2026 — ranking de usuários: ação "ranking" devolve só a posição de quem
 *                        pergunta (pontos dos últimos 30 dias, calculados da aba Uso), entre
 *                        todos os cadastros ativos.
 */

const VERSAO = "1.18.0";
const PLANILHA_ID = "1SFTDBS8Jiz3yPBbbdkgb8MkWZCbKU9Ed8wjDxNR7pAA";
const ABA = ""; // vazio = primeira aba
const MAX_TENTATIVAS = 5;
const BLOQUEIO_SEGUNDOS = 15 * 60;
const MAX_CADASTROS_HORA = 30; // proteção contra cadastros em massa
const MIN_SENHA = 6;
const MAX_SENHA = 40;
const PREFIXO_HASH = "h1$"; // senha protegida; o que não começa assim é senha provisória
const PROP_CHAVE_SENHAS = "CHAVE_SENHAS"; // fica nas propriedades do script, fora do código público
const VALIDADE_CODIGO_SEGUNDOS = 15 * 60;
const MAX_CODIGOS_HORA = 3; // por celular
const MAX_ERROS_CODIGO = 5;
const DIAS_COMPROVANTE = 31; // sessão no app: 30 dias
// Sessões abertas antes do comprovante vencem em 30 dias: até lá, a contagem delas é aceita.
const FIM_SESSOES_ANTIGAS = new Date("2026-12-05T00:00:00-03:00").getTime();
const AVISAR_CADASTRO_POR_EMAIL = true;

// Colunas da planilha: nome do cabeçalho criado e padrão para reconhecer um existente.
const COLUNAS = {
  nome: { titulo: "Nome", re: /^nome/ },
  celular: { titulo: "Celular", re: /celular|telefone|numero|whats|fone/ },
  senha: { titulo: "Senha", re: /senha/ },
  ativo: { titulo: "Ativo", re: /ativo|status/ },
  municipio: { titulo: "Município", re: /munic|cidade/ },
  uf: { titulo: "UF", re: /^uf$|^estado/ },
  email: { titulo: "E-mail", re: /^e-?mail/ },
  funcao: { titulo: "Função", re: /^funcao|^cargo/ },
  cadastroEm: { titulo: "Cadastro em", re: /^cadastr|^data/ },
  termosEm: { titulo: "Termos aceitos em", re: /^termos/ },
  termosVersao: { titulo: "Versão dos termos", re: /^versao.*termos/ },
};
const MAX_ACEITES_HORA = 10; // por celular

// Contagem de uso: só aceita módulos e ações conhecidos, gravados com nome legível.
const ABA_USO = "Uso";
const ABA_RESUMO = "Resumo de uso";
const MODULOS_USO = {
  app: "App",
  "rebanho-leite": "Rebanho ideal — leite",
  "previsao-leite": "Previsão de leite",
  "rebanho-corte": "Rebanho ideal — corte",
  "volumoso-seca": "Volumoso para a seca",
  agio: "Ágio de animais",
  "capacidade-suporte": "Capacidade de suporte",
  "estoque-silagem": "Estoque de silagem",
  convite: "Convite",
};
const ACOES_USO = { abrir: "Abriu", calcular: "Calculou", pdf: "Exportou PDF", enviar: "Enviou" };
const MAX_EVENTOS_ENVIO = 100;
const MAX_ENVIOS_HORA = 60; // por celular

// Ranking: pontos dos últimos DIAS_RANKING dias. Cada dia com uso vale 1 ponto, além das ações.
// Abrir um módulo não pontua (seria fácil inflar); calcular, gerar PDF e convidar, sim.
const DIAS_RANKING = 30;
const PONTOS_DIA_USO = 1;
const PONTOS_ACAO = { Calculou: 1, "Exportou PDF": 2, Enviou: 3 };
const CACHE_RANKING_SEGUNDOS = 30 * 60;

function doGet() {
  return responder({ ok: true, servico: "Assist Cal login" });
}

function doPost(e) {
  let dados;
  try {
    dados = JSON.parse(e.postData.contents);
  } catch (err) {
    return responder({ ok: false, erro: "Requisição inválida." });
  }
  // Sem isto, um erro devolve uma página do Google e o app só diz "Não foi possível conectar".
  try {
    if (dados.acao === "login") return responder(login(String(dados.celular || ""), String(dados.senha || "")));
    if (dados.acao === "cadastro") return responder(cadastrar(dados));
    if (dados.acao === "esqueci") return responder(enviarCodigo(String(dados.celular || "")));
    if (dados.acao === "redefinir") return responder(redefinirSenha(dados));
    if (dados.acao === "trocarSenha") return responder(trocarSenha(dados));
    if (dados.acao === "uso") return responder(registrarUso(dados));
    if (dados.acao === "aceite") return responder(registrarAceite(dados));
    if (dados.acao === "ranking") return responder(posicaoRanking(dados));
  } catch (err) {
    console.error("Erro em " + dados.acao + ": " + (err.stack || err));
    return responder({ ok: false, erro: "Erro no servidor: " + err.message });
  }
  return responder({ ok: false, erro: "Ação desconhecida." });
}

// ---------- Login ----------

function login(celular, senha) {
  const chave = chaveCelular(celular);
  if (!chave || !senha.trim()) return { ok: false, erro: "Informe o celular e a senha." };

  const conferido = conferirSenha(chave, senha);
  if (conferido.erro) return { ok: false, erro: conferido.erro };
  const resposta = sessao(conferido.usuario, chave);
  if (!senhaProtegida(conferido.usuario.senha)) resposta.trocarSenha = true;
  return resposta;
}

// termos: versão já aceita (vazio = o app pede o aceite).
function sessao(usuario, chave) {
  return {
    ok: true,
    nome: String(usuario.nome || "").trim(),
    termos: String(usuario.termos || "").trim(),
    comprovante: gerarComprovante(chave),
  };
}

// Prova que o celular entrou com a senha. Só o script assina, com a chave que não está no código.
function gerarComprovante(chave) {
  const validade = String(Date.now() + DIAS_COMPROVANTE * 86400000);
  return validade + "." + gerarHash(validade, "sessao" + chave);
}

function comprovanteValido(chave, comprovante) {
  const texto = String(comprovante || "");
  const ponto = texto.indexOf(".");
  const validade = texto.slice(0, ponto);
  if (!/^\d+$/.test(validade) || Number(validade) <= Date.now()) return false;
  return texto.slice(ponto + 1) === gerarHash(validade, "sessao" + chave);
}

// Devolve { usuario } ou { erro }, contando as tentativas erradas do celular.
function conferirSenha(chave, senha) {
  const cache = CacheService.getScriptCache();
  const chaveCache = "tentativas_" + chave;
  const tentativas = Number(cache.get(chaveCache) || 0);
  if (tentativas >= MAX_TENTATIVAS) {
    return { erro: "Muitas tentativas. Aguarde 15 minutos ou use “Esqueci a senha”." };
  }

  const usuario = buscarUsuario(chave);
  if (!usuario || !senhaConfere(usuario.senha, senha)) {
    cache.put(chaveCache, String(tentativas + 1), BLOQUEIO_SEGUNDOS);
    return { erro: "Celular ou senha incorretos." };
  }
  if (usuario.ativo === false) {
    return { erro: "Acesso desativado. Fale com a Zootécnica Assist." };
  }
  cache.remove(chaveCache);
  return { usuario: usuario };
}

// ---------- Senhas protegidas ----------

function senhaProtegida(guardada) {
  return String(guardada).trim().indexOf(PREFIXO_HASH) === 0;
}

function senhaConfere(guardada, senha) {
  const g = String(guardada).trim();
  const s = senha.trim();
  if (!g || !s) return false;
  return senhaProtegida(g) ? g === gerarHash(s, g.split("$")[1]) : g === s;
}

function protegerSenha(senha) {
  return gerarHash(senha.trim(), Utilities.getUuid().replace(/-/g, "").slice(0, 16));
}

// HMAC com a chave do script: sem ela, nem quem tiver a planilha consegue testar senhas.
function gerarHash(valor, sal) {
  const assinatura = Utilities.computeHmacSha256Signature(sal + ":" + valor, chaveSenhas(), Utilities.Charset.UTF_8);
  return PREFIXO_HASH + sal + "$" + Utilities.base64Encode(assinatura);
}

// Só testarLeitura cria a chave: trocá-la invalidaria todas as senhas.
function chaveSenhas() {
  const chave = PropertiesService.getScriptProperties().getProperty(PROP_CHAVE_SENHAS);
  if (!chave) throw new Error("Chave de senhas ausente: rode testarLeitura no editor.");
  return chave;
}

function erroNovaSenha(nova) {
  if (nova.length < MIN_SENHA || nova.length > MAX_SENHA) {
    return "A senha deve ter de " + MIN_SENHA + " a " + MAX_SENHA + " caracteres.";
  }
  return "";
}

function gravarSenha(usuario, nova) {
  const trava = LockService.getScriptLock();
  if (!trava.tryLock(20000)) return false;
  try {
    const aba = abrirAba();
    const col = garantirColunas(aba);
    aba.getRange(usuario.linha, col.senha + 1).setValue(protegerSenha(nova));
    SpreadsheetApp.flush();
  } finally {
    trava.releaseLock();
  }
  return true;
}

// Senha provisória: quem entrou com ela escolhe uma senha própria antes de usar o app.
function trocarSenha(d) {
  const chave = chaveCelular(d.celular);
  const senha = String(d.senha || "");
  const nova = String(d.nova || "").trim();
  if (!chave || !senha.trim()) return { ok: false, erro: "Informe o celular e a senha." };
  const conferido = conferirSenha(chave, senha);
  if (conferido.erro) return { ok: false, erro: conferido.erro };
  const erro = erroNovaSenha(nova);
  if (erro) return { ok: false, erro: erro };
  if (nova === senha.trim()) return { ok: false, erro: "Escolha uma senha diferente da provisória." };
  if (!gravarSenha(conferido.usuario, nova)) return { ok: false, erro: "Servidor ocupado. Tente de novo." };
  return sessao(conferido.usuario, chave);
}

// ---------- Recuperação de senha pelo e-mail ----------

// A resposta é igual exista ou não o cadastro: o app não revela quem está na planilha.
function enviarCodigo(celular) {
  const chave = chaveCelular(celular);
  if (!chave) return { ok: false, erro: "Informe o celular com DDD." };

  const cache = CacheService.getScriptCache();
  const chavePedidos = "esqueci_" + chave;
  const pedidos = Number(cache.get(chavePedidos) || 0);
  if (pedidos >= MAX_CODIGOS_HORA) {
    return { ok: false, erro: "Muitos pedidos. Aguarde uma hora ou fale pelo WhatsApp." };
  }
  cache.put(chavePedidos, String(pedidos + 1), 3600);

  const usuario = buscarUsuario(chave);
  if (!usuario || usuario.ativo === false || !usuario.email) return { ok: true };

  const numero = parseInt(Utilities.getUuid().replace(/-/g, "").slice(0, 12), 16) % 1000000;
  const codigo = String(numero).padStart(6, "0");
  cache.put("codigo_" + chave, gerarHash(codigo, chave), VALIDADE_CODIGO_SEGUNDOS);
  cache.remove("codigo_erros_" + chave);
  try {
    MailApp.sendEmail(
      usuario.email,
      "Assist Cal — código para criar nova senha",
      "Seu código é " + codigo + ".\n\n" +
        "Digite o código no aplicativo para criar uma nova senha. Ele vale por 15 minutos.\n" +
        "Se você não pediu, ignore este e-mail: sua senha continua a mesma.",
    );
  } catch (err) {
    console.warn("Falha ao enviar código de senha: " + err);
    return { ok: false, erro: "Não foi possível enviar o e-mail. Fale pelo WhatsApp." };
  }
  return { ok: true };
}

function redefinirSenha(d) {
  const chave = chaveCelular(d.celular);
  const codigo = String(d.codigo || "").trim();
  const nova = String(d.nova || "").trim();
  if (!chave || !/^\d{6}$/.test(codigo)) return { ok: false, erro: "Informe o código de 6 dígitos." };
  const erro = erroNovaSenha(nova);
  if (erro) return { ok: false, erro: erro };

  const cache = CacheService.getScriptCache();
  const chaveCodigo = "codigo_" + chave;
  const chaveErros = "codigo_erros_" + chave;
  const guardado = cache.get(chaveCodigo);
  if (!guardado) return { ok: false, erro: "Código vencido. Peça um novo." };
  if (guardado !== gerarHash(codigo, chave)) {
    const erros = Number(cache.get(chaveErros) || 0) + 1;
    if (erros >= MAX_ERROS_CODIGO) {
      cache.remove(chaveCodigo);
      cache.remove(chaveErros);
      return { ok: false, erro: "Muitos erros. Peça um novo código." };
    }
    cache.put(chaveErros, String(erros), VALIDADE_CODIGO_SEGUNDOS);
    return { ok: false, erro: "Código incorreto." };
  }

  const usuario = buscarUsuario(chave);
  if (!usuario || usuario.ativo === false) return { ok: false, erro: "Acesso desativado. Fale com a Zootécnica Assist." };
  if (!gravarSenha(usuario, nova)) return { ok: false, erro: "Servidor ocupado. Tente de novo." };
  cache.remove(chaveCodigo);
  cache.remove(chaveErros);
  cache.remove("tentativas_" + chave);
  return sessao(usuario, chave);
}

function buscarUsuario(chave) {
  const aba = abrirAba();
  const valores = aba.getDataRange().getDisplayValues();
  if (valores.length < 2) return null;

  const col = localizarColunas(valores[0]);
  if (col.celular < 0 || col.senha < 0) throw new Error("A planilha precisa das colunas Celular e Senha.");

  for (let i = 1; i < valores.length; i++) {
    const linha = valores[i];
    if (chaveCelular(linha[col.celular]) !== chave) continue;
    const ativo = col.ativo < 0 ? true : !/^(nao|n|inativo|bloqueado|false|0)$/.test(normalizar(linha[col.ativo]));
    return {
      nome: col.nome < 0 ? "" : linha[col.nome],
      senha: linha[col.senha],
      email: col.email < 0 ? "" : String(linha[col.email]).trim(),
      ativo: ativo,
      termos: col.termosVersao < 0 ? "" : linha[col.termosVersao],
      linha: i + 1,
    };
  }
  return null;
}

function emailCadastrado(email) {
  const valores = abrirAba().getDataRange().getDisplayValues();
  const col = localizarColunas(valores[0]);
  if (col.email < 0) return false;
  return valores.slice(1).some((linha) => String(linha[col.email]).trim().toLowerCase() === email);
}

// ---------- Cadastro (primeiro acesso) ----------

function cadastrar(d) {
  const novo = {
    nome: limpar(d.nome, 80),
    celular: limpar(d.celular, 30),
    senha: String(d.senha || "").trim(),
    municipio: limpar(d.municipio, 60),
    uf: limpar(d.uf, 2).toUpperCase(),
    email: limpar(d.email, 100).toLowerCase(),
    funcao: limpar(d.funcao, 40),
  };
  const chave = chaveCelular(novo.celular);

  if (novo.nome.length < 3) return { ok: false, erro: "Informe o nome completo." };
  if (!celularCompleto(novo.celular)) return { ok: false, erro: "Informe o celular completo, com DDD e o 9 na frente: (62) 9 0000-0000." };
  const erroSenha = erroNovaSenha(novo.senha);
  if (erroSenha) return { ok: false, erro: erroSenha };
  if (!novo.municipio || !/^[A-Z]{2}$/.test(novo.uf)) return { ok: false, erro: "Informe o município e a UF." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(novo.email)) return { ok: false, erro: "Informe um e-mail válido." };
  if (!novo.funcao) return { ok: false, erro: "Informe a função." };

  const cache = CacheService.getScriptCache();
  const cadastrosHora = Number(cache.get("cadastros_hora") || 0);
  if (cadastrosHora >= MAX_CADASTROS_HORA) {
    return { ok: false, erro: "Muitos cadastros agora. Tente de novo em uma hora." };
  }

  const trava = LockService.getScriptLock();
  if (!trava.tryLock(20000)) return { ok: false, erro: "Servidor ocupado. Tente de novo." };
  try {
    if (buscarUsuario(chave)) {
      return { ok: false, erro: "Este celular já está cadastrado. Use “Entrar” ou “Esqueci a senha”." };
    }
    if (emailCadastrado(novo.email)) {
      return { ok: false, erro: "Este e-mail já está cadastrado. Use “Entrar” ou “Esqueci a senha”." };
    }
    const aba = abrirAba();
    const col = garantirColunas(aba);
    const largura = aba.getLastColumn();
    const linha = new Array(largura).fill("");
    linha[col.nome] = semFormula(novo.nome);
    linha[col.celular] = formatarCelular(chave, novo.celular);
    linha[col.senha] = protegerSenha(novo.senha);
    linha[col.ativo] = "sim";
    if (col.uf >= 0) {
      linha[col.municipio] = semFormula(novo.municipio);
      linha[col.uf] = novo.uf;
    } else {
      linha[col.municipio] = semFormula(novo.municipio + "/" + novo.uf);
    }
    linha[col.email] = semFormula(novo.email);
    linha[col.funcao] = semFormula(novo.funcao);
    linha[col.cadastroEm] = Utilities.formatDate(new Date(), "America/Sao_Paulo", "dd/MM/yyyy HH:mm");
    const termos = limpar(d.termos, 10);
    if (termos) {
      linha[col.termosEm] = linha[col.cadastroEm];
      linha[col.termosVersao] = comoTexto(termos);
    }

    const numLinha = proximaLinha(aba, col);
    garantirLinhas(aba, numLinha);
    aba.getRange(numLinha, 1, 1, largura).setValues([linha]);
    SpreadsheetApp.flush();
  } finally {
    trava.releaseLock();
  }
  cache.put("cadastros_hora", String(cadastrosHora + 1), 3600);

  if (AVISAR_CADASTRO_POR_EMAIL) avisarCadastro(novo);
  return { ok: true, nome: novo.nome, comprovante: gerarComprovante(chave) };
}

function avisarCadastro(novo) {
  try {
    const dono = Session.getEffectiveUser().getEmail();
    if (!dono) return;
    MailApp.sendEmail(
      dono,
      "Assist Cal — novo cadastro: " + novo.nome,
      "Novo cadastro pelo Primeiro acesso do Assist Cal:\n\n" +
        "Nome: " + novo.nome + "\n" +
        "Celular: " + novo.celular + "\n" +
        "E-mail: " + novo.email + "\n" +
        "Município/UF: " + novo.municipio + "/" + novo.uf + "\n" +
        "Função: " + novo.funcao + "\n\n" +
        "O acesso já está liberado. Para bloquear, troque a coluna Ativo para \"não\" na planilha.",
    );
  } catch (err) {
    // O cadastro vale mesmo se o e-mail falhar (ex.: cota diária do Gmail).
    console.warn("Falha ao enviar aviso de cadastro: " + err);
  }
}

// Primeira linha toda vazia depois do último celular; nunca grava sobre uma linha com conteúdo.
function proximaLinha(aba, col) {
  const valores = aba.getDataRange().getDisplayValues();
  let ultima = valores.length - 1;
  while (ultima > 0 && !String(valores[ultima][col.celular]).trim()) ultima--;
  for (let i = ultima + 1; i < valores.length; i++) {
    if (valores[i].every((c) => !String(c).trim())) return i + 1;
  }
  return valores.length + 1;
}

// ---------- Aceite dos Termos de uso ----------

// O app aceita na hora (mesmo offline) e envia depois: grava a data do aceite no aparelho.
function registrarAceite(d) {
  const chave = chaveCelular(d.celular);
  const versao = limpar(d.versao, 10);
  if (!chave || !versao) return { ok: false, erro: "Dados do aceite inválidos." };
  // Sem comprovante, nada é gravado: como a planilha segue sem o aceite, o próximo login pede de novo.
  if (!comprovanteValido(chave, d.comprovante)) return { ok: true };

  const cache = CacheService.getScriptCache();
  const chaveCache = "aceite_" + chave;
  const envios = Number(cache.get(chaveCache) || 0);
  if (envios >= MAX_ACEITES_HORA) return { ok: false, erro: "Muitos envios. Tente mais tarde." };
  cache.put(chaveCache, String(envios + 1), 3600);

  const agora = Date.now();
  let quando = new Date(d.quando);
  if (isNaN(quando) || quando.getTime() > agora + 3600000 || quando.getTime() < agora - 90 * 86400000) {
    quando = new Date(agora);
  }

  const trava = LockService.getScriptLock();
  if (!trava.tryLock(20000)) return { ok: false, erro: "Servidor ocupado." };
  try {
    const usuario = buscarUsuario(chave);
    // Celular fora da planilha: descarta sem erro, para o app não reenviar para sempre.
    if (!usuario) return { ok: true };
    const aba = abrirAba();
    const col = garantirColunas(aba);
    aba.getRange(usuario.linha, col.termosEm + 1)
      .setValue(Utilities.formatDate(quando, "America/Sao_Paulo", "dd/MM/yyyy HH:mm"));
    aba.getRange(usuario.linha, col.termosVersao + 1).setValue(comoTexto(versao));
    SpreadsheetApp.flush();
  } finally {
    trava.releaseLock();
  }
  return { ok: true };
}

// ---------- Contagem de uso ----------

function registrarUso(d) {
  const chave = chaveCelular(d.celular);
  if (!chave) return { ok: false, erro: "Celular inválido." };
  if (!comprovanteValido(chave, d.comprovante) && (d.comprovante || Date.now() >= FIM_SESSOES_ANTIGAS)) {
    return { ok: true, gravados: 0 };
  }

  const cache = CacheService.getScriptCache();
  const chaveCache = "uso_" + chave;
  const envios = Number(cache.get(chaveCache) || 0);
  if (envios >= MAX_ENVIOS_HORA) return { ok: false, erro: "Muitos envios. Tente mais tarde." };
  cache.put(chaveCache, String(envios + 1), 3600);

  // Celular fora da planilha: descarta sem erro, para o app não reenviar para sempre.
  const usuario = buscarUsuario(chave);
  if (!usuario) return { ok: true, gravados: 0 };

  const agora = Date.now();
  const versaoApp = limpar(d.versaoApp, 20);
  const eventos = Array.isArray(d.eventos) ? d.eventos.slice(0, MAX_EVENTOS_ENVIO) : [];
  const linhas = [];
  for (const ev of eventos) {
    if (!ev || !MODULOS_USO.hasOwnProperty(ev.modulo) || !ACOES_USO.hasOwnProperty(ev.acao)) continue;
    const quando = new Date(ev.quando);
    // Aceita até 90 dias atrás (uso offline) e descarta datas no futuro.
    if (isNaN(quando) || quando.getTime() > agora + 3600000 || quando.getTime() < agora - 90 * 86400000) continue;
    linhas.push([
      quando,
      semFormula(String(usuario.nome || "").trim()),
      formatarCelular(chave, d.celular),
      MODULOS_USO[ev.modulo],
      ACOES_USO[ev.acao],
      semFormula(versaoApp),
    ]);
  }
  if (!linhas.length) return { ok: true, gravados: 0 };

  const trava = LockService.getScriptLock();
  if (!trava.tryLock(20000)) return { ok: false, erro: "Servidor ocupado." };
  try {
    const aba = abaUso();
    const inicio = aba.getLastRow() + 1;
    garantirLinhas(aba, inicio + linhas.length - 1);
    aba.getRange(inicio, 1, linhas.length, linhas[0].length).setValues(linhas);
  } finally {
    trava.releaseLock();
  }
  return { ok: true, gravados: linhas.length };
}

// ---------- Ranking ----------

// Devolve só a posição de quem pergunta: nomes e pontos dos outros nunca saem da planilha.
function posicaoRanking(d) {
  const chave = chaveCelular(d.celular);
  if (!chave || !comprovanteValido(chave, d.comprovante)) return { ok: false, erro: "Sessão inválida." };
  const pontos = pontosRanking();
  return Object.assign({ ok: true, dias: DIAS_RANKING }, posicaoDe(pontos, chave, totalCadastros()));
}

// Cadastros ativos com celular válido (cada celular conta uma vez). Guardado por 30 minutos.
function totalCadastros() {
  const cache = CacheService.getScriptCache();
  const guardado = cache.get("cadastros");
  if (guardado) return Number(guardado);
  const valores = abrirAba().getDataRange().getDisplayValues();
  const total = contarCadastros(valores);
  cache.put("cadastros", String(total), CACHE_RANKING_SEGUNDOS);
  return total;
}

function contarCadastros(valores) {
  if (valores.length < 2) return 0;
  const col = localizarColunas(valores[0]);
  if (col.celular < 0) return 0;
  const vistos = {};
  for (let i = 1; i < valores.length; i++) {
    const chave = chaveCelular(valores[i][col.celular]);
    if (!chave) continue;
    if (col.ativo >= 0 && /^(nao|n|inativo|bloqueado|false|0)$/.test(normalizar(valores[i][col.ativo]))) continue;
    vistos[chave] = true;
  }
  return Object.keys(vistos).length;
}

// O cálculo lê a aba Uso inteira; o resultado fica guardado por 30 minutos para todos.
function pontosRanking() {
  const cache = CacheService.getScriptCache();
  const guardado = cache.get("ranking");
  if (guardado) return JSON.parse(guardado);

  const aba = SpreadsheetApp.openById(PLANILHA_ID).getSheetByName(ABA_USO);
  const linhas = aba && aba.getLastRow() > 1 ? aba.getRange(2, 1, aba.getLastRow() - 1, 5).getValues() : [];
  const pontos = calcularPontos(linhas, Date.now());
  try {
    cache.put("ranking", JSON.stringify(pontos), CACHE_RANKING_SEGUNDOS);
  } catch (err) {
    // acima do limite do cache (100 KB): calcula de novo na próxima vez
  }
  return pontos;
}

// linhas: [Data/hora, Nome, Celular, Módulo, Ação] da aba Uso. Devolve { chaveCelular: pontos }.
function calcularPontos(linhas, agora) {
  const inicio = agora - DIAS_RANKING * 86400000;
  const pontos = {};
  const dias = {};
  for (const linha of linhas) {
    const quando = linha[0] instanceof Date ? linha[0].getTime() : new Date(linha[0]).getTime();
    if (isNaN(quando) || quando < inicio || quando > agora + 3600000) continue;
    const chave = chaveCelular(linha[2]);
    if (!chave) continue;
    const dia = chave + "|" + Utilities.formatDate(new Date(quando), "America/Sao_Paulo", "yyyy-MM-dd");
    let p = PONTOS_ACAO[linha[4]] || 0;
    if (!dias[dia]) {
      dias[dia] = true;
      p += PONTOS_DIA_USO;
    }
    pontos[chave] = (pontos[chave] || 0) + p;
  }
  return pontos;
}

// Empatados dividem a posição (1º, 2º, 2º, 4º). Sem pontos no período = ainda sem posição.
// total: todos os cadastros ativos (nunca menos que os que pontuaram).
function posicaoDe(pontos, chave, cadastros) {
  const total = Math.max(Number(cadastros) || 0, Object.keys(pontos).length);
  const meus = pontos[chave] || 0;
  if (!meus) return { posicao: 0, total: total, pontos: 0 };
  let acima = 0;
  for (const k in pontos) if (pontos[k] > meus) acima++;
  return { posicao: acima + 1, total: total, pontos: meus };
}

// Abas de uso ficam no fim da planilha: a primeira aba continua sendo a de usuários.
function abaUso() {
  const planilha = SpreadsheetApp.openById(PLANILHA_ID);
  let aba = planilha.getSheetByName(ABA_USO);
  if (aba) return aba;

  aba = planilha.insertSheet(ABA_USO, planilha.getNumSheets());
  aba.getRange(1, 1, 1, 6).setValues([["Data/hora", "Nome", "Celular", "Módulo", "Ação", "Versão do app"]])
    .setFontWeight("bold");
  aba.getRange("A2:A").setNumberFormat("dd/MM/yyyy HH:mm");
  aba.getRange("C2:C").setNumberFormat("@");
  aba.setFrozenRows(1);

  criarResumo(planilha);
  return aba;
}

// Aba de resumo com fórmulas: atualiza sozinha a cada novo registro.
// Se a aba já existe, regrava as fórmulas (testarLeitura usa isso para corrigir).
function criarResumo(planilha) {
  const r = planilha.getSheetByName(ABA_RESUMO) || planilha.insertSheet(ABA_RESUMO, planilha.getNumSheets());
  // Em planilha em português, os argumentos das fórmulas são separados por ponto e vírgula.
  const s = String(planilha.getSpreadsheetLocale()).startsWith("pt") ? ";" : ",";
  r.getRange("A1").setValue("Resumo de uso do Assist Cal").setFontWeight("bold").setFontSize(14);

  r.getRange("A3:A5").setValues([
    ["Usuários diferentes nos últimos 7 dias"],
    ["Usuários diferentes nos últimos 30 dias"],
    ["Usuários diferentes desde o início"],
  ]);
  r.getRange("B3").setFormula("=IFERROR(COUNTUNIQUE(FILTER(Uso!C2:C" + s + " Uso!A2:A >= TODAY() - 7))" + s + " 0)");
  r.getRange("B4").setFormula("=IFERROR(COUNTUNIQUE(FILTER(Uso!C2:C" + s + " Uso!A2:A >= TODAY() - 30))" + s + " 0)");
  r.getRange("B5").setFormula("=COUNTUNIQUE(Uso!C2:C)");

  // Mudança de endereço: a "Versão do app" começa com "assist-cal" no endereço novo e com
  // "ateg-cal" (ou fica vazia, nas versões até a 33) no antigo.
  const novo = "LEFT(Uso!F2:F" + s + " 10) = \"assist-cal\"";
  const antigo = "LEFT(Uso!F2:F" + s + " 10) <> \"assist-cal\"";
  const ult30 = "Uso!A2:A >= TODAY() - 30";
  const unicos = (...filtros) =>
    "=IFERROR(COUNTUNIQUE(FILTER(Uso!C2:C" + s + " " + filtros.join(s + " ") + "))" + s + " 0)";
  r.getRange("D2").setValue("Mudança para o endereço novo (assist-cal)").setFontWeight("bold");
  r.getRange("D3:D6").setValues([
    ["Usaram o endereço novo nos últimos 30 dias"],
    ["Usaram o endereço antigo nos últimos 30 dias"],
    ["Já migraram (% dos usuários dos últimos 30 dias)"],
    ["Usaram o endereço novo desde o início"],
  ]);
  r.getRange("E3").setFormula(unicos(ult30, novo));
  r.getRange("E4").setFormula(unicos(ult30, antigo));
  r.getRange("E5").setFormula("=IFERROR(E3 / B4" + s + " 0)").setNumberFormat("0%");
  r.getRange("E6").setFormula(unicos(novo));
  r.setColumnWidth(4, 330);

  const consulta = (texto) => "=IFERROR(QUERY(Uso!A:F" + s + " \"" + texto + "\"" + s + " 1)" + s + " \"Sem dados ainda\")";

  r.getRange("A7").setValue("Por módulo (quantas vezes)").setFontWeight("bold");
  r.getRange("A8").setFormula(
    consulta("select D, count(A) where D is not null group by D pivot E label D 'Módulo'"),
  );

  r.getRange("G7").setValue("Por mês").setFontWeight("bold");
  r.getRange("G8").setFormula(
    consulta(
      "select year(A), month(A) + 1, count(A) where A is not null " +
        "group by year(A), month(A) + 1 order by year(A), month(A) + 1 " +
        "label year(A) 'Ano', month(A) + 1 'Mês', count(A) 'Ações'",
    ),
  );

  r.getRange("K7").setValue("Por usuário (mais ativos primeiro)").setFontWeight("bold");
  r.getRange("K8").setFormula(
    consulta(
      "select B, C, count(A), max(A) where C is not null group by B, C " +
        "order by count(A) desc label B 'Nome', C 'Celular', count(A) 'Ações', max(A) 'Último uso' " +
        "format max(A) 'dd/mm/yyyy'",
    ),
  );
  r.setColumnWidth(1, 280);
}

// ---------- Planilha ----------

function abrirAba() {
  const planilha = SpreadsheetApp.openById(PLANILHA_ID);
  return ABA ? planilha.getSheetByName(ABA) : planilha.getSheets()[0];
}

function localizarColunas(cabecalho) {
  const cab = cabecalho.map((c) => normalizar(c));
  const col = {};
  for (const nome in COLUNAS) col[nome] = cab.findIndex((c) => COLUNAS[nome].re.test(c));
  return col;
}

// Cria no fim da linha 1 as colunas que ainda não existem e devolve a posição de todas.
// Se houver uma coluna única "Município/UF", a UF vai junto nela (col.uf fica -1).
function garantirColunas(aba) {
  const largura = Math.max(aba.getLastColumn(), 1);
  const cabecalho = aba.getRange(1, 1, 1, largura).getDisplayValues()[0];
  const col = localizarColunas(cabecalho);
  const municipioComUf = col.municipio >= 0 && /(^|[^a-z])uf([^a-z]|$)/.test(normalizar(cabecalho[col.municipio]));
  let proxima = cabecalho.every((c) => c === "") ? 0 : largura;
  for (const nome in COLUNAS) {
    if (col[nome] >= 0) continue;
    if (nome === "uf" && municipioComUf) continue;
    aba.getRange(1, proxima + 1).setValue(COLUNAS[nome].titulo);
    col[nome] = proxima;
    proxima++;
  }
  return col;
}

// Gravar além do fim da aba dá erro: cria as linhas que faltam.
function garantirLinhas(aba, ultimaLinha) {
  const maximo = aba.getMaxRows();
  if (ultimaLinha > maximo) aba.insertRowsAfter(maximo, ultimaLinha - maximo);
}

// ---------- Utilidades ----------

// DDD + 8 últimos dígitos: "(62) 9 9999-9999", "5562999999999" e "62 9999-9999" viram "62999999999".
function chaveCelular(valor) {
  let d = String(valor).replace(/\D/g, "");
  if (d.length >= 12 && d.indexOf("55") === 0) d = d.slice(2);
  if (d.indexOf("0") === 0) d = d.slice(1);
  if (d.length < 10) return "";
  return d.slice(0, 2) + d.slice(-8);
}

// Cadastro novo: DDD + 9 + 8 dígitos. O login aceita também os números antigos, sem o 9.
function celularCompleto(valor) {
  const d = String(valor).replace(/\D/g, "").replace(/^55(?=\d{11})/, "").replace(/^0/, "");
  return /^[1-9]{2}9\d{8}$/.test(d);
}

// Grava o celular sempre no formato (62) 9 9999-9999.
function formatarCelular(chave, original) {
  const tem9 = String(original).replace(/\D/g, "").replace(/^55(?=\d{11})/, "").length === 11;
  const fim = chave.slice(2);
  return "(" + chave.slice(0, 2) + ") " + (tem9 ? "9 " : "") + fim.slice(0, 4) + "-" + fim.slice(4);
}

// O apóstrofo mantém o valor como texto ("0123", "1.0"). A tabela da planilha não aceita
// setNumberFormat em coluna com tipo, e o erro só aparece na gravação seguinte.
function comoTexto(valor) {
  return "'" + valor;
}

// Texto digitado por quem usa o app nunca pode virar fórmula: uma fórmula na planilha leria
// as outras linhas e poderia enviá-las para fora.
function semFormula(valor) {
  return /^[=+\-@]/.test(valor) ? comoTexto(valor) : valor;
}

function limpar(valor, max) {
  return String(valor || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function normalizar(texto) {
  return String(texto).trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Toda resposta leva a versão do script, para conferir qual implantação está no ar.
function responder(obj) {
  obj.versao = VERSAO;
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Rode esta função no editor depois de colar uma versão nova: autoriza o acesso
 * à planilha e o envio de e-mail, e mostra a versão no registro de execução.
 */
function testarLeitura() {
  const propriedades = PropertiesService.getScriptProperties();
  if (!propriedades.getProperty(PROP_CHAVE_SENHAS)) {
    propriedades.setProperty(PROP_CHAVE_SENHAS, Utilities.getUuid() + Utilities.getUuid());
  }
  Logger.log("Chave de senhas pronta.");
  const aba = abrirAba();
  Logger.log("Assist Cal login v" + VERSAO + " — planilha: " + aba.getParent().getName() + " — linhas: " + aba.getLastRow());
  Logger.log("Cota de e-mails restante hoje: " + MailApp.getRemainingDailyQuota());
  Logger.log("Aba de uso pronta: " + abaUso().getName());
  criarResumo(aba.getParent());
  Logger.log("Resumo de uso atualizado — idioma da planilha: " + aba.getParent().getSpreadsheetLocale());
  Logger.log("Fórmulas na aba de usuários: " + listarFormulas(aba));
  Logger.log("Fórmulas na aba Uso: " + listarFormulas(abaUso()));
  CacheService.getScriptCache().removeAll(["cadastros", "ranking"]);
  const pontos = pontosRanking();
  Logger.log("Ranking: " + totalCadastros() + " cadastros ativos; " + Object.keys(pontos).length +
    " com pontos nos últimos " + DIAS_RANKING + " dias.");
}

// Essas abas só guardam dados: fórmula nelas pode ser sinal de cadastro malicioso.
function listarFormulas(aba) {
  const achadas = [];
  aba.getDataRange().getFormulas().forEach((linha, l) => {
    linha.forEach((formula, c) => {
      if (formula) achadas.push(aba.getRange(l + 1, c + 1).getA1Notation());
    });
  });
  return achadas.length ? achadas.join(", ") : "nenhuma";
}

/**
 * Rode uma vez no editor, logo depois de implantar a versão 1.12.0: protege todas as senhas
 * que ainda estão legíveis. Depois disso, ninguém mais consegue ler as senhas na planilha.
 */
function protegerSenhas() {
  const trava = LockService.getScriptLock();
  if (!trava.tryLock(20000)) throw new Error("Servidor ocupado. Rode de novo.");
  try {
    const aba = abrirAba();
    const valores = aba.getDataRange().getDisplayValues();
    const col = localizarColunas(valores[0]);
    let protegidas = 0;
    for (let i = 1; i < valores.length; i++) {
      const senha = String(valores[i][col.senha]).trim();
      if (!chaveCelular(valores[i][col.celular]) || !senha || senhaProtegida(senha)) continue;
      aba.getRange(i + 1, col.senha + 1).setValue(protegerSenha(senha));
      protegidas++;
    }
    SpreadsheetApp.flush();
    Logger.log("Senhas protegidas agora: " + protegidas);
  } finally {
    trava.releaseLock();
  }
}
