#include <agent_synth/c_api.h>
#include <agent_synth/synth.hpp>
#include <array>
#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#define SYNTH_EXPORT EMSCRIPTEN_KEEPALIVE
#else
#define SYNTH_EXPORT
#endif

namespace {
constexpr int capacity = 512;
agent_synth::Synth synth;
agent_synth::Patch staging = agent_synth::Patch::initial();
std::array<float, capacity> output{};
}

extern "C" {
SYNTH_EXPORT int synth_schema_version() { return 1; }
SYNTH_EXPORT int synth_parameter_count() { return agent_synth::parameter_count; }
SYNTH_EXPORT int synth_capacity() { return capacity; }
SYNTH_EXPORT int synth_init(double sample_rate) {
    if (!synth.prepare(sample_rate)) return 0;
    staging = agent_synth::Patch::initial();
    output.fill(0);
    return synth.set_patch(staging) ? 1 : 0;
}
SYNTH_EXPORT float* synth_patch_buffer() { return staging.values.data(); }
SYNTH_EXPORT int synth_apply_patch() { return synth.set_patch(staging) ? 1 : 0; }
SYNTH_EXPORT int synth_note_on(int note, float velocity) { return synth.note_on(note, velocity) ? 1 : 0; }
SYNTH_EXPORT void synth_note_off(int note) { synth.note_off(note); }
SYNTH_EXPORT void synth_panic() { synth.panic(); }
SYNTH_EXPORT int synth_render(int frames) {
    if (frames < 0 || frames > capacity) return 0;
    synth.render(std::span<float>(output.data(), static_cast<std::size_t>(frames)));
    return 1;
}
SYNTH_EXPORT float* synth_output_buffer() { return output.data(); }
SYNTH_EXPORT int synth_active_voices() { return synth.active_voices(); }
}
