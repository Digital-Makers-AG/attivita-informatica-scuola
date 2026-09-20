/* Prova della pagina argomento (assets/argomento.js) con un DOM finto.
 *
 * La pagina di prova è quella vera, SERVIZI_COMMERCIALI/WORDPRESS/index.html:
 * gli id e i valori di data-base / data-argomento si leggono da lì, così se il
 * modello cambia la prova se ne accorge invece di restare verde per caso.
 *
 *     deno test --allow-read tests/argomento_dom_test.js
 */
import { assertEquals, assert, assertStringIncludes } from 'jsr:@std/assert@1';

/* ---------- DOM finto ---------- */

class FintoNodo {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.figli = [];
    this.attributi = new Map();
    this.classi = new Set();
    this.dataset = {};
    this.hidden = false;
    this.nome = '';
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
  setAttribute(nome, valore) {
    this.attributi.set(nome, String(valore));
    if (nome === 'hidden') this.hidden = true;
  }
  getAttribute(nome) { return this.attributi.get(nome) ?? null; }
  append(...nodi) {
    for (const cosa of nodi) {
      const nodo = typeof cosa === 'string' || typeof cosa === 'number'
        ? Object.assign(new FintoNodo('#text'), { textContent: String(cosa) })
        : cosa;
      this.figli.push(nodo);
    }
  }
  replaceChildren(...nodi) { this.figli = []; this.append(...nodi); }
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

const PAGINA = 'SERVIZI_COMMERCIALI/WORDPRESS/index.html';
const html = await Deno.readTextFile(new URL('../' + PAGINA, import.meta.url));
const registro = new Map();
for (const [, id] of html.matchAll(/id="([^"]+)"/g)) registro.set(id, new FintoNodo('div'));
// e rispetta l'attributo hidden scritto nella pagina (errore, stato-vuoto...)
for (const [id, elemento] of registro) {
  const etichetta = (html.match(new RegExp('<[^>]*id="' + id + '"[^>]*>')) || [''])[0];
  if (/\shidden\b/.test(etichetta)) elemento.hidden = true;
}
const corpo = new FintoNodo('body');
corpo.dataset = {
  base: (html.match(/<body data-base="([^"]*)"/) || ['', ''])[1],
  argomento: (html.match(/<body data-base="[^"]*" data-argomento="([^"]*)"/) || ['', ''])[1],
};

const fintoDocumento = {
  createElement: (tag) => new FintoNodo(tag),
  createTextNode: (testo) => Object.assign(new FintoNodo('#text'), { textContent: String(testo) }),
  getElementById: (id) => registro.get(id) || null,
  body: corpo,
  title: 'WordPress · Attività di informatica',
};

globalThis.document = fintoDocumento;
globalThis.HubSenzaAvvioAutomatico = true;  // la pagina non deve partire da sola

await import('../assets/catalogo.js');
await import('../assets/argomento.js');
const { avvia, normalizzaArgomento } = globalThis.Argomento;

/* ---------- catalogo finto: due attività sotto WordPress, una altrove ---------- */

const CATALOGO = {
  etichette: {
    COMPETENZE_DIGITALI_BASE: 'Competenze digitali base',
    SERVIZI_COMMERCIALI: 'Servizi commerciali',
    WORDPRESS: 'WordPress',
  },
  voci: [
    { percorso: 'SERVIZI_COMMERCIALI/WORDPRESS/INSTALLARE/', titolo: 'Installare WordPress', descrizione: 'Hosting, database e tema.', tag: ['wordpress'], minuti: 120 },
    { percorso: 'SERVIZI_COMMERCIALI/WORDPRESS/MENU_E_PAGINE/', titolo: 'Menu e pagine', descrizione: 'Pagine, menu e utenti.', tag: ['wordpress'], minuti: 90 },
    { percorso: 'COMPETENZE_DIGITALI_BASE/MISSIONE_0/', titolo: 'Missione 0', tag: ['competenze-base'], minuti: 600 },
  ],
};

let risposta = () => Promise.resolve(CATALOGO);
let erroreFinto = null;
globalThis.fetch = async () => {
  if (erroreFinto) throw erroreFinto;
  return { ok: true, status: 200, json: () => Promise.resolve(risposta()) };
};

/* ---------- comodità per le prove ---------- */

const nodo = (id) => registro.get(id);
const schede = () => nodo('attivita').figli;
const titoloScheda = (scheda) => scheda.trova((n) => n.tagName === 'H2').figli[0];
const conConsoleTaciuta = async (funzione) => {
  const avvisi = [];
  const warnPrima = console.warn;
  const errorPrima = console.error;
  console.warn = (...pezzi) => avvisi.push(pezzi.join(' '));
  console.error = (...pezzi) => avvisi.push(pezzi.join(' '));
  try {
    await funzione();
  } finally {
    console.warn = warnPrima;
    console.error = errorPrima;
  }
  return avvisi;
};

/* ---------- prove ---------- */

Deno.test('normalizzaArgomento mette il percorso nella forma giusta', () => {
  assertEquals(normalizzaArgomento('SERVIZI_COMMERCIALI/WORDPRESS'), 'SERVIZI_COMMERCIALI/WORDPRESS/');
  assertEquals(normalizzaArgomento('SERVIZI_COMMERCIALI/WORDPRESS/'), 'SERVIZI_COMMERCIALI/WORDPRESS/');
  assertEquals(normalizzaArgomento('/SERVIZI_COMMERCIALI/WORDPRESS/'), 'SERVIZI_COMMERCIALI/WORDPRESS/');
  assertEquals(normalizzaArgomento(''), '');
  assertEquals(normalizzaArgomento(null), '');
});

Deno.test('la pagina legge il percorso dal <body> della pagina vera', () => {
  assertEquals(corpo.dataset.base, '../../');
  assertEquals(corpo.dataset.argomento, 'SERVIZI_COMMERCIALI/WORDPRESS/');
  assertStringIncludes(html, 'data-argomento="SERVIZI_COMMERCIALI/WORDPRESS/"');
});

Deno.test('la pagina elenca le attività dell\'argomento e si intitola col nome del catalogo', async () => {
  erroreFinto = null;
  corpo.dataset.argomento = 'SERVIZI_COMMERCIALI/WORDPRESS/';
  await conConsoleTaciuta(() => avvia());

  assertEquals(schede().length, 2);
  assertEquals(schede().map((s) => s.className), ['card attivita', 'card attivita']);
  assertEquals(schede().map((s) => titoloScheda(s).textContent), ['Installare WordPress', 'Menu e pagine']);
  assertEquals(titoloScheda(schede()[0]).getAttribute('href'),
    '../../SERVIZI_COMMERCIALI/WORDPRESS/INSTALLARE/');
  assertStringIncludes(schede()[0].textContent, '120 min');
  assertStringIncludes(schede()[0].textContent, 'ATTIVITÀ');
  assertStringIncludes(schede()[0].textContent, 'Servizi commerciali');

  // nome dell'area, nome dell'argomento e titolo della scheda del browser
  assertEquals(nodo('argomento-area').textContent, 'Servizi commerciali');
  assertEquals(nodo('argomento-titolo').textContent, 'WordPress');
  assertEquals(fintoDocumento.title, 'WordPress · Servizi commerciali');

  assertEquals(nodo('conteggio').textContent, '2 attività · 210 min');
  assertEquals(nodo('stato-vuoto').hidden, true);
  assertEquals(nodo('errore').hidden, true);
});

Deno.test('l\'ordine è per titolo e la Missione 0 non entra nella pagina di WordPress', async () => {
  corpo.dataset.argomento = 'SERVIZI_COMMERCIALI/WORDPRESS/';
  await conConsoleTaciuta(() => avvia());
  const titoli = schede().map((s) => titoloScheda(s).textContent);
  assertEquals(titoli.slice().sort((a, b) => a.localeCompare(b, 'it')), titoli);
  assertEquals(titoli.includes('Missione 0'), false);
});

Deno.test('un argomento senza attività lo dice, invece di restare muto', async () => {
  corpo.dataset.argomento = 'SERVIZI_COMMERCIALI/SEO/';
  await conConsoleTaciuta(() => avvia());

  assertEquals(schede().length, 0);
  assertEquals(nodo('stato-vuoto').hidden, false);
  assertStringIncludes(nodo('stato-vuoto').textContent, 'Questo argomento non ha ancora attività.');
  assertStringIncludes(nodo('stato-vuoto').textContent, 'catalogo.json');
  assertEquals(nodo('conteggio').textContent, '');
  assertEquals(nodo('argomento-titolo').textContent, 'Seo',
    'senza etichetta il nome si ricava dalla cartella');
});

Deno.test('senza etichetta nel catalogo il nome dell\'argomento si ricava dalla cartella', async () => {
  corpo.dataset.argomento = 'SERVIZI_COMMERCIALI/FOGLI_DI_CALCOLO/';
  await conConsoleTaciuta(() => avvia());
  assertEquals(nodo('argomento-titolo').textContent, 'Fogli di calcolo');
  assertEquals(nodo('argomento-area').textContent, 'Servizi commerciali');
});

Deno.test('una pagina senza data-argomento non fa niente e lo dice', async () => {
  corpo.dataset.argomento = '';
  const avvisi = await conConsoleTaciuta(() => avvia());
  assertEquals(schede().length, 0);
  assertEquals(nodo('errore').figli.length, 0, 'senza data-argomento non si elenca niente e non serve nessun messaggio di errore');
  assert(avvisi.some((a) => a.includes('data-argomento')), 'deve avvisare che manca data-argomento');

  // un percorso a un solo segmento non è un argomento
  corpo.dataset.argomento = 'SERVIZI_COMMERCIALI/';
  const avvisi2 = await conConsoleTaciuta(() => avvia());
  assertEquals(schede().length, 0);
  assert(avvisi2.some((a) => a.includes('data-argomento')));
  corpo.dataset.argomento = 'SERVIZI_COMMERCIALI/WORDPRESS/';
});

Deno.test('se il catalogo non arriva la pagina lo dice', async () => {
  erroreFinto = new Error('rete assente');
  corpo.dataset.argomento = 'SERVIZI_COMMERCIALI/WORDPRESS/';
  await conConsoleTaciuta(() => avvia());

  assertEquals(nodo('errore').hidden, false);
  assertStringIncludes(nodo('errore').textContent, 'rete assente');
  assertStringIncludes(nodo('errore').textContent, 'Non riesco a leggere il catalogo');
  assertEquals(schede().length, 0);
  assertEquals(nodo('stato-vuoto').hidden, true);
  erroreFinto = null;
});

Deno.test('col catalogo vero e le attività non ancora scritte, la pagina spiega cosa fare', async () => {
  risposta = () => Deno.readTextFile(new URL('../catalogo.json', import.meta.url)).then(JSON.parse);
  corpo.dataset.argomento = 'SERVIZI_COMMERCIALI/WORDPRESS/';
  await conConsoleTaciuta(() => avvia());

  assertEquals(schede().length, 0);
  assertEquals(nodo('stato-vuoto').hidden, false);
  assertStringIncludes(nodo('stato-vuoto').textContent, 'Questo argomento non ha ancora attività.');
  assertEquals(nodo('argomento-titolo').textContent, 'WordPress');
  assertEquals(nodo('argomento-area').textContent, 'Servizi commerciali');

  // l'argomento della Missione 0 invece è pronto, ma non ha attività nel catalogo
  corpo.dataset.argomento = 'COMPETENZE_DIGITALI_BASE/MISSIONE_0/';
  await conConsoleTaciuta(() => avvia());
  assertEquals(schede().length, 0);
  assertEquals(nodo('argomento-titolo').textContent, 'Missione 0');
  assertEquals(nodo('argomento-area').textContent, 'Competenze digitali base');
});
