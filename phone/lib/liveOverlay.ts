import type { OverlayPayload } from '@/lib/api';

type SpatialOverlay = {
  type?: string;
  label?: string;
  phrase?: string;
  cible?: string;
  color?: string;
  shape?: string;
  /** Meta / normalized 0-1 */
  rect?: { x?: number; y?: number; w?: number; h?: number; width?: number; height?: number };
  from?: { x?: number; y?: number };
  to?: { x?: number; y?: number };
  center?: { x?: number; y?: number };
  position?: { x?: number; y?: number };
  radius?: number;
  headers?: string[];
  rows?: string[][];
  /** Gemini legacy [ymin,xmin,ymax,xmax] 0-1000 */
  box?: number[];
  box_2d?: number[];
  from_2d?: number[];
  to_2d?: number[];
  center_2d?: number[];
};

const COLOR: Record<string, string> = {
  red: '#F04452',
  rouge: '#F04452',
  problem: '#F04452',
  orange: '#F5A524',
  verify: '#F5A524',
  blue: '#1769FF',
  bleu: '#1769FF',
  white: '#FFFFFF',
  blanc: '#FFFFFF',
  green: '#16C784',
  vert: '#16C784',
};

function colorOf(raw?: string, fallback = '#1769FF') {
  if (!raw) return fallback;
  return COLOR[raw.toLowerCase()] || raw || fallback;
}

function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function asNormPoint(pt?: { x?: number; y?: number } | null) {
  if (!pt) return null;
  const x = Number(pt.x);
  const y = Number(pt.y);
  if (![x, y].every((n) => Number.isFinite(n))) return null;
  return { x: clamp01(x), y: clamp01(y) };
}

function rectFromMeta(rect?: SpatialOverlay['rect']) {
  if (!rect) return null;
  const x = Number(rect.x);
  const y = Number(rect.y);
  const w = Number(rect.w ?? rect.width);
  const h = Number(rect.h ?? rect.height);
  if (![x, y, w, h].every((n) => Number.isFinite(n))) return null;
  return {
    x: clamp01(x),
    y: clamp01(y),
    width: Math.max(0.04, clamp01(w)),
    height: Math.max(0.04, clamp01(h)),
  };
}

/** Gemini [ymin,xmin,ymax,xmax] — accept 0-1000 or 0-1. */
function boxFrom2d(box: number[]) {
  if (!Array.isArray(box) || box.length < 4) return null;
  const nums = box.map((n) => Number(n));
  if (!nums.every((n) => Number.isFinite(n))) return null;
  const scale = Math.max(...nums) > 1.5 ? 1000 : 1;
  const [a, b, c, d] = nums.map((n) => n / scale);
  const y1 = Math.min(a, c);
  const y2 = Math.max(a, c);
  const x1 = Math.min(b, d);
  const x2 = Math.max(b, d);
  return {
    x: clamp01(x1),
    y: clamp01(y1),
    width: Math.max(0.04, clamp01(x2 - x1)),
    height: Math.max(0.04, clamp01(y2 - y1)),
  };
}

function pointFrom2d(pt: number[]) {
  if (!Array.isArray(pt) || pt.length < 2) return null;
  const a = Number(pt[0]);
  const b = Number(pt[1]);
  if (![a, b].every((n) => Number.isFinite(n))) return null;
  const scale = Math.max(a, b) > 1.5 ? 1000 : 1;
  return { x: clamp01(b / scale), y: clamp01(a / scale) };
}

export function extractOverlayJson(text: string): SpatialOverlay[] | null {
  if (!text?.trim()) return null;
  const fenced = text.match(/<<OVERLAY>>([\s\S]*?)<<\/OVERLAY>>/i);
  const candidates = [
    fenced?.[1],
    text.match(/\{[\s\S]*"overlays"\s*:\s*\[[\s\S]*\][\s\S]*\}/)?.[0],
    text.match(/\{[\s\S]*"box_2d"\s*:\s*\[[\s\S]*?\][\s\S]*\}/)?.[0],
    text.match(/\{[\s\S]*"rect"\s*:\s*\{[\s\S]*?\}[\s\S]*\}/)?.[0],
    text.match(/\{[\s\S]*"box"\s*:\s*\[[\s\S]*?\][\s\S]*\}/)?.[0],
  ].filter(Boolean) as string[];

  for (const raw of candidates) {
    try {
      const cleaned = raw.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
      const data = JSON.parse(cleaned) as {
        overlays?: SpatialOverlay[];
        cible?: string;
        box?: number[];
        box_2d?: number[];
        rect?: SpatialOverlay['rect'];
      };
      if (Array.isArray(data.overlays)) return data.overlays;
      if (data.rect || data.box_2d || data.box) {
        return [
          {
            type: 'box',
            label: data.cible || 'Cible',
            rect: data.rect,
            box_2d: data.box_2d || data.box,
            color: 'blue',
          },
        ];
      }
    } catch {
      // try next
    }
  }
  return null;
}

