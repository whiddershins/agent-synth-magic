#include <agent_synth/c_api.h>
#include <agent_synth/synth.hpp>
#include <algorithm>
#include <array>
#include <cmath>
#include <cstdlib>
#include <iostream>
#include <limits>
#include <new>
#include <span>
#include <vector>

namespace {
bool monitor_allocations = false;
int allocations = 0;
int deallocations = 0;
}
void* operator new(std::size_t size) {
    if (monitor_allocations) ++allocations;
    if (void* memory = std::malloc(std::max(size, std::size_t{1}))) return memory;
    throw std::bad_alloc();
}
void* operator new[](std::size_t size) { return ::operator new(size); }
void operator delete(void* memory) noexcept { if (monitor_allocations && memory) ++deallocations; std::free(memory); }
void operator delete[](void* memory) noexcept { ::operator delete(memory); }
void operator delete(void* memory, std::size_t) noexcept { ::operator delete(memory); }
void operator delete[](void* memory, std::size_t) noexcept { ::operator delete(memory); }

namespace {
using namespace agent_synth;
int checks = 0;
void require(bool condition, const char* message) {
    ++checks;
    if (!condition) { std::cerr << "FAIL: " << message << '\n'; std::exit(1); }
}
float peak(std::span<const float> samples) {
    float result = 0;
    for (float sample : samples) result = std::max(result, std::abs(sample));
    return result;
}
double rms(std::span<const float> samples) {
    double sum = 0;
    for (float sample : samples) sum += sample * sample;
    return std::sqrt(sum / samples.size());
}
Patch sine_patch() {
    auto patch = Patch::initial();
    patch.values[0] = 2;
    patch.values[1] = 0.2f;
    patch.op(0, sustain) = 1;
    patch.op(0, release) = 0.04f;
    return patch;
}
Patch complex_patch(int algorithm) {
    auto patch = Patch::initial();
    patch.values[0] = static_cast<float>(algorithm);
    patch.values[2] = 0.7f;
    for (int op = 0; op < 6; ++op) {
        patch.op(op, ratio) = static_cast<float>(op + 1);
        patch.op(op, level) = 0.6f - op * 0.07f;
        patch.op(op, decay) = 0.08f + op * 0.03f;
        patch.op(op, release) = 0.06f + op * 0.015f;
    }
    return patch;
}
std::vector<float> render_note(const Patch& patch, int block_size) {
    Synth synth;
    require(synth.set_patch(patch), "fixture patch accepted");
    require(synth.note_on(60, 0.8f), "fixture note accepted");
    std::vector<float> result(16000);
    for (int start = 0; start < 8000; start += block_size) {
        synth.render(std::span<float>(result.data() + start, std::min(block_size, 8000 - start)));
    }
    synth.note_off(60);
    for (int start = 8000; start < 16000; start += block_size) {
        synth.render(std::span<float>(result.data() + start, std::min(block_size, 16000 - start)));
    }
    return result;
}
void tuning_and_release() {
    for (double rate : {44100.0, 48000.0, 96000.0}) {
        Synth synth;
        require(synth.prepare(rate), "supported sample rate accepted");
        require(synth.set_patch(sine_patch()), "sine patch accepted");
        std::array<float, 512> silence{};
        synth.render(silence);
        require(peak(silence) == 0, "initial render is silent");
        require(synth.note_on(69, 1), "A4 accepted");
        std::vector<float> samples(static_cast<std::size_t>(rate * 1.2));
        synth.render(samples);
        int crossings = 0;
        const auto start = static_cast<std::size_t>(rate * 0.1);
        const auto end = start + static_cast<std::size_t>(rate);
        for (auto i = start + 1; i < end; ++i) if (samples[i - 1] <= 0 && samples[i] > 0) ++crossings;
        require(std::abs(crossings - 440) <= 1, "A4 is 440 Hz across sample rates");
        require(rms(samples) > 0.05, "note is audible");
        synth.note_off(69);
        synth.render(samples);
        require(peak(std::span<const float>(samples).last(1024)) == 0, "release reaches exact silence");
        require(synth.active_voices() == 0, "released voice retires");
    }
}
void validation() {
    Synth synth;
    const auto before = synth.patch().values;
    for (int parameter = 0; parameter < parameter_count; ++parameter) {
        for (float value : {std::numeric_limits<float>::quiet_NaN(), std::numeric_limits<float>::infinity(),
                parameter_definitions[parameter].minimum - 1, parameter_definitions[parameter].maximum + 1}) {
            auto invalid = Patch::initial();
            invalid.values[parameter] = value;
            require(!synth.set_patch(invalid), "out-of-range or non-finite patch rejected");
            require(synth.patch().values == before, "invalid patch is atomic");
        }
    }
    auto fractional = Patch::initial();
    fractional.values[0] = 0.5f;
    require(!synth.set_patch(fractional), "fractional algorithm rejected");
    require(!synth.note_on(-1, 0.5f) && !synth.note_on(128, 0.5f), "invalid MIDI notes rejected");
    require(!synth.note_on(60, std::numeric_limits<float>::quiet_NaN()), "NaN velocity rejected");
    require(!synth.note_on(60, 1.1f), "invalid velocity rejected");
    for (double rate : {0.0, -1.0, 7999.0, 192001.0, std::numeric_limits<double>::quiet_NaN()}) {
        require(!synth.prepare(rate), "invalid sample rate rejected");
        require(synth.sample_rate() == 48000, "invalid prepare preserves sample rate");
    }
}
void routing_and_repeatability() {
    std::vector<float> previous;
    for (int algorithm = 0; algorithm < 4; ++algorithm) {
        const auto patch = complex_patch(algorithm);
        const auto whole = render_note(patch, 8000);
        require(whole == render_note(patch, 127), "render does not depend on block size");
        require(whole == render_note(patch, 512), "repeated render is deterministic");
        if (!previous.empty()) {
            double difference = 0;
            for (std::size_t i = 0; i < whole.size(); ++i) difference += std::abs(whole[i] - previous[i]);
            require(difference > 5, "routing changes audible output");
        }
        previous = whole;
    }
}
void polyphony_and_extremes() {
    Synth synth;
    auto patch = complex_patch(1);
    for (int op = 0; op < 6; ++op) {
        patch.op(op, ratio) = 16;
        patch.op(op, level) = 1;
        patch.op(op, sustain) = 1;
        patch.op(op, attack) = 0.001f;
    }
    patch.values[1] = 0.8f;
    patch.values[2] = 2;
    require(synth.set_patch(patch), "maximum patch accepted");
    for (int note = 100; note <= 127; ++note) require(synth.note_on(note, 1), "voice stealing accepts notes");
    require(synth.active_voices() == 16, "voice capacity bounded");
    std::array<float, 512> output;
    for (int block = 0; block < 20; ++block) {
        synth.render(output);
        for (float sample : output) require(std::isfinite(sample) && std::abs(sample) <= 1, "extreme patch has bounded finite output");
    }
    synth.panic();
    for (int block = 0; block < 4; ++block) synth.render(output);
    require(peak(output) == 0 && synth.active_voices() == 0, "panic releases every voice");
    require(synth.note_on(60, 0.8f), "new note after panic");
    require(synth.note_on(60, 0), "velocity zero is note-off");
    for (int block = 0; block < 20; ++block) synth.render(output);
    require(synth.active_voices() == 0, "velocity zero releases note");
}
void allocation_free_audio_path() {
    Synth synth;
    std::array<float, 512> output{};
    auto patch = complex_patch(2);
    patch.values[parameter_index("filter.type")] = 3;
    patch.values[parameter_index("pitch.amount")] = 12;
    for (int op = 0; op < 6; ++op) patch.op(op, waveform) = static_cast<float>(op % 5);
    monitor_allocations = true;
    const bool accepted = synth.set_patch(patch) && synth.note_on(60, 0.8f);
    synth.render(output);
    synth.note_off(60);
    synth.render(output);
    synth.panic();
    synth.render(output);
    monitor_allocations = false;
    require(accepted && allocations == 0 && deallocations == 0, "audio/event path allocates and deallocates no heap memory");
}
void extended_envelope() {
    Envelope env;
    env.start(.1f, 1000, .2f, .3f);
    for (int i = 0; i < 200; ++i) require(env.next(.1f, .4f, 1000) == 0, "delay is silent for its full duration");
    for (int i = 0; i < 100; ++i) (void)env.next(.1f, .4f, 1000);
    for (int i = 0; i < 300; ++i) require(env.next(.1f, .4f, 1000) == 1, "hold preserves the peak for its full duration");
    for (int i = 0; i < 101; ++i) (void)env.next(.1f, .4f, 1000);
    require(std::abs(env.next(.1f, .4f, 1000) - .4f) < 1e-6f, "decay reaches sustain after hold");
    env.start(.1f, 1000, 1, 1);
    env.release(.02f, 1000);
    for (int i = 0; i < 21; ++i) require(env.next(.1f, .4f, 1000) == 0, "note-off during delay never starts an attack");
    require(!env.active(), "note-off during delay retires the envelope");
}
void waveforms_pitch_and_filter() {
    for (int shape = 0; shape < 5; ++shape) {
        auto patch = sine_patch();
        patch.op(0, waveform) = static_cast<float>(shape);
        const auto rendered = render_note(patch, 512);
        require(rendered == render_note(patch, 37), "every waveform including noise is repeatable across block sizes");
        require(rms(rendered) > .01, "every waveform produces audio");
        if (shape > 0) require(rendered != render_note(sine_patch(), 512), "non-sine waveforms have distinct output");
    }
    auto pitched = sine_patch();
    pitched.values[parameter_index("pitch.amount")] = 12;
    pitched.values[parameter_index("pitch.hold")] = .05f;
    pitched.values[parameter_index("pitch.decay")] = .15f;
    Synth synth;
    require(synth.set_patch(pitched) && synth.note_on(69, 1), "pitch envelope fixture accepted");
    std::vector<float> output(48000);
    synth.render(output);
    const auto crossings = [&](int start, int end) {
        int count = 0;
        for (int i = start + 1; i < end; ++i) if (output[i-1] <= 0 && output[i] > 0) ++count;
        return count;
    };
    require(std::abs(crossings(480, 1920) - 26) <= 1, "pitch hold raises A4 by one octave");
    require(std::abs(crossings(24000, 28800) - 44) <= 1, "pitch decay returns to played A4");
    const auto filtered_rms = [](int mode, float cutoff, float ratio_value) {
        auto patch = sine_patch();
        patch.op(0, ratio) = ratio_value;
        patch.values[parameter_index("filter.type")] = static_cast<float>(mode);
        patch.values[parameter_index("filter.cutoff")] = cutoff;
        Synth engine;
        require(engine.set_patch(patch) && engine.note_on(69, 1), "filter fixture accepted");
        std::vector<float> samples(24000);
        engine.render(samples);
        return rms(std::span<const float>(samples).last(12000));
    };
    const double dry = filtered_rms(0, 100, 1);
    require(filtered_rms(1, 100, 1) < dry * .1, "low-pass removes tones above cutoff");
    require(filtered_rms(2, 2000, 1) < dry * .1, "high-pass removes tones below cutoff");
    require(filtered_rms(3, 440, 1) > filtered_rms(3, 440, 10) * 5, "band-pass favors its center frequency");
    for (double rate : {8000.0, 48000.0, 192000.0}) {
        for (int mode = 1; mode <= 3; ++mode) {
            auto patch = complex_patch(3);
            patch.values[parameter_index("filter.type")] = static_cast<float>(mode);
            patch.values[parameter_index("filter.resonance")] = 10;
            patch.values[parameter_index("pitch.amount")] = 48;
            patch.values[parameter_index("pitch.sustain")] = 1;
            for (int op = 0; op < 6; ++op) patch.op(op, waveform) = static_cast<float>(op % 5);
            Synth engine;
            require(engine.prepare(rate) && engine.set_patch(patch), "extreme extended patch accepted");
            for (int note = 112; note < 128; ++note) require(engine.note_on(note, 1), "extreme polyphonic note accepted");
            std::array<float, 512> samples;
            for (float cutoff : {20.0f, 20000.0f, 20.0f}) {
                patch.values[parameter_index("filter.cutoff")] = cutoff;
                require(engine.set_patch(patch), "moving resonant filter accepted");
                for (int block = 0; block < 10; ++block) {
                    engine.render(samples);
                    for (float sample : samples) require(std::isfinite(sample) && std::abs(sample) <= 1, "resonant extreme remains finite and bounded");
                }
            }
        }
    }
}

void c_abi_bounds() {
    require(synth_init(48000) == 1, "C ABI initializes");
    require(synth_parameter_count() == parameter_count, "C ABI agrees with schema");
    require(synth_render(-1) == 0 && synth_render(513) == 0, "C ABI rejects invalid buffer sizes");
    synth_patch_buffer()[0] = 500;
    require(synth_apply_patch() == 0, "C ABI validates staging buffer");
    require(synth_note_on(60, 0.8f) == 1 && synth_render(512) == 1, "C ABI remains usable after rejection");
    require(peak(std::span<const float>(synth_output_buffer(), 512)) > 0, "C ABI renders audio");
}
}

int main() {
    extended_envelope();
    waveforms_pitch_and_filter();
    tuning_and_release();
    validation();
    routing_and_repeatability();
    polyphony_and_extremes();
    allocation_free_audio_path();
    c_abi_bounds();
    std::cout << "Passed " << checks << " assertions across tuning, envelopes, validation, routing, polyphony, allocation, and ABI tests.\n";
}
