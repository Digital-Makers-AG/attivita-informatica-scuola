/* hub.js — la pagina dell'hub: filtri, ricerca con suggerimenti, indirizzo condivisibile, disegno.
 *
 * Script classico (niente ES modules): espone globalThis.Hub. Ha bisogno di
 * assets/catalogo.js caricato prima, perché il catalogo (voci, etichette, schede)
 * si legge da lì. Le funzioni sui filtri sono pure e si provano senza browser
 * (tests/hub_test.js, con Deno).
 *
 * Qui dentro non compare nessun nome di area, di argomento o di tag: tutto arriva da catalogo.json.
 * La distinzione argomento/attività non è scritta a mano: la deduce il catalogo dal percorso
 * (2 segmenti = argomento, 3 = attività).
 *
 * I filtri stanno nella query string (?area=...&tag=...&q=...&mostra=...&modo=...), scritta con
 * history.replaceState: cambiare un filtro non crea un passo nella cronologia, e un indirizzo
 * copiato riapre la stessa vista. Al ritorno con il pulsante Indietro l'hub ritrova anche lo
 * scorrimento: le schede arrivano solo dopo catalogo.json, quindi il browser da solo non ci
 * riesce; lo scrollY si annota in history.state al clic su una scheda e su pagehide, e si
 * rimette dopo il disegno (da bfcache non serve: la pagina torna esattamente com'era).
 */
