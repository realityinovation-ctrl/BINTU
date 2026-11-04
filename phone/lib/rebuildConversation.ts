/**
 * Reconstitue le fil de chat A→Z puis le renvoie au format Chat inversé
 * (index 0 = message le plus récent), comme Chat.append(..., inverted=true).
 */

import {
  makeBotMessage,
  makeUserMessage,
  type BintuChatMessage,
} from '@/components/DiagnosticChat';
import type { ConversationTurn, Investigation } from '@/lib/api';

/** Chat (GiftedChat) : tableau newest-first. */
export function toChatOrder(chronological: BintuChatMessage[]): BintuChatMessage[] {
  return chronological.slice().reverse();
}

function stampAt(index: number, createdAt?: string): Date {
  if (createdAt) {
    const date = new Date(createdAt);
    if (!Number.isNaN(date.getTime())) return date;
  }
  // Horodatage stable croissant pour un tri / affichage cohérent.
  return new Date(1_700_000_000_000 + index * 1000);
}

function chronologicalFromTurns(
  turns: ConversationTurn[],
  greet: string,
): BintuChatMessage[] {
  const out: BintuChatMessage[] = [
    makeBotMessage(greet, {
      _id: 'greet',
      kind: 'info',
      animate: false,
      createdAt: stampAt(0),
    }),
  ];

  turns.forEach((turn, index) => {
    const createdAt = stampAt(index + 1, turn.created_at);
    const content = String(turn.content || '').trim();
    if (!content) return;

    if (turn.role === 'user' || turn.role === 'technician') {
      out.push({
        ...makeUserMessage(content),
        _id: `hist-u-${turn.id ?? index}`,
        createdAt,
      });
      return;
    }

    const kind =
      turn.kind === 'diagnosis'
        ? ('diagnosis' as const)
        : turn.kind === 'measure'
          ? ('measure' as const)
          : turn.kind === 'image'
            ? ('image' as const)
            : turn.kind === 'question'
              ? ('question' as const)
              : ('info' as const);

    out.push({
      ...makeBotMessage(content, {
        _id: `hist-b-${turn.id ?? index}`,
        kind,
        animate: false,
        cameraCta: kind === 'image',
        reportCta: kind === 'diagnosis',
      }),
      createdAt,
    });
  });

  return out;
}

export function messagesFromTurns(
  turns: ConversationTurn[],
  greet: string,
): BintuChatMessage[] {
  if (!turns.length) {
    return [
      makeBotMessage(greet, {
        _id: 'greet',
        kind: 'info',
        animate: false,
      }),
    ];
  }
  return toChatOrder(chronologicalFromTurns(turns, greet));
}

/** Fallback si conversation_turns est vide (anciennes sessions). */
export function messagesFromInvestigation(
  item: Investigation,
  greet: string,
): BintuChatMessage[] {
  const chrono: BintuChatMessage[] = [
    makeBotMessage(greet, {
      _id: 'greet',
      kind: 'info',
      animate: false,
      createdAt: stampAt(0),
    }),
  ];
  let seq = 0;
  const seen = new Set<string>();

  const pushUser = (text: string) => {
    const cleaned = text.trim();
    if (!cleaned) return;
    const key = `u:${cleaned.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    seq += 1;
    chrono.push({
      ...makeUserMessage(cleaned),
      _id: `fb-u-${seq}`,
      createdAt: stampAt(seq),
    });
  };

  const pushBot = (
    text: string,
    extras: Partial<BintuChatMessage> = {},
  ) => {
    const cleaned = text.trim();
    if (!cleaned) return;
    const key = `b:${cleaned.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    seq += 1;
    chrono.push({
      ...makeBotMessage(cleaned, { animate: false, ...extras }),
      _id: `fb-b-${seq}`,
      createdAt: stampAt(seq),
    });
  };

  const problem = item.state.problem?.description?.trim();
  if (problem) pushUser(problem);

  const observations = [...(item.state.observations ?? [])];
  const timeline = [...(item.state.timeline ?? [])].sort(
    (a, b) => (a.sequence ?? 0) - (b.sequence ?? 0),
  );

  // Alternance approximative : décisions bot → observations user dans l’ordre.
  let obsCursor = 0;
  for (const event of timeline) {
    const type = event.event_type;
    const summary = String(event.summary || '').trim();
    if (type === 'decision_recorded' && summary) {
      pushBot(summary, { kind: 'question' });
    } else if (type === 'observation_added' && obsCursor < observations.length) {
      const statement = String(observations[obsCursor]?.statement || '').trim();
      obsCursor += 1;
      if (statement) pushUser(statement);
    }
  }

  while (obsCursor < observations.length) {
    const statement = String(observations[obsCursor]?.statement || '').trim();
    obsCursor += 1;
    if (statement) pushUser(statement);
  }

  for (const utterance of item.state.assistant_context?.recent_utterances ?? []) {
    pushUser(String(utterance || ''));
  }

  const pending = item.state.pending_action;
  if (pending?.tool_name === 'ask_technician') {
    pushBot(String(pending.arguments.question || pending.reason || ''), {
      kind: 'question',
    });
  } else if (pending?.tool_name === 'analyze_image') {
    pushBot(String(pending.arguments.focus || pending.reason || ''), {
      kind: 'image',
      cameraCta: true,
    });
  } else if (pending?.tool_name === 'request_measurement') {
    const measurement_type = String(pending.arguments.measurement_type ?? '');
    const unit = String(pending.arguments.unit ?? '');
    const location = String(pending.arguments.location ?? '');
    pushBot(
      pending.reason ||
        `Mesure demandée\n\n- ${measurement_type}\n- ${unit}\n- ${location}`,
      { kind: 'measure' },
    );
  }

  const conclusion = item.state.conclusion;
  if (conclusion?.diagnosis?.trim()) {
    const percent = Math.round((conclusion.confidence ?? 0) * 100);
    pushBot(`${conclusion.diagnosis}\n\nConfiance : ${percent}%`, {
      kind: 'diagnosis',
      reportCta: true,
    });
  }

  return toChatOrder(chrono);
}

/** Construit un ReportItem uniquement s’il y a un vrai diagnostic. */
export function reportFromInvestigation(
  item: Investigation,
  locale: 'fr' | 'en',
): {
  id: string;
  title: string;
  equipment: string;
  date: string;
  problem: string;
  cause: string;
  solution: string;
  confidence: number;
  actions: string[];
} | null {
  const diagnosis = item.state.conclusion?.diagnosis?.trim();
  if (!diagnosis || item.status !== 'completed') return null;
  const problem = item.state.problem?.description?.trim() || diagnosis;
  const percent = Math.round((item.state.conclusion?.confidence ?? 0) * 100);
  return {
    id: item.investigation_id,
    title: problem,
    equipment: problem,
    date: new Date().toLocaleString(locale === 'fr' ? 'fr-FR' : 'en-US'),
    problem,
    cause: diagnosis,
    solution: diagnosis,
    confidence: percent,
    actions: [],
  };
}
