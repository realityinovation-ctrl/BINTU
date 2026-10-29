import { afterEach, expect, test, vi } from "vitest";
import { startWavRecording } from "./recorder";

const originalAudioContext = window.AudioContext;

afterEach(() => {
  window.AudioContext = originalAudioContext;
  vi.restoreAllMocks();
});

test("produit un WAV mono PCM 16-bit à 16 kHz sans réseau", async () => {
  let processAudio: ((event: AudioProcessingEvent) => void) | null = null;
  const stopTrack = vi.fn();
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: vi.fn().mockResolvedValue({
        getTracks: () => [{ stop: stopTrack }],
      }),
    },
  });

  class FakeAudioContext {
    sampleRate = 48000;
    destination = {};
    resume = vi.fn().mockResolvedValue(undefined);
    close = vi.fn().mockResolvedValue(undefined);
    createMediaStreamSource() {
      return { connect: vi.fn(), disconnect: vi.fn() };
    }
    createScriptProcessor() {
      return {
        get onaudioprocess() {
          return processAudio;
        },
        set onaudioprocess(handler: ScriptProcessorNode["onaudioprocess"]) {
          processAudio = handler;
        },
        connect: vi.fn(),
        disconnect: vi.fn(),
      };
    }
    createGain() {
      return {
        gain: { value: 1 },
        connect: vi.fn(),
        disconnect: vi.fn(),
      };
    }
  }
  window.AudioContext =
    FakeAudioContext as unknown as typeof window.AudioContext;

  const recording = await startWavRecording();
  const samples = new Float32Array(4800).fill(0.25);
  const process = processAudio as
    | ((event: AudioProcessingEvent) => void)
    | null;
  process?.({
    inputBuffer: {
      getChannelData: () => samples,
    },
  } as unknown as AudioProcessingEvent);
  const blob = await recording.stop();
  const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
  const view = new DataView(buffer);

  expect(blob.type).toBe("audio/wav");
  expect(String.fromCharCode(...new Uint8Array(view.buffer, 0, 4))).toBe(
    "RIFF",
  );
  expect(view.getUint16(22, true)).toBe(1);
  expect(view.getUint32(24, true)).toBe(16000);
  expect(view.getUint16(34, true)).toBe(16);
  expect(stopTrack).toHaveBeenCalledOnce();
});
