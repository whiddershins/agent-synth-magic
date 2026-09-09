# Agent Synth 0.4

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

- Six selectable sine/triangle/saw/square/noise operators using phase modulation; operator levels map to a maximum 8-radian modulation depth.
- Four directed routing algorithms: three pairs, a six-operator stack, five modulators into one carrier, and two three-operator stacks.
- Per operator: waveform, frequency ratio, cents detuning, level, delay, attack, hold, decay, sustain, release.
- A global pitch envelope with ±48-semitone depth and delay/attack/hold/decay/sustain/release stages.
- A resonant output state-variable filter with bypass, low-pass, high-pass and band-pass modes.
- Operator 6 self-feedback is delayed by one internal sample. This is distinct from the agent's evaluation loop.
- Sixteen voices, deterministic voice selection, MIDI note/velocity input. Retriggering and voice replacement use a short fade.
- 4x internal oversampling with a low-pass decimator. This reduces aliasing; it does not promise alias-free synthesis for every patch.
- Parameter smoothing for pitch, levels, feedback, sustain and output gain. Envelope segment durations latch at segment entry. Routing, waveform and pitch-depth changes apply to new notes.
- Mono synthesis delivered to both output channels. Master gain has headroom and a final bounded output stage.

## User interface

Enable audio, play an on-screen or computer keyboard, choose a starting patch, edit every parameter, audition a fixed phrase, save named patches in a persistent browser-local patch menu, import/export versioned JSON patches, and download rendered WAV auditions. Display the routing and live waveform. Use the native keyboard and pointer APIs without a framework. Dragging crosses discrete notes; each touch contact owns its note independently. Web MIDI input supports note/velocity, sustain pedal and device disconnection when available. The experimental agent panel is hidden by default.

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

Connect an audio-capable model to the existing control/audition facade, measure closed-loop improvement against a no-audio baseline, then add native JUCE standalone/AU wrappers. This first version does not include model calls, API credentials, DX7 emulation, arbitrary routing or native plugin packaging.

## Release additions accepted September 8, 2026

Delay + hold + ADSR is the chosen multistage envelope design for this release. Freely editable envelope points remain future work. Publish the playable synth first and return to the agent feedback loop later. Schema-1 patches must migrate without changing any original values, serialized positions, or neutral-default sound.


## Expressive release 0.4

Schema/ABI 3 preserves all 73 existing parameter indices and meanings, then appends independent operator pitch DAHDSR enable/depth/timing and bypassable operator filters, one free-running LFO with four assignable bipolar routes, and a dry-by-default mono algorithmic reverb. Each operator shows a routing-aware explanation and a saved editable annotation (up to 1,000 characters).

Two multitouch keyboards share one engine, with separate detune and octave controls saved in the patch. Held notes retune smoothly when detune changes; octave changes affect the next key press. Source identities keep equal pitches independent. MPE MIDI input adds independent member-channel pitch bend, pressure-to-amplitude and CC74-to-modulator-level expression; lower/upper zone and bend ranges are selectable, with standard RPN configuration supported. Classic MIDI remains available. This is MIDI 1.0 MPE, not Haken MPE+ or MIDI 2.0. Hardware validation remains a manual check.

LFO routes cover global pitch, output level/filter cutoff, and individual operator pitch/level/filter cutoff. Reverb uses fixed prepared delay storage and runs in the shared C++ engine for live/offline parity. Bypass clears its tail. All original patch values migrate unchanged; new effects are neutral by default.

Each on-screen keyboard has an independent performance sustain latch. Released notes stay held until that keyboard’s latch is turned off, including notes traversed during glissando. Tapping a latched note again releases just that note while leaving the latch and other notes active. Another tap adds it back. Turning the latch off preserves keys still physically held. Window blur and page hiding preserve latched notes and latch switches; physical browser presses are released through the normal sustain behavior. MIDI continues to receive note-offs and expression while backgrounded. Patch selection and import preserve held notes and both sustain latches. Continuous parameters follow the new patch with the existing smoothing; routing, waveforms and captured pitch envelopes apply to new notes. Stop all and audition playback clear both latches and notes. Latch state is transient and is not saved with the patch.

Operator cards retain their technical explanation and add a separate short “Try…” suggestion giving practical, control-specific guidance for changing the current sound, including envelope shape, brightness, body, pitch sweeps and currently silent routes. These deterministic explanations complement the saved editable operator notes; they make no model calls.

Save patch opens a naming dialog with explicit Save new patch or Replace saved patch actions. Cancel preserves the current patch and saved library. A failed save must not rename the working patch or report success; concurrent changes to a replacement target must be reviewed again.
