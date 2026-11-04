import type { OverlayElement, OverlayPayload } from "../types/overlay";

/** Dessine le contrat overlay normalisé (0–1) — identique à la logique mobile. */
export function drawOverlayPayload(
  ctx: CanvasRenderingContext2D,
  payload: OverlayPayload | null,
  width: number,
  height: number,
): void {
  ctx.clearRect(0, 0, width, height);
  if (!payload) return;
  const elements = payload.overlay_instructions?.elements ?? [];
  for (const element of elements) {
    drawElement(ctx, element, width, height);
  }
}

function drawElement(
  ctx: CanvasRenderingContext2D,
  element: OverlayElement,
  width: number,
  height: number,
): void {
  if (element.type === "BOUNDING_BOX") {
    const { x, y, width: w, height: h } = element.coordinates;
    ctx.strokeStyle = element.style?.color ?? "#FF3B30";
    ctx.lineWidth = element.style?.strokeWidth ?? 3;
    ctx.strokeRect(x * width, y * height, w * width, h * height);
    fillLabel(ctx, element.label, x * width + 6, y * height + 16, ctx.strokeStyle);
    return;
  }
  if (element.type === "ARROW") {
    const x1 = element.from.x * width;
    const y1 = element.from.y * height;
    const x2 = element.to.x * width;
    const y2 = element.to.y * height;
    ctx.strokeStyle = element.style?.color ?? "#FF9500";
    ctx.lineWidth = element.style?.strokeWidth ?? 2;
    if (element.style?.dashPattern?.length) {
      ctx.setLineDash(element.style.dashPattern);
    }
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.setLineDash([]);
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const head = 10;
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(
      x2 - head * Math.cos(angle - Math.PI / 6),
      y2 - head * Math.sin(angle - Math.PI / 6),
    );
    ctx.lineTo(
      x2 - head * Math.cos(angle + Math.PI / 6),
      y2 - head * Math.sin(angle + Math.PI / 6),
    );
    ctx.closePath();
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fill();
    fillLabel(ctx, element.label, x1 + 4, y1 - 6, ctx.strokeStyle);
    return;
  }
  if (element.type === "FORMULA_BOX") {
    const x = element.position.x * width;
    const y = element.position.y * height;
    ctx.fillStyle = "rgba(23, 105, 255, 0.88)";
    roundRect(ctx, x, y, Math.min(260, width * 0.45), 54, 8);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "600 12px Sora, sans-serif";
    ctx.fillText(element.title, x + 10, y + 18);
    ctx.font = "12px IBM Plex Mono, monospace";
    ctx.fillText(element.formula_latex, x + 10, y + 34);
    ctx.font = "11px Inter, sans-serif";
    ctx.fillText(element.value_expected.slice(0, 42), x + 10, y + 48);
    return;
  }
  if (element.type === "INFO_BUBBLE") {
    const x = element.position.x * width;
    const y = element.position.y * height;
    ctx.fillStyle = "rgba(15, 27, 51, 0.82)";
    roundRect(ctx, x, y, Math.min(280, width * 0.5), 58, 8);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "600 12px Sora, sans-serif";
    ctx.fillText(element.title, x + 10, y + 18);
    ctx.font = "12px Inter, sans-serif";
    wrapText(ctx, element.text, x + 10, y + 36, Math.min(260, width * 0.46), 14);
  }
}

function fillLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
): void {
  ctx.fillStyle = color;
  ctx.font = "600 12px Inter, sans-serif";
  ctx.fillText(text.slice(0, 48), x, y);
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
): void {
  const words = text.split(/\s+/);
  let line = "";
  let cursorY = y;
  let lines = 0;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, cursorY);
      line = word;
      cursorY += lineHeight;
      lines += 1;
      if (lines >= 2) {
        ctx.fillText(`${word.slice(0, 24)}…`, x, cursorY);
        return;
      }
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, cursorY);
}
