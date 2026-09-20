/* Prova della parte "browser" dell'hub (assets/hub.js) con un DOM finto.
 *
 * Non serve un browser: qui c'è un DOM minimo che registra figli, attributi ed eventi.
 * Gli elementi finti vengono creati per gli id davvero presenti in index.html: se hub.js
 * cerca un contenitore che non esiste, ottiene null e la prova fallisce.
 *
 *     deno test --allow-read tests/hub_dom_test.js
 */
import { assertEquals, assert, assertStringIncludes } from 'jsr:@std/assert@1';

/* ---------- DOM finto ---------- */

class FintoNodo {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.figli = [];
    this.attributi = new Map();
    this.eventi = new Map();
    this.classi = new Set();
    this.dataset = {};
    this.hidden = false;
    this.disabled = false;
    this.value = '';
    this.nome = '';
    this.parentElement = null;
    this.classList = {
      add: (c) => this.classi.add(c),
      remove: (c) => this.classi.delete(c),
      contains: (c) => this.classi.has(c),
    };
  }
  set className(valore) { this.classi = new Set(String(valore).split(/\s+/).filter(Boolean)); }
  get className() { return [...this.classi].join(' '); }
  set textContent(valore) { this.nome = String(valore); this.figli = []; }
  get textContent() { return this.nome + this.figli.map((f) => f.textContent).join(''); }
  get children() { return this.figli; }
  setAttribute(nome, valore) {
    this.attributi.set(nome, String(valore));
    if (nome === 'hidden') this.hidden = true;
    if (nome === 'disabled') this.disabled = true;
  }
  getAttribute(nome) { return this.attributi.get(nome) ?? null; }
  removeAttribute(nome) { this.attributi.delete(nome); }
  append(...nodi) {
    for (const cosa of nodi) {
      const nodo = typeof cosa === 'string' || typeof cosa === 'number'
        ? Object.assign(new FintoNodo('#text'), { textContent: String(cosa) })
        : cosa;
      nodo.parentElement = this;
      this.figli.push(nodo);
    }
  }
  replaceChildren(...nodi) { this.figli = []; this.append(...nodi); }
  addEventListener(tipo, funzione) {
    if (!this.eventi.has(tipo)) this.eventi.set(tipo, []);
    this.eventi.get(tipo).push(funzione);
  }
  contains(nodo) { return nodo === this || this.figli.some((f) => f.contains(nodo)); }
  /** Fa finta che sia successo qualcosa: la prova preme, scrive o preme un tasto. */
  succede(tipo, dettagli = {}) {
    const evento = Object.assign({ target: this, preventDefault() {}, stopPropagation() {} }, dettagli);
    for (const funzione of this.eventi.get(tipo) || []) funzione(evento);
  }
  trova(predicato) {
    if (predicato(this)) return this;
    for (const figlio of this.figli) {
      const trovato = figlio.trova(predicato);
      if (trovato) return trovato;
    }
    return null;
  }
  tutti() { return [this, ...this.figli.flatMap((f) => f.tutti())]; }
}

const registro = new Map();
const ascoltatoriDocumento = new Map();
const ascoltatoriFinestra = new Map();

/* la pagina finta è index.html: id, data-base e nient'altro inventato a mano */
const htmlHub = await Deno.readTextFile(new URL('../index.html', import.meta.url));
for (const [, id] of htmlHub.matchAll(/id="([^"]+)"/g)) registro.set(id, new FintoNodo('div'));
// e rispetta l'attributo hidden scritto nella pagina (sugg, azzera, stato-vuoto...)
for (const [id, elemento] of registro) {
  const etichetta = (htmlHub.match(new RegExp('<[^>]*id="' + id + '"[^>]*>')) || [''])[0];
  if (/\shidden\b/.test(etichetta)) elemento.hidden = true;
}
const baseDichiarata = (htmlHub.match(/<body data-base="([^"]*)"/) || ['', ''])[1];

/* nel vero index.html il campo di ricerca sta dentro .qwrap: qui si replica,
   perché hub.js usa parentElement per capire se il clic è fuori dalla tendina */
const qwrap = new FintoNodo('div');
qwrap.append(registro.get('q'));

