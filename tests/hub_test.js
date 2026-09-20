/* Prove della logica dell'hub (assets/hub.js): filtri, ricerca, indirizzo.
 *
 * Si eseguono con Deno, senza browser e senza dipendenze installate:
 *     deno test --allow-read tests/hub_test.js
 *
 * Il catalogo finto ha la stessa forma di catalogo.json: le schede di argomento
 * non sono scritte a mano, le ricava assets/catalogo.js dalle attività.
 */
import { assertEquals, assert, assertStringIncludes } from 'jsr:@std/assert@1';

await import('../assets/catalogo.js');
const C = globalThis.Catalogo;
await import('../assets/hub.js');
const H = globalThis.Hub;
const {
  FILTRI_VUOTI, SUGGERIMENTI_MAX, TAG_VISIBILI,
  conteggiDinamici, filtra, filtriUguali, haFiltri, leggiHash, messaggioVuoto,
  normalizzaFiltri, normalizzaMostra, scriviHash, suggerimenti, testoConteggio,
} = H;

/* ---------- catalogo di prova: 5 argomenti e 2 attività, 13 tag ---------- */

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

const letto = C.normalizzaCatalogo(CATALOGO);
const VOCI = letto.voci;
const ETICHETTE = letto.etichette;
const base = (extra = {}) => normalizzaFiltri(Object.assign({}, FILTRI_VUOTI, extra));
const percorsi = (elenco) => elenco.map((v) => v.percorso);

Deno.test('il catalogo di prova è quello che le prove si aspettano', () => {
  assertEquals(letto.avvisi, []);
  assertEquals(VOCI.length, 7);
  assertEquals(VOCI.filter((v) => v.tipo === C.TIPO_ARGOMENTO).length, 5);
  assertEquals(VOCI.filter((v) => v.tipo === C.TIPO_ATTIVITA).length, 2);
  assertEquals(C.tagConConteggio(VOCI).length, 13);
});

/* ---------- filtri ---------- */

Deno.test('normalizzaMostra capisce le due forme e ignora il resto', () => {
  assertEquals(normalizzaMostra('argomenti'), 'argomenti');
  assertEquals(normalizzaMostra('Argomento'), 'argomenti');
  assertEquals(normalizzaMostra('ARGOMENTI'), 'argomenti');
  assertEquals(normalizzaMostra('attività'), 'attivita');
  assertEquals(normalizzaMostra('Attivita'), 'attivita');
  assertEquals(normalizzaMostra('tutto'), '');
  assertEquals(normalizzaMostra(''), '');
  assertEquals(normalizzaMostra(undefined), '');
  assertEquals(normalizzaMostra('strano'), '');
});

Deno.test('normalizzaFiltri sistema tag, modo e mostra', () => {
  assertEquals(normalizzaFiltri({ tag: ['HTML', '-inizio', 'html'], modo: 'AND', mostra: 'Argomenti' }), {
    area: '', tag: ['html'], modo: 'and', q: '', mostra: 'argomenti',
  });
  assertEquals(normalizzaFiltri(null), FILTRI_VUOTI);
});

Deno.test('filtra per area', () => {
  assertEquals(percorsi(filtra(VOCI, base({ area: 'SERVIZI_COMMERCIALI' }))).length, 6);
  assertEquals(percorsi(filtra(VOCI, base({ area: 'COMPETENZE_DIGITALI_BASE' }))).length, 1);
  assertEquals(filtra(VOCI, base({ area: 'AREA_INESISTENTE' })), []);
  assertEquals(filtra(VOCI, base()).length, 7, 'senza filtri si vedono argomenti e attività');
});

Deno.test('filtra per tipo: solo argomenti o solo attività', () => {
  assert(percorsi(filtra(VOCI, base({ mostra: 'argomenti' }))).every((p) => p.split('/').length === 3),
    'con "Argomenti" restano solo le schede a due segmenti');
  assertEquals(filtra(VOCI, base({ mostra: 'attivita' })).length, 2);
  assertEquals(percorsi(filtra(VOCI, base({ mostra: 'attivita' }))), [
    'SERVIZI_COMMERCIALI/WORDPRESS/INSTALLARE/',
    'SERVIZI_COMMERCIALI/WORDPRESS/MENU_E_PAGINE/',
  ]);
  assertEquals(filtra(VOCI, base({ area: 'SERVIZI_COMMERCIALI', mostra: 'attivita' })).length, 2);
  assertEquals(filtra(VOCI, base({ area: 'COMPETENZE_DIGITALI_BASE', mostra: 'attivita' })), []);
});

