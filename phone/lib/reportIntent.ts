/** Détecte une demande de rapport / conclusion (vocal Live ou texte). */

const REPORT_WORD =
  /\b(rapport|report|pdf|compte[\s-]?rendu|bilan|synth[eè]se)\b/i;

const ACTION_WORD =
  /\b(g[eé]n[eè]r(e|er)|gener(e|er)|cr[eé](e|er)|fais|fait|faire|donne|montre|ouvre|pr[eé]pare|export(e|er)?|t[eé]l[eé]charg(e|er)|download|peux|peut|veux|voudrais|besoin|s'?il\s+te\s+pla[iî]t)\b/i;

export function wantsReport(text: string): boolean {
  const cleaned = text.trim().normalize('NFC');
  if (cleaned.length < 4) return false;

  // « génère un rapport », « faire le rapport », « je veux le pdf »…
  if (REPORT_WORD.test(cleaned) && ACTION_WORD.test(cleaned)) return true;
  if (/^(le\s+)?rapport(\s+pdf)?\s*[.!?]?\s*$/i.test(cleaned)) return true;
  if (/\b(rapport|report)\s+(final|complet|d['']intervention)\b/i.test(cleaned)) {
    return true;
  }
  return /\b(conclu(s|re|sion)|terminer?\s+l['']?enquête|cl[oô]turer)\b/i.test(
    cleaned,
  );
}
