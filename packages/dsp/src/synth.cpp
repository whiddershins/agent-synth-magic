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
    routing_samples_ = static_cast<int>(internal_rate_ * 0.03);
    age_ = 0;
    voices_ = {};
    history_ = {};
    history_position_ = 0;
    output_filter_ = {};
    reverb_.prepare(sample_rate);
    reverb_muted_ = false;
    lfo_phase_ = 0; lfo_random_ = 0x12345678; lfo_hold_ = 0;
    update_targets();
    current_ = target_;
    return true;
}

bool Synth::set_patch(const Patch& patch) noexcept {
    if (!patch.valid()) return false;
    patch_ = patch;
    update_targets();
    for (auto& voice : voices_) if (active(voice) && voice.routing_remaining == 0) start_routing(voice);
    if (active_voices() == 0 && !reverb_.active()) current_ = target_;
    return true;
}

void Synth::update_targets() noexcept {
    target_.lfo_rate = patch_.values[parameter_index("lfo.rate")];
    target_.reverb_mix = patch_.values[parameter_index("reverb.mix")] / 100;
    target_.reverb_decay = patch_.values[parameter_index("reverb.decay")];
    target_.reverb_damping = patch_.values[parameter_index("reverb.damping")] / 100;
    for (int r=0; r<4; ++r) target_.lfo_amounts[r] = patch_.values[parameter_index("lfo.route1.amount")+2*r] / 100;
    target_.gain = patch_.values[1];
    target_.feedback = patch_.values[2];
    target_.cutoff = patch_.values[filter_cutoff];
    target_.resonance = patch_.values[filter_resonance];
    target_.filter_mix.fill(0);
    target_.filter_mix[static_cast<int>(patch_.values[filter_type])] = 1;
    for (int i = 0; i < operator_count; ++i) {
        target_.cutoffs[i] = patch_.op(i, op_filter_cutoff);
        target_.resonances[i] = patch_.op(i, op_filter_resonance);
        target_.filter_mixes[i].fill(0);
        target_.filter_mixes[i][static_cast<int>(patch_.op(i, op_filter_type))] = 1;
        target_.multipliers[i] = patch_.op(i, ratio) * std::exp2(patch_.op(i, detune) / 1200.0);
        target_.levels[i] = patch_.op(i, level);
        target_.sustains[i] = patch_.op(i, sustain);
    }
}

void Synth::smooth() noexcept {
    current_.lfo_rate += smoothing_ * (target_.lfo_rate-current_.lfo_rate);
    current_.reverb_mix += smoothing_ * (target_.reverb_mix-current_.reverb_mix);
    current_.reverb_decay += smoothing_ * (target_.reverb_decay-current_.reverb_decay);
    current_.reverb_damping += smoothing_ * (target_.reverb_damping-current_.reverb_damping);
    for (int r=0; r<4; ++r) current_.lfo_amounts[r] += smoothing_*(target_.lfo_amounts[r]-current_.lfo_amounts[r]);
    current_.gain += smoothing_ * (target_.gain - current_.gain);
    current_.feedback += smoothing_ * (target_.feedback - current_.feedback);
    current_.cutoff += smoothing_ * (target_.cutoff - current_.cutoff);
    current_.resonance += smoothing_ * (target_.resonance - current_.resonance);
    for (int i = 0; i < 4; ++i) {
        current_.filter_mix[i] += smoothing_ * (target_.filter_mix[i] - current_.filter_mix[i]);
        if (std::abs(current_.filter_mix[i] - target_.filter_mix[i]) < 1e-6f) current_.filter_mix[i] = target_.filter_mix[i];
    }
    for (int i = 0; i < operator_count; ++i) {
        current_.cutoffs[i] += smoothing_*(target_.cutoffs[i]-current_.cutoffs[i]);
        current_.resonances[i] += smoothing_*(target_.resonances[i]-current_.resonances[i]);
        for (int mode=0; mode<4; ++mode) {
            auto& mix = current_.filter_mixes[i][mode];
            mix += smoothing_*(target_.filter_mixes[i][mode]-mix);
            if (std::abs(mix-target_.filter_mixes[i][mode]) < 1e-6f) mix=target_.filter_mixes[i][mode];
        }
        current_.multipliers[i] += smoothing_ * (target_.multipliers[i] - current_.multipliers[i]);
        current_.levels[i] += smoothing_ * (target_.levels[i] - current_.levels[i]);
        current_.sustains[i] += smoothing_ * (target_.sustains[i] - current_.sustains[i]);
    }
}

