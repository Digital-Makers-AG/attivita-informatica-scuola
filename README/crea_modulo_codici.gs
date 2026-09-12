/**
 * Missione 0 · Officina 23 — crea il Modulo Google «Missione 0 · codici risultato»
 * con impostazioni, domande, convalida dei codici e Foglio delle risposte collegato.
 *
 * Come si usa (una volta sola, con l'account della scuola):
 *  1. Apri https://script.google.com › Nuovo progetto.
 *  2. Cancella il contenuto, incolla tutto questo codice e salva (Ctrl+S).
 *  3. In alto scegli la funzione creaModuloCodici e premi Esegui.
 *  4. Autorizza l'accesso a Moduli e Fogli quando Google lo chiede.
 *  5. Apri il Registro di esecuzione: trovi il link del modulo (da allegare ai compiti 01, 03, 06 e 08)
 *     e il link del foglio delle risposte (da copiare in verifica_codici.html).
 */
const TITOLO = 'Missione 0 · codici risultato';
const CODICI = [
  {
    "titolo": "Codice palestra della tastiera (L1)",
    "aiuto": "Lezione 1 · Palestra della tastiera: ★ Riepilogo › clic nel codice › Ctrl+A › Ctrl+C, poi qui Ctrl+V. Inizia con O23-L1.",
    "regex": "^\\s*O23-L1 \\|.*\\| #[0-9A-Z]{5}\\s*$",
    "inizio": "O23-L1"
  },
  {
    "titolo": "Codice palestra delle scorciatoie (L1)",
    "aiuto": "Lezione 1 · Palestra delle scorciatoie: ★ Riepilogo › copia il codice. Inizia con O23-SCO.",
    "regex": "^\\s*O23-SCO \\|.*\\| #[0-9A-Z]{5}\\s*$",
    "inizio": "O23-SCO"
  },
  {
    "titolo": "Codice palestra della selezione (L2)",
    "aiuto": "Lezione 2 · Palestra della selezione: ★ Riepilogo › copia il codice. Inizia con O23-SEL.",
    "regex": "^\\s*O23-SEL \\|.*\\| #[0-9A-Z]{5}\\s*$",
    "inizio": "O23-SEL"
  },
  {
    "titolo": "Codice casella di posta (L4)",
    "aiuto": "Lezione 4 · Casella di posta: ★ Riepilogo e codice › copia il codice. Inizia con O23-PHI.",
    "regex": "^\\s*O23-PHI \\|.*\\| #[0-9A-Z]{5}\\s*$",
    "inizio": "O23-PHI"
  },
  {
    "titolo": "Codice casella della missione (MF)",
    "aiuto": "Missione finale · Casella di posta: ★ Riepilogo e codice › copia il codice. Inizia con O23-PMF.",
    "regex": "^\\s*O23-PMF \\|.*\\| #[0-9A-Z]{5}\\s*$",
    "inizio": "O23-PMF"
  }
];

function creaModuloCodici() {
  const form = FormApp.create(TITOLO);
  form.setDescription('Incolla qui i codici risultato delle palestre e delle caselle di posta di Officina 23. ' +
    'Ogni codice inizia con O23 e finisce con # seguito da 5 caratteri: copialo tutto. ' +
    'Puoi tornare sul modulo quando vuoi e aggiungere i codici delle lezioni successive (Modifica la risposta).');

  // Chi risponde: solo account della scuola, una risposta a testa, modificabile nelle lezioni successive
  imposta_('raccolta degli indirizzi email', () => form.setEmailCollectionType(FormApp.EmailCollectionType.VERIFIED), () => form.setCollectEmail(true));
  imposta_('solo utenti della scuola', () => form.setRequireLogin(true));
  imposta_('una risposta per persona', () => form.setLimitOneResponsePerUser(true));
  form.setAllowResponseEdits(true);
  form.setShowLinkToRespondAgain(false);
  form.setProgressBar(false);
  form.setConfirmationMessage('Codici ricevuti, grazie! Quando una lezione ti chiede un altro codice, riapri il modulo e scegli «Modifica la risposta».');

  form.addTextItem().setTitle('Nome e cognome')
      .setHelpText('Scrivilo come negli strumenti (esempio: Mario Rossi).').setRequired(true);
  form.addTextItem().setTitle('Classe').setHelpText('Esempio: 3A').setRequired(true)
      .setValidation(FormApp.createTextValidation()
        .requireTextMatchesPattern('^\\s*[1-5]\\s?[A-Za-z]{1,3}\\s*$')
        .setHelpText('Scrivi la classe come 3A.').build());

  CODICI.forEach(c => {
    form.addTextItem().setTitle(c.titolo).setHelpText(c.aiuto)
        .setValidation(FormApp.createTextValidation()
          .requireTextMatchesPattern(c.regex)
          .setHelpText('Incolla il codice completo, da ' + c.inizio + ' fino al # finale.').build());
  });

  const foglio = SpreadsheetApp.create(TITOLO + ' (risposte)');
  form.setDestination(FormApp.DestinationType.SPREADSHEET, foglio.getId());
  if (typeof form.setPublished === 'function') imposta_('pubblicazione del modulo', () => form.setPublished(true));

  Logger.log('Modulo da allegare ai compiti 01, 03, 06 e 08: ' + form.getPublishedUrl());
  Logger.log('Per modificare il modulo: ' + form.getEditUrl());
  Logger.log('Foglio delle risposte (seleziona tutto, copia e incolla in verifica_codici.html): ' + foglio.getUrl());
}

/** Applica un'impostazione; se l'account non la permette, prova l'alternativa e lo annota nel registro. */
function imposta_(nome, azione, alternativa) {
  try { azione(); }
  catch (e) {
    if (alternativa) { try { alternativa(); return; } catch (e2) { /* nemmeno l'alternativa è disponibile */ } }
    Logger.log('Impostazione non applicata (' + nome + '): ' + e.message + '. Puoi attivarla a mano nelle Impostazioni del modulo.');
  }
}
