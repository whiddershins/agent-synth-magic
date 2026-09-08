import type { AudioController } from '../audio/controller';

export function startScope(canvas: HTMLCanvasElement, audio: AudioController, levelLabel: HTMLElement): void {
  const drawing = canvas.getContext('2d')!;
  const buffer = new Float32Array(2048);
  let lastFrame = 0;
  const paint = (time: number) => {
    requestAnimationFrame(paint);
    if (time - lastFrame < 33 || document.hidden) return;
    lastFrame = time;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const scale = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(width * scale) || canvas.height !== Math.round(height * scale)) {
      canvas.width = Math.round(width * scale); canvas.height = Math.round(height * scale);
    }
    drawing.setTransform(scale, 0, 0, scale, 0, 0);
    drawing.clearRect(0, 0, width, height);
    drawing.strokeStyle = '#d9ddd2'; drawing.lineWidth = 1;
    drawing.beginPath(); drawing.moveTo(0, height / 2); drawing.lineTo(width, height / 2); drawing.stroke();
    if (audio.analyser) audio.analyser.getFloatTimeDomainData(buffer);
    else buffer.fill(0);
    let peak = 0;
    for (const sample of buffer) peak = Math.max(peak, Math.abs(sample));
    levelLabel.textContent = peak > .00001 ? `${(20 * Math.log10(peak)).toFixed(1)} dB` : '−∞ dB';
    let start = 0;
    for (let i = 1; i < 512; i++) if (buffer[i - 1]! <= 0 && buffer[i]! > 0) { start = i; break; }
    drawing.strokeStyle = '#246e5a'; drawing.lineWidth = 1.5;
    drawing.beginPath();
    for (let i = 0; i < 1024; i++) {
      const x = i / 1023 * width;
      const y = height / 2 - buffer[start + i]! * (height * .44);
      if (i === 0) drawing.moveTo(x, y); else drawing.lineTo(x, y);
    }
    drawing.stroke();
  };
  requestAnimationFrame(paint);
}