Deno.test('filtra per testo, senza badare a maiuscole né accenti', () => {
  assertEquals(percorsi(filtra(VOCI, base({ q: 'wordpress' }))), [
    'SERVIZI_COMMERCIALI/WORDPRESS/',
    'SERVIZI_COMMERCIALI/WORDPRESS/INSTALLARE/',
  ]);
  assertEquals(percorsi(filtra(VOCI, base({ q: 'WORDPRESS' }))).length, 2);
  assertEquals(percorsi(filtra(VOCI, base({ q: 'attivita inesistente' }))), []);
});

Deno.test('modo "oppure" allarga, modo "e" restringe', () => {
  const tag = ['wordpress', 'pagine'];
  const o = filtra(VOCI, base({ tag, modo: 'or' }));
  const e = filtra(VOCI, base({ tag, modo: 'and' }));
  assertEquals(percorsi(o), [
    'SERVIZI_COMMERCIALI/WORDPRESS/',
    'SERVIZI_COMMERCIALI/WORDPRESS/INSTALLARE/',
    'SERVIZI_COMMERCIALI/WORDPRESS/MENU_E_PAGINE/',
  ]);
  assertEquals(percorsi(e), [
    'SERVIZI_COMMERCIALI/WORDPRESS/',
    'SERVIZI_COMMERCIALI/WORDPRESS/MENU_E_PAGINE/',
  ]);
  assert(o.length > e.length, 'con "e" i risultati devono essere meno che con "oppure"');
  // con due tag che non stanno mai insieme resta una sola scheda
  assertEquals(percorsi(filtra(VOCI, base({ tag: ['siti-web', 'hosting'], modo: 'and' }))),
    ['SERVIZI_COMMERCIALI/CREAZIONE_SITI_WEB/']);
});

Deno.test('con "e" i tag di schede diverse non si incontrano mai', () => {
  assertEquals(filtra(VOCI, base({ tag: ['seo', 'css'], modo: 'and' })), []);
  assertEquals(filtra(VOCI, base({ tag: ['seo', 'css'], modo: 'or' })).length, 2);
});

Deno.test('i tre filtri si sommano: area, tipo e testo', () => {
  assertEquals(percorsi(filtra(VOCI, base({ area: 'SERVIZI_COMMERCIALI', mostra: 'argomenti', q: 'web' }))), [
    'SERVIZI_COMMERCIALI/CREAZIONE_SITI_WEB/',
    'SERVIZI_COMMERCIALI/LINGUAGGI_WEB/',
  ]);
});

/* ---------- conteggi e suggerimenti ---------- */

Deno.test('conteggiDinamici dice quanti risultati darebbe ogni tag', () => {
  const conteggi = conteggiDinamici(VOCI, base());
  assertEquals(conteggi.get('hosting'), 3);
  assertEquals(conteggi.get('wordpress'), 3);
  assertEquals(conteggi.get('seo'), 1);
  assertEquals(conteggi.get('competenze-base'), 1);
  // con "tutti i tag" il conteggio tiene conto dei tag già attivi
  assertEquals(conteggiDinamici(VOCI, base({ tag: ['siti-web'], modo: 'and' })).get('cms'), 1);
  assertEquals(conteggiDinamici(VOCI, base({ tag: ['siti-web'], modo: 'and' })).get('css'), 1);
  assertEquals(conteggiDinamici(VOCI, base({ tag: ['seo'], modo: 'and' })).get('css'), 0);
});

Deno.test('la tendina mette prima i tag, poi i titoli, e chiude con "cerca"', () => {
  const righe = suggerimenti(VOCI, 'sit', base());
  assertEquals(righe.length, 3, 'un tag, un titolo e la riga "cerca"');
  assertEquals(righe[0].tipo, 'tag');
  assertEquals(righe[0].valore, 'siti-web');
  assertEquals(righe[0].badge, '3 risultati');
  assertEquals(righe[1].tipo, 'titolo');
  assertEquals(righe[1].valore, 'Creare un sito web');
  assertEquals(righe[1].genere, 'argomento');
  assertEquals(righe[1].badge, 'Servizi commerciali');
  assertEquals(righe[2].tipo, 'cerca');
  assertEquals(righe[2].valore, 'sit');
  assertEquals(righe[2].etichetta, 'cerca "sit"');
  assertEquals(righe[2].badge, '2 risultati', 'il testo cerca anche nelle descrizioni');
});

