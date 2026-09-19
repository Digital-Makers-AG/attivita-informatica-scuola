/* Prove della logica dell'hub (assets/hub.js).
 *
 * Si eseguono con Deno, senza browser e senza dipendenze installate:
 *     deno test --allow-read tests/hub_test.js
 *
 * Il file di prova usa un elenco di moduli finto con la stessa forma di dati/moduli.json
 * (stesse aree, stesso numero di tag) e in fondo controlla anche il file vero su disco.
 */
import { assertEquals, assert, assertStringIncludes } from 'jsr:@std/assert@1';
import {
  TAG_VISIBILI, SUGGERIMENTI_MAX, FILTRI_VUOTI,
  aree, conteggiDinamici, filtra, haFiltri, labelDaChiave, leggiHash, messaggioVuoto,
  normalizza, normalizzaFiltri, normalizzaTag, normalizzaTesto, plurale, scriviHash,
  suggerimenti, tagConConteggio, tagValido,
} from '../assets/hub.js';

/* ---------- dati di prova: 7 moduli, 15 tag distinti ---------- */
const GREZZI = [
  { area: 'COMPETENZE_DIGITALI_BASE', percorso: 'COMPETENZE_DIGITALI_BASE/MISSIONE_0/', titolo: 'Missione 0 \u00b7 Riattiviamo le competenze digitali', descrizione: 'Quattro lezioni e una missione finale.', tag: ['competenze-base', 'file', 'documenti', 'ricerca', 'sicurezza'] },
  { area: 'SERVIZI_COMMERCIALI', percorso: 'SERVIZI_COMMERCIALI/BRAND/', titolo: 'Brand identity', descrizione: 'Marchio, logo e palette.', tag: ['brand', 'grafica'] },
  { area: 'SERVIZI_COMMERCIALI', percorso: 'SERVIZI_COMMERCIALI/CREAZIONE_SITI_WEB/', titolo: 'Creazione di siti web', descrizione: 'Dal dominio alla prima pagina online.', tag: ['siti-web', 'cms', 'hosting'] },
  { area: 'SERVIZI_COMMERCIALI', percorso: 'SERVIZI_COMMERCIALI/FOGLI_DI_CALCOLO/', titolo: 'Fogli di calcolo', descrizione: 'Preventivi e tabelle.', tag: ['fogli-di-calcolo'] },
  { area: 'SERVIZI_COMMERCIALI', percorso: 'SERVIZI_COMMERCIALI/LINGUAGGI_WEB/', titolo: 'Linguaggi del web', descrizione: 'HTML e CSS di base.', tag: ['siti-web', 'html', 'css'] },
  { area: 'SERVIZI_COMMERCIALI', percorso: 'SERVIZI_COMMERCIALI/SEO/', titolo: 'SEO', descrizione: 'Farsi trovare dai motori di ricerca.', tag: ['siti-web', 'seo'] },
  { area: 'SERVIZI_COMMERCIALI', percorso: 'SERVIZI_COMMERCIALI/WORDPRESS/', titolo: 'WordPress', descrizione: 'Il sito del cliente con WordPress.', tag: ['siti-web', 'cms', 'wordpress', 'hosting'] },
];
const { moduli: MODULI, avvisi: AVVISI } = normalizza(GREZZI);

const base = (extra = {}) => normalizzaFiltri({ ...FILTRI_VUOTI, ...extra });
const percorsi = (elenco) => elenco.map((m) => m.percorso);

/* ---------- etichette e tag ---------- */

Deno.test('labelDaChiave rende leggibile il nome della cartella', () => {
  assertEquals(labelDaChiave('COMPETENZE_DIGITALI_BASE'), 'Competenze digitali base');
  assertEquals(labelDaChiave('SERVIZI_COMMERCIALI'), 'Servizi commerciali');
  assertEquals(labelDaChiave('SOCIO_SANITARIO'), 'Socio sanitario');
  assertEquals(labelDaChiave(''), '');
  assertEquals(labelDaChiave(null), '');
});

