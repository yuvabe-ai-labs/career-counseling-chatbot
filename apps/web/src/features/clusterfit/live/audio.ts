import { PCM_CAPTURE_PROCESSOR_NAME, createPcmCaptureWorkletUrl } from "./pcm-capture-worklet";

/** Ported from the POC's media-handler.js: averaging downsample to 16 kHz. */
export function downsampleBuffer(
  buffer: Float32Array,
  sampleRate: number,
  outSampleRate: number,
): Float32Array {
  if (outSampleRate === sampleRate) return buffer;
  const ratio = sampleRate / outSampleRate;
  const result = new Float32Array(Math.round(buffer.length / ratio));
  let offsetBuffer = 0;
  for (let offsetResult = 0; offsetResult < result.length; offsetResult++) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);
    let accum = 0;
    let count = 0;
    for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
      accum += buffer[i]!;
      count++;
    }
    result[offsetResult] = count ? accum / count : 0;
    offsetBuffer = nextOffsetBuffer;
  }
  return result;
}

export function float32ToInt16(buffer: Float32Array): ArrayBuffer {
  const out = new Int16Array(buffer.length);
  for (let i = 0; i < buffer.length; i++) out[i] = Math.min(1, Math.max(-1, buffer[i]!)) * 0x7fff;
  return out.buffer;
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/** Mic capture and gapless playback: the POC's MediaHandler without the camera and screen parts. */
export class LiveAudio {
  private context: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private node: AudioWorkletNode | null = null;
  private nextStartTime = 0;
  private sources: AudioBufferSourceNode[] = [];
  recording = false;

  private async ensureContext(): Promise<AudioContext> {
    if (!this.context) {
      this.context = new AudioContext();
      const url = createPcmCaptureWorkletUrl();
      try {
        await this.context.audioWorklet.addModule(url);
      } finally {
        URL.revokeObjectURL(url);
      }
    }
    if (this.context.state === "suspended") await this.context.resume();
    return this.context;
  }

  /** Starts the mic and calls onChunk with base64 16 kHz PCM. Throws if the mic is unavailable. */
  async startMic(onChunk: (base64Pcm: string) => void): Promise<void> {
    const context = await this.ensureContext();
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const source = context.createMediaStreamSource(this.stream);
    this.node = new AudioWorkletNode(context, PCM_CAPTURE_PROCESSOR_NAME);
    this.node.port.onmessage = (event: MessageEvent<Float32Array>) => {
      if (!this.recording) return;
      onChunk(
        arrayBufferToBase64(
          float32ToInt16(downsampleBuffer(event.data, context.sampleRate, 16000)),
        ),
      );
    };
    source.connect(this.node);
    const mute = context.createGain();
    mute.gain.value = 0;
    this.node.connect(mute);
    mute.connect(context.destination);
    this.recording = true;
  }

  stopMic(): void {
    this.recording = false;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.node?.disconnect();
    this.node = null;
  }

  /** Plays one chunk of the guide's 24 kHz PCM right after the previous one. */
  async play(base64Pcm: string): Promise<void> {
    const context = await this.ensureContext();
    const pcm = new Int16Array(base64ToArrayBuffer(base64Pcm));
    const floats = new Float32Array(pcm.length);
    for (let i = 0; i < pcm.length; i++) floats[i] = pcm[i]! / 32768;
    const buffer = context.createBuffer(1, floats.length, 24000);
    buffer.getChannelData(0).set(floats);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    this.nextStartTime = Math.max(context.currentTime, this.nextStartTime);
    source.start(this.nextStartTime);
    this.nextStartTime += buffer.duration;
    this.sources.push(source);
    source.onended = () => {
      this.sources = this.sources.filter((entry) => entry !== source);
    };
  }

  /** The student interrupted the guide: drop the audio still queued. */
  stopPlayback(): void {
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        /* already stopped */
      }
    }
    this.sources = [];
    if (this.context) this.nextStartTime = this.context.currentTime;
  }

  get speaking(): boolean {
    return this.sources.length > 0;
  }

  async close(): Promise<void> {
    this.stopMic();
    this.stopPlayback();
    await this.context?.close().catch(() => undefined);
    this.context = null;
  }
}
