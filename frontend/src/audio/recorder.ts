export interface WavRecording {
  stop(): Promise<Blob>;
  cancel(): Promise<void>;
}

type AudioContextConstructor = typeof AudioContext;

function audioContextConstructor(): AudioContextConstructor {
  const compatibleWindow = window as typeof window & {
    webkitAudioContext?: AudioContextConstructor;
  };
  const Constructor =
    compatibleWindow.AudioContext ?? compatibleWindow.webkitAudioContext;
  if (!Constructor) {
    throw new Error("Audio recording is not supported by this browser.");
  }
  return Constructor;
}

export async function startWavRecording(): Promise<WavRecording> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Microphone access is not supported by this browser.");
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
    },
  });
  const Context = audioContextConstructor();
  const context = new Context();
  await context.resume();
  const source = context.createMediaStreamSource(stream);
  const processor = context.createScriptProcessor(4096, 1, 1);
  const silentOutput = context.createGain();
  silentOutput.gain.value = 0;
  const chunks: Float32Array[] = [];
  let active = true;

  processor.onaudioprocess = (event) => {
    if (active) {
      chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
    }
  };
  source.connect(processor);
  processor.connect(silentOutput);
  silentOutput.connect(context.destination);

  async function cleanup() {
    if (!active) return;
    active = false;
    processor.disconnect();
    source.disconnect();
    silentOutput.disconnect();
    stream.getTracks().forEach((track) => track.stop());
    await context.close();
  }

  return {
    async stop() {
      await cleanup();
      const samples = mergeChunks(chunks);
      if (samples.length === 0) {
        throw new Error("No audio was recorded.");
      }
      const resampled = resample(samples, context.sampleRate, 16000);
      return encodeWav(resampled, 16000);
    },
    cancel: cleanup,
  };
}

function mergeChunks(chunks: Float32Array[]): Float32Array {
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const merged = new Float32Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}

function resample(
  input: Float32Array,
  sourceRate: number,
  targetRate: number,
): Float32Array {
  if (sourceRate === targetRate) return input;
  const ratio = sourceRate / targetRate;
  const output = new Float32Array(Math.max(1, Math.floor(input.length / ratio)));
  for (let index = 0; index < output.length; index += 1) {
    const position = index * ratio;
    const lower = Math.floor(position);
    const upper = Math.min(lower + 1, input.length - 1);
    const fraction = position - lower;
    output[index] =
      input[lower] * (1 - fraction) + input[upper] * fraction;
  }
  return output;
}

function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, samples.length * 2, true);

  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index]));
    view.setInt16(
      44 + index * 2,
      sample < 0 ? sample * 0x8000 : sample * 0x7fff,
      true,
    );
  }
  return new Blob([buffer], { type: "audio/wav" });
}

function writeAscii(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}