Deno.test('tagValido accetta minuscole, cifre e trattini singoli', () => {
  assert(tagValido('siti-web'));
  assert(tagValido('fogli-di-calcolo'));
  assert(tagValido('seo2'));
  assert(!tagValido('Siti-Web'));
  assert(!tagValido('siti web'));
  assert(!tagValido('città'));
  assert(!tagValido('doppio--trattino'));
  assert(!tagValido('-inizio'));
  assert(!tagValido(''));
  assert(!tagValido(undefined));
});

/* ---------- lettura dei dati ---------- */

Deno.test('normalizza accetta i dati buoni senza avvisi', () => {
  assertEquals(AVVISI, []);
  assertEquals(MODULI.length, 7);
  assertEquals(MODULI[0].tagSet.has('documenti'), true);
});

Deno.test('normalizza non si rompe con dati storti e li segnala', () => {
  const esito = normalizza([
    null,
    { titolo: 'Senza percorso' },
    { area: 'X', percorso: 'X/A/', titolo: 'Tag sbagliato', tag: ['Va Bene', 'ok-tag'] },
    { area: 'X', percorso: 'X/A/', titolo: 'Duplicato' },
    { area: 'X', percorso: 'X/SENZA-SLASH', titolo: 'Percorso senza slash' },
  ]);
  assertEquals(esito.moduli.length, 2);
  assertEquals(esito.moduli[0].tag, ['ok-tag']);
  assertEquals(esito.avvisi.length, 5);
  assert(esito.avvisi.some((a) => a.includes('non e\u2019 un oggetto') || a.includes('non e')));
  assert(esito.avvisi.some((a) => a.includes('manca "percorso"')));
  assert(esito.avvisi.some((a) => a.includes('tag non valido')));
  assert(esito.avvisi.some((a) => a.includes('ripetuto')));
  assert(esito.avvisi.some((a) => a.includes('non finisce con "/"')));
});

Deno.test('normalizza segnala un JSON che non e\' un array', () => {
  const esito = normalizza({ moduli: [] });
  assertEquals(esito.moduli, []);
  assertEquals(esito.avvisi.length, 1);
});

Deno.test('aree elenca le aree presenti con conteggio ed etichetta', () => {
  assertEquals(aree(MODULI), [
    { chiave: 'COMPETENZE_DIGITALI_BASE', etichetta: 'Competenze digitali base', n: 1 },
    { chiave: 'SERVIZI_COMMERCIALI', etichetta: 'Servizi commerciali', n: 6 },
  ]);
});

Deno.test('tagConConteggio conta i tag e ordina per frequenza', () => {
  const tag = tagConConteggio(MODULI);
  assertEquals(tag.length, 15);
  assertEquals(tag[0], { tag: 'siti-web', n: 4 });
  assertEquals(tag.filter((t) => t.tag === 'hosting'), [{ tag: 'hosting', n: 2 }]);
  assertEquals(tag.slice(0, 4), [
    { tag: 'siti-web', n: 4 },
    { tag: 'cms', n: 2 },
    { tag: 'hosting', n: 2 },
    { tag: 'brand', n: 1 },
  ]);
  assert(tag.length > TAG_VISIBILI, `servono piu' di ${TAG_VISIBILI} tag per la tendina "mostra tutti"`);
});

/* ---------- filtro: area, testo, OR contro AND ---------- */

Deno.test('normalizzaTesto ignora maiuscole e accenti', () => {
  assertEquals(normalizzaTesto('  CITT\u00c0  '), 'citta');
  assertEquals(normalizzaTesto('Perch\u00e9'), 'perche');
  assertEquals(normalizzaTag('  Siti-Web '), 'siti-web');
});

Deno.test('filtra per area', () => {
  assertEquals(percorsi(filtra(MODULI, base({ area: 'SERVIZI_COMMERCIALI' }))).length, 6);
  assertEquals(percorsi(filtra(MODULI, base({ area: 'COMPETENZE_DIGITALI_BASE' }))).length, 1);
  assertEquals(filtra(MODULI, base({ area: 'AREA_INESISTENTE' })), []);
  assertEquals(filtra(MODULI, base()).length, 7);
});