function shortLabel(raw: string, max = 22) {
  const t = raw.trim().replace(/\s+/g, ' ');
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/** Salutations / chat → hors tableau AR (reste à l’oral / diagnostic texte). */
const CHITCHAT_RE =
  /\b(bonjour|bonsoir|salut|hello|hi|hey|merci|coucou|ciao|ça\s*va|ca\s*va|comment\s+vas|bonne\s+journ|à\s+bientôt)\b/i;

function isDiagnosticTable(
  label: string,
  headers: string[],
  rows: string[][],
  hint: string,
): boolean {
  if (headers.length < 2 || rows.length < 1) return false;
  const blob = [label, ...headers, ...rows.flat()].join(' ');
  if (CHITCHAT_RE.test(blob)) return false;
  const wantsTable = /tableau|table|valeur|mesure|compar|donn[ée]e|diagnostic/.test(
    hint,
  );
  const hasNumber = /\d/.test(blob);
  const hasUnit =
    /\b(v|a|w|kw|kwh|°c|celsius|ohm|hz|%|bar|pa|mA|vac|vdc)\b/i.test(blob);
  // Sans demande explicite : seulement si ça ressemble à des mesures.
  if (!wantsTable && !(hasNumber && (hasUnit || rows.length >= 2))) return false;
  if (!hasNumber && !wantsTable) return false;
  return true;
}

function cleanTechnicalLabel(raw: string): string {
  if (CHITCHAT_RE.test(raw)) return 'Cible';
  return shortLabel(raw);
}

function shortenArrow(
  from: { x: number; y: number },
  to: { x: number; y: number },
  maxLen = 0.14,
) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 0.01;
  if (len <= maxLen) return { from, to };
  const scale = maxLen / len;
  return {
    from: {
      x: clamp01(to.x - dx * scale),
      y: clamp01(to.y - dy * scale),
    },
    to,
  };
}

/** Direction de flèche demandée oralement / dans le hint. */
function arrowBiasFromHint(hint: string): 'top' | 'left' | 'right' | 'diag' {
  const t = hint.toLowerCase();
  if (/diagon|obliqu/.test(t)) return 'diag';
  if (/gauche|left/.test(t)) return 'left';
  if (/droite|right/.test(t)) return 'right';
  return 'top';
}

function arrowForBox(
  coords: { x: number; y: number; width: number; height: number },
  bias: 'top' | 'left' | 'right' | 'diag',
  color: string,
) {
  const cx = coords.x + coords.width / 2;
  const cy = coords.y + coords.height / 2;
  let from = { x: cx, y: clamp01(coords.y - 0.1) };
  let to = { x: cx, y: clamp01(coords.y + Math.min(0.05, coords.height / 2)) };
  if (bias === 'left') {
    from = { x: clamp01(coords.x - 0.1), y: cy };
    to = { x: clamp01(coords.x + Math.min(0.05, coords.width / 2)), y: cy };
  } else if (bias === 'right') {
    from = { x: clamp01(coords.x + coords.width + 0.1), y: cy };
    to = {
      x: clamp01(coords.x + coords.width - Math.min(0.05, coords.width / 2)),
      y: cy,
    };
  } else if (bias === 'diag') {
    from = { x: clamp01(coords.x - 0.06), y: clamp01(coords.y - 0.08) };
    to = { x: cx, y: cy };
  }
  const slim = shortenArrow(from, to, 0.12);
  return {
    type: 'ARROW',
    from: slim.from,
    to: slim.to,
    label: '',
    style: { color },
  };
}

export type OverlayBuildOptions = {
  /** Hint oral pour orienter flèches / densité. */
  hint?: string;
  /** Remplace l’overlay précédent (défaut) ou fusionne. */
  replace?: boolean;
};

