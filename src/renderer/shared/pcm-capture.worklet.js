class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.pending = new Float32Array(4096);
    this.length = 0;
    this.port.onmessage = (event) => {
      if (event.data === 'flush') {
        this.emitSamples();
        this.port.postMessage('done');
      }
    };
  }

  emitSamples() {
    if (this.length === 0) return;
    const samples = this.pending.slice(0, this.length);
    this.port.postMessage(samples, [samples.buffer]);
    this.length = 0;
  }

  process(inputs) {
    const channels = inputs[0];
    if (!channels?.length) return true;
    for (let frame = 0; frame < channels[0].length; frame++) {
      let sample = 0;
      for (const channel of channels) sample += channel[frame];
      this.pending[this.length++] = sample / channels.length;
      if (this.length === this.pending.length) this.emitSamples();
    }
    return true;
  }
}

registerProcessor('pcm-capture', PcmCaptureProcessor);