const fintoDocumento = {
  createElement: (tag) => new FintoNodo(tag),
  createTextNode: (testo) => Object.assign(new FintoNodo('#text'), { textContent: String(testo) }),
  getElementById: (id) => registro.get(id) || null,
  addEventListener: (tipo, funzione) => ascoltatoriDocumento.set(tipo, funzione),
  body: Object.assign(new FintoNodo('body'), { dataset: { base: baseDichiarata } }),
};

const fintaFinestra = {
  location: { pathname: '/attivita-informatica-scuola/', search: '', hash: '' },
  history: {
    ultimoIndirizzo: null,
    replaceState(_stato, _titolo, indirizzo) { this.ultimoIndirizzo = indirizzo; },
  },
  localStorage: {
    memoria: new Map(),
    getItem(chiave) { return this.memoria.has(chiave) ? this.memoria.get(chiave) : null; },
    setItem(chiave, valore) { this.memoria.set(chiave, String(valore)); },
  },
  addEventListener: (tipo, funzione) => ascoltatoriFinestra.set(tipo, funzione),
};

/* catalogo finto: 5 argomenti (di cui uno ricavato dalle sue attività) e 2 attività, 13 tag */
const CATALOGO = {
  etichette: {
    COMPETENZE_DIGITALI_BASE: 'Competenze digitali base',
    SERVIZI_COMMERCIALI: 'Servizi commerciali',
    WORDPRESS: 'WordPress',
    SEO: 'SEO',
  },
  voci: [
    { percorso: 'COMPETENZE_DIGITALI_BASE/MISSIONE_0/', titolo: 'Missione 0 · Riattiviamo le competenze digitali', descrizione: 'Quattro lezioni e una missione finale.', tag: ['competenze-base', 'file', 'documenti', 'ricerca', 'sicurezza'], minuti: 600 },
    { percorso: 'SERVIZI_COMMERCIALI/WORDPRESS/', descrizione: 'Il sito del cliente con WordPress.' },
    { percorso: 'SERVIZI_COMMERCIALI/WORDPRESS/INSTALLARE/', titolo: 'Installare WordPress', descrizione: 'Hosting, database e tema.', tag: ['wordpress', 'hosting'], minuti: 120 },
    { percorso: 'SERVIZI_COMMERCIALI/WORDPRESS/MENU_E_PAGINE/', titolo: 'Menu e pagine', descrizione: 'Pagine, menu e utenti.', tag: ['wordpress', 'pagine'], minuti: 90 },
    { percorso: 'SERVIZI_COMMERCIALI/SEO/', titolo: 'Farsi trovare: SEO di base', descrizione: 'Titoli, descrizioni e parole chiave.', tag: ['siti-web', 'seo'], minuti: 90 },
    { percorso: 'SERVIZI_COMMERCIALI/CREAZIONE_SITI_WEB/', titolo: 'Creare un sito web', descrizione: 'Dal dominio alla prima pagina online.', tag: ['siti-web', 'cms', 'hosting'], minuti: 120 },
    { percorso: 'SERVIZI_COMMERCIALI/LINGUAGGI_WEB/', titolo: 'I linguaggi del web', descrizione: 'HTML e CSS scritti a mano.', tag: ['siti-web', 'html', 'css'], minuti: 150 },
  ],
};

const ARGOMENTI = 5;
const ATTIVITA = 2;

let rispostaFinta = async () => ({ ok: true, status: 200, json: () => Promise.resolve(CATALOGO) });
let erroreFinto = null;
const fetchFinto = async (percorso) => {
  if (erroreFinto) throw erroreFinto;
  return rispostaFinta(percorso);
};

globalThis.document = fintoDocumento;
globalThis.window = fintaFinestra;
globalThis.fetch = fetchFinto;
globalThis.HubSenzaAvvioAutomatico = true;

await import('../assets/catalogo.js');
await import('../assets/hub.js');
const { avvia, CHIAVE_MODO, TAG_VISIBILI } = globalThis.Hub;

/* ---------- comodità per le prove ---------- */

