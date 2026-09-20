/* Prove del catalogo (assets/catalogo.js).
 *
 * Si eseguono con Deno, senza browser e senza dipendenze installate:
 *     deno test --allow-read tests/catalogo_test.js
 *
 * Il catalogo finto qui sotto ha la stessa forma di catalogo.json e serve a
 * dimostrare la regola principale: un argomento non si scrive, si ricava dalle
 * sue attività (tag uniti, minuti sommati, numero di attività). Le ultime prove
 * controllano il catalogo vero e le pagine vere su disco.
 */
import { assertEquals, assert, assertStringIncludes } from 'jsr:@std/assert@1';

await import('../assets/catalogo.js');
const C = globalThis.Catalogo;

/* ---------- catalogo di prova ---------- */

const ETICHETTE = {
  COMPETENZE_DIGITALI_BASE: 'Competenze digitali base',
  SERVIZI_COMMERCIALI: 'Servizi commerciali',
  WORDPRESS: 'WordPress',
};

const CATALOGO = {
  etichette: ETICHETTE,
  voci: [
    { tipo: 'attivita', percorso: 'SERVIZI_COMMERCIALI/WORDPRESS/INSTALLARE/', titolo: 'Installare WordPress', descrizione: 'Hosting, database e prima configurazione.', tag: ['wordpress', 'hosting'], minuti: 120 },
    { percorso: 'SERVIZI_COMMERCIALI/WORDPRESS/MENU_E_PAGINE/', titolo: 'Menu e pagine', descrizione: 'Pagine, menu e utenti.', tag: ['wordpress', 'pagine'], minuti: 90 },
    { percorso: 'SERVIZI_COMMERCIALI/WORDPRESS/', descrizione: 'Otto ore per mettere online il sito del cliente.' },
    { percorso: 'SERVIZI_COMMERCIALI/BRAND/', titolo: 'Brand identity', tag: ['brand', 'grafica'], minuti: 60 },
    { percorso: 'COMPETENZE_DIGITALI_BASE/MISSIONE_0/', titolo: 'Missione 0 · Riattiviamo le competenze digitali', tag: ['competenze-base', 'file'], minuti: 600 },
    { percorso: 'COMPETENZE_DIGITALI_BASE/MISSIONE_0/LEZIONE_1/', titolo: 'Tastiera e scorciatoie', tag: ['tastiera'], minuti: 60 },
  ],
};

const letto = C.normalizzaCatalogo(CATALOGO);
const perPercorso = (percorso) => letto.voci.find((v) => v.percorso === percorso);

/* ---------- nomi leggibili ---------- */

Deno.test('etichettaCartella rende leggibile il nome della cartella', () => {
  assertEquals(C.etichettaCartella('COMPETENZE_DIGITALI_BASE'), 'Competenze digitali base');
  assertEquals(C.etichettaCartella('SERVIZI_COMMERCIALI'), 'Servizi commerciali');
  assertEquals(C.etichettaCartella('SEO'), 'Seo');
  assertEquals(C.etichettaCartella(''), '');
  assertEquals(C.etichettaCartella(null), '');
});

Deno.test('etichettaDi preferisce la mappa "etichette" e ripiega sulla derivazione', () => {
  assertEquals(C.etichettaDi('WORDPRESS', ETICHETTE), 'WordPress');
  assertEquals(C.etichettaDi('SEO', ETICHETTE), 'Seo');
  assertEquals(C.etichettaDi('SEO', { SEO: '  SEO  ' }), 'SEO');
  assertEquals(C.etichettaDi('X', { X: '   ' }), 'X');
  assertEquals(C.etichettaDi('FOGLI_DI_CALCOLO', null), 'Fogli di calcolo');
  assertEquals(C.etichettaDi('', ETICHETTE), '');
});

Deno.test('tagValido accetta minuscole, cifre e trattini singoli', () => {
  assert(C.tagValido('siti-web'));
  assert(C.tagValido('seo2'));
  assert(!C.tagValido('Siti-Web'));
  assert(!C.tagValido('siti web'));
  assert(!C.tagValido('citta\u0300'));
  assert(!C.tagValido('doppio--trattino'));
  assert(!C.tagValido('-inizio'));
  assert(!C.tagValido(''));
  assert(!C.tagValido(undefined));
});

