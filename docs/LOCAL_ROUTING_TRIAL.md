# Local routing crossfade trial — 2026-09-09

Initial routing trial and subsequent combined-release validation. The first table records the earlier routing-only experiment.

The four routing algorithms now crossfade over 30 ms for sounding voices. A voice has at most two oscillator/filter/feedback paths. Both paths share envelopes advanced once per sample; phases and signal history are copied when a transition begins. Further requests replace one pending target and take effect after the active transition finishes. Note IDs and release behavior are retained. Waveforms and pitch-depth remained note-on settings in the initial trial; the combined release below adds live waveform changes.

Validation: npm test (native behavior, package consumer, WASM/native parity and bridge tests), production web build, 21 browser tests, AddressSanitizer and UndefinedBehaviorSanitizer passed. Tests cover held-note routing convergence while attack is still running, rapid changes with 16 voices, allocation/deallocation monitoring, deterministic caller block sizes, panic, and real AudioWorklet output changes with a sustain latch.

## Throughput measurement

Run `node --import tsx scripts/benchmark-routing.ts` after building WASM. These are local Node/V8 WASM timings, not AudioWorklet scheduling measurements or a certification of older computers. 128-frame blocks; 300 warmup blocks and 1,500 measured blocks. Synthetic heavy patch: all six operators at ratio 16, level/sustain 1, per-operator resonant filters, global filter, pitch LFO and reverb. Steady uses Six-stack. Switching requests a new algorithm every block, keeping two paths active. Timings include patch conversion/publication for switching. Ordinary manual changes only incur the dual-path cost during the 30 ms fade. No actual CPU throttling was performed; 4x slowdown is arithmetic sensitivity analysis only.

| Rate | Voices | Mode | Median ms | p99 ms | Audio budget ms | p99 / budget |
|---|---|---|---|---|---|---|
| 48000 | 4 | steady | 0.332 | 0.377 | 2.667 | 14.1% |
| 48000 | 4 | switching | 0.489 | 0.611 | 2.667 | 22.9% |
| 48000 | 16 | steady | 0.877 | 0.984 | 2.667 | 36.9% |
| 48000 | 16 | switching | 1.210 | 1.627 | 2.667 | 61.0% |
| 96000 | 4 | steady | 0.337 | 0.388 | 1.333 | 29.1% |
| 96000 | 4 | switching | 0.507 | 0.595 | 1.333 | 44.6% |
| 96000 | 16 | steady | 0.876 | 0.976 | 1.333 | 73.2% |
| 96000 | 16 | switching | 1.340 | 1.649 | 1.333 | 123.7% |

Four voices at 48 kHz leave substantial measured headroom on this host. Sixteen continuously switching voices exceed the budget at 96 kHz. A hypothetical 4x slower processor would exceed the budget for the 16-voice switching case even at 48 kHz; the four-voice 48 kHz case approaches the budget. Do not claim universal older-machine support from these results. More optimization or an explicit polyphony/quality policy would be needed before treating the worst case as production-ready.

## Combined release: live waveforms and patch URLs

Native behavior/package tests, WASM/native parity, 29 Node tests and 23 browser tests passed. AddressSanitizer and UndefinedBehaviorSanitizer passed (63.74 s). Browser tests cover a sustained note changing from sine to square and back without another key press, URL restoration over session state, Undo, malformed links and quick reloads during pending URL compression. Desktop 1440 px and mobile 390 px layouts were visually checked, including keyboards above the patch block and the Copy link action.

The same benchmark now includes all six waveform targets changing every quantum, alone or together with routing. These are synthetic worst-case transitions, including patch conversion and publication. Results below are a new local run, not a controlled comparison against the earlier table; host scheduling and processor speed can affect them. No concurrent build/test was launched by this task during the run.

| Rate | Voices | Mode | Median ms | p99 ms | Audio budget ms | p99 / budget |
|---|---|---|---|---|---|---|
| 48000 | 4 | steady | 0.455 | 0.938 | 2.667 | 35.2% |
| 48000 | 4 | switching | 0.625 | 1.167 | 2.667 | 43.8% |
| 48000 | 4 | waveforms | 0.536 | 1.082 | 2.667 | 40.6% |
| 48000 | 4 | combined | 0.674 | 1.341 | 2.667 | 50.3% |
| 48000 | 16 | steady | 1.318 | 2.337 | 2.667 | 87.6% |
| 48000 | 16 | switching | 1.896 | 3.316 | 2.667 | 124.4% |
| 48000 | 16 | waveforms | 1.550 | 2.646 | 2.667 | 99.2% |
| 48000 | 16 | combined | 2.016 | 3.366 | 2.667 | 126.2% |
| 96000 | 4 | steady | 0.456 | 0.957 | 1.333 | 71.8% |
| 96000 | 4 | switching | 0.633 | 1.279 | 1.333 | 95.9% |
| 96000 | 4 | waveforms | 0.541 | 1.090 | 1.333 | 81.7% |
| 96000 | 4 | combined | 0.678 | 1.337 | 1.333 | 100.3% |
| 96000 | 16 | steady | 1.316 | 2.304 | 1.333 | 172.8% |
| 96000 | 16 | switching | 1.836 | 3.203 | 1.333 | 240.2% |
| 96000 | 16 | waveforms | 1.492 | 2.619 | 1.333 | 196.4% |
| 96000 | 16 | combined | 2.075 | 3.523 | 1.333 | 264.2% |

The heavy 16-voice simultaneous-edit case exceeds its p99 budget at both sample rates on this run. Four voices at 48 kHz remain below budget, while 96 kHz has much less margin. This release does not establish universal older-machine or worst-case 16-voice real-time performance. The fast-follow morph experiment should measure whether one routing path improves transition cost.