const nodo = (id) => registro.get(id);
const schede = () => nodo('cards').figli;
const chipDi = (contenitore, etichetta) => nodo(contenitore).figli.find((c) => c.textContent.includes(etichetta));
const premuti = (contenitore) => nodo(contenitore).figli.filter((c) => c.getAttribute('aria-pressed') === 'true');
const badgeDurata = (scheda) => scheda.trova((n) => n.className.includes('badge-durata'));
const indirizzo = () => fintaFinestra.history.ultimoIndirizzo;
const titoloScheda = (scheda) => scheda.trova((n) => n.tagName === 'H2').figli[0];

/* ---------- prove ---------- */

Deno.test('all\'avvio si vedono argomenti e attività, con i chip di tutti i filtri', async () => {
  fintaFinestra.location.hash = '';
  erroreFinto = null;
  // la preferenza AND/OR ricordata non deve passare da una prova all'altra
  fintaFinestra.localStorage.memoria.clear();
  await avvia();

  assertEquals(schede().length, ARGOMENTI + ATTIVITA, 'una scheda per argomento e una per attività');
  assertEquals(nodo('conteggio').textContent, '5 argomenti e 2 attività');

  for (const scheda of schede()) {
    for (const link of scheda.tutti().filter((n) => n.tagName === 'A')) {
      assertEquals(link.getAttribute('target'), '_blank', 'ogni link apre una scheda nuova');
      assertEquals(link.getAttribute('rel'), 'noopener');
    }
    assert(scheda.getAttribute('class') === null);
  }

  // la prima scheda è la Missione 0: argomento già pronto, col suo badge e i suoi tag
  const prima = schede()[0];
  assert(prima.className.includes('argomento'), 'le schede di argomento hanno la classe argomento');
  assertStringIncludes(titoloScheda(prima).textContent, 'Missione 0');
  assertEquals(titoloScheda(prima).getAttribute('href'), 'COMPETENZE_DIGITALI_BASE/MISSIONE_0/');
  assertStringIncludes(prima.textContent, 'ARGOMENTO');
  assertStringIncludes(prima.textContent, 'Competenze digitali base');
  assertStringIncludes(prima.textContent, 'documenti');
  assertEquals(badgeDurata(prima).textContent, '600 min');

  // l'ordine: prima le schede dell'area "Competenze digitali base", poi "Servizi commerciali"
  assertEquals(schede().map((s) => s.className.includes('attivita')),
    [false, false, false, false, false, true, true]);
  assertEquals(schede().map((s) => s.trova((n) => n.className.includes('area-badge')).textContent),
    ['Competenze digitali base', 'Servizi commerciali', 'Servizi commerciali', 'Servizi commerciali',
      'Servizi commerciali', 'Servizi commerciali', 'Servizi commerciali']);

  // la scheda dell'argomento WordPress è ricavata dalle sue due attività
  const wordpress = schede().find((s) => titoloScheda(s).textContent === 'WordPress');
  assertEquals(badgeDurata(wordpress).textContent, '2 attività · 210 min');
  assertStringIncludes(wordpress.textContent, 'Il sito del cliente con WordPress.');

  // aree: "tutte" più una per area, con il numero di schede
  const chipsArea = nodo('filtro-area').figli;
  assertEquals(chipsArea.length, 3);
  assertStringIncludes(chipsArea[1].textContent, 'Competenze digitali base');
  assertStringIncludes(chipsArea[1].textContent, '1');
  assertStringIncludes(chipsArea[2].textContent, 'Servizi commerciali');
  assertStringIncludes(chipsArea[2].textContent, '6');
  assertEquals(premuti('filtro-area').length, 1);
  assertEquals(premuti('filtro-area')[0].textContent, 'Tutte le aree');

  // mostra: "tutto" all'inizio
  assertEquals(nodo('filtro-mostra').figli.map((c) => c.textContent), ['Tutto', 'Argomenti', 'Attività']);
  assertEquals(premuti('filtro-mostra').length, 1);
  assertEquals(premuti('filtro-mostra')[0].textContent, 'Tutto');

  // modo: due chip, all'inizio "almeno un tag"
  assertEquals(premuti('filtro-modo').length, 1);
  assertStringIncludes(premuti('filtro-modo')[0].textContent, 'Almeno un tag');

  // tag: se ne vedono al massimo TAG_VISIBILI, con il pulsante per vederli tutti
  assertEquals(nodo('filtro-tag').figli.length, TAG_VISIBILI);
  assertEquals(nodo('mostra-tutti-tag').hidden, false);
  assertEquals(nodo('mostra-tutti-tag').textContent, 'mostra tutti i tag (13)');
  assertEquals(premuti('filtro-tag').length, 0);
  assertStringIncludes(nodo('filtro-tag').figli[0].textContent, 'hosting');

  nodo('mostra-tutti-tag').succede('click');
  assertEquals(nodo('filtro-tag').figli.length, 13);
  assertStringIncludes(nodo('mostra-tutti-tag').textContent, 'più usati');
  nodo('mostra-tutti-tag').succede('click');
  assertEquals(nodo('filtro-tag').figli.length, TAG_VISIBILI);

  // niente filtri attivi: nessun pulsante azzera e indirizzo pulito
  assertEquals(nodo('azzera').hidden, true);
  assertEquals(indirizzo(), '/attivita-informatica-scuola/');
});

