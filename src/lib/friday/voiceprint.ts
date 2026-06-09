// Voiceprint: capture audio via Web Audio API, compute average magnitude spectrum,
// reduce to a fixed-length vector. Compare via cosine similarity.
// NOT biometric-grade. Sufficient for casual single-user gating.

const VECTOR_SIZE = 32;
const FFT_SIZE = 2048;

export async function recordAudio(seconds: number): Promise<Float32Array> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const ctx = new AudioContext();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = FFT_SIZE;
  source.connect(analyser);

  const bins = analyser.frequencyBinCount;
  const acc = new Float32Array(bins);
  const tmp = new Uint8Array(bins);
  const start = performance.now();
  let frames = 0;

  return new Promise((resolve) => {
    const tick = () => {
      analyser.getByteFrequencyData(tmp);
      for (let i = 0; i < bins; i++) acc[i] += tmp[i];
      frames++;
      if (performance.now() - start < seconds * 1000) {
        requestAnimationFrame(tick);
      } else {
        stream.getTracks().forEach((t) => t.stop());
        void ctx.close();
        for (let i = 0; i < bins; i++) acc[i] /= Math.max(1, frames);
        resolve(reduceToVector(acc));
      }
    };
    requestAnimationFrame(tick);
  });
}

function reduceToVector(spectrum: Float32Array): Float32Array {
  const out = new Float32Array(VECTOR_SIZE);
  const chunk = Math.floor(spectrum.length / VECTOR_SIZE);
  for (let i = 0; i < VECTOR_SIZE; i++) {
    let sum = 0;
    for (let j = 0; j < chunk; j++) sum += spectrum[i * chunk + j];
    out[i] = sum / chunk;
  }
  // normalize
  let norm = 0;
  for (let i = 0; i < VECTOR_SIZE; i++) norm += out[i] * out[i];
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < VECTOR_SIZE; i++) out[i] /= norm;
  return out;
}

export function averageVectors(vecs: number[][]): number[] {
  if (!vecs.length) return [];
  const out = new Array(VECTOR_SIZE).fill(0);
  for (const v of vecs) for (let i = 0; i < VECTOR_SIZE; i++) out[i] += v[i] ?? 0;
  for (let i = 0; i < VECTOR_SIZE; i++) out[i] /= vecs.length;
  // renormalize
  let norm = 0;
  for (let i = 0; i < VECTOR_SIZE; i++) norm += out[i] * out[i];
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < VECTOR_SIZE; i++) out[i] /= norm;
  return out;
}

export function cosineSimilarity(a: number[] | Float32Array, b: number[] | Float32Array): number {
  let dot = 0,
    na = 0,
    nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

export const VOICE_MATCH_THRESHOLD = 0.82;
