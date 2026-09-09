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
void live_routing() {
    // Match a continuously running destination voice after the fade: this checks
    // oscillator phase and envelope progress without exposing private state.
    auto patch = complex_patch(0);
    patch.values[2] = 0;
    for (int op=0; op<6; ++op) patch.op(op, attack) = .8f;
    Synth changed, destination;
    require(changed.set_patch(patch) && changed.note_on_id(42, 60, .8f), "routing source starts");
    patch.values[0] = 1;
    require(destination.set_patch(patch) && destination.note_on_id(42, 60, .8f), "routing reference starts");
    std::array<float, 4096> a{}, b{};
    changed.render(a); destination.render(b);
    require(changed.set_patch(patch), "held routing changes");
    changed.render(a); destination.render(b);
    double error = 0;
    for (int i=2048; i<4096; ++i) error += std::abs(a[i]-b[i]);
    require(error < .0001, "routing converges without restarting phases or envelopes");
    require(changed.active_voices() == 1, "routing preserves note ownership");
    changed.note_off_id(42);
    for (int i=0; i<5; ++i) changed.render(a);
    require(changed.active_voices() == 0 && peak(a) == 0, "release after routing finishes normally");

    const auto run = [](int block) {
        Synth synth;
        auto p = complex_patch(0);
        p.values[2] = 2;
        for (int op=0; op<6; ++op) {
            p.op(op, waveform) = static_cast<float>(op%5);
            p.op(op, op_filter_type) = 1;
            p.op(op, sustain) = .7f;
        }
        require(synth.set_patch(p), "stress routing patch valid");
        for (int n=0; n<16; ++n) require(synth.note_on_id(n, 48+n, .7f), "stress voice starts");
        std::vector<float> samples(16000);
        for (int start=0; start<16000;) {
            // Requests every 200 samples are faster than a fade; the final one wins.
            if (start%200 == 0) {
                p.values[0] = static_cast<float>((start/200)%4);
                for (int op=0; op<6; ++op) p.op(op, waveform) = static_cast<float>((op+start/200)%5);
                monitor_allocations = true;
                const bool ok = synth.set_patch(p);
                monitor_allocations = false;
                require(ok, "queued routing accepted");
            }
            const int count=std::min({block, 200-start%200, 16000-start});
            monitor_allocations = true;
            synth.render(std::span<float>(samples.data()+start,count));
            monitor_allocations = false;
            start += count;
        }
        require(synth.active_voices() == 16, "rapid routing preserves all voices");
        for (float sample : samples) require(std::isfinite(sample) && std::abs(sample)<=1, "rapid routing remains bounded");
        synth.panic();
        std::array<float,1024> tail{}; synth.render(tail);
        require(synth.active_voices()==0 && peak(std::span<const float>(tail).last(256))==0, "panic during routing clears voices");
        return samples;
    };
    const int before_allocations=allocations, before_deallocations=deallocations;
    require(run(127)==run(512), "queued routing is independent of caller block size");
    require(allocations==before_allocations && deallocations==before_deallocations, "routing never allocates or frees");
}

