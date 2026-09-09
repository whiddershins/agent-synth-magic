# Architecture

## DSP package

`AgentSynth::dsp` is a static CMake library. `Synth` owns a fixed array of sixteen voices, each with six phase accumulators and envelopes. All voices use a shared immutable sine table and the synth owns a fixed low-pass history buffer. There are no allocations inside rendering, patch publication, or note events.

The engine uses phase modulation. Operators are evaluated from 6 down to 1; every routing edge points toward an already evaluable lower-numbered carrier. The routing masks are generated from the same contract used to draw the web diagram. Modulator output is scaled by 8 radians. Operator 6 feedback uses its envelope/level-scaled output from the previous internal sample.

Per-operator pitch multiplier, level and sustain, plus output gain and feedback, use a 10 ms one-pole smoother updated at the output sample rate. New patches snap to their target when no voices are active. Delay, attack, and hold durations latch at note-on; decay and release latch at segment entry. Envelopes are linear, with optional delay and hold stages that take zero samples when disabled. A routing edit crossfades each sounding voice between two routing paths over 30 ms. Oscillator phase, noise, filter and feedback state are copied into a fixed second path; each path then owns its signal history. Both paths use the same envelopes, advanced once per internal sample. A linear output crossfade completes before a pending routing starts; only the latest requested target is retained. New notes start directly with the selected routing. This bounds processing at two paths per voice and preserves note ownership and envelope progress.

Repeated note identities retrigger their held voice; different IDs can share the same MIDI pitch. Legacy note calls use the pitch as identity. Otherwise the first idle voice is reused; when all voices are busy the oldest is replaced. A 3 ms decaying continuation of the last output value softens replacement discontinuities. This is a simple declick mechanism, not preservation of the old voice's full release. The UI tracks keyboard/pointer ownership so releasing one input source does not release a note still held by another.

Operator oscillators, level envelopes, the resonant filter and saturator run at 4x sample rate. Each voice evaluates its pitch envelope at output sample rate and applies the same multiplier to all six operators. A 127-tap FIR decimator uses a cutoff at 80% of output Nyquist and introduces 15.75 output samples of group delay. High ratios and feedback are not guaranteed alias-free. This is an initial quality/CPU tradeoff to evaluate with listening and spectral measurements.

`prepare()` clears voices and filter state, preserves the selected patch, and validates sample rates in [8,000, 192,000] Hz. Invalid patches are rejected in their entirety, leaving the previous state unchanged.

## Browser audio

The WebAssembly ABI is a small synchronous facade in `src/c_api.cpp`. Its `Synth`, patch staging area, and 512-sample output buffer are static. Each module instance has independent memory. Emscripten emits a standalone `.wasm` with no host imports, no filesystem and no memory growth. Call `_initialize()` before using its functions. The facade is linked into the WebAssembly target; the native package's supported public entry point is the C++ `Synth` class.

`AudioController` compiles the module on the main thread, then supplies it to an AudioWorklet. The worklet instantiates it once. MessagePort commands are processed between render callbacks; continuous playback always calls C++ and never waits for an agent. Patch commands are acknowledged. Audio activation happens only after a user gesture, with visible errors when loading or startup fails.

The worklet copies samples directly into the host-supplied output arrays. It handles larger host render quanta by splitting them into blocks within the ABI capacity. JS wrapper initialization and command handling may allocate; its normal sample-copy loop does not create temporary arrays.

## Offline audition

An ordinary worker instantiates the same WebAssembly module separately for each audition. It applies a complete validated patch, schedules MIDI events at rounded sample offsets, and renders PCM to a fixed final length. Simultaneous events retain caller order. No live voice state is shared, so repeated evaluations do not interfere with the playable instrument.

The worker calculates peak/RMS over the full clip and a magnitude-weighted spectral centroid from up to eight 2,048-sample Hann-windowed FFT frames. The centroid is a descriptive measurement, not a score for how good a sound is. WAV export is mono 16-bit PCM. The in-page facade returns float32 PCM; external agents receive mono PCM16 WAV with the exact render inputs and measurements.

## State and agent boundary

