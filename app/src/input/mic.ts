// Microphone loudness with the Web Audio API. Runs its own loop and writes into `state`.

export interface MicState {
  /** RMS of the latest buffer, 0..1. */
  level: number;
  /** Smoothed level: fast attack, slow release. */
  smoothed: number;
  /** Room noise measured during calibration. */
  noiseFloor: number;
}

export interface MicMeter {
  state: MicState;
  /** Listens for `ms` and stores the room's noise floor. */
  calibrate(ms?: number): Promise<number>;
  /** 0..1 loudness above the noise floor, scaled by sensitivity (0.5..2, 1 = default). */
  loudness(sensitivity: number): number;
  stop(): void;
}

export function startMic(stream: MediaStream): MicMeter {
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  void ctx.resume();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  ctx.createMediaStreamSource(stream).connect(analyser);
  const buf = new Float32Array(analyser.fftSize);
  const state: MicState = { level: 0, smoothed: 0, noiseFloor: 0.01 };
  let raf = 0;

  const tick = () => {
    analyser.getFloatTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    state.level = Math.sqrt(sum / buf.length);
    const k = state.level > state.smoothed ? 0.5 : 0.12;
    state.smoothed += (state.level - state.smoothed) * k;
    raf = requestAnimationFrame(tick);
  };
  tick();

  return {
    state,
    calibrate(ms = 2000) {
      return new Promise((resolve) => {
        const samples: number[] = [];
        const id = window.setInterval(() => samples.push(state.level), 30);
        window.setTimeout(() => {
          clearInterval(id);
          samples.sort((a, b) => a - b);
          // 80th percentile: ignores a cough, still covers steady fan noise.
          const floor = samples[Math.floor(samples.length * 0.8)] ?? 0.01;
          state.noiseFloor = Math.max(0.004, floor);
          resolve(state.noiseFloor);
        }, ms);
      });
    },
    loudness(sensitivity) {
      const above = Math.max(0, state.smoothed - state.noiseFloor * 1.3);
      return Math.min(1, above * 9 * sensitivity);
    },
    stop() {
      cancelAnimationFrame(raf);
      void ctx.close();
    },
  };
}
