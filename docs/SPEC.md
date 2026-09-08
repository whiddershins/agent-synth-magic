# Agent Synth 0.1

## Product

A playable six-operator FM instrument with a portable C++ engine and a vanilla web interface. The web instrument executes the compiled C++ engine in an AudioWorklet. The same engine renders repeatable auditions offline, exposing the controls and evidence a future model-driven sound-design loop needs.

## Accepted architecture

- One repository: reusable CMake package in `packages/dsp`, web application in `packages/web`.
- C++20, Emscripten pinned in `.emscripten-version`, vanilla HTML/CSS/TypeScript with Vite.
- No DSP dependency on browser APIs, JUCE, networking, or a language-model provider.
- Fixed-capacity voices and render buffers. No allocation, locking, I/O, or exceptions in the DSP render path.
- A versioned, validated parameter contract shared by native and web code.
- Separate WebAssembly instances for live playback and offline auditions.

## Instrument

- Six sine operators using phase modulation; operator levels map to a maximum 8-radian modulation depth.
- Four directed routing algorithms: three pairs, a six-operator stack, five modulators into one carrier, and two three-operator stacks.
- Per operator: frequency ratio, cents detuning, level, attack, decay, sustain, release.
- Operator 6 self-feedback is delayed by one internal sample. This is distinct from the agent's evaluation loop.
- Sixteen voices, deterministic voice selection, MIDI note/velocity input. Retriggering and voice replacement use a short fade.
- 4x internal oversampling with a low-pass decimator. This reduces aliasing; it does not promise alias-free synthesis for every patch.
- Parameter smoothing for pitch, levels, feedback, sustain and output gain. Envelope segment durations latch at segment entry. Routing changes apply to new notes.
- Mono synthesis delivered to both output channels. Master gain has headroom and a final bounded output stage.

## User interface

Enable audio, play an on-screen or computer keyboard, choose a starting patch, edit every parameter, audition a fixed phrase, import/export versioned JSON patches, and download rendered WAV auditions. Display the routing and live waveform. Use the native keyboard and pointer APIs without a framework.

## Agent-facing contract

Describe controls and their units/ranges; read the current patch/revision; validate and atomically apply edits; render a supplied patch and note sequence; return PCM with peak/RMS/brightness measurements; restore an earlier patch. A narrow JavaScript facade exposes these operations without UI automation. The [accepted agent integration](AGENT_INTEGRATION.md) adds a local paired HTTP/WebSocket bridge and CLI over the same authority, including authenticated WAV delivery and separately permitted speaker playback.

The UI and agent facade share one patch store. Invalid or stale edits must leave the current patch unchanged. Imported patch names are text, never executable markup. Render requests have explicit duration and event-count limits.

## Acceptance

1. A clean checkout can install local build tools, build/test the native library, compile WebAssembly, and build the static frontend using documented commands.
2. Native tests verify tuning, envelope release, routing differences, finite/bounded output under maximum settings, invalid input rejection, and independence from render block sizes.
3. A native and WebAssembly render of the same patch/score agree within a documented floating-point tolerance.
4. The AudioWorklet calls the compiled engine and produces non-silent PCM after a note, followed by silence after release.
5. The frontend exposes all controls and supports patch round-trip, audition and WAV export.
6. CI builds and checks the native package, WebAssembly bridge, and frontend.

## Follow-on work

Connect an audio-capable model to the existing control/audition facade, measure closed-loop improvement against a no-audio baseline, then add native JUCE standalone/AU wrappers. This first version does not include model calls, API credentials, DX7 emulation, MIDI device discovery, arbitrary routing, effects, or native plugin packaging.