Deno.test('area, tag, modo "e", azzera: l\'elenco e l\'indirizzo seguono i clic', async () => {
  fintaFinestra.location.hash = '';
  erroreFinto = null;
  // la preferenza AND/OR ricordata non deve passare da una prova all'altra
  fintaFinestra.localStorage.memoria.clear();
  await avvia();

  chipDi('filtro-area', 'Servizi commerciali').succede('click');
  assertEquals(schede().length, 6);
  assertEquals(indirizzo(), '/attivita-informatica-scuola/#area=SERVIZI_COMMERCIALI&modo=or');
  assertEquals(nodo('azzera').hidden, false);
  assertEquals(premuti('filtro-area').length, 1);

  chipDi('filtro-tag', 'siti-web').succede('click');
  assertEquals(schede().length, 3);
  assertEquals(indirizzo(), '/attivita-informatica-scuola/#area=SERVIZI_COMMERCIALI&tag=siti-web&modo=or');
  const chipSitiWeb = chipDi('filtro-tag', 'siti-web');
  assertEquals(chipSitiWeb.getAttribute('aria-pressed'), 'true');
  assertStringIncludes(chipSitiWeb.textContent, '\u00d7');

  // OPPURE: siti-web oppure css
  chipDi('filtro-tag', 'css').succede('click');
  assertEquals(schede().length, 3, 'SEO, Creare un sito web e I linguaggi del web');
  assertStringIncludes(chipDi('filtro-tag', 'css').textContent, '3');

  // E: servono entrambi i tag, e i chip che non possono dare risultati si spengono
  chipDi('filtro-modo', 'Tutti i tag').succede('click');
  assertEquals(schede().length, 1);
  assertEquals(fintaFinestra.localStorage.getItem(CHIAVE_MODO), 'and');
  assertEquals(chipDi('filtro-tag', 'wordpress').disabled, true);
  assertEquals(chipDi('filtro-tag', 'html').disabled, false, 'html con siti-web e css dà una scheda');
  assertStringIncludes(chipDi('filtro-tag', 'html').textContent, '1');
  assertEquals(chipDi('filtro-tag', 'cms').disabled, true, 'cms non sta con siti-web e css insieme');
  assertStringIncludes(indirizzo(), 'modo=and');

  // azzera riporta tutto come all'inizio, ma ricorda la preferenza E
  nodo('azzera').succede('click');
  assertEquals(schede().length, 7);
  assertEquals(nodo('azzera').hidden, true);
  assertEquals(indirizzo(), '/attivita-informatica-scuola/');
  assertEquals(chipDi('filtro-modo', 'Tutti i tag').getAttribute('aria-pressed'), 'true');
});

