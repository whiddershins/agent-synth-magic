# Agent control API

The running browser exposes `window.synth`. It controls the same patch state as the visible controls. It does not connect to a model or send audio anywhere.

```ts
const description = window.synth.describe();
const before = window.synth.readPatch();

const after = await window.synth.applyChanges(
  { 'op2.level': 0.25, 'op2.ratio': 3 },
  before.revision,
);

const audition = await window.synth.render({ patch: after.patch });
// audition.samples: Float32Array, mono, not an encoded media file
// audition.sampleRate: 48000 by default
// audition.measurements: peak, rms, spectralCentroidHz, durationSeconds
// audition.patch and audition.score: exact rendering inputs

// Restore a previous candidate while checking for intervening edits.
await window.synth.replacePatch(before.patch, after.revision);
```

`applyChanges()` and `replacePatch()` require `expectedRevision`. Both reject stale revisions, unknown controls, missing values, invalid routing enums, non-finite numbers and out-of-range values. A mutation updates the patch store and, when audio is enabled, waits for the AudioWorklet to acknowledge it. With audio disabled, the patch becomes the next playback configuration. If the audio processor fails, its error is surfaced; a browser-side state update is not rolled back automatically.

`readPatch()` returns `{ revision, patch }`. A patch has this shape:

```ts
{
  schemaVersion: 1,
  name: 'My patch',
  parameters: {
    algorithm: 0,
    gain: 0.22,
    feedback: 0,
    // All 42 operator controls are required, e.g. op1.ratio … op6.release.
  }
}
```

Use `describe().parameters` to enumerate the complete 45-control schema. Its operator level units need particular care: a modulator's full level contributes 8 radians to downstream phase; a carrier's level affects audible amplitude. Ratio and detune are combined into an oscillator frequency multiplier.

## Custom auditions

```ts
const audition = await window.synth.render({
  patch: window.synth.readPatch().patch,
  sampleRate: 48000,
  score: {
    duration: 4,
    events: [
      { time: 0, type: 'on', note: 60, velocity: 0.8 },
      { time: 1.5, type: 'off', note: 60 },
    ],
  },
});
```

Times are seconds from the start of the render. Note-on velocity is a normalized number in [0, 1]. MIDI pitches are integers in [0, 127]. Events must occur before the clip ends. Scores are limited to 0.05–12 seconds, 256 events, and integer sample rates from 8,000 to 96,000 Hz. One audition can render at a time; a stalled worker is terminated after 30 seconds. Requests return PCM without playing it through speakers or changing the current patch.

`window.synth.stop()` releases live notes and stops audition playback. Note that it does not cancel a worker that is currently rendering an offline clip.

The default phrase plays C3, C4, G4 and a C-major chord with fixed velocities. It lasts five seconds. A patch with long envelopes may need a longer score to expose the whole release. When comparing candidates, keep the score and sample rate fixed and control audition loudness. Do not compare unrelated live performances as though only the patch had changed.
