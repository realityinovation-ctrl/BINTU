/** HTTP adapters. The routes depend on these ports, never on a driver. */

export interface Transcriber {
  transcribe(audio: Buffer, filename: string): string;
}

export interface ImageAnalysis {
  description: string;
  certainty: number;
}

export interface ImageAnalyzer {
  analyze(content: Buffer, contentType: string, focus: string): ImageAnalysis;
}

export interface AuthContext {
  userId: string;
  organizationId: string | null;
  role: string | null;
  permissions: readonly string[];
}

/** Phase 4 injects a fixed context. Real session verification arrives in Phase 5. */
export interface AuthContextProvider {
  authenticate(): AuthContext;
}
