#include <agent_synth/synth.hpp>
#include <array>
#include <algorithm>
#include <cmath>

int main() {
    agent_synth::Synth synth;
    if (!synth.prepare(48000) || !synth.note_on(60, 0.8f)) return 1;
    std::array<float, 512> samples{};
    synth.render(samples);
    return std::any_of(samples.begin(), samples.end(), [](float sample) { return std::abs(sample) > 0.001f; }) ? 0 : 1;
}