Deno.test('il filtro "Mostra" stringe l\'elenco ad argomenti o ad attività', async () => {
  fintaFinestra.location.hash = '';
  erroreFinto = null;
  // la preferenza AND/OR ricordata non deve passare da una prova all'altra
  fintaFinestra.localStorage.memoria.clear();
  await avvia();

  chipDi('filtro-mostra', 'Attività').succede('click');
  assertEquals(schede().length, ATTIVITA);
  assertEquals(nodo('conteggio').textContent, '2 attività');
  assertEquals(schede().every((s) => s.className.includes('attivita')), true);
  assertEquals(indirizzo(), '/attivita-informatica-scuola/#mostra=attivita&modo=or');
  assertEquals(nodo('azzera').hidden, false);

  chipDi('filtro-mostra', 'Argomenti').succede('click');
  assertEquals(schede().length, ARGOMENTI);
  assertEquals(nodo('conteggio').textContent, '5 argomenti');
  assertEquals(schede().every((s) => s.className.includes('argomento')), true);


  // si somma agli altri filtri: con "Argomenti" attivo l'area stringe ancora
  chipDi('filtro-area', 'Servizi commerciali').succede('click');
  assertEquals(schede().length, 4, 'i quattro argomenti di Servizi commerciali');
  assertEquals(nodo('conteggio').textContent, '4 argomenti');

  // con "Attività" restano le due attività di quell'area
  chipDi('filtro-mostra', 'Attività').succede('click');
  assertEquals(schede().length, ATTIVITA);
  assertEquals(nodo('conteggio').textContent, '2 attività');

  // "Tutto" rimette insieme argomenti e attività dell'area scelta
  chipDi('filtro-mostra', 'Tutto').succede('click');
  assertEquals(schede().length, 6);
  nodo('azzera').succede('click');
  assertEquals(schede().length, 7);
  assertEquals(indirizzo(), '/attivita-informatica-scuola/');
});

Deno.test('tendina di autocompletamento: tag, titoli, "cerca" e tastiera', async () => {
  fintaFinestra.location.hash = '';
  erroreFinto = null;
  // la preferenza AND/OR ricordata non deve passare da una prova all'altra
  fintaFinestra.localStorage.memoria.clear();
  await avvia();

  const campo = nodo('q');
  campo.value = 'sit';
  campo.succede('input', { target: campo });
  assertEquals(campo.getAttribute('aria-expanded'), 'true');
  assertEquals(nodo('sugg').hidden, false);
  const righe = nodo('sugg').figli;
  assertEquals(righe.length, 3, 'un tag, un titolo e la riga "cerca"');
  assertStringIncludes(righe[0].textContent, 'siti-web');
  assertStringIncludes(righe[0].textContent, '1 risultato',
    'col testo "sit" attivo il tag siti-web darebbe una sola scheda');
  assertStringIncludes(righe[1].textContent, 'Creare un sito web');
  assertStringIncludes(righe[1].textContent, 'argomento');
  assert(righe[2].classList.contains('cerca'));
  assertStringIncludes(righe[2].textContent, 'cerca "sit"');
  assertStringIncludes(righe[2].textContent, '2 risultati');
  assertEquals(schede().length, 2, 'mentre si scrive l\'elenco si restringe subito');

  // freccia giù due volte, poi invio: si sceglie la seconda riga, un titolo
  campo.succede('keydown', { key: 'ArrowDown', target: campo });
  campo.succede('keydown', { key: 'ArrowDown', target: campo });
  assertEquals(campo.getAttribute('aria-activedescendant'), 'sugg-1');
  assertEquals(righe[1].getAttribute('aria-selected'), 'true');
  campo.succede('keydown', { key: 'Enter', target: campo });
  assertEquals(campo.value, 'Creare un sito web');
  assertEquals(schede().length, 1);
  assertEquals(nodo('sugg').hidden, true);
  assertEquals(campo.getAttribute('aria-expanded'), 'false');
  assertStringIncludes(indirizzo(), 'q=Creare');

  // clic su una riga "cerca": conferma il testo scritto
  campo.value = 'seo';
  campo.succede('input', { target: campo });
  const ultima = nodo('sugg').figli.at(-1);
  assert(ultima.classList.contains('cerca'));
  ultima.succede('mousedown', { preventDefault() {} });
  assertEquals(campo.value, 'seo');
  assertEquals(schede().length, 1);
  assertStringIncludes(indirizzo(), 'q=seo');
  assertEquals(nodo('sugg').hidden, true);

  // Esc chiude la tendina senza toccare i filtri
  campo.value = 'web';
  campo.succede('input', { target: campo });
  assertEquals(nodo('sugg').hidden, false);
  campo.succede('keydown', { key: 'Escape', target: campo });
  assertEquals(nodo('sugg').hidden, true);
  assertEquals(campo.value, 'web');

  // un clic fuori dal campo chiude la tendina
  campo.value = 'web';
  campo.succede('input', { target: campo });
  assertEquals(nodo('sugg').hidden, false);
  ascoltatoriDocumento.get('click')({ target: new FintoNodo('div') });
  assertEquals(nodo('sugg').hidden, true);
});