Deno.test('filtra per testo, senza badare a maiuscole', () => {
  assertEquals(percorsi(filtra(MODULI, base({ q: 'wordpress' }))), ['SERVIZI_COMMERCIALI/WORDPRESS/']);
  assertEquals(percorsi(filtra(MODULI, base({ q: 'WORDPRESS' }))), ['SERVIZI_COMMERCIALI/WORDPRESS/']);
  assertEquals(filtra(MODULI, base({ q: 'argomento inesistente' })), []);
});

Deno.test('modo "oppure" allarga, modo "e" restringe', () => {
  const o = filtra(MODULI, base({ tag: ['siti-web', 'hosting'], modo: 'or' }));
  const e = filtra(MODULI, base({ tag: ['siti-web', 'hosting'], modo: 'and' }));
  assertEquals(percorsi(o), [
    'SERVIZI_COMMERCIALI/CREAZIONE_SITI_WEB/',
    'SERVIZI_COMMERCIALI/LINGUAGGI_WEB/',
    'SERVIZI_COMMERCIALI/SEO/',
    'SERVIZI_COMMERCIALI/WORDPRESS/',
  ]);
  assertEquals(percorsi(e), [
    'SERVIZI_COMMERCIALI/CREAZIONE_SITI_WEB/',
    'SERVIZI_COMMERCIALI/WORDPRESS/',
  ]);
  assert(o.length > e.length, 'con "e" i risultati devono essere meno che con "oppure"');
});

Deno.test('con "e" i tag di moduli diversi non si incontrano mai', () => {
  assertEquals(filtra(MODULI, base({ tag: ['brand', 'hosting'], modo: 'and' })), []);
  assertEquals(filtra(MODULI, base({ tag: ['html', 'wordpress'], modo: 'and' })), []);
});

Deno.test('area, tag e testo si sommano', () => {
  const dentro = filtra(MODULI, base({ area: 'SERVIZI_COMMERCIALI', tag: ['cms'], q: 'word' }));
  assertEquals(percorsi(dentro), ['SERVIZI_COMMERCIALI/WORDPRESS/']);
  const fuori = filtra(MODULI, base({ area: 'COMPETENZE_DIGITALI_BASE', tag: ['cms'], q: 'word' }));
  assertEquals(fuori, []);
});

/* ---------- numeri sui chip ---------- */

Deno.test('conteggiDinamici dice quanti moduli darebbe ogni tag', () => {
  const conteggi = conteggiDinamici(MODULI, base());
  assertEquals(conteggi.get('siti-web'), 4);
  assertEquals(conteggi.get('cms'), 2);
  assertEquals(conteggi.get('hosting'), 2);
  assertEquals(conteggi.get('fogli-di-calcolo'), 1);
  assertEquals(conteggi.size, 15);
});

Deno.test('con "e" il conteggio va a zero per i tag incompatibili', () => {
  const conteggi = conteggiDinamici(MODULI, base({ tag: ['siti-web'], modo: 'and' }));
  assertEquals(conteggi.get('siti-web'), 4);
  assertEquals(conteggi.get('cms'), 2);
  assertEquals(conteggi.get('css'), 1);
  assertEquals(conteggi.get('hosting'), 2);
  const aZero = [...conteggi.entries()].filter(([, n]) => n === 0).map(([t]) => t);
  assertEquals(aZero, ['brand', 'competenze-base', 'documenti', 'file', 'fogli-di-calcolo', 'grafica', 'ricerca', 'sicurezza']);
  assert(aZero.every((t) => !MODULI.some((m) => m.tagSet.has(t) && m.tagSet.has('siti-web'))));
});

Deno.test('il conteggio tiene conto anche di area e testo', () => {
  const conteggi = conteggiDinamici(MODULI, base({ area: 'COMPETENZE_DIGITALI_BASE' }));
  assertEquals(conteggi.get('siti-web'), 0);
  assertEquals(conteggi.get('sicurezza'), 1);
});

/* ---------- tendina di autocompletamento ---------- */