Deno.test('normalizzaTag sistema spazi e maiuscole', () => {
  assertEquals(C.normalizzaTag('  Siti Web '), 'siti-web');
  assertEquals(C.normalizzaTag('WordPress'), 'wordpress');
  assertEquals(C.normalizzaTag(null), '');
});

Deno.test('normalizzaTesto ignora maiuscole e accenti', () => {
  assertEquals(C.normalizzaTesto('  CITT\u00c0  '), 'citta');
  assertEquals(C.normalizzaTesto('Perch\u00e9'), 'perche');
  assertEquals(C.normalizzaTesto(null), '');
});

Deno.test('minutiValidi accetta numeri e stringhe, scarta il resto', () => {
  assertEquals(C.minutiValidi(120), 120);
  assertEquals(C.minutiValidi('90'), 90);
  assertEquals(C.minutiValidi('45,5'), 46);
  assertEquals(C.minutiValidi(0), null);
  assertEquals(C.minutiValidi(-5), null);
  assertEquals(C.minutiValidi('due ore'), null);
  assertEquals(C.minutiValidi(null), null);
});

Deno.test('plurale sceglie la parola giusta', () => {
  assertEquals(C.plurale(0, 'risultato', 'risultati'), '0 risultati');
  assertEquals(C.plurale(1, 'risultato', 'risultati'), '1 risultato');
  assertEquals(C.plurale(1, 'attività', 'attività'), '1 attività');
  assertEquals(C.plurale(3, 'attività', 'attività'), '3 attività');
});

Deno.test('percorsoChiuso e percorsoArgomento normalizzano i percorsi', () => {
  assertEquals(C.percorsoChiuso('A/B'), 'A/B/');
  assertEquals(C.percorsoChiuso('A/B/'), 'A/B/');
  assertEquals(C.percorsoChiuso('   '), '');
  assertEquals(C.percorsoChiuso(null), '');
  assertEquals(C.percorsoArgomento({ percorso: 'A/B/C/' }), 'A/B/');
  assertEquals(C.percorsoArgomento({ percorso: 'A/B/' }), 'A/B/');
  assertEquals(C.percorsoArgomento({ percorso: '' }), '');
});

/* ---------- lettura del catalogo ---------- */

Deno.test('un catalogo buono non produce avvisi', () => {
  assertEquals(letto.avvisi, []);
  assertEquals(letto.etichette, ETICHETTE);
  assertEquals(letto.voci.length, 6, 'le voci di partenza sono 6: 4 attività e 2 argomenti senza attività');
});

Deno.test('il tipo di ogni scheda lo decide il percorso, non la parola scritta', () => {
  assertEquals(perPercorso('SERVIZI_COMMERCIALI/WORDPRESS/INSTALLARE/').tipo, C.TIPO_ATTIVITA);
  assertEquals(perPercorso('SERVIZI_COMMERCIALI/WORDPRESS/').tipo, C.TIPO_ARGOMENTO);
  assertEquals(perPercorso('COMPETENZE_DIGITALI_BASE/MISSIONE_0/').argomentoEtichetta,
    'Missione 0');
  assertEquals(perPercorso('COMPETENZE_DIGITALI_BASE/MISSIONE_0/').areaEtichetta,
    'Competenze digitali base');
});

Deno.test('la tendina "etichette" copre anche il nome dell\'argomento', () => {
  assertEquals(perPercorso('SERVIZI_COMMERCIALI/WORDPRESS/').titolo, 'WordPress');
  assertEquals(perPercorso('SERVIZI_COMMERCIALI/BRAND/').titolo, 'Brand identity',
    'il titolo scritto a mano vince su quello derivato');
});

/* ---------- derivazione dell'argomento dalle attività ---------- */

Deno.test('un argomento nasce dalle sue attività: tag uniti e minuti sommati', () => {
  const wordpress = perPercorso('SERVIZI_COMMERCIALI/WORDPRESS/');
  assertEquals(wordpress.derivata, true, 'la scheda WordPress non è scritta: è ricavata');
  assertEquals(wordpress.nAttivita, 2);
  assertEquals(wordpress.tag, ['wordpress', 'hosting', 'pagine']);
  assertEquals(wordpress.minuti, 210);
  assertEquals(wordpress.titolo, 'WordPress', 'il titolo arriva dalla mappa etichette');
  assertEquals(wordpress.descrizione, 'Otto ore per mettere online il sito del cliente.',
    'la descrizione scritta a mano resta');
});

