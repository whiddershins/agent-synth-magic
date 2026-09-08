// Generated from contracts/instrument.json. Run npm run generate.
export const instrument = {
  "schemaVersion": 1,
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
    "description": "Linear fall from peak to sustain. Duration is captured when the attack ends.",
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
    "description": "Linear fall from peak to sustain. Duration is captured when the attack ends.",
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
    "description": "Linear fall from peak to sustain. Duration is captured when the attack ends.",
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
    "description": "Linear fall from peak to sustain. Duration is captured when the attack ends.",
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
    "description": "Linear fall from peak to sustain. Duration is captured when the attack ends.",
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
    "description": "Linear fall from peak to sustain. Duration is captured when the attack ends.",
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
  }
] as const;
export type ParameterId = typeof parameters[number]['id'];
