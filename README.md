# Agent Synth Magic

A six-operator FM synthesizer with a C++20 DSP package, a WebAssembly build, and a vanilla HTML/CSS/TypeScript interface. The browser plays the compiled C++ engine in an AudioWorklet. Independent offline renders provide reproducible audio and measurements for an agent-controlled sound-design loop.

The public instrument focuses on playing and shaping sounds. The experimental agent connection is hidden by default and can be enabled locally. The synth makes no model calls and needs no provider API key.

## Quick start

Prerequisites: Node.js 22.12 or newer, npm, Python 3, Git, and a native C++20 compiler. On macOS, install Xcode Command Line Tools. The scripts support macOS and Linux.

```sh
npm run setup
npm ci
npm run build
npm run dev
```

Open <http://127.0.0.1:5173>, enable audio, then play the on-screen keyboard or use A–K (with W/E/T/Y/U for the black keys). Escape releases all notes. Audio activation requires a browser user gesture. A deployed copy must use HTTPS; localhost is also supported.

`npm run setup` installs pinned CMake/Ninja and Emscripten 4.0.20 into the ignored `.tools/` directory. It does not change your shell profile or install global packages. Node dependencies are locked in `package-lock.json`; npm uses the ignored project cache.

After editing C++, run `npm run build:wasm` and reload the page. Vite hot-reloads frontend changes. The production static application is written to `dist/`, including its `.wasm` binary. Serve it with `npm run preview` for the local agent API, or any static HTTPS host for the standalone instrument. The application has no remote runtime dependencies.

## Connect your agent

The experimental agent panel is hidden for the initial public instrument release.
For local development, open `http://127.0.0.1:5173/?agent=1`, then click
**Connect agent** and copy its pairing prompt to your
agent. The agent runs the provided `npm run agent -- connect ...` command; approve
its requested permissions in the page. It can then discover controls, make batch
edits, download real WAV auditions, and play them through the open instrument.
Disconnect at any time. Connections expire after 30 minutes or when the tab closes.

See [the CLI and HTTP API](docs/AGENT_API.md) and
[the sound-design loop](docs/AGENT_INTEGRATION.md). The bridge carries actual audio;
whether your agent can ingest and evaluate that audio depends on its model/tools.

## Layout

```text
contracts/instrument.json      Parameter/routing source of truth
packages/dsp/                 Portable CMake package and native tests
packages/web/                 Vanilla web instrument and audio bridge
packages/bridge/              Local agent API, pairing, permissions, sessions
scripts/                      Toolchain, code generation, builds
tests/                        Native/Wasm parity and browser integration
docs/SPEC.md                  Version 0.4 scope and acceptance criteria
docs/ARCHITECTURE.md           Audio, state, and integration boundaries
docs/AGENT_API.md              Structured control and audition API
.github/workflows/ci.yml       Reproducible builds and checks
```

## Instrument

- Six operators with sine, triangle, saw, square, or deterministic noise; ratio, detune, level, and delay/attack/hold/decay/sustain/release envelopes.
- Four routing algorithms, operator 6 self-feedback, and sixteen voices.
- 4x oversampling with a 127-tap Blackman-windowed sinc decimator.
- Global and optional per-operator ±48-semitone pitch envelopes and resonant low-pass, high-pass, or band-pass filters.
- One LFO with four assignable routes, a dry-by-default reverb, and saved operator annotations.
- Smoothed continuous controls; routing, wave shape, and pitch depth changes apply to new notes.
- Two keyboards with independent detune/octave controls, drag glissando, and independent touch contacts.
- MIDI input with velocity, sustain, channel bend, and MPE pitch / pressure / timbre in supporting browsers.
- Ten starting patches, a browser-local saved patch menu, JSON patch import/export, undo, and a fixed audition phrase.
- WAV export and peak, RMS, and spectral-centroid measurements from the rendered audio.
- `window.synth` exposes versioned control discovery, patch snapshots, revision-checked edits, and offline rendering.

This is an original phase-modulation instrument, not a DX7 emulator. There is no preset compatibility with other synthesizers. Synthesis is mono, duplicated to the browser's stereo output. The output stage uses a gentle saturator before downsampling; high polyphony can therefore change the tone.

## Build and test

```sh
npm test                       # Contract, native behavior, Wasm build, parity/bridge tests
npm run build:web              # TypeScript check and production frontend build
npm run test:browser:install   # Install the pinned Chromium in .cache/playwright
npm run test:browser           # Test the production build in a real browser
```

