# Working on Agent Synth Magic

Read `docs/SPEC.md` for the agreed scope and `docs/ARCHITECTURE.md` for the audio/state boundaries.

- Own the synthesis DSP in `packages/dsp`; keep browser, JUCE, model-provider and networking dependencies outside it.
- `contracts/instrument.json` is the parameter/routing source of truth. Run `npm run generate` after editing it and commit both generated outputs.
- Do not change the meaning/order of serialized parameters without an explicit schema/ABI migration.
- The audio thread must never allocate/deallocate heap memory, acquire locks, perform I/O, or wait for another thread. Prepare buffers and voices before playback.
- Keep live and offline playback on the same C++ implementation. Preserve repeatable rendering and independence from caller block sizes.
- The frontend is vanilla HTML/CSS/TypeScript. Avoid a framework migration without a product reason.
- All user and agent edits go through `PatchStore`; agent writes require the expected revision.
- Avoid pretending that a model listened or scored audio. Version 0.1 exposes the real control/render facade but makes no model calls.
- Use pinned dependencies and the local `.tools` toolchain. Do not commit binaries, toolchains, downloaded browsers, caches, generated `dist`, or credentials.
- Verify DSP/contract changes with `npm test`, frontend changes with `npm run build:web`, and audio/UI integration changes with `npm run test:browser` after building the production frontend. Use sanitizers for native memory concerns.
- Keep the public CMake package consumable with `find_package(AgentSynth CONFIG REQUIRED)` and `AgentSynth::dsp`.
