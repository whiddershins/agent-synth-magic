#include <agent_synth/synth.hpp>
#include <array>
#include <cstdlib>
#include <fstream>
#include <iostream>
#include <string>
#include <vector>

// Deterministic reference renderer used by the native/Wasm parity test.
// Binary float32 I/O keeps JSON and codec dependencies outside the DSP package.
int main(int argc, char** argv) {
    if (argc != 3) {
        std::cerr << "Usage: synth_render PATCH.f32 OUTPUT.f32\n"
                     "Renders A3 for 0.5 s, then 1 s of release, at 48 kHz.\n";
        return 1;
    }
    agent_synth::Patch patch;
    std::ifstream input(argv[1], std::ios::binary);
    input.read(reinterpret_cast<char*>(patch.values.data()), sizeof(patch.values));
    if (!input || input.peek() != std::char_traits<char>::eof() || !patch.valid()) {
        std::cerr << "Invalid patch input\n";
        return 1;
    }
    agent_synth::Synth synth;
    if (!synth.prepare(48000) || !synth.set_patch(patch) || !synth.note_on(57, 0.8f)) return 1;
    std::vector<float> audio(72000);
    synth.render(std::span<float>(audio.data(), 24000));
    synth.note_off(57);
    synth.render(std::span<float>(audio.data() + 24000, 48000));
    std::ofstream output(argv[2], std::ios::binary);
    output.write(reinterpret_cast<const char*>(audio.data()), static_cast<std::streamsize>(audio.size() * sizeof(float)));
    if (!output) { std::cerr << "Could not write output\n"; return 1; }
    return 0;
}