`PatchStore` is the single UI/agent authority. It validates complete patches, creates defensive snapshots, increments a monotonic revision, and keeps up to 64 previous edits for Undo. Agent writes require an expected revision. A stale proposal is rejected so it cannot overwrite newer user edits.

The generated parameter contract contains stable names, ranges, units, defaults, and descriptions. It describes the effect of controls without binding the engine to any AI provider. `window.synth` provides the current host adapter; a later native host can expose the same operations through a local service or tool interface.

The local `packages/bridge` Node service attaches to Vite's development and preview
HTTP server. It validates loopback address, Host and browser Origin, pairs each
browser tab independently, and checks grants before forwarding operations over
an authenticated WebSocket. Browser operations recheck grant scope/expiry and
call the existing patch/audio authority. No request reaches the audio callback.

All session state is in memory. Single-use pairing codes require explicit browser
approval; host and agent credentials are separate. The bridge retains bounded
mutation receipts to avoid duplicate edits/playback and bounded WAV caches owned
by the rendering agent. The browser terminates offline workers on cancellation,
checks cancellation before playback after asynchronous startup, and stops an
agent's audition on revocation. Tab closure invalidates the session. See
[the protocol](AGENT_API.md) for lifetimes and limits.

A connected model should retain a candidate's exact patch, score, sample rate, audio and user preference together. Compare bounded candidates, keep the best patch, and measure whether audio feedback improves results over an equal-budget no-audio baseline. The instrument itself does not implement an autonomous model loop; the paired agent owns evaluation, candidate selection, and truthful reporting of audio ingestion.

## Native follow-on

JUCE can wrap the existing C++ package for standalone and Audio Unit targets. Keep JUCE parameter/device/UI types outside `AgentSynth::dsp`. The wrapper owns synchronization and translates host events into calls at the correct sample boundaries. A browser UI is not itself the native audio engine.

## Extended sound controls and compatibility

Schema/ABI 2 appends 28 controls after the original 45 positions; see [migration details](PATCH_SCHEMA.md). Waveform edits blend two shapes at the same modulated oscillator phase over 30 ms, before the operator filter and outgoing modulation. Phases and envelopes keep advancing. New notes start with the selected shape. Each oscillator completes its current blend before starting the latest requested shape; there are at most two shape evaluations per routing path and one noise update per internal sample when noise participates. Routing-path copies include the waveform transition state. Sine retains the original table interpolation; triangle is analytic, saw and square use polyBLEP edge correction. All remain subject to the oversampling/aliasing limit under deep phase modulation. Noise uses a per-operator xorshift32 state seeded from note, operator and deterministic note sequence number. It does not depend on wall time, and ratio/incoming phase modulation do not affect it.

The shared output filter is a topology-preserving state-variable filter before gain/saturation. Cutoff and Q are smoothed, and modes crossfade over the same smoothing interval. Coefficients update once per output sample; filter state advances at the internal rate. Cutoff is capped at 45% of the output sample rate. Tiny state values are cleared to avoid denormals. Bypass preserves the old signal path exactly.

The keyboard keeps source ownership across computer keys, independent captured pointer IDs, and MIDI port/channel/note IDs. Pointer movement hit-tests the key under each contact; leaving the keyboard releases that contact and re-entry can start another note. Delayed audio activation uses a per-press token so a cancelled press cannot restart. MIDI requests no SysEx, forwards velocity, defers note-off while CC64 is down, and releases only the affected input's notes on disconnect. Panic clears ownership and pedal state. Blur/page hiding release physical browser presses through sustain handling, preserving latched notes and live MIDI input. Session storage retains a validated patch for the tab; PatchStore remains the only mutation authority.

## Saved patch menu

The named patch library uses versioned localStorage under `fm6.saved-patches`. Every loaded entry passes the same full patch validator. The Save dialog previews whether its trimmed name will create or replace an entry. Save rechecks the latest library against that preview; a newly conflicting or changed entry requires review again. Names change through PatchStore only after storage succeeds. Storage writes must complete before the menu or success message changes. A malformed library is never silently overwritten. Cross-tab storage events refresh the menu without replacing the current working patch. Loading a saved entry goes through PatchStore. Starting-patch selection, saved-patch selection and import publish the patch without resetting note ownership or latches. Existing voices crossfade routing while retaining their captured pitch envelopes; continuous controls follow the new patch. Export JSON remains a separate portable-file action; no saved patch is sent to a server.