void live_waveforms() {
    for (int shape=1; shape<=3; ++shape) {
        Synth changed, destination;
        auto patch = sine_patch();
        patch.op(0, attack) = .3f;
        require(changed.set_patch(patch) && changed.note_on_id(42, 60, .8f), "wave source starts");
        patch.op(0, waveform) = static_cast<float>(shape);
        require(destination.set_patch(patch) && destination.note_on_id(42, 60, .8f), "wave reference starts");
        std::array<float,4096> a{}, b{};
        changed.render(a); destination.render(b);
        require(changed.set_patch(patch), "held waveform changes");
        changed.render(a); destination.render(b);
        double error = 0;
        for (int i=2048; i<4096; ++i) error += std::abs(a[i]-b[i]);
        require(error < .0001, "wave change reaches destination without phase or attack reset");
        require(changed.active_voices()==1, "wave change keeps held note identity");
        changed.note_off_id(42);
        for (int i=0; i<5; ++i) changed.render(a);
        require(changed.active_voices()==0 && peak(a)==0, "wave change preserves normal release");
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

void expressive_identity_and_pitch() {
    Synth synth;
    auto patch=sine_patch(); patch.op(0, attack)=.001f;
    require(synth.set_patch(patch), "expressive fixture accepted");
    require(synth.note_on_id(1000,69,1) && synth.note_on_id(1001,69,1,-9), "same pitch accepts independent IDs");
    require(synth.active_voices()==2, "equal pitches occupy separate voices");
    std::vector<float> samples(48000);
    synth.note_off_id(1001); synth.render(samples);
    require(synth.active_voices()==1, "one release preserves equal-pitch sibling");
    require(synth.expression(1000,1200,1,.5f), "per-note octave bend accepted");
    synth.render(samples); synth.render(samples);
    int crossings=0;
    for (int i=1;i<48000;++i) if (samples[i-1]<=0 && samples[i]>0) ++crossings;
    require(std::abs(crossings-880)<=1, "per-note pitch bend reaches 880 Hz");
    require(!synth.expression(1000,std::numeric_limits<float>::quiet_NaN(),1,.5f), "nonfinite expression rejected");
    require(synth.expression(1000,1200,0,.5f), "pressure accepted");
    synth.render(samples); require(peak(std::span<const float>(samples).last(1024))<1e-6f, "pressure can silence one voice");
}

void operator_modulation_and_reverb() {
    auto base=sine_patch();
    auto expressive=base;
    expressive.op(0,op_pitch_enabled)=1; expressive.op(0,op_pitch_amount)=12;
    expressive.op(0,op_pitch_sustain)=1; expressive.op(0,op_pitch_attack)=.001f;
    require(render_note(base,127)!=render_note(expressive,127), "operator pitch envelope changes audio");
    expressive.op(0,op_pitch_enabled)=0;
    require(render_note(base,127)==render_note(expressive,127), "disabled operator pitch is neutral despite retained settings");
    expressive.op(0,op_filter_type)=1; expressive.op(0,op_filter_cutoff)=80;
    require(rms(render_note(expressive,127))<rms(render_note(base,127))*.2, "operator low-pass attenuates its carrier");
    expressive=base;
    expressive.values[parameter_index("lfo.route1.target")]=1;
    expressive.values[parameter_index("lfo.route1.amount")]=50;
    require(render_note(base,127)!=render_note(expressive,127), "assigned LFO changes audio");
    expressive.values[parameter_index("lfo.waveform")]=4;
    expressive.values[parameter_index("lfo.rate")]=20;
    expressive.values[parameter_index("reverb.mix")]=35;
    expressive.values[parameter_index("reverb.decay")]=2;
    expressive.op(0,op_filter_type)=2;
    expressive.op(0,op_filter_cutoff)=150;
    const auto whole=render_note(expressive,8000);
    require(whole==render_note(expressive,127), "LFO, operator filter and reverb are block-independent");
    require(rms(std::span<const float>(whole).last(1024))>.00001, "reverb survives voice release");
    Synth synth;
    require(synth.set_patch(expressive) && synth.note_on_id(1000,60,1), "effect allocation fixture accepted");
    std::array<float,512> block{};
    monitor_allocations=true;
    for (int i=0;i<100;++i) { (void)synth.expression(1000,static_cast<float>(i),.8f,.7f); synth.render(block); }
    synth.panic();
    for (int i=0;i<100;++i) synth.render(block);
    monitor_allocations=false;
    require(allocations==0 && deallocations==0,"expression and effects never allocate or free");
    require(peak(block)==0, "panic clears the reverb tail");
    for (double rate : {8000.0,192000.0}) {
        require(synth.prepare(rate), "effect extreme sample rate accepted");
        expressive.values[parameter_index("reverb.mix")]=60; expressive.values[parameter_index("reverb.decay")]=8;
        for (int op=0;op<6;++op) { expressive.op(op,op_filter_type)=3; expressive.op(op,op_filter_resonance)=10; expressive.op(op,op_filter_cutoff)=20000; }
        require(synth.set_patch(expressive), "effect extreme patch accepted");
        for (int note=100;note<116;++note) require(synth.note_on_id(note,note,1,9600), "extreme note bend accepted");
        for (int i=0;i<40;++i) { synth.render(block); for (float sample:block) require(std::isfinite(sample) && std::abs(sample)<=1,"extreme effects finite and bounded"); }
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
    live_routing();
    live_waveforms();
    polyphony_and_extremes();
    allocation_free_audio_path();
    expressive_identity_and_pitch();
    operator_modulation_and_reverb();
    c_abi_bounds();
    std::cout << "Passed " << checks << " assertions across tuning, envelopes, validation, routing, polyphony, allocation, and ABI tests.\n";
}
