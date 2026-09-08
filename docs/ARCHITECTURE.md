# Architecture

## DSP package

`AgentSynth::dsp` is a static CMake library. `Synth` owns a fixed array of sixteen voices, each with six phase accumulators and envelopes. All voices use a shared immutable sine table and the synth owns a fixed low-pass history buffer. There are no allocations inside rendering, patch publication, or note events.

The engine uses phase modulation. Operators are evaluated from 6 down to 1; every routing edge points toward an already evaluable lower-numbered carrier. The routing masks are generated from the same contract used to draw the web diagram. Modulator output is scaled by 8 radians. Operator 6 feedback uses its envelope/level-scaled output from the previous internal sample.

Per-operator pitch multiplier, level and sustain, plus output gain and feedback, use a 10 ms one-pole smoother updated at the output sample rate. New patches snap to their target when no voices are active. Attack, decay, and release durations latch at segment entry; envelopes are linear. A voice captures its routing at note-on, so a topology edit does not discontinuously reroute a held note.

Repeated notes retrigger their held voice. Otherwise the first idle voice is reused; when all voices are busy the oldest is replaced. A 3 ms decaying continuation of the last output value softens replacement discontinuities. This is a simple declick mechanism, not preservation of the old voice's full release. The UI tracks keyboard/pointer ownership so releasing one input source does not release a note still held by another.

All oscillators, envelopes and the saturator run at 4x sample rate. A 127-tap FIR decimator uses a cutoff at 80% of output Nyquist and introduces 15.75 output samples of group delay. High ratios and feedback are not guaranteed alias-free. This is an initial quality/CPU tradeoff to evaluate with listening and spectral measurements.

`prepare()` clears voices and filter state, preserves the selected patch, and validates sample rates in [8,000, 192,000] Hz. Invalid patches are rejected in their entirety, leaving the previous state unchanged.

## Browser audio

The WebAssembly ABI is a small synchronous facade in `src/c_api.cpp`. Its `Synth`, patch staging area, and 512-sample output buffer are static. Each module instance has independent memory. Emscripten emits a standalone `.wasm` with no host imports, no filesystem and no memory growth. Call `_initialize()` before using its functions. The facade is linked into the WebAssembly target; the native package's supported public entry point is the C++ `Synth` class.

`AudioController` compiles the module on the main thread, then supplies it to an AudioWorklet. The worklet instantiates it once. MessagePort commands are processed between render callbacks; continuous playback always calls C++ and never waits for an agent. Patch commands are acknowledged. Audio activation happens only after a user gesture, with visible errors when loading or startup fails.

The worklet copies samples directly into the host-supplied output arrays. It handles larger host render quanta by splitting them into blocks within the ABI capacity. JS wrapper initialization and command handling may allocate; its normal sample-copy loop does not create temporary arrays.

## Offline audition

An ordinary worker instantiates the same WebAssembly module separately for each audition. It applies a complete validated patch, schedules MIDI events at rounded sample offsets, and renders PCM to a fixed final length. Simultaneous events retain caller order. No live voice state is shared, so repeated evaluations do not interfere with the playable instrument.

The worker calculates peak/RMS over the full clip and a magnitude-weighted spectral centroid from up to eight 2,048-sample Hann-windowed FFT frames. The centroid is a descriptive measurement, not a score for how good a sound is. WAV export is mono 16-bit PCM. The agent receives float32 PCM before WAV quantization.

## State and agent boundary

`PatchStore` is the single UI/agent authority. It validates complete patches, creates defensive snapshots, increments a monotonic revision, and keeps up to 64 previous edits for Undo. Agent writes require an expected revision. A stale proposal is rejected so it cannot overwrite newer user edits.

The generated parameter contract contains stable names, ranges, units, defaults, and descriptions. It describes the effect of controls without binding the engine to any AI provider. `window.synth` provides the current host adapter; a later native host can expose the same operations through a local service or tool interface.

The next model integration should retain a candidate's exact patch, score, sample rate, audio and user preference together. Compare bounded candidates, keep the best patch, and measure whether audio feedback improves results over an equal-budget no-audio baseline. No autonomous model loop is implemented in version 0.1.

## Native follow-on

JUCE can wrap the existing C++ package for standalone and Audio Unit targets. Keep JUCE parameter/device/UI types outside `AgentSynth::dsp`. The wrapper owns synchronization and translates host events into calls at the correct sample boundaries. A browser UI is not itself the native audio engine.