export function overlayFromGemini(
  items: SpatialOverlay[],
  previous: OverlayPayload | null,
  options?: OverlayBuildOptions,
): OverlayPayload {
  const hint = (options?.hint || '').toLowerCase();
  const wantsMany =
    /partout|plusieurs|tous? les?|multiple|plusieurs cadres|plusieurs fl/.test(hint);
  const wantsArrowOnly = /fl[eè]che|pointe|arrow/.test(hint) && !/cadre|box|entoure|encadr/.test(hint);
  const wantsCircle =
    /cercle|circle|rond|entoure.*(cercle|rond)/.test(hint);
  const maxItems = wantsMany ? 5 : 3;
  const maxArrows = wantsMany ? 3 : wantsArrowOnly ? 2 : 2;
  const bias = arrowBiasFromHint(hint);
  const elements: Record<string, unknown>[] = [];
  let arrowCount = 0;

  for (const item of items.slice(0, maxItems)) {
    const kind = (item.type || 'box').toLowerCase();
    const label = cleanTechnicalLabel(item.label || item.cible || 'Cible');
    const color = colorOf(
      item.color,
      kind === 'box' && /probl|panne|rouge/.test(label.toLowerCase())
        ? '#F04452'
        : kind === 'table'
          ? '#FFFFFF'
          : '#1769FF',
    );

    if (kind === 'table') {
      const headers = Array.isArray(item.headers) ? item.headers.map(String) : [];
      const rows = Array.isArray(item.rows)
        ? item.rows
            .filter((row): row is string[] => Array.isArray(row))
            .map((row) => row.map(String))
            .slice(0, 5)
        : [];
      if (!isDiagnosticTable(label, headers, rows, hint)) continue;
      const position =
        asNormPoint(item.position) || ({ x: 0.04, y: 0.58 } as const);
      elements.push({
        type: 'TABLE',
        label: shortLabel(label, 18),
        position,
        headers,
        rows,
        style: { color },
      });
      continue;
    }

    if (kind === 'arrow' || (wantsArrowOnly && kind === 'box')) {
      if (arrowCount >= maxArrows) continue;
      if (kind === 'arrow') {
        const from = asNormPoint(item.from) || pointFrom2d(item.from_2d || []);
        const to = asNormPoint(item.to) || pointFrom2d(item.to_2d || []);
        if (from && to) {
          const slim = shortenArrow(from, to, 0.14);
          elements.push({
            type: 'ARROW',
            from: slim.from,
            to: slim.to,
            label: '',
            style: { color },
          });
          arrowCount += 1;
        }
        continue;
      }
    }

    if (kind === 'circle' || (wantsCircle && kind === 'box')) {
      const center =
        asNormPoint(item.center) ||
        pointFrom2d(item.center_2d || []) ||
        (() => {
          const c =
            rectFromMeta(item.rect) || boxFrom2d(item.box_2d || item.box || []);
          if (!c) return null;
          return { x: c.x + c.width / 2, y: c.y + c.height / 2 };
        })();
      if (center) {
        const rawR = Number(item.radius);
        const r = Number.isFinite(rawR)
          ? rawR > 1
            ? clamp01(rawR / 1000)
            : clamp01(rawR)
          : 0.08;
        elements.push({
          type: 'CIRCLE',
          center,
          radius: Math.max(0.04, Math.min(0.18, r)),
          label,
          style: { color },
        });
      }
      if (wantsCircle) continue;
    }

    if (kind === 'box' || kind === 'rect' || kind === 'rectangle') {
      if (wantsArrowOnly) continue;
      const coords =
        rectFromMeta(item.rect) || boxFrom2d(item.box_2d || item.box || []);
      if (!coords) continue;
      elements.push({
        type: 'BOUNDING_BOX',
        label,
        coordinates: coords,
        style: { color },
      });
      if (arrowCount < maxArrows && !wantsCircle) {
        elements.push(arrowForBox(coords, bias, color));
        arrowCount += 1;
      }
    }
  }

  const primaryLabel =
    (
      elements.find((e) => e.type === 'BOUNDING_BOX') as
        | { label?: string }
        | undefined
    )?.label ||
    (
      elements.find((e) => e.type === 'CIRCLE') as { label?: string } | undefined
    )?.label ||
    (
      elements.find((e) => e.type === 'TABLE') as { label?: string } | undefined
    )?.label ||
    '';

  return {
    step_id: 'live-vision-meta',
    confidence_score: elements.length ? 0.88 : previous?.confidence_score ?? 0.4,
    hypothesis: 'vision_spatial_guide',
    overlay_instructions: {
      frame_dimensions: { width: 1, height: 1 },
      coordinate_space: 'normalized',
      elements,
    },
    action_required: {
      type: 'observe',
      prompt: elements.length ? primaryLabel : '',
      unit: null,
    },
  };
}

function emptyOverlay(prompt = ''): OverlayPayload {
  return {
    step_id: 'live-vision',
    confidence_score: 0.5,
    hypothesis: 'live',
    overlay_instructions: {
      frame_dimensions: { width: 1, height: 1 },
      coordinate_space: 'normalized',
      elements: [],
    },
    action_required: { type: 'observe', prompt, unit: null },
  };
}

