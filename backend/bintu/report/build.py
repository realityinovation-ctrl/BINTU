"""Construit un rapport Markdown structuré puis un PDF au rendu professionnel.

Inspiration : modèles type Eisvogel / rapports d'audit Markdown→PDF,
sans dépendre de LaTeX (HTML + xhtml2pdf).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from html import escape
from io import BytesIO
from typing import Any

from bintu.core.models import InvestigationState
from bintu.core.report import investigation_report


@dataclass(frozen=True)
class ReportDocument:
    investigation_id: str
    title: str
    markdown: str
    html: str
    meta: dict[str, Any]


def build_report_document(state: InvestigationState) -> ReportDocument | None:
    """None si aucun diagnostic conclu (pas de rapport)."""

    conclusion = state.conclusion
    if conclusion is None or not conclusion.diagnosis.strip():
        return None
    if state.status.value != "completed":
        return None

    data = investigation_report(state)
    title = (data.get("problem") or "Rapport d'intervention BINTU").strip()
    generated = datetime.now(timezone.utc).strftime("%d/%m/%Y %H:%M UTC")
    confidence = conclusion.confidence
    percent = int(round(float(confidence) * 100))

    md = _markdown_body(
        investigation_id=state.investigation_id,
        title=title,
        generated=generated,
        diagnosis=conclusion.diagnosis.strip(),
        percent=percent,
        data=data,
        dossier=state.equipment_dossier.brief() if state.equipment_dossier else None,
    )
    html = _html_document(
        investigation_id=state.investigation_id,
        title=title,
        generated=generated,
        diagnosis=conclusion.diagnosis.strip(),
        percent=percent,
        data=data,
        dossier=state.equipment_dossier.brief() if state.equipment_dossier else None,
    )
    return ReportDocument(
        investigation_id=state.investigation_id,
        title=title,
        markdown=md,
        html=html,
        meta={
            "generated_at": generated,
            "confidence": confidence,
            "confidence_percent": percent,
            "status": state.status.value,
        },
    )


def render_report_pdf(document: ReportDocument) -> bytes:
    """HTML stylé → PDF. Lève RuntimeError si le moteur PDF est indisponible."""

    try:
        from xhtml2pdf import pisa
    except ImportError as exc:
        raise RuntimeError(
            "xhtml2pdf manquant. Installez : pip install xhtml2pdf"
        ) from exc

    buffer = BytesIO()
    result = pisa.CreatePDF(
        src=document.html.encode("utf-8"),
        dest=buffer,
        encoding="utf-8",
    )
    if result.err:
        raise RuntimeError("Échec de la génération PDF du rapport")
    return buffer.getvalue()


def _markdown_body(
    *,
    investigation_id: str,
    title: str,
    generated: str,
    diagnosis: str,
    percent: int,
    data: dict[str, Any],
    dossier: str | None,
) -> str:
    lines = [
        f"# {title}",
        "",
        f"**BINTU** — Rapport d'intervention technique  ",
        f"**Référence :** `{investigation_id}`  ",
        f"**Date :** {generated}  ",
        f"**Confiance :** {percent} %",
        "",
        "---",
        "",
        "## 1. Diagnostic",
        "",
        diagnosis,
        "",
        "## 2. Problème déclaré",
        "",
        str(data.get("problem") or "—"),
        "",
    ]
    if dossier:
        lines.extend(["## 3. Dossier équipement", "", dossier, ""])
        section = 4
    else:
        section = 3

    observations = data.get("observations") or []
    lines.append(f"## {section}. Observations")
    lines.append("")
    if observations:
        for item in observations:
            statement = str(item.get("statement") or "").strip()
            source = str(item.get("source_type") or "")
            if statement:
                lines.append(f"- **{source}** — {statement}")
    else:
        lines.append("_Aucune observation enregistrée._")
    lines.append("")
    section += 1

    measurements = data.get("measurements") or []
    lines.append(f"## {section}. Mesures")
    lines.append("")
    if measurements:
        lines.append("| Type | Lieu | Valeur | Unité |")
        lines.append("|---|---|---|---|")
        for item in measurements:
            lines.append(
                "| {type} | {loc} | {val} | {unit} |".format(
                    type=escape_md(str(item.get("measurement_type") or "")),
                    loc=escape_md(str(item.get("location") or "")),
                    val=escape_md(str(item.get("value") if item.get("value") is not None else "")),
                    unit=escape_md(str(item.get("unit") or "")),
                )
            )
    else:
        lines.append("_Aucune mesure enregistrée._")
    lines.append("")
    section += 1

    evidence = data.get("cited_evidence") or []
    lines.append(f"## {section}. Preuves citées")
    lines.append("")
    if evidence:
        for item in evidence:
            lines.append(
                f"- `{item.get('evidence_id')}` — {item.get('statement') or ''}"
            )
    else:
        lines.append("_Aucune preuve citée._")
    lines.append("")
    section += 1

    uncertainties = data.get("remaining_uncertainties") or []
    lines.append(f"## {section}. Incertitudes restantes")
    lines.append("")
    if uncertainties:
        for item in uncertainties:
            lines.append(f"- {item}")
    else:
        lines.append("_Aucune incertitude signalée._")
    lines.append("")
    section += 1

    timeline = data.get("timeline") or []
    lines.append(f"## {section}. Chronologie")
    lines.append("")
    if timeline:
        for event in timeline:
            lines.append(
                f"{event.get('sequence')}. **{event.get('event_type')}** — "
                f"{event.get('summary')}"
            )
    else:
        lines.append("_Chronologie vide._")
    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append("_Document généré automatiquement par BINTU. Ne pas altérer la référence._")
    lines.append("")
    return "\n".join(lines)


def escape_md(value: str) -> str:
    return value.replace("|", "\\|")


def _html_document(
    *,
    investigation_id: str,
    title: str,
    generated: str,
    diagnosis: str,
    percent: int,
    data: dict[str, Any],
    dossier: str | None,
) -> str:
    observations_html = _list_html(
        [
            f"<strong>{escape(str(o.get('source_type') or ''))}</strong> — "
            f"{escape(str(o.get('statement') or ''))}"
            for o in (data.get("observations") or [])
            if str(o.get("statement") or "").strip()
        ],
        empty="Aucune observation enregistrée.",
    )
    measurements = data.get("measurements") or []
    if measurements:
        rows = "".join(
            "<tr>"
            f"<td>{escape(str(m.get('measurement_type') or ''))}</td>"
            f"<td>{escape(str(m.get('location') or ''))}</td>"
            f"<td>{escape(str(m.get('value') if m.get('value') is not None else ''))}</td>"
            f"<td>{escape(str(m.get('unit') or ''))}</td>"
            "</tr>"
            for m in measurements
        )
        measurements_html = (
            "<table><thead><tr>"
            "<th>Type</th><th>Lieu</th><th>Valeur</th><th>Unité</th>"
            "</tr></thead><tbody>"
            f"{rows}</tbody></table>"
        )
    else:
        measurements_html = "<p class='muted'>Aucune mesure enregistrée.</p>"

    evidence_html = _list_html(
        [
            f"<code>{escape(str(e.get('evidence_id') or ''))}</code> — "
            f"{escape(str(e.get('statement') or ''))}"
            for e in (data.get("cited_evidence") or [])
        ],
        empty="Aucune preuve citée.",
    )
    uncertainties_html = _list_html(
        [escape(str(u)) for u in (data.get("remaining_uncertainties") or [])],
        empty="Aucune incertitude signalée.",
    )
    timeline_html = _list_html(
        [
            f"<strong>{escape(str(ev.get('sequence')))}. "
            f"{escape(str(ev.get('event_type') or ''))}</strong> — "
            f"{escape(str(ev.get('summary') or ''))}"
            for ev in (data.get("timeline") or [])
        ],
        empty="Chronologie vide.",
        ordered=True,
    )
    dossier_block = ""
    if dossier:
        dossier_block = (
            "<h2>3. Dossier équipement</h2>"
            f"<pre class='dossier'>{escape(dossier)}</pre>"
        )
        obs_n, mes_n, ev_n, unc_n, tl_n = 4, 5, 6, 7, 8
    else:
        obs_n, mes_n, ev_n, unc_n, tl_n = 3, 4, 5, 6, 7

    return f"""<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8"/>
  <title>{escape(title)} — BINTU</title>
  <style>
    @page {{
      size: A4;
      margin: 18mm 16mm 20mm 16mm;
      @frame footer {{
        -pdf-frame-content: footerContent;
        bottom: 8mm;
        margin-left: 16mm;
        margin-right: 16mm;
        height: 12mm;
      }}
    }}
    body {{
      font-family: Helvetica, Arial, sans-serif;
      font-size: 11pt;
      color: #142033;
      line-height: 1.45;
    }}
    .cover {{
      border: 2pt solid #1769FF;
      padding: 22pt 20pt;
      margin-bottom: 22pt;
      background: #F5F9FF;
    }}
    .brand {{
      color: #1769FF;
      font-size: 22pt;
      font-weight: bold;
      letter-spacing: 1pt;
      margin: 0 0 6pt 0;
    }}
    .subtitle {{
      color: #4A5B73;
      font-size: 10pt;
      margin: 0 0 14pt 0;
    }}
    h1 {{
      font-size: 16pt;
      margin: 0 0 10pt 0;
      color: #0B1B33;
    }}
    .meta {{
      font-size: 9.5pt;
      color: #334155;
    }}
    .meta strong {{ color: #0B1B33; }}
    .badge {{
      display: inline-block;
      background: #16C784;
      color: #fff;
      padding: 3pt 8pt;
      font-size: 9pt;
      font-weight: bold;
      margin-top: 10pt;
    }}
    h2 {{
      font-size: 12.5pt;
      color: #1769FF;
      border-bottom: 1pt solid #D7E6FF;
      padding-bottom: 4pt;
      margin-top: 16pt;
      margin-bottom: 8pt;
    }}
    p {{ margin: 0 0 8pt 0; }}
    .diagnosis {{
      background: #EEF6FF;
      border-left: 3pt solid #1769FF;
      padding: 10pt 12pt;
      margin: 6pt 0 10pt 0;
    }}
    table {{
      width: 100%;
      border-collapse: collapse;
      margin: 6pt 0 10pt 0;
      font-size: 10pt;
    }}
    th, td {{
      border: 0.5pt solid #C9D4E5;
      padding: 5pt 6pt;
      text-align: left;
      vertical-align: top;
    }}
    th {{
      background: #EAF1FF;
      color: #0B1B33;
      font-weight: bold;
    }}
    ul, ol {{ margin: 4pt 0 10pt 18pt; padding: 0; }}
    li {{ margin-bottom: 3pt; }}
    .muted {{ color: #64748B; font-style: italic; }}
    pre.dossier {{
      white-space: pre-wrap;
      font-family: Helvetica, Arial, sans-serif;
      font-size: 9.5pt;
      background: #F8FAFC;
      border: 0.5pt solid #E2E8F0;
      padding: 8pt;
    }}
    .footer {{
      font-size: 8pt;
      color: #64748B;
      border-top: 0.5pt solid #E2E8F0;
      padding-top: 4pt;
    }}
  </style>
</head>
<body>
  <div class="cover">
    <p class="brand">BINTU</p>
    <p class="subtitle">Rapport d'intervention technique</p>
    <h1>{escape(title)}</h1>
    <p class="meta">
      <strong>Référence :</strong> {escape(investigation_id)}<br/>
      <strong>Date :</strong> {escape(generated)}<br/>
      <strong>Statut :</strong> Diagnostic conclu
    </p>
    <div class="badge">Confiance {percent}%</div>
  </div>

  <h2>1. Diagnostic</h2>
  <div class="diagnosis">{escape(diagnosis)}</div>

  <h2>2. Problème déclaré</h2>
  <p>{escape(str(data.get("problem") or "—"))}</p>

  {dossier_block}

  <h2>{obs_n}. Observations</h2>
  {observations_html}

  <h2>{mes_n}. Mesures</h2>
  {measurements_html}

  <h2>{ev_n}. Preuves citées</h2>
  {evidence_html}

  <h2>{unc_n}. Incertitudes restantes</h2>
  {uncertainties_html}

  <h2>{tl_n}. Chronologie</h2>
  {timeline_html}

  <div id="footerContent" class="footer">
    BINTU — {escape(investigation_id)} — document généré automatiquement —
    page <pdf:pagenumber/> / <pdf:pagecount/>
  </div>
</body>
</html>
"""


def _list_html(
    items: list[str],
    *,
    empty: str,
    ordered: bool = False,
) -> str:
    cleaned = [item for item in items if item and item.strip()]
    if not cleaned:
        return f"<p class='muted'>{escape(empty)}</p>"
    tag = "ol" if ordered else "ul"
    body = "".join(f"<li>{item}</li>" for item in cleaned)
    return f"<{tag}>{body}</{tag}>"
