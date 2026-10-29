import { useState } from "react";
import type { TimelineEvent } from "../types/investigation";

export function Timeline({ events }: { events: TimelineEvent[] }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <aside className="timeline-card" aria-labelledby="timeline-title">
      <div className="timeline-header">
        <div>
          <p className="eyebrow">Progression</p>
          <h2 id="timeline-title">Timeline</h2>
        </div>
        <button
          type="button"
          className="timeline-toggle"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "Masquer" : `Voir (${events.length})`}
        </button>
      </div>
      <ol className={`timeline-list ${expanded ? "timeline-expanded" : ""}`}>
        {events.map((event) => (
          <li key={event.sequence}>
            <span className="timeline-marker" aria-hidden="true" />
            <div>
              <span className="timeline-sequence">
                Étape {event.sequence}
              </span>
              <p>{event.summary}</p>
            </div>
          </li>
        ))}
      </ol>
    </aside>
  );
}