Deno.test('la tendina non cresce oltre il limite e con testo vuoto non compare', () => {
  const righe = suggerimenti(VOCI, 'e', base());
  assertEquals(righe.length, SUGGERIMENTI_MAX);
  assertEquals(righe[righe.length - 1].tipo, 'cerca');
  assertEquals(suggerimenti(VOCI, '   ', base()), []);
  assertEquals(suggerimenti(VOCI, '', base()), []);
});

Deno.test('i tag trovati per primi vengono prima', () => {
  assertEquals(suggerimenti(VOCI, 'web', base()).filter((r) => r.tipo === 'tag').map((r) => r.valore),
    ['siti-web']);
});

/* ---------- indirizzo condivisibile ---------- */

Deno.test('leggiHash legge sia la forma con i nomi sia quella corta', () => {
  assertEquals(leggiHash('#area=SERVIZI_COMMERCIALI&tag=hosting,cms&modo=or&q=brand'), {
    area: 'SERVIZI_COMMERCIALI', tag: ['hosting', 'cms'], modo: 'or', q: 'brand', mostra: '',
  });
  assertEquals(leggiHash('#mostra=argomenti'), {
    area: '', tag: [], modo: 'or', q: '', mostra: 'argomenti',
  });
  assertEquals(leggiHash('#hosting,cms'), { area: '', tag: ['hosting', 'cms'], modo: 'or', q: '', mostra: '' });
  assertEquals(leggiHash(''), normalizzaFiltri(FILTRI_VUOTI));
  assertEquals(leggiHash('#'), normalizzaFiltri(FILTRI_VUOTI));
});

Deno.test('leggiHash ignora tag non validi e accetta modo scritto in maiuscolo', () => {
  assertEquals(leggiHash('#tag=-inizio,seo').tag, ['seo']);
  assertEquals(leggiHash('#modo=AND').modo, 'and');
  assertEquals(leggiHash('#modo=strano').modo, 'or');
  assertEquals(leggiHash('#mostra=Attività').mostra, 'attivita');
});

Deno.test('l\'indirizzo resta pulito quando non c\'è nessun filtro', () => {
  assertEquals(scriviHash(FILTRI_VUOTI), '');
  assertEquals(scriviHash(base({ modo: 'and' })), '');
});

Deno.test('scriviHash scrive "mostra" e si rilegge identico', () => {
  assertEquals(scriviHash(base({ mostra: 'argomenti' })), '#mostra=argomenti&modo=or');
  const filtri = base({ area: 'SERVIZI_COMMERCIALI', tag: ['siti-web', 'cms'], modo: 'and', q: 'brand', mostra: 'attivita' });
  assertEquals(scriviHash(filtri),
    '#area=SERVIZI_COMMERCIALI&tag=siti-web,cms&q=brand&mostra=attivita&modo=and');
  assertEquals(leggiHash(scriviHash(filtri)), filtri);
  const soloTag = base({ tag: ['hosting'], modo: 'and' });
  assertEquals(scriviHash(soloTag), '#tag=hosting&modo=and');
  assertEquals(leggiHash(scriviHash(soloTag)), soloTag);
});

Deno.test('filtriUguali tiene conto anche di "mostra"', () => {
  assert(filtriUguali(base({ tag: ['cms'] }), { tag: ['cms'], modo: 'or' }));
  assert(!filtriUguali(base({ tag: ['cms'], mostra: 'argomenti' }), base({ tag: ['cms'] })));
});

/* ---------- stato dei filtri e messaggi ---------- */

Deno.test('haFiltri distingue i filtri veri dalla sola preferenza AND/OR', () => {
  assert(!haFiltri(FILTRI_VUOTI));
  assert(!haFiltri(base({ modo: 'and' })));
  assert(haFiltri(base({ area: 'SOCIO_SANITARIO' })));
  assert(haFiltri(base({ tag: ['seo'] })));
  assert(haFiltri(base({ q: 'x' })));
  assert(haFiltri(base({ mostra: 'argomenti' })));
});

Deno.test('messaggioVuoto spiega quali filtri hanno svuotato la pagina', () => {
  assertEquals(messaggioVuoto(FILTRI_VUOTI, ETICHETTE), 'Nessun argomento o attività disponibile.');
  assertEquals(messaggioVuoto(base({ mostra: 'attivita' }), ETICHETTE), 'Nessuna attività disponibile.');
  assertEquals(messaggioVuoto(base({ mostra: 'argomenti' }), ETICHETTE), 'Nessun argomento disponibile.');
  assertEquals(messaggioVuoto(base({ tag: ['brand', 'seo'], modo: 'and' }), ETICHETTE),
    'Nessun argomento o attività con tag «brand» + «seo».');
  assertEquals(messaggioVuoto(base({ area: 'SERVIZI_COMMERCIALI', q: 'brand' }), ETICHETTE),
    'Nessun argomento o attività con area «Servizi commerciali», testo «brand».');
});

