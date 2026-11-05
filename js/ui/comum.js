// Utilidades de interface compartilhadas pelos módulos: formatação, formulários,
// relatório em PDF, dicas (tooltip) e gráfico de barras.

export const $ = (id) => document.getElementById(id);

export const fmt = (v, casas = 0) =>
  v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });

// Número inteiro em destaque com o valor calculado (1 casa) logo abaixo, como na tabela por categoria.
export const inteiroComDecimal = (v) => `${fmt(Math.round(v))}<span class="decimal">${fmt(v, 1)}</span>`;

// Quantidade inteira de animais nos avisos ("1 novilha", "4 novilhas"); nunca mostra zero.
export function fmtAnimais(v, nome = "novilha") {
  const n = Math.max(1, Math.round(v));
  return `${fmt(n)} ${nome}${n === 1 ? "" : "s"}`;
}

export const escapar =(s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// "" → null (usa a referência); aceita vírgula decimal.
export function numero(texto) {
  const bruto = String(texto ?? "").trim().replace(",", ".");
  return bruto === "" ? null : Number(bruto);
}

export const dataHoje = () => new Date().toLocaleDateString("pt-BR");

// Avisa o app que um módulo foi usado (a contagem de uso fica em js/uso.js).
export const avisarUso = (modulo, acao) =>
  document.dispatchEvent(new CustomEvent("ateg-cal:uso", { detail: { modulo, acao } }));

// ---------- Formulários ----------

// Campo vazio → valor padrão. Aceita vírgula decimal mesmo em navegadores que a repassam.
export function lerNumero(form, nome, padrao) {
  const bruto = form.elements[nome].value.trim().replace(",", ".");
  if (bruto === "") return padrao;
  return Number(bruto);
}

export function salvarFormulario(form, chave) {
  const dados = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === "radio") {
      if (el.checked) dados[el.name] = el.value;
    } else {
      dados[el.name] = el.value;
    }
  }
  try {
    localStorage.setItem(chave, JSON.stringify(dados));
  } catch {
    // Sem armazenamento (aba privada etc.): segue sem lembrar os dados.
  }
}

export function restaurarFormulario(form, chave) {
  let dados = null;
  try {
    dados = JSON.parse(localStorage.getItem(chave));
  } catch {
    dados = null;
  }
  if (!dados || typeof dados !== "object") return;
  for (const [nome, valor] of Object.entries(dados)) {
    const campo = form.elements[nome];
    if (!campo || typeof valor !== "string") continue;
    if (campo instanceof RadioNodeList) {
      for (const r of campo) r.checked = r.value === valor;
    } else {
      campo.value = valor;
    }
  }
}

// Último resultado do Rebanho ideal (leite ou corte), para outros módulos aproveitarem.
const chaveUltimoRebanho = (origem) => `ateg-cal:ultimo-rebanho-${origem}`;

export function guardarUltimoRebanho(origem, fazenda, r) {
  const dados = {
    fazenda,
    fase: r.fase ?? null,
    data: dataHoje(),
    categorias: r.categorias.map((c) => ({ id: c.id, grupo: c.grupo ?? null, quantidade: c.quantidade, pesoKg: c.pesoKg })),
  };
  try {
    localStorage.setItem(chaveUltimoRebanho(origem), JSON.stringify(dados));
  } catch {
    // Sem armazenamento: o botão de trazer o rebanho fica indisponível.
  }
}

export function lerUltimoRebanho(origem) {
  try {
    const dados = JSON.parse(localStorage.getItem(chaveUltimoRebanho(origem)));
    return dados && Array.isArray(dados.categorias) ? dados : null;
  } catch {
    return null;
  }
}

// Último resultado do Estoque de silagem, para o Volumoso para a seca aproveitar.
const CHAVE_ULTIMO_SILO = "ateg-cal:ultimo-estoque-silagem";

export function guardarUltimoSilo(dados) {
  try {
    localStorage.setItem(CHAVE_ULTIMO_SILO, JSON.stringify({ ...dados, data: dataHoje() }));
  } catch {
    // Sem armazenamento: o botão de trazer o estoque fica indisponível.
  }
}

export function lerUltimoSilo() {
  try {
    const dados = JSON.parse(localStorage.getItem(CHAVE_ULTIMO_SILO));
    return dados && typeof dados.silagem === "string" && dados.estoqueT > 0 ? dados : null;
  } catch {
    return null;
  }
}

export function esquecerFormulario(chave) {
  try {
    localStorage.removeItem(chave);
  } catch {
    // ignora
  }
}

// ---------- Relatório (PDF) ----------

const CONTATOS = {
  celular: "(62) 9 9117-6151",
  celularLink: "https://wa.me/5562991176151",
  email: "zootecnicaateg@gmail.com",
  instagram: ["wederzootecnista", "leiteurgente"],
  grupo: "https://chat.whatsapp.com/CMfiai6BOjUHSrblzglZbq",
};

export function cabecalhoRelatorio(titulo, fazenda) {
  return `
    <header class="so-impressao rel-cabecalho">
      <img src="icons/logo-empresa.jpg" alt="Zootécnica" width="72" height="72">
      <div>
        <p class="rel-titulo">Relatório — ${escapar(titulo)}</p>
        <p class="rel-meta">${fazenda ? `Propriedade: <b>${escapar(fazenda)}</b> · ` : ""}Emitido em ${dataHoje()}</p>
      </div>
      <img src="icons/logo-96.png" alt="Assist Cal" width="48" height="48">
    </header>`;
}

export function premissasRelatorio(linhas) {
  return `
    <section class="so-impressao">
      <h3>Dados utilizados</h3>
      <table class="rel-premissas"><tbody>
        ${linhas.map(([nome, v]) => `<tr><td>${nome}</td><td>${v}</td></tr>`).join("")}
      </tbody></table>
    </section>`;
}

