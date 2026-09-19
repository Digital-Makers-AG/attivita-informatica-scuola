/* Hub dei moduli — logica di filtro e disegno della pagina.
 *
 * Modulo ES. Le funzioni esportate sono pure e si possono provare senza browser
 * (vedi tests/hub_test.js, eseguibile con Deno). Il bootstrap della pagina parte
 * soltanto se esiste un document, quindi importare questo file altrove e' sicuro.
 *
 * Qui dentro non compare nessun nome di area, di modulo o di tag: tutto arriva da dati/moduli.json.
 */

export const TAG_VISIBILI = 12;            // chip di tag mostrati prima di "mostra tutti i tag"
export const SUGGERIMENTI_MAX = 8;         // righe massime nella tendina (l'ultima e' sempre "cerca ...")
export const CHIAVE_MODO = 'hubidx_modo';  // dove si ricorda la preferenza AND/OR

const REGOLA_TAG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const FILTRI_VUOTI = Object.freeze({ area: '', tag: Object.freeze([]), modo: 'or', q: '' });

/* ------------------------------------------------------------------ *
 * funzioni pure
 * ------------------------------------------------------------------ */

export function tagValido(tag) {
  return typeof tag === 'string' && REGOLA_TAG.test(tag);
}

export function normalizzaTag(tag) {
  return String(tag ?? '').trim().toLowerCase();
}

