/**
 * AudioWorklet processor: downsamples mic audio to 16-bit PCM at a target
 * sample rate, batches it into ~100ms chunks, and reports each chunk's RMS
 * volume alongside the PCM data so the main thread can detect silence
 * without a second pass over the audio.
 */
class PCMProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const opts = options.processorOptions || {};
    this.targetSampleRate = opts.targetSampleRate || 16000;
    this.chunkMs = opts.chunkMs || 100;
    this.ratio = sampleRate / this.targetSampleRate;
    this.chunkSamples = Math.round((this.targetSampleRate * this.chunkMs) / 1000);
    this._pcm = [];
    this._sumSquares = 0;
    this._sampleCount = 0;
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (!channel) return true;

    for (let i = 0; i < channel.length; i++) {
      this._sumSquares += channel[i] * channel[i];
    }
    this._sampleCount += channel.length;

    const outLength = Math.floor(channel.length / this.ratio);
    for (let i = 0; i < outLength; i++) {
      const s = Math.max(-1, Math.min(1, channel[Math.floor(i * this.ratio)]));
      this._pcm.push(s < 0 ? s * 0x8000 : s * 0x7fff);
    }

    if (this._pcm.length >= this.chunkSamples) {
      const pcm = new Int16Array(this._pcm);
      const rms = Math.sqrt(this._sumSquares / this._sampleCount);
      this._pcm = [];
      this._sumSquares = 0;
      this._sampleCount = 0;
      this.port.postMessage({ pcm: pcm.buffer, rms }, [pcm.buffer]);
    }
    return true;
  }
}

registerProcessor('pcm-processor', PCMProcessor);
