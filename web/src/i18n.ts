import { useEffect, useState } from 'react';

export const german = {
  "Look for another virtual finish": "Andere virtuelle Fortsetzung suchen",
  "Collection": "Sammlung",
  "YOUR NEXT DISCOVERY": "DEINE NÄCHSTE ENTDECKUNG",
  "Your game, your rewards.": "Deine Partie, deine Erfolge.",
  "I played as": "Ich habe gespielt als",
  "Choose after your game": "Nach der Partie auswählen",
  "Changing color replaces this game’s rewards; it does not collect both sides.": "Ein Farbwechsel ersetzt die Erfolge dieser Partie. Es werden nicht beide Seiten gesammelt.",
  "Load a completed game to collect rewards.": "Lade eine abgeschlossene Partie, um Erfolge zu sammeln.",
  "Saving rewards…": "Erfolge werden gespeichert…",
  "Collect rewards": "Erfolge sammeln",
  "Could not save rewards. Please try again.": "Erfolge konnten nicht gespeichert werden. Bitte versuche es erneut.",
  "Already in your scrapbook.": "Schon in deinem Scrapbook.",
  "No progress was counted twice.": "Kein Fortschritt wurde doppelt gezählt.",
  "Game rewards saved. Your collection is up to date.": "Erfolge gespeichert. Deine Sammlung ist auf dem neuesten Stand.",
  "Real": "Echt",
  "Virtual": "Virtuell",
  "THIS GAME THROUGH THE CURRENT MOVE": "DIESE PARTIE BIS ZUM AKTUELLEN ZUG",
  "AT THIS MOMENT": "IN DIESEM MOMENT",
  "No contribution on this move.": "Kein Fortschritt bei diesem Zug.",
  "Jump to a reward moment": "Zu einem Erfolgsmoment springen",
  "Badge names and flavor text are the English originals.": "Abzeichennamen und Flavortexte sind die englischen Originale.",
  "A GROWING COLLECTION": "EINE WACHSENDE SAMMLUNG",
  "Your scrapbook.": "Dein Scrapbook.",
  "Saved only in this browser. Collect completed PGNs to try the reward loop.": "Nur in diesem Browser gespeichert. Sammle abgeschlossene PGN-Partien, um die Erfolge auszuprobieren.",
  "Could not open the local collection. Reload to try again.": "Die lokale Sammlung konnte nicht geöffnet werden. Versuche es nach dem Neuladen erneut.",
  "Badges": "Abzeichen",
  "Not unlocked yet": "Noch nicht freigeschaltet",
  "Mating scraps": "Matt-Scraps",
  "One notation, one collectible. Open a scrap for its real checkmate counts.": "Eine Notation, ein Sammelstück. Öffne einen Scrap für die Anzahl der echten Mattzüge.",
  "Your first mating scrap is waiting to be discovered.": "Dein erster Matt-Scrap wartet darauf, entdeckt zu werden.",
  "Real checkmates · White {white} · Black {black}": "Echte Mattzüge · Weiß {white} · Schwarz {black}",
  "Collected games": "Gesammelte Partien",
  "No games collected yet.": "Noch keine Partien gesammelt.",
  "Replay game": "Partie nachspielen",
  "After analysis, collect a virtual scrap if your side delivers mate.": "Sammle nach der Analyse einen virtuellen Scrap, wenn deine Seite mattsetzt.",
  "Pause analysis before opening another game.": "Pausiere die Analyse, bevor du eine andere Partie öffnest.",

  "Main navigation": "Hauptnavigation",
  "Language": "Sprache",
  "FIELD NOTES / 001": "NOTIZBUCH / 001",
  "THE BROWSER EXPERIMENT": "DAS BROWSER-EXPERIMENT",
  "Your games.": "Deine Partien.",
  "A little more remarkable.": "Ein bisschen bemerkenswerter.",
  "A real game from the original notebook. A chess engine running right here. Let’s see what your browser can do.": "Eine echte Partie aus dem ursprünglichen Notizbuch. Eine Schachengine direkt in deinem Browser. Schauen wir, was er kann.",
  "Game replay": "Partie nachspielen",
  "vs": "gegen",
  "Flip board": "Brett drehen",
  "First position": "Anfangsstellung",
  "Previous move": "Vorheriger Zug",
  "Next move": "Nächster Zug",
  "Last position": "Endstellung",
  "Replay position": "Stellung auswählen",
  "ENGINE CONTINUATION · NOT PLAYED": "ENGINE-FORTSETZUNG · NICHT GESPIELT",
  "STARTING POSITION": "ANFANGSSTELLUNG",
  "A separate simulated finish. Your original game is unchanged.": "Eine separate simulierte Fortsetzung. Deine ursprüngliche Partie bleibt unverändert.",
  "Move through the game. Analysis will appear here as it is saved.": "Gehe die Partie durch. Gespeicherte Analysen erscheinen hier.",
  "Scores are from White’s perspective.": "Bewertungen gelten aus Sicht von Weiß.",
  "ON YOUR DEVICE": "AUF DEINEM GERÄT",
  "A moment of reflection.": "Ein Moment zum Nachdenken.",
  "Moves saved": "Gespeicherte Halbzüge",
  "Analysis progress": "Analysefortschritt",
  "search depth": "Suchtiefe",
  "move analysis": "Zuganalyse",
  "ms / ply": "ms / Halbzug",
  "Analysis complete ✓": "Analyse abgeschlossen ✓",
  "Working in your browser…": "Dein Browser arbeitet…",
  "Resume analysis": "Analyse fortsetzen",
  "Analyze this game": "Partie analysieren",
  "Pause analysis": "Analyse pausieren",
  "Full Stockfish 19 · one worker · 32 MB hash. First use downloads a large engine; later visits use its cache. Completed moves survive a reload.": "Volles Stockfish 19 · ein Worker · 32 MB Hash. Beim ersten Mal wird die Engine heruntergeladen, danach aus dem Cache geladen. Fertige Halbzüge bleiben beim Neuladen erhalten.",
  "A POSSIBLE ENDING": "EIN MÖGLICHES ENDE",
  "What if they’d played on?": "Was wäre beim Weiterspielen passiert?",
  "No checkmate within the 20-ply continuation.": "Kein Schachmatt innerhalb der Fortsetzung von 20 Halbzügen.",
  "The position is terminal; no further finish to explore.": "Die Stellung ist beendet; keine weitere Fortsetzung möglich.",
  "After analysis, explore up to 20 additional engine plies. This proof does not grant scraps.": "Nach der Analyse folgen bis zu 20 zusätzliche Engine-Halbzüge. Dieser Prototyp vergibt noch keine Scraps.",
  "Virtual continuation": "Virtuelle Fortsetzung",
  "Open another page of the notebook": "Eine andere Seite im Notizbuch aufschlagen",
  "Original rapid game": "Ursprüngliche Schnellschachpartie",
  "Mate example": "Mattbeispiel",
  "PASTE ONE PGN": "EINE PGN EINFÜGEN",
  "Load PGN": "PGN laden",
  "Export analysis JSON": "Analyse als JSON exportieren",
  "The game, move by move.": "Die Partie, Zug für Zug.",
  "Played moves": "Gespielte Züge",
  "analyzed": "analysiert",
  "Local browser proof · analysis stays on this device · no account or game imports yet.": "Lokaler Browser-Prototyp · Analyse bleibt auf diesem Gerät · noch keine Konten oder Partieimporte.",
  "Engine source": "Engine-Quellcode",
  "Opening your local notebook…": "Dein lokales Notizbuch wird geöffnet…",
  "Saved analysis restored. Pick up where you left off.": "Gespeicherte Analyse wiederhergestellt. Mach weiter, wo du aufgehört hast.",
  "Your browser is the analysis engine.": "Dein Browser übernimmt die Analyse.",
  "Analysis was interrupted. Resume from the saved moves.": "Die Analyse wurde unterbrochen. Setze sie bei den gespeicherten Zügen fort.",
  "Saved analysis restored.": "Gespeicherte Analyse wiederhergestellt.",
  "Ready when you are.": "Bereit, wenn du es bist.",
  "Paused. Completed moves are saved on this device.": "Pausiert. Fertige Halbzüge sind auf diesem Gerät gespeichert.",
  "Starting Stockfish…": "Stockfish wird gestartet…",
  "Reading the game, one move at a time.": "Die Partie wird Zug für Zug analysiert.",
  "Exploring a separate engine finish…": "Eine separate Engine-Fortsetzung wird untersucht…",
  "Analysis complete. Every played move is preserved.": "Analyse abgeschlossen. Alle gespielten Züge sind erhalten.",
  "Loading engine without persistent download cache…": "Engine wird ohne dauerhaften Download-Cache geladen…",
  "Engine ready from browser cache.": "Engine aus dem Browser-Cache bereit.",
  "Downloading full Stockfish engine…": "Die vollständige Stockfish-Engine wird heruntergeladen…",
  "Virtual ply {ply}": "Virtueller Halbzug {ply}",
  "Ply {ply} / {total}": "Halbzug {ply} / {total}",
  "PLAYED · {move}": "GESPIELT · {move}",
  "Evaluation {score} · best alternative {move} · {seconds}s": "Bewertung {score} · beste Alternative {move} · {seconds}s",
  "{color} mates with {move} after {plies} simulated plies.": "{color} setzt mit {move} nach {plies} simulierten Halbzügen matt.",
  "White": "Weiß",
  "Black": "Schwarz",
  "Chess position, {color} to move": "Schachstellung, {color} am Zug",
  "checkmate": "Schachmatt",
  "Ply {ply}: {move}": "Halbzug {ply}: {move}",
  "Downloading engine · {received} MB": "Engine wird heruntergeladen · {received} MB",
  "An error occurred.": "Ein Fehler ist aufgetreten.",
  "Technical details": "Technische Details",
  "Help": "Hilfe",
  "Feedback": "Feedback",
  "Notebook": "Notizbuch",
  "Help articles are coming soon.": "Hilfeartikel folgen demnächst.",
  "There are no help articles yet.": "Es gibt noch keine Hilfeartikel.",
  "Your feedback": "Dein Feedback",
  "What would you like to tell us?": "Was möchtest du uns mitteilen?",
  "Save draft": "Entwurf speichern",
  "Clear draft": "Entwurf löschen",
  "Draft saved on this device. It has not been sent.": "Entwurf auf diesem Gerät gespeichert. Er wurde nicht gesendet.",
  "Feedback stays on this device for now. We’ll connect submission to GitHub later.": "Feedback bleibt vorerst auf diesem Gerät. Die Übermittlung an GitHub folgt später.",
  "Could not save the draft. Please copy your text before leaving.": "Der Entwurf konnte nicht gespeichert werden. Bitte kopiere deinen Text, bevor du die Seite verlässt.",
  "Could not restore the feedback draft.": "Der Feedback-Entwurf konnte nicht wiederhergestellt werden.",
  "Draft cleared.": "Entwurf gelöscht.",
  "Unsaved draft": "Ungespeicherter Entwurf"
} as const;