Deno.test('togliendo le attività l\'argomento sparisce: è davvero derivato', () => {
  const senzaAttivita = C.normalizzaCatalogo({
    etichette: ETICHETTE,
    voci: CATALOGO.voci.filter((v) => !v.percorso.startsWith('SERVIZI_COMMERCIALI/WORDPRESS/')),
  });
  assertEquals(senzaAttivita.voci.some((v) => v.percorso === 'SERVIZI_COMMERCIALI/WORDPRESS/'), false);
  assertEquals(senzaAttivita.avvisi, []);

  // e basta aggiungere le attività perché l'argomento torni, con i conti giusti
  const rimesse = C.normalizzaCatalogo({
    etichette: ETICHETTE,
    voci: senzaAttivita.voci.map((v) => ({ percorso: v.percorso })).concat({
      percorso: 'SERVIZI_COMMERCIALI/WORDPRESS/INSTALLARE/', titolo: 'Installare', tag: ['wordpress'], minuti: 30,
    }),
  });
  const tornato = rimesse.voci.find((v) => v.percorso === 'SERVIZI_COMMERCIALI/WORDPRESS/');
  assertEquals(tornato.nAttivita, 1);
  assertEquals(tornato.minuti, 30);
  assertEquals(tornato.tag, ['wordpress']);
});

Deno.test('le voci scritte a mano sovrascrivono i campi derivati, uno per uno', () => {
  const missione = perPercorso('COMPETENZE_DIGITALI_BASE/MISSIONE_0/');
  assertEquals(missione.derivata, true, 'ha un\'attività, quindi è anche un argomento derivato');
  assertEquals(missione.nAttivita, 1);
  assertEquals(missione.titolo, 'Missione 0 · Riattiviamo le competenze digitali');
  assertEquals(missione.tag, ['competenze-base', 'file'], 'i tag scritti a mano vincono su quelli uniti');
  assertEquals(missione.minuti, 600);
});

Deno.test('una voce di argomento senza attività è una scheda come le altre', () => {
  const brand = perPercorso('SERVIZI_COMMERCIALI/BRAND/');
  assertEquals(brand.derivata, false);
  assertEquals(brand.nAttivita, 0);
  assertEquals(brand.minuti, 60);
  assertEquals(C.testoBadge(brand), '60 min');
});

/* ---------- schede e badge ---------- */

Deno.test('il badge dice quante attività e quanto dura un argomento', () => {
  assertEquals(C.testoBadge(perPercorso('SERVIZI_COMMERCIALI/WORDPRESS/')), '2 attività · 210 min');
  assertEquals(C.testoBadge(perPercorso('SERVIZI_COMMERCIALI/WORDPRESS/INSTALLARE/')), '120 min');
});

Deno.test('un argomento senza minuti mostra solo il numero di attività', () => {
  const esito = C.normalizzaCatalogo({
    etichette: ETICHETTE,
    voci: [{ percorso: 'SERVIZI_COMMERCIALI/SEO/FARSI_TROVARE/', titolo: 'Farsi trovare', tag: ['seo'] }],
  });
  const seo = esito.voci.find((v) => v.percorso === 'SERVIZI_COMMERCIALI/SEO/');
  assertEquals(seo.minuti, null);
  assertEquals(C.testoBadge(seo), '1 attività');
  assertEquals(C.testoBadge(esito.voci.find((v) => v.tipo === C.TIPO_ATTIVITA)), '', 'senza durata niente badge');
});

/* ---------- elenchi per l'interfaccia ---------- */

Deno.test('aree elenca le aree presenti con conteggio ed etichetta', () => {
  assertEquals(C.aree(letto.voci), [
    { chiave: 'COMPETENZE_DIGITALI_BASE', etichetta: 'Competenze digitali base', n: 2 },
    { chiave: 'SERVIZI_COMMERCIALI', etichetta: 'Servizi commerciali', n: 4 },
  ]);
});

Deno.test('tagConConteggio conta i tag di argomenti e attività, per frequenza', () => {
  assertEquals(C.tagConConteggio(letto.voci), [
    { tag: 'wordpress', n: 3 },
    { tag: 'hosting', n: 2 },
    { tag: 'pagine', n: 2 },
    { tag: 'brand', n: 1 },
    { tag: 'competenze-base', n: 1 },
    { tag: 'file', n: 1 },
    { tag: 'grafica', n: 1 },
    { tag: 'tastiera', n: 1 },
  ]);
});