/** minuscole, senza accenti: serve per confrontare testo digitato e contenuti. */
export function normalizzaTesto(testo) {
  return String(testo ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/** COMPETENZE_DIGITALI_BASE -> "Competenze digitali base" */
export function labelDaChiave(chiave) {
  const parole = String(chiave ?? '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  return parole ? parole[0].toUpperCase() + parole.slice(1) : '';
}

/** Riporta un filtro qualunque alla forma canonica: { area, tag[], modo, q }. */
export function normalizzaFiltri(filtri) {
  const f = filtri ?? {};
  const tag = [];
  for (const grezzo of (Array.isArray(f.tag) ? f.tag : [])) {
    const t = normalizzaTag(grezzo);
    if (tagValido(t) && !tag.includes(t)) tag.push(t);
  }
  return {
    area: String(f.area ?? '').trim(),
    tag,
    modo: String(f.modo ?? '').toLowerCase() === 'and' ? 'and' : 'or',
    q: String(f.q ?? '').trim(),
  };
}

/** Valida i dati grezzi di dati/moduli.json e segnala (senza lanciare) le voci malformate. */
export function normalizza(dati) {
  const avvisi = [];
  if (!Array.isArray(dati)) return { moduli: [], avvisi: ['dati/moduli.json non contiene un array JSON.'] };
  const moduli = [];
  const percorsiVisti = new Set();
  dati.forEach((grezzo, i) => {
    const dove = `voce ${i + 1}`;
    if (!grezzo || typeof grezzo !== 'object' || Array.isArray(grezzo)) {
      avvisi.push(`${dove}: non e' un oggetto, la salto.`);
      return;
    }
    const percorso = String(grezzo.percorso ?? '').trim();
    if (!percorso) {
      avvisi.push(`${dove} (${grezzo.titolo ?? 'senza titolo'}): manca "percorso", la salto.`);
      return;
    }
    if (percorsiVisti.has(percorso)) {
      avvisi.push(`${dove}: "percorso" ripetuto (${percorso}), la salto.`);
      return;
    }
    percorsiVisti.add(percorso);
    if (!percorso.endsWith('/')) avvisi.push(`${dove}: "percorso" non finisce con "/": ${percorso}`);
    const area = String(grezzo.area ?? '').trim();
    if (!area) avvisi.push(`${dove}: manca "area".`);
    const titolo = String(grezzo.titolo ?? '').trim();
    if (!titolo) avvisi.push(`${dove}: manca "titolo".`);
    const tag = [];
    for (const grezzoTag of (Array.isArray(grezzo.tag) ? grezzo.tag : [])) {
      const t = normalizzaTag(grezzoTag);
      if (tagValido(t)) {
        if (!tag.includes(t)) tag.push(t);
      } else {
        avvisi.push(`${dove}: tag non valido "${grezzoTag}" (minuscole, cifre e trattini).`);
      }
    }
    moduli.push({
      area,
      percorso,
      titolo: titolo || percorso,
      descrizione: String(grezzo.descrizione ?? '').trim(),
      tag,
      tagSet: new Set(tag),
    });
  });
  return { moduli, avvisi };
}

/** Aree presenti nei dati, con etichetta leggibile e numero di moduli. */
export function aree(moduli) {
  const conta = new Map();
  for (const m of moduli) if (m.area) conta.set(m.area, (conta.get(m.area) ?? 0) + 1);
  return [...conta.entries()]
    .map(([chiave, n]) => ({ chiave, etichetta: labelDaChiave(chiave), n }))
    .sort((a, b) => a.chiave.localeCompare(b.chiave, 'it'));
}

/** Tutti i tag dei dati con la loro frequenza, dal piu' usato al meno usato. */
export function tagConConteggio(moduli) {
  const conta = new Map();
  for (const m of moduli) for (const t of m.tag) conta.set(t, (conta.get(t) ?? 0) + 1);
  return [...conta.entries()]
    .map(([tag, n]) => ({ tag, n }))
    .sort((a, b) => (b.n - a.n) || a.tag.localeCompare(b.tag, 'it'));
}

/**
 * Filtra i moduli.
 * area: uguaglianza esatta. modo "and": servono tutti i tag attivi; "or": ne basta uno.
 * q: sottostringa (senza accenti, senza maiuscole) su titolo + descrizione.
 */
export function filtra(moduli, filtri) {
  const f = normalizzaFiltri(filtri);
  const q = normalizzaTesto(f.q);
  return moduli.filter((m) => {
    if (f.area && m.area !== f.area) return false;
    if (f.tag.length) {
      const ok = f.modo === 'and'
        ? f.tag.every((t) => m.tagSet.has(t))
        : f.tag.some((t) => m.tagSet.has(t));
      if (!ok) return false;
    }
    if (q && !normalizzaTesto(`${m.titolo} ${m.descrizione} ${m.area}`).includes(q)) return false;
    return true;
  });
}

/**
 * Per ogni tag: quanti moduli si vedrebbero se quel tag fosse attivo, con i filtri correnti.
 * E' il numero mostrato sui chip: in "and" vale 0 quando il tag non puo' dare risultati,
 * ed e' proprio quel 0 a disattivare il chip.
 */
export function conteggiDinamici(moduli, filtri) {
  const f = normalizzaFiltri(filtri);
  const conteggi = new Map();
  for (const { tag } of tagConConteggio(moduli)) {
    conteggi.set(tag, filtra(moduli, { ...f, tag: [...f.tag, tag] }).length);
  }
  return conteggi;
}

/**
 * Righe della tendina di autocompletamento: prima i tag, poi i titoli dei moduli,
 * in fondo sempre "cerca \"...\"" con il numero di risultati di quella ricerca.
 */
export function suggerimenti(moduli, testo, filtri) {
  const f = normalizzaFiltri(filtri);
  const cercato = normalizzaTesto(testo);
  if (!cercato) return [];
  const conteggi = conteggiDinamici(moduli, f);
  const righe = [];

  const tagTrovati = tagConConteggio(moduli)
    .filter((v) => normalizzaTesto(v.tag).includes(cercato))
    .sort((a, b) => {
      const pa = normalizzaTesto(a.tag).startsWith(cercato) ? 0 : 1;
      const pb = normalizzaTesto(b.tag).startsWith(cercato) ? 0 : 1;
      return (pa - pb) || (b.n - a.n) || a.tag.localeCompare(b.tag, 'it');
    });
  for (const v of tagTrovati) {
    righe.push({ tipo: 'tag', valore: v.tag, etichetta: v.tag, badge: plurale(conteggi.get(v.tag) ?? 0, 'modulo', 'moduli') });
  }
  for (const m of moduli) {
    if (normalizzaTesto(m.titolo).includes(cercato)) {
      righe.push({ tipo: 'modulo', valore: m.titolo, etichetta: m.titolo, badge: labelDaChiave(m.area) });
    }
  }
  const quante = Math.min(righe.length, SUGGERIMENTI_MAX - 1);
  const scelte = righe.slice(0, quante);
  const pulito = String(testo ?? '').trim();
  scelte.push({
    tipo: 'cerca',
    valore: pulito,
    etichetta: `cerca "${pulito}"`,
    badge: plurale(filtra(moduli, { ...f, q: pulito }).length, 'modulo', 'moduli'),
  });
  return scelte;
}

/* ------------------------------------------------------------------ *
 * indirizzo della pagina (#area=...&tag=...&modo=...&q=...)
 * ------------------------------------------------------------------ */

/** Legge l'hash in due forme: quella con i nomi dei campi e quella corta #hosting,cms. */
export function leggiHash(hash) {
  const h = String(hash ?? '').replace(/^#/, '').trim();
  if (!h) return normalizzaFiltri(FILTRI_VUOTI);
  if (!h.includes('=')) {
    return normalizzaFiltri({ ...FILTRI_VUOTI, tag: h.split(',') });
  }
  const p = new URLSearchParams(h);
  return normalizzaFiltri({
    area: p.get('area') ?? '',
    tag: (p.get('tag') ?? '').split(','),
    modo: p.get('modo') ?? '',
    q: p.get('q') ?? '',
  });
}

/** Scrive l'hash canonico; stringa vuota quando non c'e' nessun filtro.
 *  Il modo AND/OR compare solo insieme a un filtro vero, cosi' l'indirizzo pulito resta pulito. */
export function scriviHash(filtri) {
  const f = normalizzaFiltri(filtri);
  const parti = [];
  if (f.area) parti.push('area=' + encodeURIComponent(f.area));
  if (f.tag.length) parti.push('tag=' + f.tag.map(encodeURIComponent).join(','));
  if (f.q) parti.push('q=' + encodeURIComponent(f.q));
  if (parti.length && f.modo) parti.push('modo=' + f.modo);
  return parti.length ? '#' + parti.join('&') : '';
}

export function filtriUguali(a, b) {
  const x = normalizzaFiltri(a);
  const y = normalizzaFiltri(b);
  return x.area === y.area && x.modo === y.modo && x.q === y.q
    && x.tag.length === y.tag.length && x.tag.every((t, i) => t === y.tag[i]);
}

export function haFiltri(filtri) {
  const f = normalizzaFiltri(filtri);
  return Boolean(f.area || f.tag.length || f.q);
}

export function plurale(n, singolare, plurale) {
  return `${n} ${n === 1 ? singolare : plurale}`;
}

/** Frase mostrata quando i filtri non lasciano passare nessun modulo. */
export function messaggioVuoto(filtri) {
  const f = normalizzaFiltri(filtri);
  const pezzi = [];
  if (f.area) pezzi.push(`area «${labelDaChiave(f.area)}»`);
  if (f.tag.length) pezzi.push(`tag ${f.tag.map((t) => `«${t}»`).join(f.modo === 'and' ? ' + ' : ' oppure ')}`);
  if (f.q) pezzi.push(`testo «${f.q}»`);
  return pezzi.length
    ? `Nessun modulo con ${pezzi.join(', ')}.`
    : 'Nessun modulo disponibile.';
}

/* ------------------------------------------------------------------ *
 * interfaccia: da qui in giu' serve un browser
 * ------------------------------------------------------------------ */

function el(tag, props = {}, ...figli) {
  const nodo = document.createElement(tag);
  for (const [chiave, valore] of Object.entries(props)) {
    if (valore === null || valore === undefined || valore === false) continue;
    if (chiave === 'classe') nodo.className = valore;
    else if (chiave === 'testo') nodo.textContent = valore;
    else if (chiave.startsWith('on') && typeof valore === 'function') nodo.addEventListener(chiave.slice(2), valore);
    else if (chiave === 'dati') for (const [k, v] of Object.entries(valore)) nodo.dataset[k] = v;
    else nodo.setAttribute(chiave, valore === true ? '' : String(valore));
  }
  for (const figlio of figli) if (figlio !== null && figlio !== undefined) nodo.append(figlio);
  return nodo;
}

const dom = {};
let MODULI = [];
let stato = normalizzaFiltri(FILTRI_VUOTI);
let tuttiITag = false;
let righeTendina = [];
let indiceAttivo = -1;

function prendiDom() {
  const nomi = ['filtro-area', 'filtro-modo', 'q', 'sugg', 'filtro-tag', 'mostra-tutti-tag',
    'conteggio', 'filtri-attivi', 'azzera', 'cards', 'stato-vuoto', 'errore', 'avvisi'];
  for (const nome of nomi) {
    const chiave = nome.replace(/^filtro-/, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    dom[chiave] = document.getElementById(nome);
  }
}

function leggiModoRicordato() {
  try {
    const v = window.localStorage.getItem(CHIAVE_MODO);
    return v === 'and' || v === 'or' ? v : '';
  } catch {
    return '';
  }
}

function ricordaModo() {
  try { window.localStorage.setItem(CHIAVE_MODO, stato.modo); } catch { /* niente memoria: pazienza */ }
}

function sincronizzaUrl(scrivere) {
  if (!scrivere) return;
  const indirizzo = window.location.pathname + window.location.search + scriviHash(stato);
  try {
    window.history.replaceState(null, '', indirizzo);
  } catch { /* file:// o anteprima locale: l'indirizzo resta com'era */ }
}

/** Unico punto in cui i filtri cambiano: ridisegna la pagina e allinea l'indirizzo. */
function applica(parziale) {
  stato = normalizzaFiltri({ ...stato, ...parziale });
  disegna();
  sincronizzaUrl(true);
}

function azzera() {
  stato = normalizzaFiltri({ ...FILTRI_VUOTI, modo: stato.modo });
  tuttiITag = false;
  dom.q.value = '';
  chiudiTendina();
  disegna();
  sincronizzaUrl(true);
}

function disegna() {
  const risultati = filtra(MODULI, stato);
  rendiAree();
  rendiModo();
  rendiTag();
  rendiSchede(risultati);
  rendiVuoto(risultati);
  rendiRiepilogo(risultati);
}

function rendiAree() {
  dom.area.replaceChildren(el('button', {
    type: 'button', classe: 'chip area',
    'aria-pressed': stato.area === '' ? 'true' : 'false',
    onclick: () => applica({ area: '' }),
  }, 'Tutte le aree'));
  for (const area of aree(MODULI)) {
    dom.area.append(el('button', {
      type: 'button', classe: 'chip area',
      'aria-pressed': stato.area === area.chiave ? 'true' : 'false',
      onclick: () => applica({ area: stato.area === area.chiave ? '' : area.chiave }),
    }, el('span', { classe: 'nome', testo: area.etichetta }), el('span', { classe: 'n', testo: String(area.n) })));
  }
}

function rendiModo() {
  const spiegazione = {
    or: 'un modulo basta che abbia almeno uno dei tag scelti',
    and: 'un modulo deve avere tutti i tag scelti',
  };
  dom.modo.replaceChildren();
  for (const [valore, etichetta] of [['or', 'Almeno un tag'], ['and', 'Tutti i tag']]) {
    dom.modo.append(el('button', {
      type: 'button', classe: 'chip modo',
      'aria-pressed': stato.modo === valore ? 'true' : 'false',
      title: `Combina i tag cosi\u2019: ${spiegazione[valore]}`,
      onclick: () => { applica({ modo: valore }); ricordaModo(); },
    }, etichetta));
  }
}

function rendiTag() {
  const tutti = tagConConteggio(MODULI);
  const conteggi = conteggiDinamici(MODULI, stato);
  const visibili = tutti.filter((v, i) => i < TAG_VISIBILI || stato.tag.includes(v.tag));
  dom.tag.replaceChildren();
  for (const { tag } of visibili) {
    const attivo = stato.tag.includes(tag);
    const quanti = conteggi.get(tag) ?? 0;
    const spento = stato.modo === 'and' && !attivo && quanti === 0;
    dom.tag.append(el('button', {
      type: 'button', classe: 'chip tag',
      'aria-pressed': attivo ? 'true' : 'false',
      disabled: spento,
      title: spento
        ? `Nessun modulo ha insieme ${[...stato.tag, tag].join(' + ')}`
        : `${plurale(quanti, 'modulo', 'moduli')} con il tag ${tag}`,
      onclick: () => applica({ tag: attivo ? stato.tag.filter((t) => t !== tag) : [...stato.tag, tag] }),
    },
      attivo ? el('span', { classe: 'x', testo: '\u00d7' }) : null,
      el('span', { classe: 'nome', testo: tag }),
      el('span', { classe: 'n', testo: String(quanti) }),
    ));
  }
  if (tutti.length > TAG_VISIBILI) {
    dom.mostraTag.hidden = false;
    dom.mostraTag.textContent = tuttiITag ? 'mostra solo i pi\u00f9 usati' : `mostra tutti i tag (${tutti.length})`;
    dom.mostraTag.setAttribute('aria-expanded', tuttiITag ? 'true' : 'false');
  } else {
    dom.mostraTag.hidden = true;
  }
}

function rendiSchede(risultati) {
  dom.cards.replaceChildren();
  for (const m of risultati) {
    dom.cards.append(el('article', { classe: 'modulo' },
      el('div', { classe: 'area-nome', testo: labelDaChiave(m.area) }),
      el('h2', {}, el('a', { classe: 'titolo', href: m.percorso, target: '_blank', rel: 'noopener', testo: m.titolo })),
      m.descrizione ? el('p', { testo: m.descrizione }) : null,
      m.tag.length ? el('div', { classe: 'tagmini' }, ...m.tag.map((t) => el('span', { testo: t }))) : null,
      el('a', { classe: 'vai', href: m.percorso, target: '_blank', rel: 'noopener', testo: 'Apri il modulo \u2192' }),
    ));
  }
}

function rendiVuoto(risultati) {
  const vuoto = risultati.length === 0;
  dom.statoVuoto.hidden = !vuoto;
  dom.statoVuoto.replaceChildren();
  if (!vuoto) return;
  dom.statoVuoto.append(el('p', { testo: messaggioVuoto(stato) }));
  if (haFiltri(stato)) {
    dom.statoVuoto.append(el('button', { type: 'button', classe: 'all', testo: 'Azzera i filtri', onclick: azzera }));
  }
}

function rendiRiepilogo(risultati) {
  dom.conteggio.replaceChildren(
    el('span', { classe: 'n', testo: String(risultati.length) }),
    document.createTextNode(` ${risultati.length === 1 ? 'modulo' : 'moduli'}`),
  );
  dom.azzera.hidden = !haFiltri(stato);
  const attivi = [];
  if (stato.q) {
    attivi.push(el('button', {
      type: 'button', classe: 'chip', 'aria-pressed': 'true', title: 'Togli la ricerca',
      onclick: () => { dom.q.value = ''; chiudiTendina(); applica({ q: '' }); },
    }, el('span', { classe: 'x', testo: '\u00d7' }), el('span', { classe: 'nome', testo: `testo \u00ab${stato.q}\u00bb` })));
  }
  dom.filtriAttivi.replaceChildren(...attivi);
}

function rendiAvvisi(avvisi) {
  dom.avvisi.replaceChildren();
  dom.avvisi.hidden = avvisi.length === 0;
  if (!avvisi.length) return;
  dom.avvisi.append(
    el('p', {}, el('b', { testo: 'Da sistemare in dati/moduli.json: ' }), document.createTextNode(plurale(avvisi.length, 'voce', 'voci'))),
    el('ul', {}, ...avvisi.map((a) => el('li', { testo: a }))),
  );
}

function rendiErrore(errore) {
  console.error('[hub]', errore);
  dom.cards.replaceChildren();
  dom.statoVuoto.hidden = true;
  dom.errore.hidden = false;
  dom.errore.replaceChildren(
    el('p', {}, el('b', { testo: 'Non riesco a leggere l\u2019elenco dei moduli. ' }),
      document.createTextNode(String(errore && errore.message ? errore.message : errore))),
    el('p', { testo: 'Con doppio clic (indirizzo file://) i browser non leggono i file JSON: usa il sito pubblicato oppure avvia un piccolo server locale nella cartella del progetto.' }),
  );
}

/* ---------- tendina di autocompletamento ---------- */

function rendiTendina(testo) {
  righeTendina = suggerimenti(MODULI, testo, stato);
  indiceAttivo = -1;
  if (!righeTendina.length) {
    chiudiTendina();
    return;
  }
  const etichette = { tag: 'tag', modulo: 'modulo', cerca: '' };
  const voci = righeTendina.map((riga, i) => {
    const voce = el('li', {
      id: `sugg-${i}`, role: 'option', 'aria-selected': 'false',
      onmousedown: (evento) => { evento.preventDefault(); scegliRiga(i); },
    },
      el('span', { classe: 'tipo', testo: etichette[riga.tipo] }),
      el('span', { classe: 'testo', testo: riga.etichetta }),
      el('span', { classe: 'n', testo: riga.badge }),
    );
    if (riga.tipo === 'cerca') voce.classList.add('cerca');
    return voce;
  });
  dom.sugg.replaceChildren(...voci);
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
  [...dom.sugg.children].forEach((voce, i) => voce.setAttribute('aria-selected', i === indiceAttivo ? 'true' : 'false'));
  dom.q.setAttribute('aria-activedescendant', `sugg-${indiceAttivo}`);
}

/** Un tag si aggiunge ai filtri; un titolo o "cerca ..." diventano il testo cercato. */
function scegliRiga(i) {
  const riga = righeTendina[i];
  if (!riga) return;
  if (riga.tipo === 'tag') {
    if (!stato.tag.includes(riga.valore)) applica({ tag: [...stato.tag, riga.valore] });
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
    stato = normalizzaFiltri({ ...stato, q: evento.target.value });
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
  window.addEventListener('hashchange', () => {
    const nuovo = leggiHash(window.location.hash);
    if (filtriUguali(nuovo, stato)) return;
    stato = nuovo;
    dom.q.value = stato.q;
    disegna();
  });
}

async function caricaModuli() {
  const risposta = await fetch('dati/moduli.json', { cache: 'no-cache' });
  if (!risposta.ok) throw new Error(`dati/moduli.json: risposta HTTP ${risposta.status}`);
  return risposta.json();
}

/** Avvia l'hub: legge i dati, l'indirizzo e la preferenza AND/OR ricordata. */
export async function avvia() {
  prendiDom();
  legaEventi();
  let letto;
  try {
    letto = normalizza(await caricaModuli());
  } catch (errore) {
    rendiErrore(errore);
    return;
  }
  MODULI = letto.moduli;
  for (const avviso of letto.avvisi) console.warn('[hub]', avviso);
  rendiAvvisi(letto.avvisi);

  const hash = String(window.location.hash ?? '');
  stato = leggiHash(hash);
  if (!/(^|[#&])modo=/.test(hash)) {
    const ricordato = leggiModoRicordato();
    if (ricordato) stato = normalizzaFiltri({ ...stato, modo: ricordato });
  }
  dom.q.value = stato.q;
  disegna();
  sincronizzaUrl(true);   // porta la forma corta #hosting,cms nella forma con i nomi dei campi
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  avvia().catch((errore) => console.error('[hub]', errore));
}
