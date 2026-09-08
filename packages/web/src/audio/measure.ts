export interface Measurements {
  peak: number;
  rms: number;
  spectralCentroidHz: number;
  durationSeconds: number;
}

// Offline analysis only. Magnitude-weighted centroid over up to 8 Hann windows.
// A brightness descriptor, not a perceptual quality score.
export function measure(samples: Float32Array, sampleRate: number): Measurements {
  let peak = 0;
  let energy = 0;
  for (const sample of samples) { peak = Math.max(peak, Math.abs(sample)); energy += sample * sample; }
  const size = 2048;
  const real = new Float64Array(size);
  const imaginary = new Float64Array(size);
  let weighted = 0;
  let magnitudeSum = 0;
  const count = Math.min(8, Math.ceil(samples.length / size));
  for (let window = 0; window < count; window++) {
    const offset = count === 1 ? 0 : Math.floor(window * Math.max(0, samples.length - size) / (count - 1));
    for (let i = 0; i < size; i++) {
      real[i] = (samples[offset + i] ?? 0) * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (size - 1)));
      imaginary[i] = 0;
    }
    for (let i = 1, j = 0; i < size; i++) {
      let bit = size >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { const temporary = real[i]!; real[i] = real[j]!; real[j] = temporary; }
    }
    for (let length = 2; length <= size; length <<= 1) {
      const angle = -2 * Math.PI / length;
      const stepReal = Math.cos(angle);
      const stepImaginary = Math.sin(angle);
      for (let start = 0; start < size; start += length) {
        let wr = 1;
        let wi = 0;
        for (let j = 0; j < length / 2; j++) {
          const left = start + j;
          const right = left + length / 2;
          const tr = real[right]! * wr - imaginary[right]! * wi;
          const ti = real[right]! * wi + imaginary[right]! * wr;
          real[right] = real[left]! - tr;
          imaginary[right] = imaginary[left]! - ti;
          real[left] = real[left]! + tr;
          imaginary[left] = imaginary[left]! + ti;
          const nextWr = wr * stepReal - wi * stepImaginary;
          wi = wr * stepImaginary + wi * stepReal;
          wr = nextWr;
        }
      }
    }
    for (let bin = 1; bin < size / 2; bin++) {
      const magnitude = Math.hypot(real[bin]!, imaginary[bin]!);
      magnitudeSum += magnitude;
      weighted += magnitude * bin * sampleRate / size;
    }
  }
  return {
    peak,
    rms: samples.length ? Math.sqrt(energy / samples.length) : 0,
    spectralCentroidHz: magnitudeSum > 1e-8 ? weighted / magnitudeSum : 0,
    durationSeconds: samples.length / sampleRate,
  };
}