Deno.test('attivitaDi trova le attività di un argomento, ordinate per titolo', () => {
  assertEquals(C.attivitaDi(letto.voci, 'SERVIZI_COMMERCIALI/WORDPRESS/').map((v) => v.percorso), [
    'SERVIZI_COMMERCIALI/WORDPRESS/INSTALLARE/',
    'SERVIZI_COMMERCIALI/WORDPRESS/MENU_E_PAGINE/',
  ]);
  assertEquals(C.attivitaDi(letto.voci, 'SERVIZI_COMMERCIALI/BRAND/'), []);
  assertEquals(C.attivitaDi(letto.voci, 'SERVIZI_COMMERCIALI/WORDPRESS').map((v) => v.percorso), [
    'SERVIZI_COMMERCIALI/WORDPRESS/INSTALLARE/',
    'SERVIZI_COMMERCIALI/WORDPRESS/MENU_E_PAGINE/',
  ], 'la barra finale non serve');
  assertEquals(C.attivitaDi(letto.voci, ''), []);
});

Deno.test('l\'ordine delle schede è per area, poi per percorso', () => {
  assertEquals(letto.voci.map((v) => v.percorso), [
    'COMPETENZE_DIGITALI_BASE/MISSIONE_0/',
    'COMPETENZE_DIGITALI_BASE/MISSIONE_0/LEZIONE_1/',
    'SERVIZI_COMMERCIALI/BRAND/',
    'SERVIZI_COMMERCIALI/WORDPRESS/',
    'SERVIZI_COMMERCIALI/WORDPRESS/INSTALLARE/',
    'SERVIZI_COMMERCIALI/WORDPRESS/MENU_E_PAGINE/',
  ]);
});

/* ---------- indirizzi delle schede ---------- */

Deno.test('normalizzaBase prepara la base della pagina', () => {
  assertEquals(C.normalizzaBase(''), '');
  assertEquals(C.normalizzaBase('./'), '');
  assertEquals(C.normalizzaBase('../../'), '../../');
  assertEquals(C.normalizzaBase('..'), '../');
  assertEquals(C.normalizzaBase(null), '');
});

Deno.test('href mette insieme la base della pagina e il percorso della scheda', () => {
  assertEquals(C.href('', 'SERVIZI_COMMERCIALI/BRAND/'), 'SERVIZI_COMMERCIALI/BRAND/');
  assertEquals(C.href('../../', 'SERVIZI_COMMERCIALI/BRAND/'), '../../SERVIZI_COMMERCIALI/BRAND/');
  assertEquals(C.href('../../', '/SERVIZI_COMMERCIALI/BRAND/'), '../../SERVIZI_COMMERCIALI/BRAND/');
});

Deno.test('baseDaBody legge data-base dal <body>', () => {
  assertEquals(C.baseDaBody({ body: { dataset: { base: '../../' } } }), '../../');
  assertEquals(C.baseDaBody({ body: { dataset: {} } }), '');
  assertEquals(C.baseDaBody({}), '');
  assertEquals(C.baseDaBody(null), '');
});

/* ---------- dati storti: si segnalano, non si bloccano ---------- */

const STORTI = C.normalizzaCatalogo({
  etichette: 'non è un oggetto',
  voci: [
    null,
    { titolo: 'Senza percorso' },
    { percorso: 'SOLO_UNO/' },
    { percorso: 'A/B/C/D/' },
    { percorso: 'SERVIZI_COMMERCIALI/BRAND' },
    { percorso: 'SERVIZI_COMMERCIALI/BRAND/' },
    { percorso: 'SERVIZI_COMMERCIALI/SEO/TAG_STORTI/', titolo: 'Tag storti', tag: ['Va Bene', 'ok-tag', 'Sì!'], tipo: 'argomento', minuti: 'due ore' },
    { percorso: 'SERVIZI_COMMERCIALI/SEO/', titolo: 'SEO', tag: 'siti-web' },
  ],
});