(function (globale) {
  'use strict';

  const C = globale.Catalogo;
  if (!C) {
    throw new Error('assets/hub.js ha bisogno di assets/catalogo.js caricato prima: nell\'HTML metti per primo <script src="assets/catalogo.js"></script>.');
  }

  const TAG_VISIBILI = 12;           // chip di tag mostrati prima di "mostra tutti i tag"
  const SUGGERIMENTI_MAX = 8;        // righe massime nella tendina (l'ultima è sempre "cerca ...")
  const CHIAVE_MODO = 'hubidx_modo'; // dove si ricorda la preferenza AND/OR

  const FILTRI_VUOTI = Object.freeze({ area: '', tag: Object.freeze([]), modo: 'or', q: '', mostra: '' });

  /* ------------------------------------------------------------------ *
   * funzioni pure
   * ------------------------------------------------------------------ */

  /** "Tutto" | "Argomenti" | "Attività": accetta anche il singolare e le maiuscole. */
  function normalizzaMostra(valore) {
    const v = C.normalizzaTesto(valore);
    if (v === 'argomento' || v === 'argomenti') return 'argomenti';
    if (v === 'attivita' || v === 'attività') return 'attivita';
    return '';
  }

  /** Riporta un filtro qualunque alla forma canonica: { area, tag[], modo, q, mostra }. */
  function normalizzaFiltri(filtri) {
    const f = filtri || {};
    const tag = [];
    for (const grezzo of (Array.isArray(f.tag) ? f.tag : [])) {
      const t = C.normalizzaTag(grezzo);
      if (C.tagValido(t) && !tag.includes(t)) tag.push(t);
    }
    return {
      area: String(f.area === undefined || f.area === null ? '' : f.area).trim(),
      tag: tag,
      modo: String(f.modo === undefined || f.modo === null ? '' : f.modo).toLowerCase() === 'and' ? 'and' : 'or',
      q: String(f.q === undefined || f.q === null ? '' : f.q).trim(),
      mostra: normalizzaMostra(f.mostra),
    };
  }

  /**
   * Filtra le schede.
   * area: uguaglianza esatta. mostra: "argomenti" o "attivita" tengono un solo tipo di scheda.
   * modo "and": servono tutti i tag attivi; "or": ne basta uno.
   * q: sottostringa (senza accenti, senza maiuscole) su titolo + descrizione + area.
   */
  function filtra(voci, filtri) {
    const f = normalizzaFiltri(filtri);
    const q = C.normalizzaTesto(f.q);
    return voci.filter((voce) => {
      if (f.area && voce.area !== f.area) return false;
      if (f.mostra === 'argomenti' && voce.tipo !== C.TIPO_ARGOMENTO) return false;
      if (f.mostra === 'attivita' && voce.tipo !== C.TIPO_ATTIVITA) return false;
      if (f.tag.length) {
        const ok = f.modo === 'and'
          ? f.tag.every((t) => voce.tagSet.has(t))
          : f.tag.some((t) => voce.tagSet.has(t));
        if (!ok) return false;
      }
      if (q && !C.normalizzaTesto(voce.titolo + ' ' + voce.descrizione + ' ' + voce.areaEtichetta).includes(q)) return false;
      return true;
    });
  }

  /**
   * Per ogni tag: quante schede si vedrebbero se quel tag fosse attivo, con i filtri correnti.
   * È il numero mostrato sui chip: in "and" vale 0 quando il tag non può dare risultati,
   * ed è proprio quel 0 a disattivare il chip.
   */
  function conteggiDinamici(voci, filtri) {
    const f = normalizzaFiltri(filtri);
    const conteggi = new Map();
    for (const voce of C.tagConConteggio(voci)) {
      conteggi.set(voce.tag, filtra(voci, Object.assign({}, f, { tag: f.tag.concat([voce.tag]) })).length);
    }
    return conteggi;
  }

  /**
   * Righe della tendina: prima i tag, poi i titoli degli argomenti e delle attività,
   * in fondo sempre "cerca \"...\"" con il numero di risultati di quella ricerca.
   */
  function suggerimenti(voci, testo, filtri) {
    const f = normalizzaFiltri(filtri);
    const cercato = C.normalizzaTesto(testo);
    if (!cercato) return [];
    const conteggi = conteggiDinamici(voci, f);
    const righe = [];

    const tagTrovati = C.tagConConteggio(voci)
      .filter((voce) => C.normalizzaTesto(voce.tag).includes(cercato))
      .sort((a, b) => {
        const pa = C.normalizzaTesto(a.tag).indexOf(cercato) === 0 ? 0 : 1;
        const pb = C.normalizzaTesto(b.tag).indexOf(cercato) === 0 ? 0 : 1;
        return (pa - pb) || (b.n - a.n) || a.tag.localeCompare(b.tag, 'it');
      });
    for (const voce of tagTrovati) {
      righe.push({
        tipo: 'tag',
        valore: voce.tag,
        etichetta: voce.tag,
        badge: C.plurale(conteggi.get(voce.tag) || 0, 'risultato', 'risultati'),
      });
    }
    for (const voce of voci) {
      if (C.normalizzaTesto(voce.titolo).includes(cercato)) {
        righe.push({
          tipo: 'titolo',
          valore: voce.titolo,
          etichetta: voce.titolo,
          genere: voce.tipo === C.TIPO_ARGOMENTO ? 'argomento' : 'attività',
          badge: voce.areaEtichetta,
        });
      }
    }
    const quante = Math.min(righe.length, SUGGERIMENTI_MAX - 1);
    const scelte = righe.slice(0, quante);
    const pulito = String(testo === undefined || testo === null ? '' : testo).trim();
    scelte.push({
      tipo: 'cerca',
      valore: pulito,
      etichetta: 'cerca "' + pulito + '"',
      badge: C.plurale(filtra(voci, Object.assign({}, f, { q: pulito })).length, 'risultato', 'risultati'),
    });
    return scelte;
  }

  /* ------------------------------------------------------------------ *
   * indirizzo della pagina (?area=...&tag=...&q=...&mostra=...&modo=...)
   * ------------------------------------------------------------------ */

  /** Legge i filtri dalla query string. I valori non validi li butta normalizzaFiltri. */
  function leggiQuery(search) {
    const p = new URLSearchParams(String(search === undefined || search === null ? '' : search).replace(/^\?/, ''));
    return normalizzaFiltri({
      area: p.get('area') || '',
      tag: (p.get('tag') || '').split(','),
      modo: p.get('modo') || '',
      q: p.get('q') || '',
      mostra: p.get('mostra') || '',
    });
  }

  /** Scrive la query string canonica; stringa vuota quando non c'è nessun filtro.
   *  Il modo AND/OR compare solo insieme a un filtro vero, così l'indirizzo pulito resta pulito. */
  function scriviQuery(filtri) {
    const f = normalizzaFiltri(filtri);
    const parti = [];
    if (f.area) parti.push('area=' + encodeURIComponent(f.area));
    if (f.tag.length) parti.push('tag=' + f.tag.map(encodeURIComponent).join(','));
    if (f.q) parti.push('q=' + encodeURIComponent(f.q));
    if (f.mostra) parti.push('mostra=' + f.mostra);
    if (parti.length && f.modo) parti.push('modo=' + f.modo);
    return parti.length ? '?' + parti.join('&') : '';
  }

  /** I filtri nell'indirizzo: prima la query string, poi il ripiego sui vecchi link #area=... */
  function filtriDallIndirizzo(search, hash) {
    const dallaQuery = leggiQuery(search);
    return haFiltri(dallaQuery) ? dallaQuery : leggiHash(hash);
  }

  /** Butta i filtri che nel catalogo non esistono: un'area sbagliata nell'indirizzo svuoterebbe la pagina. */
  function validaControCatalogo(filtri, voci) {
    const f = normalizzaFiltri(filtri);
    if (!f.area) return f;
    const esiste = C.aree(voci).some((area) => area.chiave === f.area);
    return esiste ? f : normalizzaFiltri(Object.assign({}, f, { area: '' }));
  }

  /** Legge i vecchi indirizzi con i filtri dopo il cancelletto (#area=...&tag=..., oppure #hosting,cms).
   *  Li scriveva la versione precedente dell'hub: si leggono ancora, poi l'indirizzo diventa canonico. */
  function leggiHash(hash) {
    const h = String(hash === undefined || hash === null ? '' : hash).replace(/^#/, '').trim();
    if (!h) return normalizzaFiltri(FILTRI_VUOTI);
    if (h.indexOf('=') === -1) {
      return normalizzaFiltri(Object.assign({}, FILTRI_VUOTI, { tag: h.split(',') }));
    }
    const p = new URLSearchParams(h);
    return normalizzaFiltri({
      area: p.get('area') || '',
      tag: (p.get('tag') || '').split(','),
      modo: p.get('modo') || '',
      q: p.get('q') || '',
      mostra: p.get('mostra') || '',
    });
  }

  function filtriUguali(a, b) {
    const x = normalizzaFiltri(a);
    const y = normalizzaFiltri(b);
    return x.area === y.area && x.modo === y.modo && x.q === y.q && x.mostra === y.mostra
      && x.tag.length === y.tag.length && x.tag.every((t, i) => t === y.tag[i]);
  }

  function haFiltri(filtri) {
    const f = normalizzaFiltri(filtri);
    return Boolean(f.area || f.tag.length || f.q || f.mostra);
  }

  /** Frase mostrata quando i filtri non lasciano passare nessuna scheda. */
  function messaggioVuoto(filtri, etichette) {
    const f = normalizzaFiltri(filtri);
    const soggetto = f.mostra === 'argomenti'
      ? 'Nessun argomento'
      : f.mostra === 'attivita'
        ? 'Nessuna attività'
        : 'Nessun argomento o attività';
    const pezzi = [];
    if (f.area) pezzi.push('area «' + C.etichettaDi(f.area, etichette) + '»');
    if (f.tag.length) pezzi.push('tag ' + f.tag.map((t) => '«' + t + '»').join(f.modo === 'and' ? ' + ' : ' oppure '));
    if (f.q) pezzi.push('testo «' + f.q + '»');
    return pezzi.length ? soggetto + ' con ' + pezzi.join(', ') + '.' : soggetto + ' disponibile.';
  }

  /** Riepilogo sopra l'elenco: "2 argomenti e 3 attività", oppure solo il tipo filtrato. */
  function testoConteggio(risultati, mostra) {
    const argomenti = risultati.filter((voce) => voce.tipo === C.TIPO_ARGOMENTO).length;
    const attivita = risultati.length - argomenti;
    if (mostra === 'argomenti') return C.plurale(argomenti, 'argomento', 'argomenti');
    if (mostra === 'attivita') return C.plurale(attivita, 'attività', 'attività');
    if (!risultati.length) return '0 risultati';
    const pezzi = [];
    if (argomenti) pezzi.push(C.plurale(argomenti, 'argomento', 'argomenti'));
    if (attivita) pezzi.push(C.plurale(attivita, 'attività', 'attività'));
    return pezzi.join(' e ');
  }

  /* ------------------------------------------------------------------ *
   * interfaccia: da qui in giù serve un browser
   * ------------------------------------------------------------------ */

  const dom = {};
  let BASE = '';
  let VOCI = [];
  let ETICHETTE = {};
  let stato = normalizzaFiltri(FILTRI_VUOTI);
  let tuttiITag = false;
  let righeTendina = [];
  let indiceAttivo = -1;
  let disegnato = false; // le schede sono già state disegnate almeno una volta (serve allo scorrimento)

  function prendiDom() {
    const id = {
      area: 'filtro-area', mostra: 'filtro-mostra', modo: 'filtro-modo', tag: 'filtro-tag',
      q: 'q', sugg: 'sugg', mostraTag: 'mostra-tutti-tag',
      conteggio: 'conteggio', filtriAttivi: 'filtri-attivi', azzera: 'azzera',
      cards: 'cards', statoVuoto: 'stato-vuoto', errore: 'errore', avvisi: 'avvisi',
    };
    for (const chiave of Object.keys(id)) dom[chiave] = document.getElementById(id[chiave]);
  }

  function leggiModoRicordato() {
    try {
      const v = window.localStorage.getItem(CHIAVE_MODO);
      return v === 'and' || v === 'or' ? v : '';
    } catch (errore) {
      return '';
    }
  }

  function ricordaModo() {
    try {
      window.localStorage.setItem(CHIAVE_MODO, stato.modo);
    } catch (errore) {
      // niente memoria: pazienza
    }
  }

  /** Scrive i filtri nell'indirizzo con replaceState, mai pushState: cambiare filtro non è un passo
   *  della cronologia, quindi il pulsante Indietro porta all'hub e non all'ultimo filtro toccato.
   *  Lo stato della voce di cronologia si passa avanti com'è, altrimenti si perderebbe lo scrollY. */
  function sincronizzaUrl(scrivere) {
    if (!scrivere) return;
    const indirizzo = window.location.pathname + scriviQuery(stato);
    try {
      window.history.replaceState(window.history.state, '', indirizzo);
    } catch (errore) {
      // file:// o anteprima locale: l'indirizzo resta com'era
    }
  }

  /** Il link dentro cui è finito il clic: una scheda ne ha due (il titolo e «Apri l'attività»). */
  function linkDi(nodo) {
    let corrente = nodo;
    while (corrente) {
      if (corrente.tagName === 'A') return corrente;
      corrente = corrente.parentElement;
    }
    return null;
  }

  /** Annota dove sta lo scorrimento nella voce di cronologia corrente. Serve prima di seguire il
   *  link di una scheda: al ritorno (Indietro) la pagina si ridisegna vuota, perché le schede
   *  arrivano solo dopo catalogo.json, quindi il browser da solo non saprebbe dove rimettersi. */
  function salvaScorrimento() {
    const prima = window.history.state && typeof window.history.state === 'object' ? window.history.state : {};
    try {
      window.history.replaceState(
        Object.assign({}, prima, { scrollY: Math.round(window.scrollY || 0) }),
        '',
        window.location.pathname + window.location.search,
      );
    } catch (errore) {
      // niente cronologia: pazienza, al ritorno si resta in cima
    }
  }

  /** Rimette lo scorrimento dov'era, e solo dopo il disegno delle schede: prima la pagina è corta
   *  e non c'è niente da scorrere. Dalla cache del browser (pageshow persisted) non si tocca nulla:
   *  la pagina torna esattamente com'era. */
  function ripristinaScorrimento() {
    if (!disegnato) return;
    const statoUrl = window.history.state;
    const y = statoUrl && typeof statoUrl.scrollY === 'number' ? statoUrl.scrollY : 0;
    if (y <= 0) return;
    try {
      window.scrollTo(0, y);
    } catch (errore) {
      // pazienza, si resta in cima
    }
  }

  /** Unico punto in cui i filtri cambiano: ridisegna la pagina e allinea l'indirizzo. */
  function applica(parziale) {
    stato = normalizzaFiltri(Object.assign({}, stato, parziale));
    disegna();
    sincronizzaUrl(true);
  }

  function azzera() {
    stato = normalizzaFiltri(Object.assign({}, FILTRI_VUOTI, { modo: stato.modo }));
    tuttiITag = false;
    dom.q.value = '';
    chiudiTendina();
    disegna();
    sincronizzaUrl(true);
  }

  function disegna() {
    const risultati = filtra(VOCI, stato);
    rendiAree();
    rendiMostra();
    rendiModo();
    rendiTag();
    rendiSchede(risultati);
    rendiVuoto(risultati);
    rendiRiepilogo(risultati);
  }

  function rendiAree() {
    dom.area.replaceChildren(C.el('button', {
      type: 'button', classe: 'chip area',
      'aria-pressed': stato.area === '' ? 'true' : 'false',
      onclick: () => applica({ area: '' }),
    }, 'Tutte le aree'));
    for (const area of C.aree(VOCI)) {
      dom.area.append(C.el('button', {
        type: 'button', classe: 'chip area',
        'aria-pressed': stato.area === area.chiave ? 'true' : 'false',
        onclick: () => applica({ area: stato.area === area.chiave ? '' : area.chiave }),
      }, C.el('span', { classe: 'nome', testo: area.etichetta }), C.el('span', { classe: 'n', testo: String(area.n) })));
    }
  }

  /** "Tutto" | "Argomenti" | "Attività": un filtro in più, oltre ad area e tag. */
  function rendiMostra() {
    if (!dom.mostra) return;
    dom.mostra.replaceChildren();
    const scelte = [['', 'Tutto'], ['argomenti', 'Argomenti'], ['attivita', 'Attività']];
    for (const scelta of scelte) {
      const valore = scelta[0];
      const etichetta = scelta[1];
      dom.mostra.append(C.el('button', {
        type: 'button', classe: 'chip mostra',
        'aria-pressed': stato.mostra === valore ? 'true' : 'false',
        title: valore === ''
          ? 'Mostra gli argomenti e le attività'
          : 'Mostra solo ' + (valore === 'argomenti' ? 'gli argomenti' : 'le attività'),
        onclick: () => applica({ mostra: valore }),
      }, etichetta));
    }
  }

  function rendiModo() {
    const spiegazione = {
      or: 'un argomento o un\u2019attività basta che abbia almeno uno dei tag scelti',
      and: 'un argomento o un\u2019attività deve avere tutti i tag scelti',
    };
    dom.modo.replaceChildren();
    for (const coppia of [['or', 'Almeno un tag'], ['and', 'Tutti i tag']]) {
      const valore = coppia[0];
      dom.modo.append(C.el('button', {
        type: 'button', classe: 'chip modo',
        'aria-pressed': stato.modo === valore ? 'true' : 'false',
        title: 'Combina i tag così: ' + spiegazione[valore],
        onclick: () => { applica({ modo: valore }); ricordaModo(); },
      }, coppia[1]));
    }
  }

  function rendiTag() {
    const tutti = C.tagConConteggio(VOCI);
    const conteggi = conteggiDinamici(VOCI, stato);
    const visibili = tutti.filter((voce, i) => tuttiITag || i < TAG_VISIBILI || stato.tag.includes(voce.tag));
    dom.tag.replaceChildren();
    for (const voce of visibili) {
      const tag = voce.tag;
      const attivo = stato.tag.includes(tag);
      const quanti = conteggi.get(tag) || 0;
      const spento = stato.modo === 'and' && !attivo && quanti === 0;
      dom.tag.append(C.el('button', {
        type: 'button', classe: 'chip tag',
        'aria-pressed': attivo ? 'true' : 'false',
        disabled: spento,
        title: spento
          ? 'Nessun risultato ha insieme ' + stato.tag.concat([tag]).join(' + ')
          : C.plurale(quanti, 'risultato', 'risultati') + ' con il tag ' + tag,
        onclick: () => applica({ tag: attivo ? stato.tag.filter((t) => t !== tag) : stato.tag.concat([tag]) }),
      },
        attivo ? C.el('span', { classe: 'x', testo: '\u00d7' }) : null,
        C.el('span', { classe: 'nome', testo: tag }),
        C.el('span', { classe: 'n', testo: String(quanti) }),
      ));
    }
    if (tutti.length > TAG_VISIBILI) {
      dom.mostraTag.hidden = false;
      dom.mostraTag.textContent = tuttiITag ? 'mostra solo i più usati' : 'mostra tutti i tag (' + tutti.length + ')';
      dom.mostraTag.setAttribute('aria-expanded', tuttiITag ? 'true' : 'false');
    } else {
      dom.mostraTag.hidden = true;
    }
  }

  function rendiSchede(risultati) {
    const schede = risultati.map((voce) => C.creaCard(voce, BASE));
    dom.cards.replaceChildren.apply(dom.cards, schede);
    disegnato = true; // da qui in giù la pagina è alta: lo scorrimento si può rimettere
  }

  function rendiVuoto(risultati) {
    const vuoto = risultati.length === 0;
    dom.statoVuoto.hidden = !vuoto;
    dom.statoVuoto.replaceChildren();
    if (!vuoto) return;
    dom.statoVuoto.append(C.el('p', { testo: messaggioVuoto(stato, ETICHETTE) }));
    if (haFiltri(stato)) {
      dom.statoVuoto.append(C.el('button', { type: 'button', classe: 'all', testo: 'Azzera i filtri', onclick: azzera }));
    }
  }

  function rendiRiepilogo(risultati) {
    dom.conteggio.replaceChildren(C.el('span', { classe: 'n', testo: testoConteggio(risultati, stato.mostra) }));
    dom.azzera.hidden = !haFiltri(stato);
    const attivi = [];
    if (stato.q) {
      attivi.push(C.el('button', {
        type: 'button', classe: 'chip', 'aria-pressed': 'true', title: 'Togli la ricerca',
        onclick: () => { dom.q.value = ''; chiudiTendina(); applica({ q: '' }); },
      }, C.el('span', { classe: 'x', testo: '\u00d7' }), C.el('span', { classe: 'nome', testo: 'testo «' + stato.q + '»' })));
    }
    dom.filtriAttivi.replaceChildren.apply(dom.filtriAttivi, attivi);
  }

  function rendiAvvisi(avvisi) {
    dom.avvisi.replaceChildren();
    dom.avvisi.hidden = avvisi.length === 0;
    if (!avvisi.length) return;
    dom.avvisi.append(
      C.el('p', {}, C.el('b', { testo: 'Da sistemare in catalogo.json: ' }), document.createTextNode(C.plurale(avvisi.length, 'problema', 'problemi'))),
      C.el('ul', {}, avvisi.map((a) => C.el('li', { testo: a }))),
    );
  }

  function rendiErrore(errore) {
    console.error('[hub]', errore);
    dom.cards.replaceChildren();
    dom.statoVuoto.hidden = true;
    dom.errore.hidden = false;
    dom.errore.replaceChildren(
      C.el('p', {}, C.el('b', { testo: 'Non riesco a leggere il catalogo. ' }),
        document.createTextNode(String(errore && errore.message ? errore.message : errore))),
      C.el('p', { testo: 'Con doppio clic (indirizzo file://) i browser non leggono i file JSON: usa il sito pubblicato oppure avvia un piccolo server locale nella cartella del progetto.' }),
    );
  }

  /* ---------- tendina di autocompletamento ---------- */

  function rendiTendina(testo) {
    righeTendina = suggerimenti(VOCI, testo, stato);
    indiceAttivo = -1;
    if (!righeTendina.length) {
      chiudiTendina();
      return;
    }
    const voci = righeTendina.map((riga, i) => {
      const nodo = C.el('li', {
        id: 'sugg-' + i, role: 'option', 'aria-selected': 'false',
        onmousedown: (evento) => { evento.preventDefault(); scegliRiga(i); },
      },
        C.el('span', { classe: 'tipo', testo: riga.tipo === 'tag' ? 'tag' : (riga.tipo === 'cerca' ? '' : riga.genere) }),
        C.el('span', { classe: 'testo', testo: riga.etichetta }),
        C.el('span', { classe: 'n', testo: riga.badge }),
      );
      if (riga.tipo === 'cerca') nodo.classList.add('cerca');
      return nodo;
    });
    dom.sugg.replaceChildren.apply(dom.sugg, voci);
    dom.sugg.hidden = false;
    dom.q.setAttribute('aria-expanded', 'true');
  }

  function chiudiTendina() {
    dom.sugg.hidden = true;
    dom.sugg.replaceChildren();
    righeTendina = [];
    indiceAttivo = -1;
    dom.q.removeAttribute('aria-activedescendant');
    dom.q.setAttribute('aria-expanded', 'false');
  }

  function muovi(verso) {
    if (dom.sugg.hidden || !righeTendina.length) return;
    indiceAttivo = (indiceAttivo + verso + righeTendina.length) % righeTendina.length;
    Array.from(dom.sugg.children).forEach((voce, i) => voce.setAttribute('aria-selected', i === indiceAttivo ? 'true' : 'false'));
    dom.q.setAttribute('aria-activedescendant', 'sugg-' + indiceAttivo);
  }

  /** Un tag si aggiunge ai filtri; un titolo o "cerca ..." diventano il testo cercato. */
  function scegliRiga(i) {
    const riga = righeTendina[i];
    if (!riga) return;
    if (riga.tipo === 'tag') {
      if (!stato.tag.includes(riga.valore)) applica({ tag: stato.tag.concat([riga.valore]) });
    } else {
      dom.q.value = riga.valore;
      applica({ q: riga.valore });
    }
    chiudiTendina();
  }

  /* ---------- eventi ---------- */

  function legaEventi() {
    dom.mostraTag.addEventListener('click', () => { tuttiITag = !tuttiITag; disegna(); });
    dom.azzera.addEventListener('click', azzera);

    dom.q.addEventListener('input', (evento) => {
      // mentre si scrive il filtro si applica subito; l'indirizzo si aggiorna alla conferma
      stato = normalizzaFiltri(Object.assign({}, stato, { q: evento.target.value }));
      disegna();
      rendiTendina(evento.target.value);
    });
    dom.q.addEventListener('change', () => sincronizzaUrl(true));
    dom.q.addEventListener('focus', () => { if (dom.q.value.trim()) rendiTendina(dom.q.value); });
    dom.q.addEventListener('keydown', (evento) => {
      if (evento.key === 'ArrowDown') {
        evento.preventDefault();
        muovi(1);
      } else if (evento.key === 'ArrowUp') {
        evento.preventDefault();
        muovi(-1);
      } else if (evento.key === 'Enter') {
        if (indiceAttivo >= 0) {
          evento.preventDefault();
          scegliRiga(indiceAttivo);
        } else {
          chiudiTendina();
          sincronizzaUrl(true);
        }
      } else if (evento.key === 'Escape') {
        chiudiTendina();
      }
    });
    document.addEventListener('click', (evento) => {
      if (!dom.q.parentElement.contains(evento.target)) chiudiTendina();
    });
    // Prima di seguire il link di una scheda ci si annota lo scorrimento: le schede sono link
    // veri, quindi il clic non passa da nessuna funzione dell'hub.
    dom.cards.addEventListener('click', (evento) => {
      if (linkDi(evento.target)) salvaScorrimento();
    });
    window.addEventListener('pagehide', salvaScorrimento);
    // Tornando dalla cache del browser (pageshow persisted) la pagina è già com'era, filtri e
    // scorrimento compresi: non si tocca niente.
    window.addEventListener('pageshow', (evento) => {
      if (evento.persisted) return;
      ripristinaScorrimento();
    });
  }

  /** Avvia l'hub: legge catalogo.json, i filtri nell'indirizzo e la preferenza AND/OR ricordata. */
  async function avvia() {
    prendiDom();
    legaEventi();
    BASE = C.baseDaBody(document);
    // Lo scorrimento lo rimettiamo noi, dopo il disegno delle schede: al browser la pagina sembra
    // vuota, perché le schede arrivano solo con catalogo.json.
    try {
      window.history.scrollRestoration = 'manual';
    } catch (errore) {
      // cronologia non disponibile: pazienza
    }
    let letto;
    try {
      letto = C.normalizzaCatalogo(await C.caricaCatalogo(BASE));
    } catch (errore) {
      rendiErrore(errore);
      return;
    }
    VOCI = letto.voci;
    ETICHETTE = letto.etichette;
    for (const avviso of letto.avvisi) console.warn('[hub]', avviso);
    rendiAvvisi(letto.avvisi);

    // I filtri si leggono dall'indirizzo prima del primo disegno; i vecchi link con l'hash
    // funzionano ancora (filtriDallIndirizzo), poi l'indirizzo diventa la query string canonica.
    const search = String(window.location.search === undefined || window.location.search === null ? '' : window.location.search);
    const hash = String(window.location.hash === undefined || window.location.hash === null ? '' : window.location.hash);
    stato = validaControCatalogo(filtriDallIndirizzo(search, hash), VOCI);
    const modoNellIndirizzo = /(^|[?&])modo=/.test(search) || /(^|[#&])modo=/.test(hash);
    if (!modoNellIndirizzo) {
      const ricordato = leggiModoRicordato();
      if (ricordato) stato = normalizzaFiltri(Object.assign({}, stato, { modo: ricordato }));
    }
    dom.q.value = stato.q;
    disegna();
    sincronizzaUrl(true); // forma canonica: ?area=...&tag=...&q=...&mostra=...&modo=...
    ripristinaScorrimento();
  }

  globale.Hub = {
    TAG_VISIBILI: TAG_VISIBILI,
    SUGGERIMENTI_MAX: SUGGERIMENTI_MAX,
    CHIAVE_MODO: CHIAVE_MODO,
    FILTRI_VUOTI: FILTRI_VUOTI,
    normalizzaMostra: normalizzaMostra,
    normalizzaFiltri: normalizzaFiltri,
    filtra: filtra,
    conteggiDinamici: conteggiDinamici,
    suggerimenti: suggerimenti,
    leggiQuery: leggiQuery,
    scriviQuery: scriviQuery,
    validaControCatalogo: validaControCatalogo,
    leggiHash: leggiHash,
    filtriUguali: filtriUguali,
    haFiltri: haFiltri,
    messaggioVuoto: messaggioVuoto,
    testoConteggio: testoConteggio,
    avvia: avvia,
  };

  // Nei test la pagina finta viene preparata prima: con questo interruttore il bootstrap resta spento.
  if (typeof document !== 'undefined' && typeof window !== 'undefined'
    && !globale.HubSenzaAvvioAutomatico && document.getElementById('cards')) {
    avvia().catch((errore) => console.error('[hub]', errore));
  }
})(globalThis);
