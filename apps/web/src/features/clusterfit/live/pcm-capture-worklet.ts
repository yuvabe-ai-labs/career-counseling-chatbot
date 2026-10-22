/**
 * The POC's frontend/pcm-processor.js: buffers mic samples into 4096-frame chunks and posts them to
 * the main thread. An AudioWorklet runs in its own audio thread from a module URL, so the code is
 * kept as a string and loaded from a Blob URL (no plain .js file outside the TS project).
 */
const PCM_CAPTURE_PROCESSOR = `
class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 4096;
    this.buffer = new Float32Array(this.bufferSize);
    this.bufferIndex = 0;
  }
  process(inputs) {
    const input = inputs[0];
    if (!input || !input.length) return true;
    const channelData = input[0];
    for (let i = 0; i < channelData.length; i++) {
      this.buffer[this.bufferIndex++] = channelData[i];
      if (this.bufferIndex >= this.bufferSize) {
        this.port.postMessage(this.buffer);
        this.bufferIndex = 0;
      }
    }
    return true;
  }
}
registerProcessor("pcm-capture-processor", PcmCaptureProcessor);
`;

export const PCM_CAPTURE_PROCESSOR_NAME = "pcm-capture-processor";

export const createPcmCaptureWorkletUrl = (): string =>
  URL.createObjectURL(new Blob([PCM_CAPTURE_PROCESSOR], { type: "application/javascript" }));