bool Synth::active(const Voice& voice) const noexcept {
    if (voice.note < 0) return false;
    if (voice.tail_remaining > 0) return true;
    const auto mask = routings[voice.algorithm].carriers |
        (voice.routing_remaining > 0 ? routings[voice.next_algorithm].carriers : 0);
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

bool Synth::note_on(int note, float velocity) noexcept { return note_on_id(note, note, velocity); }

bool Synth::note_on_id(int id, int note, float velocity, float cents) noexcept {
    if (id < 0 || !std::isfinite(cents) || std::abs(cents)>14400 || note < 0 || note > 127 || !std::isfinite(velocity) || velocity < 0 || velocity > 1) return false;
    if (velocity == 0) { note_off_id(id); return true; }
    reverb_muted_ = false;
    Voice* selected = nullptr;
    // Note identity, rather than pitch, owns a voice. Legacy events use the note as ID.
    for (auto& voice : voices_) if (voice.id == id && voice.held) { selected = &voice; break; }
    if (!selected) for (auto& voice : voices_) if (!active(voice)) { selected = &voice; break; }
    if (!selected) {
        selected = &voices_[0];
        for (auto& voice : voices_) if (voice.age < selected->age) selected = &voice;
    }
    const float tail = active(*selected) ? selected->previous : 0.0f;
    *selected = {};
    selected->note = note;
    selected->id = id;
    selected->cents = selected->target_cents = cents;
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
        op.pitch_amount = patch_.op(i, op_pitch_enabled) ? patch_.op(i, op_pitch_amount) : 0;
        op.pitch_envelope.start(patch_.op(i, op_pitch_attack), sample_rate_, patch_.op(i, op_pitch_delay), patch_.op(i, op_pitch_hold));
        op.envelope.start(patch_.op(i, attack), internal_rate_, patch_.op(i, delay), patch_.op(i, hold));
        auto& oscillator = selected->oscillators[i];
        oscillator.waveform = static_cast<int>(patch_.op(i, waveform));
        oscillator.noise = 0x9e3779b9u ^ (static_cast<std::uint32_t>(note + 1) * 0x85ebca6bu)
            ^ (static_cast<std::uint32_t>(i + 1) * 0xc2b2ae35u) ^ static_cast<std::uint32_t>(age_);
        if (oscillator.noise == 0) oscillator.noise = 1;
    }
    return true;
}

void Synth::note_off(int note) noexcept { note_off_id(note); }

bool Synth::expression(int id, float cents, float pressure, float timbre) noexcept {
    if (id < 0 || !std::isfinite(cents) || std::abs(cents)>14400 || !std::isfinite(pressure) || pressure<0 || pressure>1 || !std::isfinite(timbre) || timbre<0 || timbre>1) return false;
    for (auto& voice : voices_) if (voice.id == id && active(voice)) {
        voice.target_cents = cents; voice.target_pressure = pressure; voice.target_timbre = timbre;
    }
    return true;
}

void Synth::note_off_id(int id) noexcept {
    for (auto& voice : voices_) {
        if (voice.id != id || !voice.held) continue;
        voice.held = false;
        voice.pitch_envelope.release(patch_.values[pitch_release], sample_rate_);
        for (int i = 0; i < operator_count; ++i) {
            voice.operators[i].envelope.release(patch_.op(i, release), internal_rate_);
            voice.operators[i].pitch_envelope.release(patch_.op(i, op_pitch_release), sample_rate_);
        }
    }
}