## Operator modulation, reverb and expression

Schema/ABI 3 appends 83 parameters after the 73 schema-2 positions. Each operator has an independent pitch envelope captured at note-on and a per-voice state-variable filter before its envelope/level and outgoing modulation. Filter modes crossfade, and cutoff/Q use shared smoothed coefficients updated once per output sample. Global and operator pitch envelopes, plus note cents and LFO pitch, multiply frequency.

The LFO has one free-running phase and four routes. Route depths are smoothed; destinations and waveform selection change at command boundaries. A route’s ±100% means ±12 semitones, ±100% level or ±4 cutoff octaves. Duplicate routes add and clamp at the destination range. Pitch, output gain/filter and each operator’s pitch/level/filter are destinations. Sample-and-hold uses a fixed seed. Phase and randomness are independent of render block boundaries.

Reverb runs after downsampling, using four damped feedback combs and two allpasses in fixed-capacity arrays prepared for the sample rate. It is mono, with approximate RT60 decay and smoothed mix/decay/damping. Mix zero clears the delay history; panic clears the tail and bypasses reverb until the next note. No delay storage is allocated while playing.

`createNoteInput` owns source IDs and asynchronous activation tokens independently of keyboard views. Sources explicitly share a voice only within one keyboard’s pitch group; separate keyboards and MIDI channels have separate IDs. Each key stores its transposed note at press time. Detune updates per-voice cents, smoothed over 10 ms. Released voices keep their last expression target. The MIDI router accepts channel bend/pressure and CC74, master/member sustain, RPN 0 bend sensitivity, and RPN 6 single-zone configuration per device. Disconnect/selection changes release affected MIDI sources. MPE controller settings belong to the input session, not the synthesis patch. Operator annotations and both keyboard tuning settings belong to the patch and flow through PatchStore.

Sustain latches live in `createNoteInput` as transient per-keyboard source prefixes, alongside physical owners and a separate collection of sustained voices. A last-owner release moves the note to sustained ownership. A new press at that pitch releases its sustained voice and ends that press. Pointer tracking remembers the last crossed key so movement inside a toggled-off key cannot restart it. Detune still reaches sustained notes. Deferred audio startup checks voice identity, allowing a latched tap to sound after startup and preventing a cancelled tap from returning after panic. Latch-off releases sustained ownership only; Stop all clears physical and sustained ownership plus both latch states. Focus loss separately clears pointer tracking and releases browser gestures through the latch, without resetting latch or MIDI state. MIDI messages continue in background tabs so note-offs and pedal releases are not discarded. No patch schema or DSP ABI changes are needed.

## Patch URLs

The address bar carries the current patch as `#patch=v1.<base64url>`. Version 1 uses zlib-wrapped DEFLATE of UTF-8 JSON `[3, name, values, notes]`: the 156 schema-3 parameters in contract order and six operator notes in op1–op6 order. Keep this decoder stable across future schema changes. No float32 conversion occurs during sharing. Decoding checks the version, tuple dimensions and full patch validator, with 64 KiB limits on the fragment and decompressed bytes.

An incoming valid patch takes precedence over session storage and initializes PatchStore without starting audio. Later hash navigation uses PatchStore replacement and expected revision; malformed links preserve the working patch and report an error. Edits, imports, preset changes and Undo update the URL using replaceState after a 200 ms coalescing delay. Generation checks discard stale compression/decompression results. Copy link flushes the current snapshot. A session marker permits same-document reloads interrupted during compression to recover their newer session patch; incoming navigations still use the supplied URL. URLs preserve the host/path/query, so localhost links are local; use the public site to share with another person. Link data includes names, annotations and keyboard tuning, but excludes saved-library contents, MIDI settings, permissions, held notes and latch state. URL fragments do not travel in the HTTP request; anyone holding the link can decode the patch.
