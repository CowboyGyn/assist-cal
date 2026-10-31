// Cache dos arquivos do app para uso offline no campo.
// Ao alterar qualquer arquivo listado, incremente a versão.
const VERSAO = "ateg-cal-v32";
const ARQUIVOS = [
  "./",
  "index.html",
  "css/style.css",
  "js/app.js",
  "js/config.js",
  "js/uso.js",
  "js/ui/login.js",
  "js/ui/comum.js",
  "js/ui/rebanho.js",
  "js/ui/previsao.js",
  "js/ui/corte.js",
  "js/ui/volumoso.js",
  "js/ui/agio.js",
  "js/ui/capacidade.js",
  "js/ui/convite.js",
  "js/calc/rebanho.js",
  "js/calc/previsao.js",
  "js/calc/corte.js",
  "js/calc/volumoso.js",
  "js/calc/agio.js",
  "js/calc/capacidade.js",
  "js/dados/municipios.json",
  "manifest.webmanifest",
  "icons/favicon-64.png",
  "icons/logo-empresa.jpg",
  "icons/logo-96.png",
  "icons/logo-280.png",
  "icons/apple-touch-icon.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
  "convite/instalar-android.png",
  "convite/instalar-iphone.png",
];

self.addEventListener("install", (e) => {
  // A versão na URL evita o cache do navegador e do GitHub, que podem misturar arquivos de versões
  // diferentes (o fetch abaixo ignora esse parâmetro).
  const urls = ARQUIVOS.map((a) => `${a}?v=${VERSAO}`);
  e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(urls)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((chaves) => Promise.all(chaves.filter((k) => k !== VERSAO).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((r) => r ?? fetch(e.request)));
});
