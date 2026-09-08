// Generated from contracts/instrument.json. Run npm run generate.
#pragma once
#include <array>

namespace agent_synth {
struct ParameterDefinition {
    const char* id;
    float minimum;
    float maximum;
    float initial;
    bool integer;
};
inline constexpr int parameter_count = 45;
inline constexpr std::array<ParameterDefinition, parameter_count> parameter_definitions {{
    {"algorithm", 0.0f, 3.0f, 0.0f, true},
    {"gain", 0.0f, 0.8f, 0.22f, false},
    {"feedback", 0.0f, 2.0f, 0.0f, false},
    {"op1.ratio", 0.25f, 16.0f, 1.0f, false},
    {"op1.detune", -100.0f, 100.0f, 0.0f, false},
    {"op1.level", 0.0f, 1.0f, 0.8f, false},
    {"op1.attack", 0.001f, 5.0f, 0.008f, false},
    {"op1.decay", 0.005f, 8.0f, 0.5f, false},
    {"op1.sustain", 0.0f, 1.0f, 0.3f, false},
    {"op1.release", 0.01f, 8.0f, 0.4f, false},
    {"op2.ratio", 0.25f, 16.0f, 1.0f, false},
    {"op2.detune", -100.0f, 100.0f, 0.0f, false},
    {"op2.level", 0.0f, 1.0f, 0.0f, false},
    {"op2.attack", 0.001f, 5.0f, 0.008f, false},
    {"op2.decay", 0.005f, 8.0f, 0.5f, false},
    {"op2.sustain", 0.0f, 1.0f, 0.3f, false},
    {"op2.release", 0.01f, 8.0f, 0.4f, false},
    {"op3.ratio", 0.25f, 16.0f, 1.0f, false},
    {"op3.detune", -100.0f, 100.0f, 0.0f, false},
    {"op3.level", 0.0f, 1.0f, 0.0f, false},
    {"op3.attack", 0.001f, 5.0f, 0.008f, false},
    {"op3.decay", 0.005f, 8.0f, 0.5f, false},
    {"op3.sustain", 0.0f, 1.0f, 0.3f, false},
    {"op3.release", 0.01f, 8.0f, 0.4f, false},
    {"op4.ratio", 0.25f, 16.0f, 1.0f, false},
    {"op4.detune", -100.0f, 100.0f, 0.0f, false},
    {"op4.level", 0.0f, 1.0f, 0.0f, false},
    {"op4.attack", 0.001f, 5.0f, 0.008f, false},
    {"op4.decay", 0.005f, 8.0f, 0.5f, false},
    {"op4.sustain", 0.0f, 1.0f, 0.3f, false},
    {"op4.release", 0.01f, 8.0f, 0.4f, false},
    {"op5.ratio", 0.25f, 16.0f, 1.0f, false},
    {"op5.detune", -100.0f, 100.0f, 0.0f, false},
    {"op5.level", 0.0f, 1.0f, 0.0f, false},
    {"op5.attack", 0.001f, 5.0f, 0.008f, false},
    {"op5.decay", 0.005f, 8.0f, 0.5f, false},
    {"op5.sustain", 0.0f, 1.0f, 0.3f, false},
    {"op5.release", 0.01f, 8.0f, 0.4f, false},
    {"op6.ratio", 0.25f, 16.0f, 1.0f, false},
    {"op6.detune", -100.0f, 100.0f, 0.0f, false},
    {"op6.level", 0.0f, 1.0f, 0.0f, false},
    {"op6.attack", 0.001f, 5.0f, 0.008f, false},
    {"op6.decay", 0.005f, 8.0f, 0.5f, false},
    {"op6.sustain", 0.0f, 1.0f, 0.3f, false},
    {"op6.release", 0.01f, 8.0f, 0.4f, false},
}};
struct Routing {
    std::array<unsigned, 6> inputs;
    unsigned carriers;
    int carrier_count;
};
inline constexpr std::array<Routing, 4> routings {{
    {{{2, 0, 8, 0, 32, 0}}, 21, 3},
    {{{2, 4, 8, 16, 32, 0}}, 1, 1},
    {{{62, 0, 0, 0, 0, 0}}, 1, 1},
    {{{2, 4, 0, 16, 32, 0}}, 9, 2},
}};
} // namespace agent_synth
