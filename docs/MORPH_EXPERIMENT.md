# Fast-follow experiment: preset morph

Status: agreed experiment direction; not implemented. This follows the current local held-note routing trial.

Provide two preset selectors, A and B, and one continuous A ↔ B slider. Each selector offers factory and locally saved patches. Capture selected patches as independent endpoint snapshots so moving the slider never overwrites either saved preset. The purpose is to explore intermediate instruments while notes sustain.

At 0 and 100%, synthesis parameter targets must match A and B respectively. This does not promise identical audio to a freshly triggered endpoint: running phases, filter histories and envelope progress persist. Names and operator notes remain endpoint metadata rather than interpolated values. Keyboard tuning and performance ownership need an explicit policy before implementation.

Interpolate continuous synthesis controls in appropriate domains, including logarithmic frequency/time scales where valid, with explicit treatment of zero values. Blend operator waveform outputs at a shared phase. Explore interpolating modulation connections and normalized carrier weights in one six-operator path; retain the existing directed evaluation order and separate operator-6 feedback. Avoid treating categorical parameter indices as continuous numbers. Define filter-mode and envelope-transition behavior before implementing them; envelopes must not restart simply because the slider moves.

Keep the experiment local initially. Use the shared C++ engine for live and offline rendering, fixed-capacity audio state, and PatchStore for user edits. If fractional routing or waveform mixtures require additional synthesis state, define its contract and serialization explicitly rather than overloading existing enum parameters. Compatibility with patch sharing is a design constraint, not an assumption that the current patch format can already represent a morph.

Before enabling the experiment, establish bounds for connection/carrier weights and document the assumptions behind signal boundedness. Check finite output, rapid slider reversals, endpoint parameter fidelity, deterministic block-independent rendering, preserved held-note ownership, and absence of audio-thread allocations. Benchmark settled and continuously moving morphs against the current routing crossfade. Audition contrasting preset pairs for excessive loudness changes and harsh intermediate spectra; amplitude bounds alone do not establish perceptual similarity or safe listening volume.

Success means the intermediate sounds are useful enough to justify a dedicated performance control, with measured CPU cost acceptable for the local browser instrument.