export function rodapeRelatorio() {
  const c = CONTATOS;
  return `
    <footer class="so-impressao rel-rodape">
      <p><b>Zootécnica Assist</b> — Assistência Técnica e Gerencial</p>
      <p>
        Celular/WhatsApp: <a href="${c.celularLink}">${c.celular}</a> ·
        E-mail: <a href="mailto:${c.email}">${c.email}</a>
      </p>
      <p>
        Instagram: ${c.instagram.map((u) => `<a href="https://instagram.com/${u}">@${u}</a>`).join(" e ")}
      </p>
      <p>Grupo de Gestão no WhatsApp: <a href="${c.grupo}">${c.grupo}</a></p>
      <p class="rel-aviso">Estimativa calculada pelo Assist Cal a partir dos dados informados; não substitui o acompanhamento técnico da propriedade.</p>
    </footer>`;
}

export const botaoPdf = () => `<button type="button" class="primario btn-pdf">Exportar PDF</button>`;

// Liga o botão "Exportar PDF" de um resultado; nomeArquivo() devolve as partes do nome.
export function ativarPdf(container, nomeArquivo, modulo) {
  container.addEventListener("click", (e) => {
    if (!e.target.closest(".btn-pdf")) return;
    avisarUso(modulo, "pdf");
    const tituloOriginal = document.title;
    // O título vira o nome sugerido do arquivo PDF.
    document.title = [...nomeArquivo(), dataHoje().replaceAll("/", "-")].filter(Boolean).join(" - ");
    window.addEventListener("afterprint", () => (document.title = tituloOriginal), { once: true });
    window.print();
  });
}

// ---------- Dicas (tooltip) ----------

const dica = document.createElement("div");
dica.className = "dica";
dica.hidden = true;
document.body.append(dica);

function mostrarDica(e) {
  const alvo = e.target.closest("[data-dica]");
  if (!alvo) {
    dica.hidden = true;
    return;
  }
  dica.textContent = alvo.dataset.dica;
  dica.hidden = false;
  const caixa = alvo.getBoundingClientRect();
  const largura = dica.offsetWidth;
  const x = Math.min(Math.max(8, caixa.left + caixa.width / 2 - largura / 2), window.innerWidth - largura - 8);
  dica.style.left = `${x}px`;
  dica.style.top = `${Math.max(8, caixa.top - dica.offsetHeight - 8)}px`;
}

export function ativarDicas(container) {
  container.addEventListener("pointerover", mostrarDica);
  container.addEventListener("pointerdown", mostrarDica);
  container.addEventListener("pointerleave", () => {
    dica.hidden = true;
  });
}
window.addEventListener("scroll", () => {
  dica.hidden = true;
});

// ---------- Gráfico de barras (SVG) ----------

function passoRedondo(bruto) {
  const p = 10 ** Math.floor(Math.log10(bruto));
  const n = bruto / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

// Barras verticais com grade discreta, rótulo só no maior e no menor valor e dica por barra.
export function graficoBarras({ valores, rotulos, cor, formatar, dicas, descricao }) {
  const L = 340;
  const A = 180;
  const esq = 40;
  const dir = 4;
  const topo = 18;
  const base = 22;
  const larguraUtil = L - esq - dir;
  const alturaUtil = A - topo - base;
  const maximo = Math.max(...valores, 0);
  const passo = maximo > 0 ? passoRedondo(maximo / 4) : 1;
  const teto = Math.max(passo, Math.ceil(maximo / passo) * passo);
  const y = (v) => topo + alturaUtil - (v / teto) * alturaUtil;
  const slot = larguraUtil / valores.length;
  const largura = Math.min(18, slot - 4);

  let grade = "";
  for (let v = 0; v <= teto + 1e-9; v += passo) {
    grade += `<line x1="${esq}" x2="${L - dir}" y1="${y(v)}" y2="${y(v)}" class="g-grade${v === 0 ? " g-base" : ""}"/>
      <text x="${esq - 6}" y="${y(v) + 3.5}" class="g-eixo" text-anchor="end">${formatar(v, true)}</text>`;
  }

  const iMax = valores.indexOf(Math.max(...valores));
  const iMin = valores.indexOf(Math.min(...valores));
  const barras = valores
    .map((v, i) => {
      const cx = esq + slot * i + slot / 2;
      const x = cx - largura / 2;
      const yv = y(v);
      const h = topo + alturaUtil - yv;
      const r = Math.min(4, h, largura / 2);
      // Topo arredondado, base reta apoiada no eixo.
      const caminho = h > 0
        ? `M${x},${topo + alturaUtil} V${yv + r} Q${x},${yv} ${x + r},${yv} H${x + largura - r} Q${x + largura},${yv} ${x + largura},${yv + r} V${topo + alturaUtil} Z`
        : "";
      const rotulo = (i === iMax || (i === iMin && iMin !== iMax))
        ? `<text x="${cx}" y="${yv - 5}" class="g-valor" text-anchor="middle">${formatar(v)}</text>`
        : "";
      return `<g data-dica="${escapar(dicas[i])}">
          <rect x="${esq + slot * i}" y="${topo}" width="${slot}" height="${alturaUtil}" fill="transparent"/>
          <path d="${caminho}" fill="${cor}"/>
          ${rotulo}
          <text x="${cx}" y="${A - 6}" class="g-eixo" text-anchor="middle">${escapar(rotulos[i])}</text>
        </g>`;
    })
    .join("");

  return `<svg class="grafico" viewBox="0 0 ${L} ${A}" role="img" aria-label="${escapar(descricao)}">${grade}${barras}</svg>`;
}