Deno.test('la tendina mette prima i tag, poi i titoli, in fondo "cerca"', () => {
  const righe = suggerimenti(MODULI, 'sit', base());
  assertEquals(righe.map((r) => r.tipo), ['tag', 'modulo', 'cerca']);
  assertEquals(righe[0].valore, 'siti-web');
  assertEquals(righe[0].badge, '4 moduli');
  assertEquals(righe[1].valore, 'Creazione di siti web');
  assertEquals(righe[1].badge, 'Servizi commerciali');
  assertEquals(righe[2].etichetta, 'cerca "sit"');
  assertEquals(righe[2].badge, '2 moduli');
});

Deno.test('la tendina non cresce oltre il limite e chiude sempre con "cerca"', () => {
  const righe = suggerimenti(MODULI, 'e', base());
  assertEquals(righe.length, SUGGERIMENTI_MAX);
  assertEquals(righe[righe.length - 1].tipo, 'cerca');
  assertEquals(suggerimenti(MODULI, '   ', base()), []);
});

Deno.test('i tag trovati per primi vengono prima', () => {
  const righe = suggerimenti(MODULI, 'web', base()).filter((r) => r.tipo === 'tag');
  assertEquals(righe.map((r) => r.valore), ['siti-web']);
});

/* ---------- indirizzo condivisibile ---------- */

Deno.test('leggiHash legge sia la forma con i nomi sia quella corta', () => {
  assertEquals(leggiHash('#area=SERVIZI_COMMERCIALI&tag=hosting,cms&modo=or&q=brand'), {
    area: 'SERVIZI_COMMERCIALI', tag: ['hosting', 'cms'], modo: 'or', q: 'brand',
  });
  assertEquals(leggiHash('#hosting,cms'), { area: '', tag: ['hosting', 'cms'], modo: 'or', q: '' });
  assertEquals(leggiHash('#siti-web'), { area: '', tag: ['siti-web'], modo: 'or', q: '' });
  assertEquals(leggiHash(''), normalizzaFiltri(FILTRI_VUOTI));
  assertEquals(leggiHash('#'), normalizzaFiltri(FILTRI_VUOTI));
});

Deno.test('leggiHash ignora tag non validi e accetta modo scritto in maiuscolo', () => {
  assertEquals(leggiHash('#tag=Va Bene,seo').tag, ['seo']);
  assertEquals(leggiHash('#modo=AND').modo, 'and');
  assertEquals(leggiHash('#modo=strano').modo, 'or');
});

Deno.test('l\'indirizzo resta pulito quando non c\'e\' nessun filtro', () => {
  assertEquals(scriviHash(FILTRI_VUOTI), '');
  assertEquals(scriviHash(base({ modo: 'and' })), '');
});

Deno.test('scriviHash produce sempre la stessa forma, e si rilegge identica', () => {
  const filtri = base({ area: 'SERVIZI_COMMERCIALI', tag: ['siti-web', 'cms'], modo: 'and', q: 'brand' });
  assertEquals(scriviHash(filtri), '#area=SERVIZI_COMMERCIALI&tag=siti-web,cms&q=brand&modo=and');
  assertEquals(leggiHash(scriviHash(filtri)), filtri);
  const soloTag = base({ tag: ['hosting'], modo: 'and' });
  assertEquals(scriviHash(soloTag), '#tag=hosting&modo=and');
  assertEquals(leggiHash(scriviHash(soloTag)), soloTag);
});

Deno.test('indirizzo condiviso che non puo\' dare risultati: la pagina deve dirlo', () => {
  const filtri = leggiHash('#area=SERVIZI_COMMERCIALI&tag=hosting,cms&modo=or&q=brand');
  assertEquals(filtra(MODULI, filtri), []);
  assertEquals(messaggioVuoto(filtri),
    'Nessun modulo con area \u00abServizi commerciali\u00bb, tag \u00abhosting\u00bb oppure \u00abcms\u00bb, testo \u00abbrand\u00bb.');
});

/* ---------- stato dei filtri ---------- */

Deno.test('haFiltri distingue i filtri veri dalla sola preferenza AND/OR', () => {
  assert(!haFiltri(FILTRI_VUOTI));
  assert(!haFiltri(base({ modo: 'and' })));
  assert(haFiltri(base({ area: 'SOCIO_SANITARIO' })));
  assert(haFiltri(base({ tag: ['seo'] })));
  assert(haFiltri(base({ q: 'x' })));
});