void Synth::panic() noexcept {
    reverb_.clear();
    reverb_muted_ = true;
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

float Synth::oscillator(OscillatorState& op, double cycles, double increment, int target_waveform) const noexcept {
    if (op.waveform_remaining == 0 && target_waveform != op.waveform) {
        op.next_waveform = target_waveform;
        op.waveform_remaining = routing_samples_;
    }
    const float source = waveform_sample(op, op.waveform, cycles, increment);
    if (op.waveform_remaining == 0) return source;
    // Both shapes see the same modulated phase, before the operator filter/FM edges.
    // Only one of the two distinct shapes can be noise, so its PRNG advances once.
    const float destination = waveform_sample(op, op.next_waveform, cycles, increment);
    const float mix = static_cast<float>(routing_samples_ - op.waveform_remaining) / (routing_samples_ - 1);
    if (--op.waveform_remaining == 0) op.waveform = op.next_waveform;
    return source * (1 - mix) + destination * mix;
}

float Synth::waveform_sample(OscillatorState& op, int shape, double cycles, double increment) const noexcept {
    if (shape == 0) return sine(cycles);
    if (shape == 4) {
        op.noise ^= op.noise << 13; op.noise ^= op.noise >> 17; op.noise ^= op.noise << 5;
        return static_cast<float>(op.noise >> 8) / 8388608.0f - 1.0f;
    }
    const double phase = cycles - std::floor(cycles);
    const double step = std::clamp(increment, 1e-8, 0.49);
    if (shape == 1) return static_cast<float>(1 - 4 * std::abs(phase - 0.5));
    if (shape == 2) return static_cast<float>(2 * phase - 1 - poly_blep(phase, step));
    const double shifted = phase < 0.5 ? phase + 0.5 : phase - 0.5;
    return static_cast<float>((phase < 0.5 ? 1 : -1) + poly_blep(phase, step) - poly_blep(shifted, step));
}

void Synth::modulation() noexcept {
    const int shape = static_cast<int>(patch_.values[parameter_index("lfo.waveform")]);
    float wave = sine(lfo_phase_);
    if (shape==1) wave=static_cast<float>(1-4*std::abs(lfo_phase_-.5));
    if (shape==2) wave=static_cast<float>(2*lfo_phase_-1);
    if (shape==3) wave=lfo_phase_<.5 ? 1 : -1;
    if (shape==4) wave=lfo_hold_;
    lfo_phase_ += current_.lfo_rate/sample_rate_;
    if (lfo_phase_ >= 1) {
        lfo_phase_ -= 1;
        lfo_random_ ^= lfo_random_<<13; lfo_random_ ^= lfo_random_>>17; lfo_random_ ^= lfo_random_<<5;
        lfo_hold_ = static_cast<float>(lfo_random_>>8)/8388608.0f-1;
    }
    modulation_.fill(0);
    for (int r=0; r<4; ++r) {
        const int destination = static_cast<int>(patch_.values[parameter_index("lfo.route1.target")+2*r]);
        modulation_[destination] += wave*current_.lfo_amounts[r];
    }
    for (auto& amount : modulation_) amount=std::clamp(amount,-1.0f,1.0f);
    modulated_gain_ = current_.gain*std::max(0.0f,1+modulation_[2]);
    output_coefficients_.mix = current_.filter_mix;
    if (current_.filter_mix[0]!=1) output_coefficients_.configure(current_.cutoff*std::exp2(modulation_[3]*4), current_.resonance, internal_rate_);
    for (int i=0; i<operator_count; ++i) {
        lfo_pitch_[i]=std::exp2(modulation_[1]+modulation_[4+3*i]);
        auto& c=operator_coefficients_[i]; c.mix=current_.filter_mixes[i];
        if (c.mix[0]!=1) c.configure(current_.cutoffs[i]*std::exp2(modulation_[6+3*i]*4),current_.resonances[i],internal_rate_);
    }
}

float Synth::render_routing(const Voice& voice, int algorithm,
    std::array<OscillatorState, operator_count>& oscillators,
    const std::array<float, operator_count>& envelopes) const noexcept {
    const auto& routing = routings[algorithm];
    std::array<float, operator_count> outputs{};
    float mixed = 0;
    for (int i = operator_count - 1; i >= 0; --i) {
        auto& op = oscillators[i];
        float modulation = i == 5 ? current_.feedback * op.previous : 0.0f;
        for (int j = i + 1; j < operator_count; ++j) {
            if (routing.inputs[i] & (1u << j)) modulation += modulation_radians * outputs[j];
        }
        const float envelope = envelopes[i];
        const double increment = voice.frequency * voice.pitch_multiplier * voice.operators[i].pitch_multiplier * lfo_pitch_[i] * current_.multipliers[i] / internal_rate_;
        const bool carrier = routing.carriers & (1u << i);
        const float expression_level = carrier ? 1 : .5f + voice.timbre;
        outputs[i] = op.filter.next(oscillator(op, op.phase + modulation / tau, increment, static_cast<int>(patch_.op(i, waveform))), operator_coefficients_[i])
            * envelope * current_.levels[i] * std::max(0.0f, 1+modulation_[5+3*i]) * expression_level;
        op.previous = outputs[i];
        op.phase += increment;
        op.phase -= std::floor(op.phase);
        if (routing.carriers & (1u << i)) mixed += outputs[i];
    }
    return mixed * voice.velocity * voice.pressure / routing.carrier_count;
}

void Synth::start_routing(Voice& voice) noexcept {
    const int target = static_cast<int>(patch_.values[0]);
    if (target == voice.algorithm) return;
    voice.next_algorithm = target;
    voice.next_oscillators = voice.oscillators;
    // Separate filter and feedback histories evolve from the current signal state.
    voice.routing_remaining = routing_samples_;
}

float Synth::render_voice(Voice& voice) noexcept {
    std::array<float, operator_count> envelopes{};
    for (int i = 0; i < operator_count; ++i) {
        envelopes[i] = voice.operators[i].envelope.next(patch_.op(i, decay), current_.sustains[i], internal_rate_);
    }
    float mixed = render_routing(voice, voice.algorithm, voice.oscillators, envelopes);
    if (voice.routing_remaining > 0) {
        const float next = render_routing(voice, voice.next_algorithm, voice.next_oscillators, envelopes);
        const float blend = static_cast<float>(routing_samples_ - voice.routing_remaining) / (routing_samples_ - 1);
        mixed += blend * (next - mixed);
        if (--voice.routing_remaining == 0) {
            voice.algorithm = voice.next_algorithm;
            voice.oscillators = voice.next_oscillators;
            // Latest requested algorithm is the only pending target; never stack fades.
            start_routing(voice);
        }
    }
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
        modulation();
        for (auto& voice : voices_) if (active(voice)) {
            voice.cents += smoothing_*(voice.target_cents-voice.cents);
            voice.pressure += smoothing_*(voice.target_pressure-voice.pressure);
            voice.timbre += smoothing_*(voice.target_timbre-voice.timbre);
            float pitch = voice.cents/100;
            if (voice.pitch_amount != 0) pitch += voice.pitch_amount*voice.pitch_envelope.next(patch_.values[pitch_decay],patch_.values[pitch_sustain],sample_rate_);
            voice.pitch_multiplier = std::exp2(pitch/12.0);
            for (int i=0; i<operator_count; ++i) {
                auto& op = voice.operators[i];
                if (op.pitch_amount != 0) op.pitch_multiplier = std::exp2(op.pitch_amount*op.pitch_envelope.next(patch_.op(i,op_pitch_decay),patch_.op(i,op_pitch_sustain),sample_rate_)/12.0);
            }
        }
        for (int sub = 0; sub < oversampling; ++sub) {
            float mixed = 0;
            for (auto& voice : voices_) if (active(voice)) mixed += render_voice(voice);
            const float driven = output_filter_.next(mixed, output_coefficients_) * modulated_gain_;
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
        sample = std::clamp(reverb_.next(filtered, reverb_muted_ ? 0 : current_.reverb_mix, current_.reverb_decay, current_.reverb_damping), -1.0f, 1.0f);
    }
}

} // namespace agent_synth
