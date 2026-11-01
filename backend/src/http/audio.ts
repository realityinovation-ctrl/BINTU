import { HttpError } from "./errors";

export const MAX_AUDIO_BYTES = 32 * 1024 * 1024;
export const MAX_AUDIO_DURATION_SECONDS = 10 * 60;
export const ACCEPTED_AUDIO_TYPES = new Set([
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
]);

interface WavInfo {
  channels: number;
  sampleWidth: number;
  sampleRate: number;
  compression: string;
  frameCount: number;
}

export function validateWav(content: Buffer): void {
  const wav = readWav(content);
  if (
    wav.channels !== 1 ||
    wav.sampleWidth !== 2 ||
    (wav.sampleRate !== 16000 && wav.sampleRate !== 24000) ||
    wav.compression !== "NONE"
  ) {
    throw new HttpError(
      422,
      "WAV must be mono 16-bit PCM at 16 kHz or 24 kHz",
    );
  }
  if (wav.frameCount / wav.sampleRate > MAX_AUDIO_DURATION_SECONDS) {
    throw new HttpError(413, "Audio duration exceeds the 10 minute limit");
  }
}

function readWav(content: Buffer): WavInfo {
  try {
    return parseWav(content);
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }
    throw new HttpError(422, "Audio is not a valid WAV file");
  }
}

function parseWav(content: Buffer): WavInfo {
  if (
    content.length < 12 ||
    content.toString("ascii", 0, 4) !== "RIFF" ||
    content.toString("ascii", 8, 12) !== "WAVE"
  ) {
    throw new HttpError(422, "Audio is not a valid WAV file");
  }
  let offset = 12;
  let channels: number | undefined;
  let sampleRate: number | undefined;
  let sampleWidth: number | undefined;
  let compression: string | undefined;
  let dataSize: number | undefined;
  while (offset + 8 <= content.length) {
    const id = content.toString("ascii", offset, offset + 4);
    const size = content.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (start + size > content.length) {
      throw new HttpError(422, "Audio is not a valid WAV file");
    }
    if (id === "fmt ") {
      if (size < 16) {
        throw new HttpError(422, "Audio is not a valid WAV file");
      }
      const format = content.readUInt16LE(start);
      if (format !== 1) {
        throw new HttpError(422, "Audio is not a valid WAV file");
      }
      channels = content.readUInt16LE(start + 2);
      sampleRate = content.readUInt32LE(start + 4);
      const bits = content.readUInt16LE(start + 14);
      sampleWidth = Math.floor((bits + 7) / 8);
      compression = "NONE";
    } else if (id === "data") {
      dataSize = size;
    }
    offset = start + size + (size % 2);
  }
  if (
    channels === undefined ||
    sampleRate === undefined ||
    sampleWidth === undefined ||
    compression === undefined ||
    dataSize === undefined ||
    sampleRate === 0 ||
    channels === 0 ||
    sampleWidth === 0
  ) {
    throw new HttpError(422, "Audio is not a valid WAV file");
  }
  return {
    channels,
    sampleWidth,
    sampleRate,
    compression,
    frameCount: Math.floor(dataSize / (channels * sampleWidth)),
  };
}