The bridge tests render every starting patch with the native executable and WebAssembly. Maximum absolute sample difference must be below `2e-5`. Within one platform/build, repeatability and render-block independence are checked exactly. This tolerance covers the tested patches; feedback-heavy synthesis can amplify floating-point differences, so it is not a promise of universal bit identity.

For native memory/undefined-behavior checks:

```sh
bash scripts/build-native.sh -DAGENT_SYNTH_SANITIZE=ON
```

Turn that option back off in the same build directory with `-DAGENT_SYNTH_SANITIZE=OFF` when benchmarking.

## Consume the C++ package

```sh
bash scripts/build-native.sh
.tools/venv/bin/cmake --install build/native --prefix ./build/install
```

In another CMake project:

```cmake
find_package(AgentSynth 0.4 CONFIG REQUIRED)
target_link_libraries(my_instrument PRIVATE AgentSynth::dsp)
```

Configure that project with `-DCMAKE_PREFIX_PATH=/path/to/agent-synth-magic/build/install`.

```cpp
#include <agent_synth/synth.hpp>
#include <array>

agent_synth::Synth synth;
if (!synth.prepare(48000.0)) { /* invalid sample rate */ }
auto patch = agent_synth::Patch::initial();
patch.op(1, agent_synth::ratio) = 3.0f;
patch.op(1, agent_synth::level) = 0.25f;
if (!synth.set_patch(patch)) { /* invalid parameters */ }
if (!synth.note_on(60, 0.8f)) { /* invalid note/velocity */ }
std::array<float, 128> output;
synth.render(output);
synth.note_off(60);
```

Use one owning audio thread per `Synth`. Construct/prepare before starting the audio callback, and deliver validated note events and patches at block boundaries. `render()` and note events perform no heap allocation or deallocation. Keep JSON parsing, I/O, and agent requests on other threads.

## Editing the contract

Edit `contracts/instrument.json`, then run `npm run generate`. Commit both generated files. `npm run check:contract` fails if the checked-in C++/TypeScript definitions drift. Changing parameter order, meaning, or the binary interface requires explicit versioning; do not silently reinterpret saved patches.

## Current limits

Oversampling reduces aliasing, but extreme ratios, high notes, and deep feedback can still alias. The LFO has four routes; arbitrary audio routing and freely editable envelope points remain future work. Reverb is a simple mono room. Delay, attack, and hold durations latch at note-on; decay and release latch at segment entry. Noise ignores ratio and incoming phase modulation. Saw/square edge correction and oversampling reduce aliasing but cannot eliminate it under deep phase modulation. Auditions are bounded to 12 seconds and 256 note events; the default five-second phrase can truncate long releases. Choose a longer custom score when evaluating those patches.

Web MIDI requires browser support and permission; Safari/iPad Safari currently does not expose it. The on-screen keyboard uses independent Pointer Events for touch playing and glissando. Browser tests cover multiple emulated contacts; physical iPad and MIDI hardware have not been certified. The last working patch is retained for the current tab. **Save patch** stores a named entry in the patch menu using browser-local storage and persists between visits. Saving the same name updates that entry; renaming before saving creates a separate copy. **Export JSON** downloads a portable backup. Saved patches belong to this browser and site; clearing browser data removes them, and they do not sync between devices.

Schema 3 imports complete schema-1 and schema-2 patches with neutral defaults; see [the migration](docs/PATCH_SCHEMA.md).

The repository is private by default and no redistribution license is granted yet. Licensing can be chosen when the package is ready to share.

## Expressive input

Each keyboard plays the same patch through independently owned voices. Detune retunes its held notes; octave changes apply to new presses and update key labels. Each keyboard’s **Sustain latch** holds released notes until switched off; replaying a latched note retriggers it. Keys still physically held keep sounding when the latch turns off. Stop all clears both latches. Latches are performance state and are not saved with patches. Computer keys play keyboard 1. A shared 16-voice limit applies across both keyboards and MIDI.

Enable MIDI, then choose Classic MIDI or an MPE lower/upper zone. Match the controller’s bend range (default MPE ±48 semitones, master/classic ±2). Standard RPN 6 can configure one zone per input; RPN 0 sets bend range. Master bend adds to member bend; member and master pressure multiply amplitude. CC74 moves modulator levels from 0.5× to 1.5×, so a carrier-only patch has no timbre response until a modulator is enabled. MPE+ extensions and MIDI 2.0 are not implemented. See [Roger Linn’s MPE explanation](https://www.rogerlinndesign.com/support/support-linnstrument-what-is-mpe).

For each operator, turn Pitch envelope on or choose a filter mode to reveal its editor. Collapse the editor to keep the effect active with less screen space. The live explanation follows the current routing; the editable patch note records your intention and is included in Save patch and Export JSON.
