"""Rapports d'intervention BINTU (Markdown structuré → PDF professionnel)."""

from bintu.report.build import build_report_document, render_report_pdf
from bintu.core.report import investigation_report

__all__ = [
    "build_report_document",
    "investigation_report",
    "render_report_pdf",
]