Deno.test('normalizzaCatalogo non si rompe con dati storti e li segnala tutti', () => {
  assertEquals(STORTI.avvisi.length, 11);
  const detto = (pezzo) => STORTI.avvisi.some((a) => a.includes(pezzo));
  assert(detto('"etichette" deve essere un oggetto'));
  assert(detto('voce 1: non è un oggetto'));
  assert(detto('voce 2: manca "percorso"'));
  assert(detto('il percorso deve avere 2 segmenti'));
  assert(detto('senza la "/" finale'));
  assert(detto('percorso già usato'));
  assert(detto('vince il percorso'));
  assert(detto('non è una durata valida'));
  assert(detto('il tag "Sì!" non va bene'), 'un tag non normalizzabile deve essere segnalato');
  assert(detto('"tag" deve essere un elenco'));
});

Deno.test('le voci storte non entrano nel catalogo, quelle buone sì', () => {
  assertEquals(STORTI.voci.map((v) => v.percorso), [
    'SERVIZI_COMMERCIALI/BRAND/',
    'SERVIZI_COMMERCIALI/SEO/',
    'SERVIZI_COMMERCIALI/SEO/TAG_STORTI/',
  ]);
  const seo = STORTI.voci.find((v) => v.percorso === 'SERVIZI_COMMERCIALI/SEO/');
  assertEquals(seo.nAttivita, 1, 'la scheda SEO si è costruita attorno alla sua attività');
  assertEquals(seo.titolo, 'SEO');
  assertEquals(seo.tag, [], 'il "tag" scritto male sovrascrive quelli derivati con un elenco vuoto');
  assertEquals(seo.minuti, null);
  assertEquals(STORTI.etichette, {}, 'con "etichette" storte si ripiega sui nomi derivati');
  assertEquals(STORTI.voci.find((v) => v.percorso === 'SERVIZI_COMMERCIALI/BRAND/').titolo, 'Brand');
  assertEquals(STORTI.voci.find((v) => v.percorso === 'SERVIZI_COMMERCIALI/SEO/TAG_STORTI/').tag,
    ['va-bene', 'ok-tag'], '"Va Bene" diventa va-bene, "Sì!" viene scartato');
});

Deno.test('un catalogo che non è un oggetto resta vuoto con un solo avviso', () => {
  for (const storto of [null, 'ciao', [], 42]) {
    const esito = C.normalizzaCatalogo(storto);
    assertEquals(esito.voci, []);
    assertEquals(esito.etichette, {});
    assertEquals(esito.avvisi.length, 1);
    assertStringIncludes(esito.avvisi[0], 'non contiene un oggetto JSON');
  }
});

Deno.test('un catalogo senza "voci" o con "voci" storte non inventa schede', () => {
  const senza = C.normalizzaCatalogo({ etichette: ETICHETTE });
  assertEquals(senza.voci, []);
  assertStringIncludes(senza.avvisi[0], '"voci" non c\'è');
  const storte = C.normalizzaCatalogo({ voci: 'non è un elenco' });
  assertEquals(storte.voci, []);
  assertStringIncludes(storte.avvisi[0], '"voci" deve essere un elenco');
});

Deno.test('le etichette senza nome leggibile si scartano una per una', () => {
  const esito = C.normalizzaCatalogo({ etichette: { X: 'x', '  ': 'vuota', Y: '' }, voci: [] });
  assertEquals(esito.etichette, { X: 'x' });
  assertEquals(esito.avvisi.length, 2);
});

/* ---------- controllo del catalogo e delle pagine veri su disco ---------- */

const RADICE = new URL('../', import.meta.url);
const leggi = (percorso) => Deno.readTextFile(new URL(percorso, RADICE));
const esiste = async (percorso) => {
  try {
    await Deno.stat(new URL(percorso, RADICE));
    return true;
  } catch (errore) {
    return false;
  }
};

const vero = await leggi('catalogo.json').then((testo) => C.normalizzaCatalogo(JSON.parse(testo)));
const vera = (percorso) => vero.voci.find((v) => v.percorso === percorso);

Deno.test('catalogo.json è valido e senza voci da sistemare', async () => {
  const grezzo = JSON.parse(await leggi('catalogo.json'));
  assert(!Array.isArray(grezzo), 'catalogo.json deve essere un oggetto con "etichette" e "voci"');
  assertEquals(typeof grezzo.etichette, 'object');
  assert(Array.isArray(grezzo.voci));
  assertEquals(vero.avvisi, []);
  assert(vero.voci.length > 0, 'l\'elenco delle schede è vuoto');
  assert(vera('COMPETENZE_DIGITALI_BASE/MISSIONE_0/'), 'manca la scheda della Missione 0');
});

