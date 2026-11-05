/** Contrat overlay partagé desk + mobile (GET /api/investigations/{id}/overlay). */

export type OverlayElement =
  | {
      type: "BOUNDING_BOX";
      id: string;
      label: string;
      coordinates: { x: number; y: number; width: number; height: number };
      style?: { color?: string; strokeWidth?: number };
    }
  | {
      type: "ARROW";
      from: { x: number; y: number };
      to: { x: number; y: number };
      label: string;
      style?: { color?: string; strokeWidth?: number; dashPattern?: number[] };
    }
  | {
      type: "FORMULA_BOX";
      position: { x: number; y: number };
      title: string;
      formula_latex: string;
      value_expected: string;
      style?: { color?: string; tone?: string };
    }
  | {
      type: "INFO_BUBBLE";
      position: { x: number; y: number };
      title: string;
      text: string;
      style?: { color?: string; tone?: string };
    };

export interface OverlayPayload {
  step_id: string;
  confidence_score: number;
  hypothesis: string;
  overlay_instructions: {
    frame_dimensions?: { width: number; height: number };
    coordinate_space?: string;
    elements: OverlayElement[];
  };
  action_required: {
    type: string;
    prompt: string;
    unit: string | null;
  };
}