Deno.test('indirizzo condiviso senza risultati: la pagina lo spiega e propone di azzerare', async () => {
  fintaFinestra.location.hash = '#area=SERVIZI_COMMERCIALI&tag=siti-web,cms&modo=or&q=brand';
  erroreFinto = null;
  // la preferenza AND/OR ricordata non deve passare da una prova all'altra
  fintaFinestra.localStorage.memoria.clear();
  await avvia();

  assertEquals(schede().length, 0);
  assertEquals(nodo('stato-vuoto').hidden, false);
  assertStringIncludes(nodo('stato-vuoto').textContent,
    'Nessun argomento o attività con area \u00abServizi commerciali\u00bb');
  assertStringIncludes(nodo('stato-vuoto').textContent, 'testo \u00abbrand\u00bb');
  assertEquals(nodo('q').value, 'brand');
  assertEquals(premuti('filtro-tag').length, 2);
  assertEquals(premuti('filtro-area').length, 1);
  // l'indirizzo viene riscritto nella forma canonica
  assertEquals(indirizzo(),
    '/attivita-informatica-scuola/#area=SERVIZI_COMMERCIALI&tag=siti-web,cms&q=brand&modo=or');

  nodo('stato-vuoto').trova((n) => n.className.includes('all')).succede('click');
  assertEquals(schede().length, 7);
  assertEquals(nodo('stato-vuoto').hidden, true);
  assertEquals(nodo('q').value, '');
  assertEquals(indirizzo(), '/attivita-informatica-scuola/');
});

Deno.test('se il catalogo non arriva la pagina lo dice invece di restare vuota', async () => {
  erroreFinto = new Error('rete assente');
  await avvia();

  assertEquals(nodo('errore').hidden, false);
  assertStringIncludes(nodo('errore').textContent, 'rete assente');
  assertStringIncludes(nodo('errore').textContent, 'Non riesco a leggere il catalogo');
  assertEquals(schede().length, 0);
  assertEquals(nodo('stato-vuoto').hidden, true);
  erroreFinto = null;
  // la preferenza AND/OR ricordata non deve passare da una prova all'altra
  fintaFinestra.localStorage.memoria.clear();
});

Deno.test('con il catalogo vero su disco si vede la scheda della Missione 0', async () => {
  rispostaFinta = async () => ({
    ok: true,
    status: 200,
    json: () => Deno.readTextFile(new URL('../catalogo.json', import.meta.url)).then(JSON.parse),
  });
  fintaFinestra.location.hash = '';
  await avvia();

  assertEquals(schede().length, 1);
  assertEquals(nodo('conteggio').textContent, '1 argomento');
  const scheda = schede()[0];
  assertStringIncludes(titoloScheda(scheda).textContent, 'Missione 0 · Riattiviamo le competenze digitali');
  assertEquals(titoloScheda(scheda).getAttribute('href'), 'COMPETENZE_DIGITALI_BASE/MISSIONE_0/');
  assert(scheda.className.includes('argomento'));
  assertEquals(badgeDurata(scheda).textContent, '600 min');
  assertEquals(nodo('filtro-area').figli.length, 2, '"tutte le aree" più la sola area in catalogo');
  assertStringIncludes(nodo('filtro-area').figli[1].textContent, 'Competenze digitali base');
  assertEquals(nodo('avvisi').hidden, true, 'il catalogo vero non deve avere avvisi');
});
