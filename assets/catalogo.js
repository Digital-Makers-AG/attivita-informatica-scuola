/* catalogo.js — il catalogo dell'hub: lettura di catalogo.json, derivazione degli
 * argomenti dalle attività, nomi leggibili, disegno delle schede.
 *
 * Script classico (niente ES modules): espone globalThis.Catalogo e non fa niente
 * da solo. Lo caricano l'hub (assets/hub.js) e le pagine argomento
 * (assets/argomento.js), così le schede si disegnano in un solo posto.
 *
 * Regole del catalogo:
 *  - il percorso è la verità: 2 segmenti = argomento, 3 segmenti = attività;
 *  - un argomento non va scritto a mano: nasce dalle sue attività (tag uniti,
 *    minuti sommati, numero di attività). Basta aggiungere le attività;
 *  - se in "voci" c'è una voce con lo stesso percorso, i suoi campi sovrascrivono
 *    quelli derivati, campo per campo: serve agli argomenti già pronti, come la
 *    Missione 0, che non hanno attività dentro il catalogo.
 */
(function (globale) {
  'use strict';

  const TIPO_ARGOMENTO = 'argomento';
  const TIPO_ATTIVITA = 'attivita';
  /** I tag sono parole minuscole separate da trattini: "siti-web". */
  const REGOLA_TAG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

  /** Minuscole senza accenti: per cercare "attività" scrivendo "attivita". */
  function normalizzaTesto(testo) {
    return String(testo === undefined || testo === null ? '' : testo)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }

  function tagValido(tag) {
    return typeof tag === 'string' && REGOLA_TAG.test(tag);
  }

  function normalizzaTag(tag) {
    return String(tag === undefined || tag === null ? '' : tag).trim().toLowerCase().replace(/\s+/g, '-');
  }

  /** COMPETENZE_DIGITALI_BASE -> "Competenze digitali base": ripiego della mappa "etichette". */
  function etichettaCartella(chiave) {
    const parole = String(chiave === undefined || chiave === null ? '' : chiave)
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
    if (!parole) return '';
    return parole.charAt(0).toUpperCase() + parole.slice(1);
  }

  /** Nome leggibile di una cartella: prima la mappa "etichette", poi la derivazione. */
  function etichettaDi(chiave, etichette) {
    const k = String(chiave === undefined || chiave === null ? '' : chiave).trim();
    if (!k) return '';
    const mappa = etichette && typeof etichette === 'object' && !Array.isArray(etichette) ? etichette : {};
    const scritta = mappa[k];
    if (typeof scritta === 'string' && scritta.trim()) return scritta.trim();
    return etichettaCartella(k);
  }

  function plurale(n, singolare, pluraleParola) {
    return n + ' ' + (n === 1 ? singolare : pluraleParola);
  }

  /** Durata in minuti interi, oppure null se assente o non valida. */
  function minutiValidi(valore) {
    if (typeof valore === 'number') {
      return Number.isFinite(valore) && valore > 0 ? Math.round(valore) : null;
    }
    if (typeof valore !== 'string' || !valore.trim()) return null;
    const numero = Number(valore.trim().replace(',', '.'));
    return Number.isFinite(numero) && numero > 0 ? Math.round(numero) : null;
  }

  function tagNormalizzati(grezzi, avvisi, dove) {
    if (grezzi === undefined || grezzi === null) return [];
    if (!Array.isArray(grezzi)) {
      avvisi.push(dove + ': "tag" deve essere un elenco, l\'ho ignorato.');
      return [];
    }
    const esito = [];
    for (const grezzo of grezzi) {
      const tag = normalizzaTag(grezzo);
      if (!tagValido(tag)) {
        avvisi.push(dove + ': il tag ' + JSON.stringify(grezzo) + ' non va bene (minuscole e trattini, es. "siti-web"), l\'ho saltato.');
        continue;
      }
      if (!esito.includes(tag)) esito.push(tag);
    }
    return esito;
  }

  function normalizzaEtichette(grezze, avvisi) {
    if (grezze === undefined || grezze === null) return {};
    if (typeof grezze !== 'object' || Array.isArray(grezze)) {
      avvisi.push('"etichette" deve essere un oggetto del tipo "CARTELLA": "Nome leggibile", l\'ho ignorato.');
      return {};
    }
    const esito = {};
    for (const chiave of Object.keys(grezze)) {
      const valore = grezze[chiave];
      const k = chiave.trim();
      const v = typeof valore === 'string' ? valore.trim() : '';
      if (!k || !v) {
        avvisi.push('"etichette": la chiave ' + JSON.stringify(chiave) + ' non ha un nome leggibile, l\'ho ignorata.');
        continue;
      }
      esito[k] = v;
    }
    return esito;
  }

  /** Voce completa: dal percorso ricava area, argomento ed etichette leggibili. */
  function creaVoce(base, etichette) {
    const segmenti = String(base.percorso || '').split('/').filter(Boolean);
    const area = segmenti[0] || '';
    const tag = base.tag || [];
    return {
      tipo: base.tipo,
      percorso: base.percorso,
      area: area,
      areaEtichetta: etichettaDi(area, etichette),
      argomento: segmenti[1] || '',
      argomentoEtichetta: segmenti[1] ? etichettaDi(segmenti[1], etichette) : '',
      titolo: base.titolo || '',
      descrizione: base.descrizione || '',
      tag: tag,
      tagSet: new Set(tag),
      minuti: base.minuti === undefined ? null : base.minuti,
      nAttivita: base.nAttivita || 0,
      derivata: Boolean(base.derivata),
      campiScritti: base.campiScritti || [],
    };
  }

  /** Percorso "AREA/ARGOMENTO/" di una voce (le attività stanno un livello sotto). */
  function percorsoArgomento(voce) {
    const segmenti = String(voce.percorso || '').split('/').filter(Boolean);
    if (segmenti.length < 2) return '';
    return segmenti[0] + '/' + segmenti[1] + '/';
  }

  /** Percorso con la barra finale: "AREA/ARGOMENTO" -> "AREA/ARGOMENTO/". */
  function percorsoChiuso(valore) {
    const pulito = String(valore === undefined || valore === null ? '' : valore).trim();
    if (!pulito) return '';
    return pulito.endsWith('/') ? pulito : pulito + '/';
  }

  /**
   * Valida una voce scritta a mano in "voci" e ne deduce la gerarchia dal percorso.
   * Restituisce la voce, oppure null se il percorso non è utilizzabile.
   */
  function normalizzaVoce(grezza, indice, avvisi, visti, etichette) {
    const dove = 'voce ' + (indice + 1);
    if (!grezza || typeof grezza !== 'object' || Array.isArray(grezza)) {
      avvisi.push(dove + ': non è un oggetto, l\'ho saltata.');
      return null;
    }
    const percorsoGrezzo = String(grezza.percorso === undefined || grezza.percorso === null ? '' : grezza.percorso).trim();
    if (!percorsoGrezzo) {
      avvisi.push(dove + ': manca "percorso", l\'ho saltata.');
      return null;
    }
    if (!percorsoGrezzo.endsWith('/')) {
      avvisi.push(dove + ' (' + percorsoGrezzo + '): "percorso" è senza la "/" finale, l\'ho aggiunta io.');
    }
    const segmenti = percorsoGrezzo.split('/').filter(Boolean);
    if (segmenti.length !== 2 && segmenti.length !== 3) {
      avvisi.push(dove + ' (' + percorsoGrezzo + '): il percorso deve avere 2 segmenti (AREA/ARGOMENTO) o 3 (AREA/ARGOMENTO/ATTIVITA), l\'ho saltata.');
      return null;
    }
    const percorso = segmenti.join('/') + '/';
    if (visti.has(percorso)) {
      avvisi.push(dove + ' (' + percorso + '): percorso già usato da un\'altra voce, l\'ho saltata.');
      return null;
    }
    visti.add(percorso);
    const tipoDedotto = segmenti.length === 2 ? TIPO_ARGOMENTO : TIPO_ATTIVITA;
    const tipoScritto = String(grezza.tipo === undefined || grezza.tipo === null ? '' : grezza.tipo).trim().toLowerCase();
    if (tipoScritto && tipoScritto !== tipoDedotto) {
      avvisi.push(dove + ' (' + percorso + '): "tipo": "' + tipoScritto + '" ma il percorso ha ' + segmenti.length + ' segmenti, quindi è un "' + tipoDedotto + '": vince il percorso.');
    }
    let titolo = typeof grezza.titolo === 'string' ? grezza.titolo.trim() : '';
    if (!titolo) {
      titolo = etichettaDi(segmenti[segmenti.length - 1], etichette);
      // Un argomento senza "titolo" non è un problema: lo prende dalle etichette del catalogo,
      // quindi l'avviso serve solo per le attività, dove il titolo lo scrive il docente.
      if (tipoDedotto === TIPO_ATTIVITA) {
        avvisi.push(dove + ' (' + percorso + '): manca "titolo", uso "' + titolo + '".');
      }
    }
    const minuti = minutiValidi(grezza.minuti);
    if (minuti === null && grezza.minuti !== undefined && grezza.minuti !== null && grezza.minuti !== '') {
      avvisi.push(dove + ' (' + percorso + '): "minuti": ' + JSON.stringify(grezza.minuti) + ' non è una durata valida, la scheda resta senza durata.');
    }
    const campiScritti = ['percorso'];
    for (const campo of ['tipo', 'titolo', 'descrizione', 'minuti', 'tag']) {
      if (Object.prototype.hasOwnProperty.call(grezza, campo)) campiScritti.push(campo);
    }
    return creaVoce({
      tipo: tipoDedotto,
      percorso: percorso,
      titolo: titolo,
      descrizione: typeof grezza.descrizione === 'string' ? grezza.descrizione.trim() : '',
      tag: tagNormalizzati(grezza.tag, avvisi, dove + ' (' + percorso + ')'),
      minuti: minuti,
      nAttivita: 0,
      derivata: false,
      campiScritti: campiScritti,
    }, etichette);
  }

  /** Un argomento derivato, con i campi della voce scritta a mano che li sovrascrivono. */
  function sovrapponi(derivata, scritta) {
    const esito = Object.assign({}, derivata, { campiScritti: scritta.campiScritti });
    if (scritta.campiScritti.includes('titolo')) esito.titolo = scritta.titolo;
    if (scritta.campiScritti.includes('descrizione')) esito.descrizione = scritta.descrizione;
    if (scritta.campiScritti.includes('minuti')) esito.minuti = scritta.minuti;
    if (scritta.campiScritti.includes('tag')) {
      esito.tag = scritta.tag.slice();
      esito.tagSet = new Set(esito.tag);
    }
    return esito;
  }

  /**
   * Costruisce gli argomenti derivati dalle attività e poi applica le voci scritte
   * a mano con lo stesso percorso. Il risultato è l'elenco completo delle schede.
   */
  function componiVoci(esplicite, etichette) {
    const gruppi = new Map();
    for (const voce of esplicite) {
      if (voce.tipo !== TIPO_ATTIVITA) continue;
      const percorso = percorsoArgomento(voce);
      if (!percorso) continue;
      if (!gruppi.has(percorso)) gruppi.set(percorso, []);
      gruppi.get(percorso).push(voce);
    }
    const perPercorso = new Map();
    for (const gruppo of gruppi) {
      const percorso = gruppo[0];
      const elenco = gruppo[1].slice().sort((a, b) => a.percorso.localeCompare(b.percorso, 'it'));
      const tag = [];
      let minuti = 0;
      let haMinuti = false;
      for (const voce of elenco) {
        for (const t of voce.tag) if (!tag.includes(t)) tag.push(t);
        if (voce.minuti !== null) {
          minuti += voce.minuti;
          haMinuti = true;
        }
      }
      perPercorso.set(percorso, creaVoce({
        tipo: TIPO_ARGOMENTO,
        percorso: percorso,
        titolo: etichettaDi(percorso.split('/').filter(Boolean)[1], etichette),
        descrizione: '',
        tag: tag,
        minuti: haMinuti ? minuti : null,
        nAttivita: elenco.length,
        derivata: true,
      }, etichette));
    }
    for (const voce of esplicite) {
      const derivata = perPercorso.get(voce.percorso);
      perPercorso.set(voce.percorso, derivata ? sovrapponi(derivata, voce) : creaVoce(voce, etichette));
    }
    return ordinaVoci(Array.from(perPercorso.values()));
  }

  /** Ordine dell'hub: per etichetta dell'area, poi per percorso (l'argomento precede le sue attività). */
  function ordinaVoci(voci) {
    return voci.slice().sort((a, b) => {
      const perArea = a.areaEtichetta.localeCompare(b.areaEtichetta, 'it');
      if (perArea !== 0) return perArea;
      return a.percorso.localeCompare(b.percorso, 'it');
    });
  }

  /** Le aree presenti nel catalogo, in ordine di etichetta, con il numero di schede. */
  function aree(voci) {
    const gruppi = new Map();
    for (const voce of voci) {
      if (!voce.area) continue;
      if (!gruppi.has(voce.area)) gruppi.set(voce.area, { chiave: voce.area, etichetta: voce.areaEtichetta, n: 0 });
      gruppi.get(voce.area).n += 1;
    }
    return Array.from(gruppi.values()).sort((a, b) => a.etichetta.localeCompare(b.etichetta, 'it'));
  }

  /** Tag usati nel catalogo (argomenti e attività), dal più frequente al meno frequente. */
  function tagConConteggio(voci) {
    const conteggi = new Map();
    for (const voce of voci) {
      for (const tag of voce.tag) conteggi.set(tag, (conteggi.get(tag) || 0) + 1);
    }
    return Array.from(conteggi.entries())
      .map((coppia) => ({ tag: coppia[0], n: coppia[1] }))
      .sort((a, b) => b.n - a.n || a.tag.localeCompare(b.tag, 'it'));
  }

  /** Le attività di un argomento ("AREA/ARGOMENTO/"), ordinate per titolo. */
  function attivitaDi(voci, argomento) {
    const percorso = percorsoChiuso(argomento);
    if (!percorso) return [];
    return voci
      .filter((voce) => voce.tipo === TIPO_ATTIVITA && voce.percorso.indexOf(percorso) === 0)
      .sort((a, b) => a.titolo.localeCompare(b.titolo, 'it'));
  }

  /** Legge l'oggetto di catalogo.json e restituisce { voci, etichette, avvisi }. */
  function normalizzaCatalogo(dati) {
    const avvisi = [];
    if (!dati || typeof dati !== 'object' || Array.isArray(dati)) {
      return {
        voci: [],
        etichette: {},
        avvisi: ['catalogo.json non contiene un oggetto JSON con le chiavi "etichette" e "voci".'],
      };
    }
    const etichette = normalizzaEtichette(dati.etichette, avvisi);
    let esplicite = [];
    if (dati.voci === undefined || dati.voci === null) {
      avvisi.push('"voci" non c\'è: l\'hub resta vuoto finché non aggiungi un argomento o un\'attività.');
    } else if (!Array.isArray(dati.voci)) {
      avvisi.push('"voci" deve essere un elenco: l\'hub resta vuoto.');
    } else {
      const visti = new Set();
      for (let i = 0; i < dati.voci.length; i += 1) {
        const voce = normalizzaVoce(dati.voci[i], i, avvisi, visti, etichette);
        if (voce) esplicite.push(voce);
      }
    }
    return { voci: componiVoci(esplicite, etichette), etichette: etichette, avvisi: avvisi };
  }

  /** Durata o conteggio da mostrare sulla scheda; stringa vuota = nessun badge. */
  function testoBadge(voce) {
    if (voce.tipo === TIPO_ATTIVITA) return voce.minuti ? voce.minuti + ' min' : '';
    if (voce.nAttivita > 0) {
      const conteggio = plurale(voce.nAttivita, 'attività', 'attività');
      return voce.minuti ? conteggio + ' · ' + voce.minuti + ' min' : conteggio;
    }
    return voce.minuti ? voce.minuti + ' min' : '';
  }

  /** Crea un elemento: el('div', { classe: 'x', testo: 'ciao' }, figlio1, figlio2). */
  function el(tag, proprieta, ...figli) {
    const nodo = document.createElement(tag);
    const elenco = proprieta || {};
    for (const chiave of Object.keys(elenco)) {
      const valore = elenco[chiave];
      if (valore === undefined || valore === null || valore === false) continue;
      if (chiave === 'testo') nodo.textContent = String(valore);
      else if (chiave === 'classe') nodo.className = String(valore);
      else if (chiave.indexOf('on') === 0 && typeof valore === 'function') nodo.addEventListener(chiave.slice(2), valore);
      else if (chiave === 'dati') { for (const k of Object.keys(valore)) nodo.dataset[k] = valore[k]; }
      else nodo.setAttribute(chiave, String(valore));
    }
    for (const figlio of figli.flat()) {
      if (figlio === undefined || figlio === null || figlio === false) continue;
      nodo.append(figlio);
    }
    return nodo;
  }

  /** La scheda si disegna qui e in nessun altro posto: la usano l'hub e le pagine argomento. */
  function creaCard(voce, base) {
    const indirizzo = href(base, voce.percorso);
    const argomento = voce.tipo === TIPO_ARGOMENTO;
    const badge = testoBadge(voce);
    return el('article', { classe: argomento ? 'card argomento' : 'card attivita' },
      el('span', { classe: 'tipo-badge', testo: argomento ? 'ARGOMENTO' : 'ATTIVITÀ' }),
      el('div', { classe: 'area-badge', testo: voce.areaEtichetta }),
      el('h2', {}, el('a', { classe: 'titolo', href: indirizzo, target: '_blank', rel: 'noopener', testo: voce.titolo })),
      voce.descrizione ? el('p', { classe: 'descrizione', testo: voce.descrizione }) : null,
      voce.tag.length ? el('div', { classe: 'tagmini' }, voce.tag.map((tag) => el('span', { testo: tag }))) : null,
      badge ? el('span', { classe: 'badge-durata', testo: badge }) : null,
      el('a', { classe: 'vai', href: indirizzo, target: '_blank', rel: 'noopener',
        testo: argomento ? 'Apri l\u2019argomento →' : 'Apri l\u2019attività →' }));
  }

  /** data-base: quanti livelli risalire per arrivare alla radice del sito ("" in radice). */
  function normalizzaBase(base) {
    const pulita = String(base === undefined || base === null ? '' : base).trim();
    if (!pulita || pulita === './') return '';
    return pulita.endsWith('/') ? pulita : pulita + '/';
  }

  /** Indirizzo relativo di una scheda: base della pagina + percorso nel catalogo. */
  function href(base, percorso) {
    return normalizzaBase(base) + String(percorso === undefined || percorso === null ? '' : percorso).replace(/^\/+/, '');
  }

  function baseDaBody(documento) {
    const doc = documento || (typeof document !== 'undefined' ? document : null);
    if (!doc || !doc.body || !doc.body.dataset) return '';
    return normalizzaBase(doc.body.dataset.base);
  }

  /** Legge catalogo.json: sta sempre alla radice del sito, a qualunque profondità sia la pagina. */
  async function caricaCatalogo(base) {
    const percorso = normalizzaBase(base) + 'catalogo.json';
    const risposta = await fetch(percorso, { cache: 'no-cache' });
    if (!risposta.ok) throw new Error(percorso + ': risposta HTTP ' + risposta.status);
    return await risposta.json();
  }

  function avvisiInConsole(avvisi, prefisso) {
    for (const avviso of avvisi) console.warn((prefisso || '[catalogo]') + ' ' + avviso);
  }

  globale.Catalogo = {
    TIPO_ARGOMENTO: TIPO_ARGOMENTO,
    TIPO_ATTIVITA: TIPO_ATTIVITA,
    REGOLA_TAG: REGOLA_TAG,
    normalizzaTesto: normalizzaTesto,
    normalizzaTag: normalizzaTag,
    tagValido: tagValido,
    etichettaCartella: etichettaCartella,
    etichettaDi: etichettaDi,
    plurale: plurale,
    minutiValidi: minutiValidi,
    normalizzaCatalogo: normalizzaCatalogo,
    aree: aree,
    tagConConteggio: tagConConteggio,
    attivitaDi: attivitaDi,
    ordinaVoci: ordinaVoci,
    percorsoArgomento: percorsoArgomento,
    percorsoChiuso: percorsoChiuso,
    testoBadge: testoBadge,
    el: el,
    creaCard: creaCard,
    normalizzaBase: normalizzaBase,
    href: href,
    baseDaBody: baseDaBody,
    caricaCatalogo: caricaCatalogo,
    avvisiInConsole: avvisiInConsole,
  };
})(globalThis);