Deno.test('la Missione 0 nel catalogo è un argomento già pronto', () => {
  const missione = vera('COMPETENZE_DIGITALI_BASE/MISSIONE_0/');
  assertEquals(missione.tipo, C.TIPO_ARGOMENTO);
  assertEquals(missione.titolo, 'Missione 0 · Riattiviamo le competenze digitali');
  assertEquals(missione.areaEtichetta, 'Competenze digitali base');
  assertEquals(missione.minuti, 600);
  assertEquals(missione.tag, ['competenze-base', 'file', 'documenti', 'ricerca', 'sicurezza']);
  assertEquals(missione.nAttivita, 0, 'le lezioni della Missione 0 vivono dentro la sua pagina, non nel catalogo');
  assertEquals(C.testoBadge(missione), '600 min');
});

Deno.test('ogni scheda del catalogo ha la sua cartella e la sua pagina', async () => {
  for (const voce of vero.voci) {
    assert(await esiste(voce.percorso), `${voce.percorso} non esiste su disco`);
    assert(await esiste(voce.percorso + 'index.html'), `manca la pagina ${voce.percorso}index.html`);
  }
});

Deno.test('ogni area del catalogo è una cartella vera', async () => {
  for (const area of C.aree(vero.voci)) {
    assert(await esiste(area.chiave + '/'), `${area.chiave} non esiste su disco`);
  }
});

Deno.test('le sei pagine argomento di SERVIZI_COMMERCIALI sono collegate al catalogo', async () => {
  const attese = ['BRAND', 'CREAZIONE_SITI_WEB', 'FOGLI_DI_CALCOLO', 'LINGUAGGI_WEB', 'SEO', 'WORDPRESS'];
  for (const nome of attese) {
    const html = await leggi(`SERVIZI_COMMERCIALI/${nome}/index.html`);
    assertStringIncludes(html, `data-argomento="SERVIZI_COMMERCIALI/${nome}/"`);
    assertStringIncludes(html, 'data-base="../../"');
    assertStringIncludes(html, '../../assets/hub.css');
    assertStringIncludes(html, '../../assets/catalogo.js');
    assertStringIncludes(html, '../../assets/argomento.js');
    assertStringIncludes(html, 'id="attivita"');
  }
});

Deno.test('i due modelli da copiare esistono e dicono che i loro indirizzi non funzionano', async () => {
  const argomento = await leggi('_TEMPLATE_ARGOMENTO/index.html');
  assertStringIncludes(argomento, 'È voluto');
  assertStringIncludes(argomento, 'data-argomento="AREA/ARGOMENTO/"');
  assertStringIncludes(argomento, 'data-base="../../"');
  const attivita = await leggi('_TEMPLATE_ATTIVITA/index.html');
  assertStringIncludes(attivita, 'È voluto');
  assertStringIncludes(attivita, '../../../assets/hub.css');
});

Deno.test('del vecchio impianto a moduli non resta traccia', async () => {
  assertEquals(await esiste('dati'), false);
  assertEquals(await esiste('dati/moduli.json'), false);
  assertEquals(await esiste('_TEMPLATE_MODULO/index.html'), false);
  assertEquals(await esiste('SERVIZI_COMMERCIALI/index.html'), false, 'la pagina dell\'area non serve più');
  assertEquals(await esiste('COMPETENZE_DIGITALI_BASE/index.html'), false);
  assertEquals(await esiste('SOCIO_SANITARIO'), false);

  const daControllare = ['index.html', 'assets/catalogo.js', 'assets/hub.js', 'assets/argomento.js',
    '_TEMPLATE_ARGOMENTO/index.html', '_TEMPLATE_ATTIVITA/index.html'];
  for (const percorso of daControllare) {
    const testo = await leggi(percorso);
    assert(!testo.includes('dati/moduli.json'), `${percorso} parla ancora di dati/moduli.json`);
    assert(!testo.includes('_TEMPLATE_MODULO'), `${percorso} parla ancora di _TEMPLATE_MODULO`);
    assert(!testo.includes('type="module"'), `${percorso} carica ancora un modulo ES`);
  }
});