Deno.test('messaggioVuoto spiega quali filtri hanno svuotato la pagina', () => {
  assertEquals(messaggioVuoto(FILTRI_VUOTI), 'Nessun modulo disponibile.');
  assertEquals(messaggioVuoto(base({ tag: ['brand', 'seo'], modo: 'and' })),
    'Nessun modulo con tag \u00abbrand\u00bb + \u00abseo\u00bb.');
});

Deno.test('plurale sceglie la parola giusta', () => {
  assertEquals(plurale(0, 'modulo', 'moduli'), '0 moduli');
  assertEquals(plurale(1, 'modulo', 'moduli'), '1 modulo');
  assertEquals(plurale(3, 'modulo', 'moduli'), '3 moduli');
});

/* ---------- controllo del sito vero su disco ---------- */

const RADICE = new URL('../', import.meta.url);
const leggi = (percorso) => Deno.readTextFile(new URL(percorso, RADICE));
const statDi = (percorso) => Deno.stat(new URL(percorso, RADICE));

Deno.test('dati/moduli.json e\' un array valido e senza voci da sistemare', async () => {
  const letto = JSON.parse(await leggi('dati/moduli.json'));
  assert(Array.isArray(letto), 'dati/moduli.json deve contenere un array');
  const esito = normalizza(letto);
  assertEquals(esito.avvisi, []);
  assert(esito.moduli.length > 0, 'l\'elenco dei moduli e\' vuoto');
  const tag = tagConConteggio(esito.moduli);
  assert(tag.length > TAG_VISIBILI,
    `con ${tag.length} tag la tendina "mostra tutti i tag" non comparirebbe (servono piu' di ${TAG_VISIBILI})`);
  assertEquals(aree(esito.moduli).map((a) => a.chiave), ['COMPETENZE_DIGITALI_BASE', 'SERVIZI_COMMERCIALI']);
});

Deno.test('ogni modulo elencato esiste davvero e ha la sua pagina index.html', async () => {
  const { moduli } = normalizza(JSON.parse(await leggi('dati/moduli.json')));
  for (const m of moduli) {
    const cartella = await statDi(m.percorso);
    assert(cartella.isDirectory, `${m.percorso} non e' una cartella`);
    const pagina = await statDi(`${m.percorso}index.html`);
    assert(pagina.isFile, `manca la pagina ${m.percorso}index.html`);
  }
});

Deno.test('ogni sottocartella di un\'area elencata compare in dati/moduli.json', async () => {
  const { moduli } = normalizza(JSON.parse(await leggi('dati/moduli.json')));
  const elencati = new Set(moduli.map((m) => m.percorso));
  for (const { chiave } of aree(moduli)) {
    for await (const voce of Deno.readDir(new URL(`${chiave}/`, RADICE))) {
      if (!voce.isDirectory) continue;
      const percorso = `${chiave}/${voce.name}/`;
      assert(elencati.has(percorso), `${percorso} esiste su disco ma non e' in dati/moduli.json`);
    }
  }
});

Deno.test('index.html dell\'hub ha tutti i contenitori che hub.js cerca', async () => {
  const html = await leggi('index.html');
  const contenitori = ['filtro-area', 'filtro-modo', 'q', 'sugg', 'filtro-tag', 'mostra-tutti-tag',
    'conteggio', 'filtri-attivi', 'azzera', 'cards', 'stato-vuoto', 'errore', 'avvisi'];
  for (const id of contenitori) assertStringIncludes(html, `id="${id}"`);
  assertStringIncludes(html, 'assets/hub.css');
  assertStringIncludes(html, 'assets/hub.js');
  assertStringIncludes(html, 'type="module"');
});

Deno.test('ogni area ha una pagina che riporta all\'hub', async () => {
  const { moduli } = normalizza(JSON.parse(await leggi('dati/moduli.json')));
  for (const { chiave } of aree(moduli)) {
    const html = await leggi(`${chiave}/index.html`);
    assertStringIncludes(html, 'url=../index.html');
    assertStringIncludes(html, 'href="../index.html"');
  }
});

Deno.test('nei moduli non e\' rimasto nessun collegamento al vecchio indirizzo', async () => {
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

