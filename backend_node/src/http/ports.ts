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

/** TestAuthContext supplies a fixed context. SessionAuthenticator reads the cookie. */
export interface AuthContextProvider {
  authenticate(): AuthContext;
}
