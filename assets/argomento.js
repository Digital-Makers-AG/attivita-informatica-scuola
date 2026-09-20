/* argomento.js — la pagina di un argomento: elenca le sue attività.
 *
 * Script classico (niente ES modules): espone globalThis.Argomento e ha bisogno di
 * assets/catalogo.js caricato prima. L'elenco non si scrive a mano: arriva da
 * catalogo.json, quindi aggiungere un'attività non richiede di toccare questa pagina.
 *
 * La pagina dichiara nel <body>:
 *   data-base="../../"                  dove sta catalogo.json rispetto alla pagina;
 *   data-argomento="AREA/ARGOMENTO/"    quale argomento elencare.
 * Il nome visibile (kicker, h1, titolo della scheda del browser) arriva dalle
 * etichette del catalogo: si scrive una volta sola, in catalogo.json.
 */
(function (globale) {
  'use strict';

  const C = globale.Catalogo;
  if (!C) {
    throw new Error('assets/argomento.js ha bisogno di assets/catalogo.js caricato prima: nell\'HTML metti per primo <script src="assets/catalogo.js"></script>.');
  }

  /** "AREA/ARGOMENTO" o "AREA/ARGOMENTO/" -> "AREA/ARGOMENTO/". */
  function normalizzaArgomento(valore) {
    return C.percorsoChiuso(valore).replace(/^\/+/, '');
  }

  function prendiDom() {
    const id = {
      attivita: 'attivita', conteggio: 'conteggio', statoVuoto: 'stato-vuoto',
      errore: 'errore', kicker: 'argomento-area', titolo: 'argomento-titolo',
    };
    const dom = {};
    for (const chiave of Object.keys(id)) dom[chiave] = document.getElementById(id[chiave]);
    return dom;
  }

  function rendiElenco(dom, attivita, base) {
    if (dom.attivita) {
      dom.attivita.replaceChildren.apply(dom.attivita, attivita.map((voce) => C.creaCard(voce, base)));
    }
    let minuti = 0;
    for (const voce of attivita) if (voce.minuti) minuti += voce.minuti;
    if (dom.conteggio) {
      dom.conteggio.textContent = attivita.length
        ? C.plurale(attivita.length, 'attività', 'attività') + (minuti ? ' · ' + minuti + ' min' : '')
        : '';
    }
    const vuoto = attivita.length === 0;
    if (!dom.statoVuoto) return;
    dom.statoVuoto.hidden = !vuoto;
    dom.statoVuoto.replaceChildren();
    if (!vuoto) return;
    dom.statoVuoto.append(
      C.el('p', { testo: 'Questo argomento non ha ancora attività.' }),
      C.el('p', { testo: 'Per aggiungerne una basta scrivere la sua voce in catalogo.json (percorso a tre segmenti: AREA/ARGOMENTO/ATTIVITA/) e creare la cartella con il file index.html: questo elenco si aggiorna da solo.' }),
    );
  }

  function rendiErrore(dom, errore) {
    console.error('[argomento]', errore);
    if (dom.attivita) dom.attivita.replaceChildren();
    if (dom.statoVuoto) dom.statoVuoto.hidden = true;
    if (!dom.errore) return;
    dom.errore.hidden = false;
    dom.errore.replaceChildren(
      C.el('p', {}, C.el('b', { testo: 'Non riesco a leggere il catalogo. ' }),
        document.createTextNode(String(errore && errore.message ? errore.message : errore))),
      C.el('p', { testo: 'Con doppio clic (indirizzo file://) i browser non leggono i file JSON: usa il sito pubblicato oppure avvia un piccolo server locale nella cartella del progetto.' }),
    );
  }

  /** Riempi i nomi visibili della pagina con le etichette del catalogo. */
  function rendiNomi(dom, segmenti, etichette) {
    const etichettaArea = C.etichettaDi(segmenti[0], etichette);
    const etichettaArgomento = C.etichettaDi(segmenti[1], etichette);
    if (dom.kicker && etichettaArea) dom.kicker.textContent = etichettaArea;
    if (dom.titolo && etichettaArgomento) dom.titolo.textContent = etichettaArgomento;
    if (etichettaArgomento) document.title = etichettaArgomento + (etichettaArea ? ' · ' + etichettaArea : '');
    return etichettaArgomento;
  }

  async function avvia() {
    const dom = prendiDom();
    const argomento = normalizzaArgomento(document.body.dataset.argomento);
    const segmenti = argomento.split('/').filter(Boolean);
    if (segmenti.length !== 2) {
      console.warn('[argomento] il <body> deve avere data-argomento="AREA/ARGOMENTO/": non so quali attività elencare.');
      return;
    }
    let letto;
    try {
      letto = C.normalizzaCatalogo(await C.caricaCatalogo(C.baseDaBody(document)));
    } catch (errore) {
      rendiErrore(dom, errore);
      return;
    }
    for (const avviso of letto.avvisi) console.warn('[argomento]', avviso);
    const etichetta = rendiNomi(dom, segmenti, letto.etichette);
    if (!etichetta) console.warn('[argomento] nessuna etichetta per ' + argomento + ': controllo catalogo.json.');
    rendiElenco(dom, C.attivitaDi(letto.voci, argomento), C.baseDaBody(document));
  }

  globale.Argomento = {
    normalizzaArgomento: normalizzaArgomento,
    avvia: avvia,
  };

  // Nei test la pagina finta viene preparata prima: con questo interruttore il bootstrap resta spento.
  if (typeof document !== 'undefined' && document.body && document.body.dataset
    && !globale.HubSenzaAvvioAutomatico && document.body.dataset.argomento) {
    avvia().catch((errore) => console.error('[argomento]', errore));
  }
})(globalThis);
