// Generated from contracts/instrument.json. Run npm run generate.
export const instrument = {
  "schemaVersion": 2,
  "id": "agent-synth.fm6",
  "name": "FM / 6",
  "operatorCount": 6,
  "voiceCount": 16,
  "algorithms": [
    {
      "id": 0,
      "name": "Three pairs",
      "carriers": [
        1,
        3,
        5
      ],
      "edges": [
        [
          2,
          1
        ],
        [
          4,
          3
        ],
        [
          6,
          5
        ]
      ]
    },
    {
      "id": 1,
      "name": "Six-stack",
      "carriers": [
        1
      ],
      "edges": [
        [
          6,
          5
        ],
        [
          5,
          4
        ],
        [
          4,
          3
        ],
        [
          3,
          2
        ],
        [
          2,
          1
        ]
      ]
    },
    {
      "id": 2,
      "name": "Five into one",
      "carriers": [
        1
      ],
      "edges": [
        [
          2,
          1
        ],
        [
          3,
          1
        ],
        [
          4,
          1
        ],
        [
          5,
          1
        ],
        [
          6,
          1
        ]
      ]
    },
    {
      "id": 3,
      "name": "Twin stacks",
      "carriers": [
        1,
        4
      ],
      "edges": [
        [
          3,
          2
        ],
        [
          2,
          1
        ],
        [
          6,
          5
        ],
        [
          5,
          4
        ]
      ]
    }
  ]
} as const;
export const parameters = [
  {
    "id": "algorithm",
    "label": "Routing",
    "unit": "enum",
    "min": 0,
    "max": 3,
    "default": 0,
    "step": 1,
    "integer": true,
    "description": "Routing topology. Changes apply to newly started notes; existing notes retain their routing."
  },
  {
    "id": "gain",
    "label": "Output",
    "unit": "linear",
    "min": 0,
    "max": 0.8,
    "default": 0.22,
    "step": 0.01,
    "description": "Master output amplitude, smoothed over approximately 10 ms, before the output saturator."
  },
  {
    "id": "feedback",
    "label": "Feedback",
    "unit": "radians",
    "min": 0,
    "max": 2,
    "default": 0,
    "step": 0.01,
    "description": "Operator 6 self phase modulation, delayed by one internal sample at 4x sample rate."
  },
  {
    "id": "op1.ratio",
    "label": "Ratio",
    "unit": "multiple",
    "min": 0.25,
    "max": 16,
    "default": 1,
    "step": 0.01,
    "description": "Oscillator frequency divided by the played note frequency. Integer ratios tend toward harmonic spectra.",
    "operator": 1
  },
  {
    "id": "op1.detune",
    "label": "Detune",
    "unit": "cents",
    "min": -100,
    "max": 100,
    "default": 0,
    "step": 1,
    "description": "Pitch offset in cents, applied after the frequency ratio.",
    "operator": 1
  },
  {
    "id": "op1.level",
    "label": "Level",
    "unit": "linear",
    "min": 0,
    "max": 1,
    "default": 0.8,
    "step": 0.001,
    "description": "Envelope-scaled amplitude. As a modulator, full level corresponds to 8 radians of phase modulation; as a carrier, it changes audible level.",
    "operator": 1
  },
  {
    "id": "op1.attack",
    "label": "Attack",
    "unit": "seconds",
    "min": 0.001,
    "max": 5,
    "default": 0.008,
    "step": 0.001,
    "scale": "log",
    "description": "Linear rise to maximum envelope level. Duration is captured at note-on.",
    "operator": 1
  },
  {
    "id": "op1.decay",
    "label": "Decay",
    "unit": "seconds",
    "min": 0.005,
    "max": 8,
    "default": 0.5,
    "step": 0.001,
    "scale": "log",
    "description": "Linear fall from peak to sustain. Duration is captured after the attack and any hold stage.",
    "operator": 1
  },
  {
    "id": "op1.sustain",
    "label": "Sustain",
    "unit": "linear",
    "min": 0,
    "max": 1,
    "default": 0.3,
    "step": 0.001,
    "description": "Envelope level while a key is held after decay.",
    "operator": 1
  },
  {
    "id": "op1.release",
    "label": "Release",
    "unit": "seconds",
    "min": 0.01,
    "max": 8,
    "default": 0.4,
    "step": 0.001,
    "scale": "log",
    "description": "Linear fall from the current envelope level to silence after note-off. Duration is captured at note-off.",
    "operator": 1
  },
  {
    "id": "op2.ratio",
    "label": "Ratio",
    "unit": "multiple",
    "min": 0.25,
    "max": 16,
    "default": 1,
    "step": 0.01,
    "description": "Oscillator frequency divided by the played note frequency. Integer ratios tend toward harmonic spectra.",
    "operator": 2
  },
  {
    "id": "op2.detune",
    "label": "Detune",
    "unit": "cents",
    "min": -100,
    "max": 100,
    "default": 0,
    "step": 1,
    "description": "Pitch offset in cents, applied after the frequency ratio.",
    "operator": 2
  },
  {
    "id": "op2.level",
    "label": "Level",
    "unit": "linear",
    "min": 0,
    "max": 1,
    "default": 0,
    "step": 0.001,
    "description": "Envelope-scaled amplitude. As a modulator, full level corresponds to 8 radians of phase modulation; as a carrier, it changes audible level.",
    "operator": 2
  },
  {
    "id": "op2.attack",
    "label": "Attack",
    "unit": "seconds",
    "min": 0.001,
    "max": 5,
    "default": 0.008,
    "step": 0.001,
    "scale": "log",
    "description": "Linear rise to maximum envelope level. Duration is captured at note-on.",
    "operator": 2
  },
  {
    "id": "op2.decay",
    "label": "Decay",
    "unit": "seconds",
    "min": 0.005,
    "max": 8,
    "default": 0.5,
    "step": 0.001,
    "scale": "log",
    "description": "Linear fall from peak to sustain. Duration is captured after the attack and any hold stage.",
    "operator": 2
  },
  {
    "id": "op2.sustain",
    "label": "Sustain",
    "unit": "linear",
    "min": 0,
    "max": 1,
    "default": 0.3,
    "step": 0.001,
    "description": "Envelope level while a key is held after decay.",
    "operator": 2
  },
  {
    "id": "op2.release",
    "label": "Release",
    "unit": "seconds",
    "min": 0.01,
    "max": 8,
    "default": 0.4,
    "step": 0.001,
    "scale": "log",
    "description": "Linear fall from the current envelope level to silence after note-off. Duration is captured at note-off.",
    "operator": 2
  },
  {
    "id": "op3.ratio",
    "label": "Ratio",
    "unit": "multiple",
    "min": 0.25,
    "max": 16,
    "default": 1,
    "step": 0.01,
    "description": "Oscillator frequency divided by the played note frequency. Integer ratios tend toward harmonic spectra.",
    "operator": 3
  },
  {
    "id": "op3.detune",
    "label": "Detune",
    "unit": "cents",
    "min": -100,
    "max": 100,
    "default": 0,
    "step": 1,
    "description": "Pitch offset in cents, applied after the frequency ratio.",
    "operator": 3
  },
  {
    "id": "op3.level",
    "label": "Level",
    "unit": "linear",
    "min": 0,
    "max": 1,
    "default": 0,
    "step": 0.001,
    "description": "Envelope-scaled amplitude. As a modulator, full level corresponds to 8 radians of phase modulation; as a carrier, it changes audible level.",
    "operator": 3
  },
  {
    "id": "op3.attack",
    "label": "Attack",
    "unit": "seconds",
    "min": 0.001,
    "max": 5,
    "default": 0.008,
    "step": 0.001,
    "scale": "log",
    "description": "Linear rise to maximum envelope level. Duration is captured at note-on.",
    "operator": 3
  },
  {
    "id": "op3.decay",
    "label": "Decay",
    "unit": "seconds",
    "min": 0.005,
    "max": 8,
    "default": 0.5,
    "step": 0.001,
    "scale": "log",
    "description": "Linear fall from peak to sustain. Duration is captured after the attack and any hold stage.",
    "operator": 3
  },
  {
    "id": "op3.sustain",
    "label": "Sustain",
    "unit": "linear",
    "min": 0,
    "max": 1,
    "default": 0.3,
    "step": 0.001,
    "description": "Envelope level while a key is held after decay.",
    "operator": 3
  },
  {
    "id": "op3.release",
    "label": "Release",
    "unit": "seconds",
    "min": 0.01,
    "max": 8,
    "default": 0.4,
    "step": 0.001,
    "scale": "log",
    "description": "Linear fall from the current envelope level to silence after note-off. Duration is captured at note-off.",
    "operator": 3
  },
  {
    "id": "op4.ratio",
    "label": "Ratio",
    "unit": "multiple",
    "min": 0.25,
    "max": 16,
    "default": 1,
    "step": 0.01,
    "description": "Oscillator frequency divided by the played note frequency. Integer ratios tend toward harmonic spectra.",
    "operator": 4
  },
  {
    "id": "op4.detune",
    "label": "Detune",
    "unit": "cents",
    "min": -100,
    "max": 100,
    "default": 0,
    "step": 1,
    "description": "Pitch offset in cents, applied after the frequency ratio.",
    "operator": 4
  },
  {
    "id": "op4.level",
    "label": "Level",
    "unit": "linear",
    "min": 0,
    "max": 1,
    "default": 0,
    "step": 0.001,
    "description": "Envelope-scaled amplitude. As a modulator, full level corresponds to 8 radians of phase modulation; as a carrier, it changes audible level.",
    "operator": 4
  },
  {
    "id": "op4.attack",
    "label": "Attack",
    "unit": "seconds",
    "min": 0.001,
    "max": 5,
    "default": 0.008,
    "step": 0.001,
    "scale": "log",
    "description": "Linear rise to maximum envelope level. Duration is captured at note-on.",
    "operator": 4
  },
  {
    "id": "op4.decay",
    "label": "Decay",
    "unit": "seconds",
    "min": 0.005,
    "max": 8,
    "default": 0.5,
    "step": 0.001,
    "scale": "log",
    "description": "Linear fall from peak to sustain. Duration is captured after the attack and any hold stage.",
    "operator": 4
  },
  {
    "id": "op4.sustain",
    "label": "Sustain",
    "unit": "linear",
    "min": 0,
    "max": 1,
    "default": 0.3,
    "step": 0.001,
    "description": "Envelope level while a key is held after decay.",
    "operator": 4
  },
  {
    "id": "op4.release",
    "label": "Release",
    "unit": "seconds",
    "min": 0.01,
    "max": 8,
    "default": 0.4,
    "step": 0.001,
    "scale": "log",
    "description": "Linear fall from the current envelope level to silence after note-off. Duration is captured at note-off.",
    "operator": 4
  },
  {
    "id": "op5.ratio",
    "label": "Ratio",
    "unit": "multiple",
    "min": 0.25,
    "max": 16,
    "default": 1,
    "step": 0.01,
    "description": "Oscillator frequency divided by the played note frequency. Integer ratios tend toward harmonic spectra.",
    "operator": 5
  },
  {
    "id": "op5.detune",
    "label": "Detune",
    "unit": "cents",
    "min": -100,
    "max": 100,
    "default": 0,
    "step": 1,
    "description": "Pitch offset in cents, applied after the frequency ratio.",
    "operator": 5
  },
  {
    "id": "op5.level",
    "label": "Level",
    "unit": "linear",
    "min": 0,
    "max": 1,
    "default": 0,
    "step": 0.001,
    "description": "Envelope-scaled amplitude. As a modulator, full level corresponds to 8 radians of phase modulation; as a carrier, it changes audible level.",
    "operator": 5
  },
  {
    "id": "op5.attack",
    "label": "Attack",
    "unit": "seconds",
    "min": 0.001,
    "max": 5,
    "default": 0.008,
    "step": 0.001,
    "scale": "log",
    "description": "Linear rise to maximum envelope level. Duration is captured at note-on.",
    "operator": 5
  },
  {
    "id": "op5.decay",
    "label": "Decay",
    "unit": "seconds",
    "min": 0.005,
    "max": 8,
    "default": 0.5,
    "step": 0.001,
    "scale": "log",
    "description": "Linear fall from peak to sustain. Duration is captured after the attack and any hold stage.",
    "operator": 5
  },
  {
    "id": "op5.sustain",
    "label": "Sustain",
    "unit": "linear",
    "min": 0,
    "max": 1,
    "default": 0.3,
    "step": 0.001,
    "description": "Envelope level while a key is held after decay.",
    "operator": 5
  },
  {
    "id": "op5.release",
    "label": "Release",
    "unit": "seconds",
    "min": 0.01,
    "max": 8,
    "default": 0.4,
    "step": 0.001,
    "scale": "log",
    "description": "Linear fall from the current envelope level to silence after note-off. Duration is captured at note-off.",
    "operator": 5
  },
  {
    "id": "op6.ratio",
    "label": "Ratio",
    "unit": "multiple",
    "min": 0.25,
    "max": 16,
    "default": 1,
    "step": 0.01,
    "description": "Oscillator frequency divided by the played note frequency. Integer ratios tend toward harmonic spectra.",
    "operator": 6
  },
  {
    "id": "op6.detune",
    "label": "Detune",
    "unit": "cents",
    "min": -100,
    "max": 100,
    "default": 0,
    "step": 1,
    "description": "Pitch offset in cents, applied after the frequency ratio.",
    "operator": 6
  },
  {
    "id": "op6.level",
    "label": "Level",
    "unit": "linear",
    "min": 0,
    "max": 1,
    "default": 0,
    "step": 0.001,
    "description": "Envelope-scaled amplitude. As a modulator, full level corresponds to 8 radians of phase modulation; as a carrier, it changes audible level.",
    "operator": 6
  },
  {
    "id": "op6.attack",
    "label": "Attack",
    "unit": "seconds",
    "min": 0.001,
    "max": 5,
    "default": 0.008,
    "step": 0.001,
    "scale": "log",
    "description": "Linear rise to maximum envelope level. Duration is captured at note-on.",
    "operator": 6
  },
  {
    "id": "op6.decay",
    "label": "Decay",
    "unit": "seconds",
    "min": 0.005,
    "max": 8,
    "default": 0.5,
    "step": 0.001,
    "scale": "log",
    "description": "Linear fall from peak to sustain. Duration is captured after the attack and any hold stage.",
    "operator": 6
  },
  {
    "id": "op6.sustain",
    "label": "Sustain",
    "unit": "linear",
    "min": 0,
    "max": 1,
    "default": 0.3,
    "step": 0.001,
    "description": "Envelope level while a key is held after decay.",
    "operator": 6
  },
  {
    "id": "op6.release",
    "label": "Release",
    "unit": "seconds",
    "min": 0.01,
    "max": 8,
    "default": 0.4,
    "step": 0.001,
    "scale": "log",
    "description": "Linear fall from the current envelope level to silence after note-off. Duration is captured at note-off.",
    "operator": 6
  },
  {
    "id": "pitch.amount",
    "label": "Pitch depth",
    "unit": "semitones",
    "min": -48,
    "max": 48,
    "default": 0,
    "step": 0.1,
    "description": "Pitch envelope depth in semitones. Zero disables pitch movement. Captured at note-on.",
    "sinceVersion": 2
  },
  {
    "id": "pitch.delay",
    "label": "Pitch delay",
    "unit": "seconds",
    "min": 0,
    "max": 5,
    "default": 0,
    "step": 0.001,
    "description": "Time before the pitch envelope starts. Captured at note-on.",
    "sinceVersion": 2
  },
  {
    "id": "pitch.attack",
    "label": "Pitch attack",
    "unit": "seconds",
    "min": 0.001,
    "max": 5,
    "default": 0.001,
    "step": 0.001,
    "description": "Rise from the played pitch to the pitch depth.",
    "scale": "log",
    "sinceVersion": 2
  },
  {
    "id": "pitch.hold",
    "label": "Pitch hold",
    "unit": "seconds",
    "min": 0,
    "max": 5,
    "default": 0,
    "step": 0.001,
    "description": "Time at full pitch depth before decay.",
    "sinceVersion": 2
  },
  {
    "id": "pitch.decay",
    "label": "Pitch decay",
    "unit": "seconds",
    "min": 0.005,
    "max": 8,
    "default": 0.2,
    "step": 0.001,
    "description": "Move from full pitch depth to the sustain proportion.",
    "scale": "log",
    "sinceVersion": 2
  },
  {
    "id": "pitch.sustain",
    "label": "Pitch sustain",
    "unit": "linear",
    "min": 0,
    "max": 1,
    "default": 0,
    "step": 0.001,
    "description": "Proportion of pitch depth held after decay.",
    "sinceVersion": 2
  },
  {
    "id": "pitch.release",
    "label": "Pitch release",
    "unit": "seconds",
    "min": 0.01,
    "max": 8,
    "default": 0.15,
    "step": 0.001,
    "description": "Return to the played pitch after note-off.",
    "scale": "log",
    "sinceVersion": 2
  },
  {
    "id": "filter.type",
    "label": "Filter",
    "unit": "enum",
    "min": 0,
    "max": 3,
    "default": 0,
    "step": 1,
    "description": "Resonant output filter mode, before the output saturator.",
    "integer": true,
    "options": [
      "Bypass",
      "Low-pass",
      "High-pass",
      "Band-pass"
    ],
    "sinceVersion": 2
  },
  {
    "id": "filter.cutoff",
    "label": "Cutoff",
    "unit": "Hz",
    "min": 20,
    "max": 20000,
    "default": 12000,
    "step": 1,
    "description": "Filter cutoff, smoothed over approximately 10 ms and limited by the sample rate.",
    "scale": "log",
    "sinceVersion": 2
  },
  {
    "id": "filter.resonance",
    "label": "Resonance",
    "unit": "Q",
    "min": 0.5,
    "max": 10,
    "default": 0.707,
    "step": 0.01,
    "description": "Resonance Q. Larger values emphasize frequencies near cutoff.",
    "scale": "log",
    "sinceVersion": 2
  },
  {
    "id": "op1.waveform",
    "label": "Wave",
    "unit": "enum",
    "min": 0,
    "max": 4,
    "default": 0,
    "step": 1,
    "description": "Oscillator shape, captured at note-on. Noise is deterministic white noise; ratio and incoming phase modulation do not change a noise source.",
    "integer": true,
    "options": [
      "Sine",
      "Triangle",
      "Saw",
      "Square",
      "Noise"
    ],
    "operator": 1,
    "sinceVersion": 2
  },
  {
    "id": "op1.delay",
    "label": "Delay",
    "unit": "seconds",
    "min": 0,
    "max": 5,
    "default": 0,
    "step": 0.001,
    "description": "Silence before attack. Captured at note-on.",
    "operator": 1,
    "sinceVersion": 2
  },
  {
    "id": "op1.hold",
    "label": "Hold",
    "unit": "seconds",
    "min": 0,
    "max": 5,
    "default": 0,
    "step": 0.001,
    "description": "Time at maximum envelope level between attack and decay. Captured at note-on.",
    "operator": 1,
    "sinceVersion": 2
  },
  {
    "id": "op2.waveform",
    "label": "Wave",
    "unit": "enum",
    "min": 0,
    "max": 4,
    "default": 0,
    "step": 1,
    "description": "Oscillator shape, captured at note-on. Noise is deterministic white noise; ratio and incoming phase modulation do not change a noise source.",
    "integer": true,
    "options": [
      "Sine",
      "Triangle",
      "Saw",
      "Square",
      "Noise"
    ],
    "operator": 2,
    "sinceVersion": 2
  },
  {
    "id": "op2.delay",
    "label": "Delay",
    "unit": "seconds",
    "min": 0,
    "max": 5,
    "default": 0,
    "step": 0.001,
    "description": "Silence before attack. Captured at note-on.",
    "operator": 2,
    "sinceVersion": 2
  },
  {
    "id": "op2.hold",
    "label": "Hold",
    "unit": "seconds",
    "min": 0,
    "max": 5,
    "default": 0,
    "step": 0.001,
    "description": "Time at maximum envelope level between attack and decay. Captured at note-on.",
    "operator": 2,
    "sinceVersion": 2
  },
  {
    "id": "op3.waveform",
    "label": "Wave",
    "unit": "enum",
    "min": 0,
    "max": 4,
    "default": 0,
    "step": 1,
    "description": "Oscillator shape, captured at note-on. Noise is deterministic white noise; ratio and incoming phase modulation do not change a noise source.",
    "integer": true,
    "options": [
      "Sine",
      "Triangle",
      "Saw",
      "Square",
      "Noise"
    ],
    "operator": 3,
    "sinceVersion": 2
  },
  {
    "id": "op3.delay",
    "label": "Delay",
    "unit": "seconds",
    "min": 0,
    "max": 5,
    "default": 0,
    "step": 0.001,
    "description": "Silence before attack. Captured at note-on.",
    "operator": 3,
    "sinceVersion": 2
  },
  {
    "id": "op3.hold",
    "label": "Hold",
    "unit": "seconds",
    "min": 0,
    "max": 5,
    "default": 0,
    "step": 0.001,
    "description": "Time at maximum envelope level between attack and decay. Captured at note-on.",
    "operator": 3,
    "sinceVersion": 2
  },
  {
    "id": "op4.waveform",
    "label": "Wave",
    "unit": "enum",
    "min": 0,
    "max": 4,
    "default": 0,
    "step": 1,
    "description": "Oscillator shape, captured at note-on. Noise is deterministic white noise; ratio and incoming phase modulation do not change a noise source.",
    "integer": true,
    "options": [
      "Sine",
      "Triangle",
      "Saw",
      "Square",
      "Noise"
    ],
    "operator": 4,
    "sinceVersion": 2
  },
  {
    "id": "op4.delay",
    "label": "Delay",
    "unit": "seconds",
    "min": 0,
    "max": 5,
    "default": 0,
    "step": 0.001,
    "description": "Silence before attack. Captured at note-on.",
    "operator": 4,
    "sinceVersion": 2
  },
  {
    "id": "op4.hold",
    "label": "Hold",
    "unit": "seconds",
    "min": 0,
    "max": 5,
    "default": 0,
    "step": 0.001,
    "description": "Time at maximum envelope level between attack and decay. Captured at note-on.",
    "operator": 4,
    "sinceVersion": 2
  },
  {
    "id": "op5.waveform",
    "label": "Wave",
    "unit": "enum",
    "min": 0,
    "max": 4,
    "default": 0,
    "step": 1,
    "description": "Oscillator shape, captured at note-on. Noise is deterministic white noise; ratio and incoming phase modulation do not change a noise source.",
    "integer": true,
    "options": [
      "Sine",
      "Triangle",
      "Saw",
      "Square",
      "Noise"
    ],
    "operator": 5,
    "sinceVersion": 2
  },
  {
    "id": "op5.delay",
    "label": "Delay",
    "unit": "seconds",
    "min": 0,
    "max": 5,
    "default": 0,
    "step": 0.001,
    "description": "Silence before attack. Captured at note-on.",
    "operator": 5,
    "sinceVersion": 2
  },
  {
    "id": "op5.hold",
    "label": "Hold",
    "unit": "seconds",
    "min": 0,
    "max": 5,
    "default": 0,
    "step": 0.001,
    "description": "Time at maximum envelope level between attack and decay. Captured at note-on.",
    "operator": 5,
    "sinceVersion": 2
  },
  {
    "id": "op6.waveform",
    "label": "Wave",
    "unit": "enum",
    "min": 0,
    "max": 4,
    "default": 0,
    "step": 1,
    "description": "Oscillator shape, captured at note-on. Noise is deterministic white noise; ratio and incoming phase modulation do not change a noise source.",
    "integer": true,
    "options": [
      "Sine",
      "Triangle",
      "Saw",
      "Square",
      "Noise"
    ],
    "operator": 6,
    "sinceVersion": 2
  },
  {
    "id": "op6.delay",
    "label": "Delay",
    "unit": "seconds",
    "min": 0,
    "max": 5,
    "default": 0,
    "step": 0.001,
    "description": "Silence before attack. Captured at note-on.",
    "operator": 6,
    "sinceVersion": 2
  },
  {
    "id": "op6.hold",
    "label": "Hold",
    "unit": "seconds",
    "min": 0,
    "max": 5,
    "default": 0,
    "step": 0.001,
    "description": "Time at maximum envelope level between attack and decay. Captured at note-on.",
    "operator": 6,
    "sinceVersion": 2
  }
] as const;
export type ParameterId = typeof parameters[number]['id'];
