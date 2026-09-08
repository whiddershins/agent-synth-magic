# Patch schema and binary ABI 3

Release 0.4 uses `schemaVersion: 3`, `synth_schema_version() == 3`, and 156 float32 parameters. All 73 earlier positions keep their meanings. Native clients must rebuild against the updated headers/library; old binary arrays must not be passed to the new ABI.

| Positions (zero-based) | Contents |
| --- | --- |
| 0–2 | Algorithm, gain, feedback |
| 3–44 | Original seven controls for each of six operators |
| 45–51 | Global pitch amount, delay, attack, hold, decay, sustain, release |
| 52–54 | Output filter type, cutoff, resonance |
| 55–72 | Waveform, delay, hold for each operator |
| 73–74 | LFO rate, waveform |
| 75–82 | Four LFO target/amount pairs |
| 83–85 | Reverb mix, decay, damping |
| 86–89 | Keyboard 1 detune/octave, keyboard 2 detune/octave |
| 90–155 | Eleven controls per operator: pitch enabled, amount, delay, attack, hold, decay, sustain, release; filter type, cutoff, resonance |

`contracts/instrument.json` declares the original groups, version-2 extensions, and version-3 expansion. The generator emits both languages’ definitions and stable indices. Waveforms are 0 sine / 1 triangle / 2 saw / 3 square / 4 noise. Filters are 0 bypass / 1 low-pass / 2 high-pass / 3 band-pass. The LFO waveform uses 4 for sample-and-hold. LFO targets: 0 none, 1 global pitch, 2 gain, 3 output cutoff, then pitch/level/cutoff triplets for operators 1–6.

Complete version-1 JSON patches must contain exactly the original 45 controls. Complete version-2 patches must contain exactly 73. Validation preserves those values and adds neutral defaults: sine/zero delay/hold, disabled pitch envelopes, bypassed filters, unassigned LFO routes, dry reverb, and zero keyboard offsets. Version-3 imports require all 156 controls. Missing/unknown controls, unknown schema versions and invalid enum/range values are rejected atomically. Export writes version 3; reverse conversion is not supported.

JSON also carries `annotations`, a record of `op1` through `op6` strings, at most 1,000 characters each. Absent annotations become empty strings, including for old patches. Annotations are plain text and never enter the DSP float array. Keyboard parameters are saved host controls: the host translates them into note pitches and per-note cents; they do not globally retune the engine or implicit offline scores.

The WebAssembly adapter checks schema version and count before creating its staging view. The raw-float native renderer rejects old-size files. To migrate native arrays explicitly, copy the original 45 or 73 values into `Patch::initial()` and validate before publication. The C facade adds `synth_note_on_id`, `synth_note_off_id`, and `synth_expression`; legacy note calls remain available. IDs are nonnegative signed 32-bit integers, independent from MIDI pitch. Voices accept ±14,400 cents, pressure 0–1 and timbre 0–1; note expression does not allocate or retrigger.
