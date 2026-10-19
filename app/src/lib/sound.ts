// Square-wave beeps in the same style as the landing page. Respects the HUD mute toggle.

export interface Sound {
  beep(freq: number, dur?: number, type?: OscillatorType, vol?: number): void;
  muted: boolean;
}

export function createSound(muted: boolean): Sound {
  let ac: AudioContext | null = null;
  return {
    muted,
    beep(freq, dur = 0.07, type = 'square', vol = 0.04) {
      if (this.muted) return;
      try {
        ac = ac || new AudioContext();
        const o = ac.createOscillator(), v = ac.createGain();
        o.type = type;
        o.frequency.value = freq;
        v.gain.value = vol;
        o.connect(v);
        v.connect(ac.destination);
        o.start();
        v.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
        o.stop(ac.currentTime + dur);
      } catch {
        // No audio available; the game is still playable.
      }
    },
  };
}
