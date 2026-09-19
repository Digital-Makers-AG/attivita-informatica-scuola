/* Prova della parte "browser" di assets/hub.js con un DOM finto.
 *
 * Non serve un browser: qui c'e' un DOM minimo che registra figli, attributi ed eventi.
 * Gli elementi finti vengono creati per gli id davvero presenti in index.html: se hub.js
 * cerca un contenitore che non esiste, ottiene null e la prova fallisce.
 *
 *     deno test --allow-read tests/hub_dom_test.js
 */
import { assertEquals, assert, assertStringIncludes } from 'jsr:@std/assert@1';
import { avvia, CHIAVE_MODO, TAG_VISIBILI } from '../assets/hub.js';

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
      // nel DOM vero una stringa diventa un nodo di testo
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
    const evento = { target: this, preventDefault() {}, stopPropagation() {}, ...dettagli };
    for (const funzione of this.eventi.get(tipo) ?? []) funzione(evento);
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

const fintoDocumento = {
  createElement: (tag) => new FintoNodo(tag),
  createTextNode: (testo) => Object.assign(new FintoNodo('#text'), { textContent: String(testo) }),
  getElementById: (id) => registro.get(id) ?? null,
  addEventListener: (tipo, funzione) => ascoltatoriDocumento.set(tipo, funzione),
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

/* i contenitori finti sono quelli elencati in index.html: nessun id inventato a mano */
const htmlHub = await Deno.readTextFile(new URL('../index.html', import.meta.url));
for (const [, id] of htmlHub.matchAll(/id="([^"]+)"/g)) {
  registro.set(id, new FintoNodo('div'));
}

let rispostaFinta = async (percorso) => {
  const testo = await Deno.readTextFile(new URL(`../${percorso}`, import.meta.url));
  return { ok: true, status: 200, json: () => Promise.resolve(JSON.parse(testo)) };
};

globalThis.document = fintoDocumento;
globalThis.window = fintaFinestra;
globalThis.fetch = (percorso) => rispostaFinta(percorso);

/* ---------- comodità per le prove ---------- */

const nodo = (id) => registro.get(id);
const schede = () => nodo('cards').figli;
const chipDi = (contenitore, etichetta) => nodo(contenitore).figli.find((c) => c.textContent.includes(etichetta));
const premuti = (contenitore) => nodo(contenitore).figli.filter((c) => c.getAttribute('aria-pressed') === 'true');
const indirizzo = () => fintaFinestra.history.ultimoIndirizzo;
const titoliSchede = () => schede().map((s) => s.trova((n) => n.tagName === 'A' && n.className.includes('titolo')).textContent);

/* ---------- prove ---------- */

Deno.test('all\'avvio l\'hub disegna un riquadro per modulo e i chip dei filtri', async () => {
  fintaFinestra.location.hash = '';
  await avvia();

  assertEquals(schede().length, 7);
  assertStringIncludes(nodo('conteggio').textContent, '7');
  assertStringIncludes(nodo('conteggio').textContent, 'moduli');

  for (const scheda of schede()) {
    for (const link of scheda.tutti().filter((n) => n.tagName === 'A')) {
      assertEquals(link.getAttribute('target'), '_blank', 'ogni link deve aprire una scheda nuova');
      assertEquals(link.getAttribute('rel'), 'noopener');
    }
    assert(scheda.getAttribute('class') === null && scheda.className.includes('modulo'));
  }

  const prima = schede()[0];
  const titolo = prima.trova((n) => n.tagName === 'H2').figli[0];
  assertStringIncludes(titolo.textContent, 'Missione 0');
  assertEquals(titolo.getAttribute('href'), 'COMPETENZE_DIGITALI_BASE/MISSIONE_0/');
  assertStringIncludes(prima.textContent, 'Competenze digitali base');
  assertStringIncludes(prima.textContent, 'documenti');

  // aree: "tutte" piu' una per area, con il numero di moduli
  const chipsArea = nodo('filtro-area').figli;
  assertEquals(chipsArea.length, 3);
  assertStringIncludes(chipsArea[1].textContent, 'Competenze digitali base');
  assertStringIncludes(chipsArea[2].textContent, 'Servizi commerciali');
  assertStringIncludes(chipsArea[2].textContent, '6');
  assertEquals(premuti('filtro-area').length, 1);
  assertEquals(premuti('filtro-area')[0].textContent, 'Tutte le aree');

  // modo: due chip, all'inizio "almeno un tag"
  assertEquals(premuti('filtro-modo').length, 1);
  assertStringIncludes(premuti('filtro-modo')[0].textContent, 'Almeno un tag');

  // tag: se ne vedono al massimo TAG_VISIBILI, con il pulsante per vederli tutti
  assertEquals(nodo('filtro-tag').figli.length, TAG_VISIBILI);
  assertEquals(nodo('mostra-tutti-tag').hidden, false);
  assertEquals(nodo('mostra-tutti-tag').textContent, 'mostra tutti i tag (15)');
  assertEquals(premuti('filtro-tag').length, 0);

  nodo('mostra-tutti-tag').succede('click');
  assertEquals(nodo('filtro-tag').figli.length, 15);
  assertStringIncludes(nodo('mostra-tutti-tag').textContent, 'pi\u00f9 usati');
  nodo('mostra-tutti-tag').succede('click');
  assertEquals(nodo('filtro-tag').figli.length, TAG_VISIBILI);

  // niente filtri attivi: nessun pulsante azzera e indirizzo pulito
  assertEquals(nodo('azzera').hidden, true);
  assertEquals(indirizzo(), '/attivita-informatica-scuola/');
});

