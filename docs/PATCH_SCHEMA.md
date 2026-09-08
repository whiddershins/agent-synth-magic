# Patch schema and binary ABI 2

Release 0.3 adds waveforms, delay/hold stages, pitch envelopes and a resonant output filter. JSON exports use `schemaVersion: 2`. The WebAssembly C facade returns `synth_schema_version() == 2` and requires 73 float32 parameters. Native clients must rebuild against the updated C++ headers/library; a 45-float binary patch must not be passed to the new ABI.

The existing meanings and serialized positions remain unchanged:

| Positions (zero-based) | Contents |
| --- | --- |
| 0–2 | Algorithm, gain, feedback, in their original order |
| 3–44 | Original seven controls for each of six operators, in their original order |
| 45–51 | Pitch amount, delay, attack, hold, decay, sustain, release |
| 52–54 | Filter type, cutoff, resonance |
| 55–72 | Waveform, delay, hold for each of six operators |

`contracts/instrument.json` declares the legacy groups separately from appended extension groups. The generator emits the C++ indices and TypeScript order from that source. Enum values are waveform 0 sine / 1 triangle / 2 saw / 3 square / 4 noise; filter 0 bypass / 1 low-pass / 2 high-pass / 3 band-pass.

A complete version-1 JSON patch is validated against exactly its original 45 controls, then expanded to version 2. Every original value is preserved. Extension defaults are sine, zero delay/hold, zero pitch depth and bypassed filter; they preserve the original sound path. Complete schema-2 imports are validated against all 73 controls. Missing or unknown values are rejected instead of silently filled, except for the explicitly defined version-1 migration. Newer unknown schema versions are rejected. Export always writes version 2; reverse conversion is not supported.

The WebAssembly adapter checks both schema version and parameter count before creating its staging view. The native raw-float renderer requires the current `sizeof(Patch)` and rejects old-size files. Native callers wanting to upgrade legacy arrays must copy the original 45 values into `Patch::initial()` and validate the result before publication.
