import type { AIProvider } from "../core/ports/aiProvider";
import type { DiagnosticRepository } from "../core/ports/diagnosticRepository";
import type { AuthContextProvider, ImageAnalyzer, Transcriber } from "./ports";

export interface HttpDependencies {
  repository: DiagnosticRepository;
  provider: AIProvider;
  transcriber: Transcriber;
  imageAnalyzer: ImageAnalyzer;
  auth: AuthContextProvider;
  newId: () => string;
}