Deno.test('il riepilogo conta argomenti e attività', () => {
  assertEquals(testoConteggio(VOCI, ''), '5 argomenti e 2 attività');
  assertEquals(testoConteggio(VOCI, 'argomenti'), '5 argomenti');
  assertEquals(testoConteggio(VOCI, 'attivita'), '2 attività');
  assertEquals(testoConteggio([], ''), '0 risultati');
  assertEquals(testoConteggio(VOCI.filter((v) => v.tipo === C.TIPO_ATTIVITA), ''), '2 attività');
});

/* ---------- controllo del sito vero su disco ---------- */

const RADICE = new URL('../', import.meta.url);
const leggi = (percorso) => Deno.readTextFile(new URL(percorso, RADICE));

Deno.test('index.html dell\'hub ha tutti i contenitori che hub.js cerca', async () => {
  const html = await leggi('index.html');
  const contenitori = ['filtro-area', 'filtro-mostra', 'filtro-modo', 'q', 'sugg', 'filtro-tag',
    'mostra-tutti-tag', 'conteggio', 'filtri-attivi', 'azzera', 'cards', 'stato-vuoto', 'errore', 'avvisi'];
  for (const id of contenitori) assertStringIncludes(html, `id="${id}"`);
  assertStringIncludes(html, 'assets/hub.css');
  assertStringIncludes(html, '<body data-base="">');
  assert(!html.includes('type="module"'), 'niente moduli ES: gli script sono classici');
  assert(html.indexOf('assets/catalogo.js') < html.indexOf('assets/hub.js'),
    'assets/catalogo.js deve venire prima di assets/hub.js');
  assertStringIncludes(html, 'Mostra');
  assertStringIncludes(html, 'Come combinare i tag');
});

Deno.test('l\'hub parla di argomenti e attività, non più di moduli', async () => {
  const html = await leggi('index.html');
  assertStringIncludes(html, 'argomenti');
  assertStringIncludes(html, 'attività');
  assert(!html.includes('dati/moduli.json'), 'il catalogo ora è catalogo.json');
  assert(!html.includes('_TEMPLATE_MODULO'), 'il modello da copiare ora è _TEMPLATE_ARGOMENTO');
});

Deno.test('nei moduli non è rimasto nessun collegamento al vecchio indirizzo', async () => {
  const vecchi = /attivita-informatica-scuola\/(00_GUIDA|01_LEZIONE|02_LEZIONE|03_LEZIONE|04_LEZIONE|05_MISSIONE|06_PASSAPORTO|07_GRIGLIE|08_CLASSROOM|README\/|index\.html|sintesi\.html|verifica_codici\.html)/;
  const daControllare = [
    'COMPETENZE_DIGITALI_BASE/MISSIONE_0/index.html',
    'COMPETENZE_DIGITALI_BASE/MISSIONE_0/sintesi.html',
    'COMPETENZE_DIGITALI_BASE/MISSIONE_0/verifica_codici.html',
    'COMPETENZE_DIGITALI_BASE/MISSIONE_0/08_CLASSROOM_CONSEGNE/CONSEGNA_01_L1_TASTIERA_E_SCORCIATOIE/TRACCIA_STUDENTI.txt',
    'COMPETENZE_DIGITALI_BASE/MISSIONE_0/08_CLASSROOM_CONSEGNE/CONSEGNA_03_L2_SISTEMA_IL_DOCUMENTO/TRACCIA_STUDENTI.txt',
    'COMPETENZE_DIGITALI_BASE/MISSIONE_0/08_CLASSROOM_CONSEGNE/CONSEGNA_06_L4_PHISHING/TRACCIA_STUDENTI.txt',
    'COMPETENZE_DIGITALI_BASE/MISSIONE_0/08_CLASSROOM_CONSEGNE/CONSEGNA_08_MISSIONE_FINALE/TRACCIA_STUDENTI.txt',
  ];
  for (const percorso of daControllare) {
    const testo = await leggi(percorso);
    assert(!vecchi.test(testo), `${percorso} contiene ancora un indirizzo vecchio`);
    assertStringIncludes(testo, 'attivita-informatica-scuola/COMPETENZE_DIGITALI_BASE/MISSIONE_0/');
  }
});