export type Message = keyof typeof german;
export type Locale = 'en' | 'de';
export type Parameters = Record<string, string | number>;
export function translate(locale: Locale, key: Message, parameters: Parameters = {}): string {
  const text = locale === 'de' ? german[key] : key;
  return text.replace(/\{(\w+)\}/g, (_, name: string) => typeof parameters[name] === 'number' ? new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(parameters[name] as number) : String(parameters[name] ?? `{${name}}`));
}
function initialLocale(): Locale {
  try {
    const saved = localStorage.getItem('scrapbook.locale');
    if (saved === 'en' || saved === 'de') return saved;
  } catch { /* Language selection still works when browser storage is unavailable. */ }
  for (const language of navigator.languages) {
    if (language.toLowerCase().startsWith('de')) return 'de';
    if (language.toLowerCase().startsWith('en')) return 'en';
  }
  return 'en';
}
export function useLocale() {
  const [locale, setLocale] = useState<Locale>(initialLocale);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = locale === 'de' ? 'Scrapbook; Chess — Browser-Prototyp' : 'Scrapbook; Chess — Browser proof';
    try { localStorage.setItem('scrapbook.locale', locale); } catch { /* Optional preference persistence. */ }
  }, [locale]);
  return {
    locale, setLocale,
    t: (key: Message, parameters?: Parameters) => translate(locale, key, parameters),
    number: (value: number, digits = 0) => new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value),
  };
}