Deno.test('area, tag, modo "e", azzera: l\'elenco e l\'indirizzo seguono i clic', async () => {
  fintaFinestra.location.hash = '';
  await avvia();

  chipDi('filtro-area', 'Servizi commerciali').succede('click');
  assertEquals(schede().length, 6);
  assertEquals(indirizzo(), '/attivita-informatica-scuola/#area=SERVIZI_COMMERCIALI&modo=or');
  assertEquals(nodo('azzera').hidden, false);
  assertEquals(premuti('filtro-area').length, 1);

  chipDi('filtro-tag', 'siti-web').succede('click');
  assertEquals(schede().length, 4);
  assertEquals(indirizzo(), '/attivita-informatica-scuola/#area=SERVIZI_COMMERCIALI&tag=siti-web&modo=or');
  const chipSitiWeb = chipDi('filtro-tag', 'siti-web');
  assertEquals(chipSitiWeb.getAttribute('aria-pressed'), 'true');
  assertStringIncludes(chipSitiWeb.textContent, '\u00d7');

  // OPPURE: ospitare oppure creare siti -> quattro moduli
  chipDi('filtro-tag', 'hosting').succede('click');
  assertEquals(schede().length, 4);

  // E: servono entrambi i tag -> due moduli, e i chip incompatibili si spengono
  chipDi('filtro-modo', 'Tutti i tag').succede('click');
  assertEquals(schede().length, 2);
  assertEquals(fintaFinestra.localStorage.getItem(CHIAVE_MODO), 'and');
  assertEquals(chipDi('filtro-tag', 'brand').getAttribute('disabled'), '');
  assertEquals(chipDi('filtro-tag', 'fogli-di-calcolo').getAttribute('disabled'), '');
  assertEquals(chipDi('filtro-tag', 'cms').getAttribute('disabled'), null);
  assertStringIncludes(chipDi('filtro-tag', 'cms').textContent, '2');
  assertStringIncludes(indirizzo(), 'modo=and');

  // azzera riporta tutto come all'inizio, ma ricorda la preferenza E
  nodo('azzera').succede('click');
  assertEquals(schede().length, 7);
  assertEquals(nodo('azzera').hidden, true);
  assertEquals(indirizzo(), '/attivita-informatica-scuola/');
  assertEquals(chipDi('filtro-modo', 'Tutti i tag').getAttribute('aria-pressed'), 'true');
});

