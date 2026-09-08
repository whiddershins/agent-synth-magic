#include <agent_synth/synth.hpp>
#include <algorithm>
#include <cmath>
#include <numbers>

namespace agent_synth {
namespace {
constexpr double pi = std::numbers::pi;
constexpr double tau = 2.0 * pi;
constexpr float modulation_radians = 8.0f;
constexpr int pitch_amount = parameter_index("pitch.amount");
constexpr int pitch_delay = parameter_index("pitch.delay");
constexpr int pitch_attack = parameter_index("pitch.attack");
constexpr int pitch_hold = parameter_index("pitch.hold");
constexpr int pitch_decay = parameter_index("pitch.decay");
constexpr int pitch_sustain = parameter_index("pitch.sustain");
constexpr int pitch_release = parameter_index("pitch.release");
constexpr int filter_type = parameter_index("filter.type");
constexpr int filter_cutoff = parameter_index("filter.cutoff");
constexpr int filter_resonance = parameter_index("filter.resonance");
double poly_blep(double phase, double step) noexcept {
    if (phase < step) { const double t = phase / step; return t + t - t * t - 1; }
    if (phase > 1 - step) { const double t = (phase - 1) / step; return t * t + t + t + 1; }
    return 0;
}
}

Patch Patch::initial() noexcept {
    Patch result;
    for (int i = 0; i < parameter_count; ++i) result.values[i] = parameter_definitions[i].initial;
    return result;
}

bool Patch::valid() const noexcept {
    for (int i = 0; i < parameter_count; ++i) {
        const auto value = values[i];
        const auto& definition = parameter_definitions[i];
        if (!std::isfinite(value) || value < definition.minimum || value > definition.maximum ||
            (definition.integer && std::floor(value) != value)) return false;
    }
    return true;
}

Synth::Synth() noexcept {
    for (int i = 0; i <= sine_size; ++i) {
        sine_table_[i] = static_cast<float>(std::sin(tau * i / sine_size));
    }
    // Blackman-windowed sinc. Cutoff is 80% of the output Nyquist frequency.
    // FIR delay is 63 internal samples (15.75 output samples at 4x).
    constexpr double cutoff = 0.1;
    double sum = 0;
    for (int i = 0; i < filter_size; ++i) {
        const int offset = i - (filter_size - 1) / 2;
        const double window = 0.42 - 0.5 * std::cos(tau * i / (filter_size - 1))
            + 0.08 * std::cos(2 * tau * i / (filter_size - 1));
        const double sinc = offset == 0 ? 2 * cutoff : std::sin(tau * cutoff * offset) / (pi * offset);
        filter_[i] = static_cast<float>(window * sinc);
        sum += filter_[i];
    }
    for (auto& coefficient : filter_) coefficient = static_cast<float>(coefficient / sum);
    (void)prepare(48000.0);
}

bool Synth::prepare(double sample_rate) noexcept {
    if (!std::isfinite(sample_rate) || sample_rate < 8000 || sample_rate > 192000) return false;
    sample_rate_ = sample_rate;
    internal_rate_ = sample_rate * oversampling;
    smoothing_ = static_cast<float>(1.0 - std::exp(-1.0 / (sample_rate * 0.01)));
    fade_samples_ = static_cast<int>(internal_rate_ * 0.003);
    age_ = 0;
    voices_ = {};
    history_ = {};
    history_position_ = 0;
    filter_ic1_ = filter_ic2_ = 0;
    update_targets();
    current_ = target_;
    return true;
}

bool Synth::set_patch(const Patch& patch) noexcept {
    if (!patch.valid()) return false;
    patch_ = patch;
    update_targets();
    if (active_voices() == 0) current_ = target_;
    return true;
}

void Synth::update_targets() noexcept {
    target_.gain = patch_.values[1];
    target_.feedback = patch_.values[2];
    target_.cutoff = patch_.values[filter_cutoff];
    target_.resonance = patch_.values[filter_resonance];
    target_.filter_mix.fill(0);
    target_.filter_mix[static_cast<int>(patch_.values[filter_type])] = 1;
    for (int i = 0; i < operator_count; ++i) {
        target_.multipliers[i] = patch_.op(i, ratio) * std::exp2(patch_.op(i, detune) / 1200.0);
        target_.levels[i] = patch_.op(i, level);
        target_.sustains[i] = patch_.op(i, sustain);
    }
}

void Synth::smooth() noexcept {
    current_.gain += smoothing_ * (target_.gain - current_.gain);
    current_.feedback += smoothing_ * (target_.feedback - current_.feedback);
    current_.cutoff += smoothing_ * (target_.cutoff - current_.cutoff);
    current_.resonance += smoothing_ * (target_.resonance - current_.resonance);
    for (int i = 0; i < 4; ++i) {
        current_.filter_mix[i] += smoothing_ * (target_.filter_mix[i] - current_.filter_mix[i]);
        if (std::abs(current_.filter_mix[i] - target_.filter_mix[i]) < 1e-6f) current_.filter_mix[i] = target_.filter_mix[i];
    }
    for (int i = 0; i < operator_count; ++i) {
        current_.multipliers[i] += smoothing_ * (target_.multipliers[i] - current_.multipliers[i]);
        current_.levels[i] += smoothing_ * (target_.levels[i] - current_.levels[i]);
        current_.sustains[i] += smoothing_ * (target_.sustains[i] - current_.sustains[i]);
    }
}

bool Synth::active(const Voice& voice) const noexcept {
    if (voice.note < 0) return false;
    if (voice.tail_remaining > 0) return true;
    const auto mask = routings[voice.algorithm].carriers;
    for (int i = 0; i < operator_count; ++i) {
        if ((mask & (1u << i)) && voice.operators[i].envelope.active()) return true;
    }
    return false;
}

int Synth::active_voices() const noexcept {
    int count = 0;
    for (const auto& voice : voices_) if (active(voice)) ++count;
    return count;
}

bool Synth::note_on(int note, float velocity) noexcept {
    if (note < 0 || note > 127 || !std::isfinite(velocity) || velocity < 0 || velocity > 1) return false;
    if (velocity == 0) { note_off(note); return true; }
    Voice* selected = nullptr;
    // A repeated pitch retriggers one voice. The host owns overlapping key sources.
    for (auto& voice : voices_) if (voice.note == note && voice.held) { selected = &voice; break; }
    if (!selected) for (auto& voice : voices_) if (!active(voice)) { selected = &voice; break; }
    if (!selected) {
        selected = &voices_[0];
        for (auto& voice : voices_) if (voice.age < selected->age) selected = &voice;
    }
    const float tail = active(*selected) ? selected->previous : 0.0f;
    *selected = {};
    selected->note = note;
    selected->held = true;
    selected->algorithm = static_cast<int>(patch_.values[0]);
    selected->velocity = velocity;
    selected->frequency = 440.0 * std::exp2((note - 69) / 12.0);
    selected->age = ++age_;
    selected->tail = tail;
    selected->tail_remaining = tail != 0 ? fade_samples_ : 0;
    selected->pitch_amount = patch_.values[pitch_amount];
    selected->pitch_envelope.start(patch_.values[pitch_attack], sample_rate_, patch_.values[pitch_delay], patch_.values[pitch_hold]);
    for (int i = 0; i < operator_count; ++i) {
        auto& op = selected->operators[i];
        op.envelope.start(patch_.op(i, attack), internal_rate_, patch_.op(i, delay), patch_.op(i, hold));
        op.waveform = static_cast<int>(patch_.op(i, waveform));
        op.noise = 0x9e3779b9u ^ (static_cast<std::uint32_t>(note + 1) * 0x85ebca6bu)
            ^ (static_cast<std::uint32_t>(i + 1) * 0xc2b2ae35u) ^ static_cast<std::uint32_t>(age_);
        if (op.noise == 0) op.noise = 1;
    }
    return true;
}

void Synth::note_off(int note) noexcept {
    for (auto& voice : voices_) {
        if (voice.note != note || !voice.held) continue;
        voice.held = false;
        voice.pitch_envelope.release(patch_.values[pitch_release], sample_rate_);
        for (int i = 0; i < operator_count; ++i) voice.operators[i].envelope.release(patch_.op(i, release), internal_rate_);
    }
}

void Synth::panic() noexcept {
    for (auto& voice : voices_) {
        voice.held = false;
        voice.pitch_envelope.release(0.008f, sample_rate_, true);
        for (auto& op : voice.operators) op.envelope.release(0.008f, internal_rate_, true);
    }
}

float Synth::sine(double cycles) const noexcept {
    cycles -= std::floor(cycles);
    const double position = cycles * sine_size;
    const auto index = static_cast<int>(position);
    const float fraction = static_cast<float>(position - index);
    return sine_table_[index] + fraction * (sine_table_[index + 1] - sine_table_[index]);
}

float Synth::oscillator(OperatorState& op, double cycles, double increment) const noexcept {
    if (op.waveform == 0) return sine(cycles);
    if (op.waveform == 4) {
        op.noise ^= op.noise << 13; op.noise ^= op.noise >> 17; op.noise ^= op.noise << 5;
        return static_cast<float>(op.noise >> 8) / 8388608.0f - 1.0f;
    }
    const double phase = cycles - std::floor(cycles);
    const double step = std::clamp(increment, 1e-8, 0.49);
    if (op.waveform == 1) return static_cast<float>(1 - 4 * std::abs(phase - 0.5));
    if (op.waveform == 2) return static_cast<float>(2 * phase - 1 - poly_blep(phase, step));
    const double shifted = phase < 0.5 ? phase + 0.5 : phase - 0.5;
    return static_cast<float>((phase < 0.5 ? 1 : -1) + poly_blep(phase, step) - poly_blep(shifted, step));
}

float Synth::filter_sample(float input) noexcept {
    if (current_.filter_mix[0] == 1) { filter_ic1_ = filter_ic2_ = 0; return input; }
    // Topology-preserving state-variable filter, evaluated at the internal rate.
    const double v3 = input - filter_ic2_;
    const double band = filter_a1_ * (filter_ic1_ + filter_g_ * v3);
    const double low = filter_ic2_ + filter_g_ * band;
    filter_ic1_ = 2 * band - filter_ic1_;
    filter_ic2_ = 2 * low - filter_ic2_;
    if (std::abs(filter_ic1_) < 1e-20) filter_ic1_ = 0;
    if (std::abs(filter_ic2_) < 1e-20) filter_ic2_ = 0;
    const double high = input - filter_k_ * band - low;
    return static_cast<float>(current_.filter_mix[0] * input + current_.filter_mix[1] * low
        + current_.filter_mix[2] * high + current_.filter_mix[3] * band);
}

float Synth::render_voice(Voice& voice) noexcept {
    const auto& routing = routings[voice.algorithm];
    std::array<float, operator_count> outputs{};
    float mixed = 0;
    for (int i = operator_count - 1; i >= 0; --i) {
        auto& op = voice.operators[i];
        float modulation = i == 5 ? current_.feedback * op.previous : 0.0f;
        for (int j = i + 1; j < operator_count; ++j) {
            if (routing.inputs[i] & (1u << j)) modulation += modulation_radians * outputs[j];
        }
        const float envelope = op.envelope.next(patch_.op(i, decay), current_.sustains[i], internal_rate_);
        const double increment = voice.frequency * voice.pitch_multiplier * current_.multipliers[i] / internal_rate_;
        outputs[i] = oscillator(op, op.phase + modulation / tau, increment) * envelope * current_.levels[i];
        op.previous = outputs[i];
        op.phase += increment;
        op.phase -= std::floor(op.phase);
        if (routing.carriers & (1u << i)) mixed += outputs[i];
    }
    mixed *= voice.velocity / routing.carrier_count;
    if (voice.tail_remaining > 0) {
        mixed += voice.tail * static_cast<float>(voice.tail_remaining) / fade_samples_;
        --voice.tail_remaining;
    }
    voice.previous = mixed;
    return mixed;
}

void Synth::render(std::span<float> output) noexcept {
    for (auto& sample : output) {
        smooth();
        if (current_.filter_mix[0] != 1) {
            filter_g_ = std::tan(pi * std::min(static_cast<double>(current_.cutoff), sample_rate_ * 0.45) / internal_rate_);
            filter_k_ = 1.0 / current_.resonance;
            filter_a1_ = 1.0 / (1.0 + filter_g_ * (filter_g_ + filter_k_));
        }
        for (auto& voice : voices_) if (active(voice) && voice.pitch_amount != 0) {
            const float envelope = voice.pitch_envelope.next(patch_.values[pitch_decay], patch_.values[pitch_sustain], sample_rate_);
            voice.pitch_multiplier = std::exp2(voice.pitch_amount * envelope / 12.0);
        }
        for (int sub = 0; sub < oversampling; ++sub) {
            float mixed = 0;
            for (auto& voice : voices_) if (active(voice)) mixed += render_voice(voice);
            const float driven = filter_sample(mixed) * current_.gain;
            // Smooth bounded saturator runs BEFORE downsampling.
            const float shaped = driven / std::sqrt(1.0f + driven * driven);
            history_[history_position_] = shaped;
            history_position_ = (history_position_ + 1) % filter_size;
        }
        float filtered = 0;
        int read = history_position_;
        for (int tap = 0; tap < filter_size; ++tap) {
            read = read == 0 ? filter_size - 1 : read - 1;
            filtered += filter_[tap] * history_[read];
        }
        sample = std::clamp(filtered, -1.0f, 1.0f);
    }
}

} // namespace agent_synth