function filterElements(
  previous: OverlayPayload | null,
  keep: (type: string) => boolean,
  prompt: string,
): OverlayPayload {
  const raw = previous?.overlay_instructions?.elements;
  const elements = Array.isArray(raw)
    ? raw.filter((el) => keep(String((el as { type?: string })?.type || '')))
    : [];
  return {
    step_id: previous?.step_id ?? 'live-vision',
    confidence_score: previous?.confidence_score ?? 0.5,
    hypothesis: previous?.hypothesis ?? 'live',
    overlay_instructions: {
      frame_dimensions: { width: 1, height: 1 },
      coordinate_space: 'normalized',
      elements,
    },
    action_required: { type: 'observe', prompt, unit: null },
  };
}

/** Retirer / effacer cadres, flèches, tout. */
export function wantsClearOverlay(utterance: string): boolean {
  const text = utterance.toLowerCase();
  return /^(ok )?clear\b/.test(text)
    || /\b(enl[eè]ve|enlever|efface|effacer|retire|retirer|supprime|supprimer|vire|enlève)\b/.test(text)
    || /plus\s+de\s+(cadre|fl[eè]che|symbole|cercle|tableau)/.test(text)
    || /aucun(e)?\s+(cadre|fl[eè]che|symbole)/.test(text)
    || /clear\s+overlay/.test(text);
}

export type ClearMode = 'all' | 'boxes' | 'arrows' | 'circles' | 'tables';

export function clearModeFromSpeech(utterance: string): ClearMode {
  const text = utterance.toLowerCase();
  // « retire tout / tous les symboles / vide l'écran »
  if (
    /\btout\b|\btous\s+les\s+symboles|\btous\s+les\s+overlays|nettoie|vide\s+l['’ ]?[ée]cran|efface\s+tout|enl[eè]ve\s+tout/.test(
      text,
    )
  ) {
    return 'all';
  }
  // Cible une famille de symboles
  const mentionsArrow = /fl[eè]che|arrow/.test(text);
  const mentionsCircle = /cercle|circle|rond/.test(text);
  const mentionsTable = /tableau|table/.test(text);
  const mentionsBox = /cadre|bounding|box|rectangle/.test(text);
  const kinds =
    Number(mentionsArrow) +
    Number(mentionsCircle) +
    Number(mentionsTable) +
    Number(mentionsBox);
  if (kinds === 1) {
    if (mentionsArrow) return 'arrows';
    if (mentionsCircle) return 'circles';
    if (mentionsTable) return 'tables';
    if (mentionsBox) return 'boxes';
  }
  // « retire les cadres » / défaut sur commande d’effacement
  if (mentionsBox) return 'boxes';
  return 'all';
}

/** Derive AR symbols from oral commands (clear / partiel). */
export function overlayFromSpeech(
  utterance: string,
  previous: OverlayPayload | null,
): OverlayPayload | null {
  const parsed = extractOverlayJson(utterance);
  if (parsed) return overlayFromGemini(parsed, previous, { hint: utterance });

  const text = utterance.toLowerCase();
  if (!text.trim()) return previous;

  if (wantsClearOverlay(text)) {
    const mode = clearModeFromSpeech(text);
    if (mode === 'all') return emptyOverlay('');
    if (mode === 'boxes') {
      return filterElements(
        previous,
        (t) => t !== 'BOUNDING_BOX',
        'Cadres retirés',
      );
    }
    if (mode === 'arrows') {
      return filterElements(previous, (t) => t !== 'ARROW', 'Flèches retirées');
    }
    if (mode === 'circles') {
      return filterElements(previous, (t) => t !== 'CIRCLE', 'Cercles retirés');
    }
    if (mode === 'tables') {
      return filterElements(previous, (t) => t !== 'TABLE', 'Tableau retiré');
    }
  }

  return previous;
}

/** Demande de guidage spatial (dessiner) — exclut les commandes d’effacement. */
export function wantsSpatialGuide(utterance: string): boolean {
  const text = utterance.toLowerCase();
  if (wantsClearOverlay(text)) return false;
  return /encadr|cadre|cible|entoure|pointe|fl[eè]che|montre.*(o[uù]|la|le|moi|ici)|o[uù] (est|sont)|bounding|box|circle|cercle|rond|tableau|table|symbole|yeux|œil|oeil|t[eê]te|visage|image|valeur|mesure|partout|rectangle|diagon|gauche|droite|mets?\s+(un|une|le|la)|affiche|dessine|place/.test(
    text,
  );
}