Deno.test('tendina di autocompletamento: tag, titoli, "cerca" e tastiera', async () => {
  fintaFinestra.location.hash = '';
  await avvia();

  const campo = nodo('q');
  campo.value = 'sit';
  campo.succede('input', { target: campo });
  assertEquals(campo.getAttribute('aria-expanded'), 'true');
  assertEquals(nodo('sugg').hidden, false);
  const righe = nodo('sugg').figli;
  // "sit" compare in un tag, in due titoli e in due descrizioni: sotto ci sono le righe della tendina
  assertEquals(righe.length, 4);
  assertStringIncludes(righe[0].textContent, 'siti-web');
  assertStringIncludes(righe[0].textContent, '3 moduli');
  assertStringIncludes(righe[1].textContent, 'Creare un sito web');
  assertStringIncludes(righe[1].textContent, 'Servizi commerciali');
  assertStringIncludes(righe[2].textContent, 'WordPress: il sito del cliente');
  assert(righe[3].classList.contains('cerca'));
  assertStringIncludes(righe[3].textContent, 'cerca "sit"');
  assertStringIncludes(righe[3].textContent, '4 moduli');
  assertEquals(schede().length, 4, 'mentre si scrive l\'elenco si restringe subito');

  // freccia giu' due volte, poi invio: si sceglie la seconda riga, un titolo
  campo.succede('keydown', { key: 'ArrowDown', target: campo });
  campo.succede('keydown', { key: 'ArrowDown', target: campo });
  assertEquals(campo.getAttribute('aria-activedescendant'), 'sugg-1');
  assertEquals(righe[1].getAttribute('aria-selected'), 'true');
  campo.succede('keydown', { key: 'Enter', target: campo });
  assertEquals(campo.value, 'Creare un sito web: dal dominio alla prima pagina online');
  assertEquals(schede().length, 1);
  assertEquals(nodo('sugg').hidden, true);
  assertEquals(campo.getAttribute('aria-expanded'), 'false');
  assertStringIncludes(indirizzo(), 'q=Creare');

  // clic su una riga "cerca": conferma il testo scritto
  campo.value = 'word';
  campo.succede('input', { target: campo });
  const ultima = nodo('sugg').figli.at(-1);
  assert(ultima.classList.contains('cerca'));
  ultima.succede('mousedown', { preventDefault() {} });
  assertEquals(campo.value, 'word');
  assertEquals(schede().length, 1);
  assertStringIncludes(indirizzo(), 'q=word');
  assertEquals(nodo('sugg').hidden, true);

  // Esc chiude la tendina senza toccare i filtri
  campo.value = 'seo';
  campo.succede('input', { target: campo });
  assertEquals(nodo('sugg').hidden, false);
  campo.succede('keydown', { key: 'Escape', target: campo });
  assertEquals(nodo('sugg').hidden, true);
  assertEquals(campo.value, 'seo');
});

Deno.test('indirizzo condiviso senza risultati: la pagina lo spiega e propone di azzerare', async () => {
  fintaFinestra.location.hash = '#area=SERVIZI_COMMERCIALI&tag=hosting,cms&modo=or&q=brand';
  await avvia();

  assertEquals(schede().length, 0);
  assertEquals(nodo('stato-vuoto').hidden, false);
  assertStringIncludes(nodo('stato-vuoto').textContent, 'Nessun modulo con area \u00abServizi commerciali\u00bb');
  assertStringIncludes(nodo('stato-vuoto').textContent, 'testo \u00abbrand\u00bb');
  assertEquals(nodo('q').value, 'brand');
  assertEquals(premuti('filtro-tag').length, 2);
  assertEquals(premuti('filtro-area').length, 1);
  // l'indirizzo viene riscritto nella forma canonica
  assertEquals(indirizzo(),
    '/attivita-informatica-scuola/#area=SERVIZI_COMMERCIALI&tag=hosting,cms&q=brand&modo=or');

  nodo('stato-vuoto').trova((n) => n.className.includes('all')).succede('click');
  assertEquals(schede().length, 7);
  assertEquals(nodo('stato-vuoto').hidden, true);
  assertEquals(nodo('q').value, '');
  assertEquals(indirizzo(), '/attivita-informatica-scuola/');
});

Deno.test('se i dati non arrivano la pagina lo dice invece di restare vuota', async () => {
  rispostaFinta = async () => { throw new Error('rete assente'); };
  await avvia();

  assertEquals(nodo('errore').hidden, false);
  assertStringIncludes(nodo('errore').textContent, 'rete assente');
  assertStringIncludes(nodo('errore').textContent, 'elenco dei moduli');
  assertEquals(schede().length, 0);
  assertEquals(nodo('stato-vuoto').hidden, true);
});

