# Agent Synth Magic

A six-operator FM synthesizer with a C++20 DSP package, a WebAssembly build, and a vanilla HTML/CSS/TypeScript interface. The browser plays the compiled C++ engine in an AudioWorklet. Independent offline renders provide reproducible audio and measurements for an agent-controlled sound-design loop.

The instrument includes a local API for your existing agent: pair once, approve its permissions, then let it edit the visible patch, render/download auditions, and play them. The synth makes no model calls and needs no provider API key. Audio-capable model evaluation and native JUCE/AU wrappers remain follow-on work.

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

Click **Connect agent** in the instrument and copy its pairing prompt to your
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
docs/SPEC.md                  Version 0.1 scope and acceptance criteria
docs/ARCHITECTURE.md           Audio, state, and integration boundaries
docs/AGENT_API.md              Structured control and audition API
.github/workflows/ci.yml       Reproducible builds and checks
```

## Instrument

- Six sine operators with ratio, detune, level, and ADSR envelopes.
- Four routing algorithms, operator 6 self-feedback, and sixteen voices.
- 4x oversampling with a 127-tap Blackman-windowed sinc decimator.
- Smoothed continuous controls; routing changes apply to new notes.
- Six starting patches, JSON patch import/export, undo, and a fixed audition phrase.
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
find_package(AgentSynth 0.1 CONFIG REQUIRED)
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

Oversampling reduces aliasing, but extreme ratios, high notes, and deep feedback can still alias. This version has no effects, device MIDI input, sustain pedal, or arbitrary modulation graph. Envelope durations latch when each segment starts. Auditions are bounded to 12 seconds and 256 note events; the default five-second phrase can truncate long releases. Choose a longer custom score when evaluating those patches.

The repository is private by default and no redistribution license is granted yet. Licensing can be chosen when the package is ready to share.
