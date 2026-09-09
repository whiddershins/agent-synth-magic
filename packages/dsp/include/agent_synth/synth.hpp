#pragma once
#include <agent_synth/envelope.hpp>
#include <agent_synth/effects.hpp>
#include <agent_synth/parameters.generated.hpp>
#include <array>
#include <cstddef>
#include <cstdint>
#include <span>

namespace agent_synth {

inline constexpr int operator_count = 6;
inline constexpr int voice_count = 16;
inline constexpr int oversampling = 4;
inline constexpr int global_parameter_count = 3;
inline constexpr int operator_parameter_count = 7;
enum OperatorParameter { ratio, detune, level, attack, decay, sustain, release, waveform, delay, hold, op_pitch_enabled, op_pitch_amount, op_pitch_delay, op_pitch_attack, op_pitch_hold, op_pitch_decay, op_pitch_sustain, op_pitch_release, op_filter_type, op_filter_cutoff, op_filter_resonance };
constexpr int operator_index(int op, OperatorParameter parameter) noexcept {
    return parameter <= release ? global_parameter_count + op * operator_parameter_count + parameter
        : parameter <= hold ? extension_operator_offset + op * extension_operator_parameter_count + (parameter - waveform)
        : expressive_operator_offset + op * expressive_operator_parameter_count + (parameter - op_pitch_enabled);
}

struct Patch {
    std::array<float, parameter_count> values{};
    [[nodiscard]] static Patch initial() noexcept;
    [[nodiscard]] bool valid() const noexcept;
    float& op(int index, OperatorParameter parameter) noexcept { return values[operator_index(index, parameter)]; }
    [[nodiscard]] float op(int index, OperatorParameter parameter) const noexcept { return values[operator_index(index, parameter)]; }
};

// One owning audio thread per Synth. Publish validated patches at block boundaries.
// Construction/prepare may do setup work; render and note events never allocate.
class Synth {
public:
    Synth() noexcept;
    [[nodiscard]] bool prepare(double sample_rate) noexcept;
    [[nodiscard]] bool set_patch(const Patch& patch) noexcept;
    [[nodiscard]] const Patch& patch() const noexcept { return patch_; }
    [[nodiscard]] bool note_on(int note, float velocity) noexcept;
    void note_off(int note) noexcept;
    [[nodiscard]] bool note_on_id(int id, int note, float velocity, float cents = 0) noexcept;
    void note_off_id(int id) noexcept;
    [[nodiscard]] bool expression(int id, float cents, float pressure, float timbre) noexcept;
    void panic() noexcept;
    void render(std::span<float> output) noexcept;
    [[nodiscard]] int active_voices() const noexcept;
    [[nodiscard]] double sample_rate() const noexcept { return sample_rate_; }

private:
    static constexpr int sine_size = 4096;
    static constexpr int filter_size = 127;
    struct OscillatorState {
        double phase = 0.0;
        float previous = 0.0f;
        FilterState filter;
        int waveform = 0;
        int next_waveform = 0;
        int waveform_remaining = 0;
        std::uint32_t noise = 1;
    };
    struct OperatorState {
        Envelope envelope;
        Envelope pitch_envelope;
        float pitch_amount = 0;
        double pitch_multiplier = 1;
    };
    struct Voice {
        std::array<OperatorState, operator_count> operators{};
        int note = -1;
        int id = -1;
        float cents = 0, target_cents = 0;
        float pressure = 1, target_pressure = 1;
        float timbre = .5f, target_timbre = .5f;
        std::array<OscillatorState, operator_count> oscillators{};
        std::array<OscillatorState, operator_count> next_oscillators{};
        int algorithm = 0;
        int next_algorithm = 0;
        int routing_remaining = 0;
        float velocity = 0.0f;
        double frequency = 0.0;
        std::uint64_t age = 0;
        bool held = false;
        float previous = 0.0f;
        float tail = 0.0f;
        int tail_remaining = 0;
        Envelope pitch_envelope;
        float pitch_amount = 0;
        double pitch_multiplier = 1;
    };
    struct SmoothState {
        std::array<double, operator_count> multipliers{};
        std::array<float, operator_count> levels{};
        std::array<float, operator_count> sustains{};
        std::array<float, operator_count> cutoffs{};
        std::array<float, operator_count> resonances{};
        std::array<std::array<float,4>, operator_count> filter_mixes{};
        std::array<float,4> lfo_amounts{};
        float reverb_mix = 0, reverb_decay = 1.8f, reverb_damping = .45f;
        float lfo_rate = 2;
        float gain = 0.0f;
        float feedback = 0.0f;
        float cutoff = 12000;
        float resonance = 0.707f;
        std::array<float, 4> filter_mix{1, 0, 0, 0};
    };

    [[nodiscard]] float sine(double cycles) const noexcept;
    [[nodiscard]] float oscillator(OscillatorState& op, double cycles, double increment, int target_waveform) const noexcept;
    [[nodiscard]] float waveform_sample(OscillatorState& op, int shape, double cycles, double increment) const noexcept;
    void modulation() noexcept;
    [[nodiscard]] float render_voice(Voice& voice) noexcept;
    [[nodiscard]] float render_routing(const Voice& voice, int algorithm,
        std::array<OscillatorState, operator_count>& oscillators,
        const std::array<float, operator_count>& envelopes) const noexcept;
    void start_routing(Voice& voice) noexcept;
    [[nodiscard]] bool active(const Voice& voice) const noexcept;
    void update_targets() noexcept;
    void smooth() noexcept;

    double sample_rate_ = 48000.0;
    double internal_rate_ = 192000.0;
    float smoothing_ = 0.0f;
    int fade_samples_ = 576;
    int routing_samples_ = 5760;
    std::uint64_t age_ = 0;
    Patch patch_ = Patch::initial();
    SmoothState current_{};
    SmoothState target_{};
    std::array<Voice, voice_count> voices_{};
    std::array<float, sine_size + 1> sine_table_{};
    std::array<float, filter_size> filter_{};
    std::array<float, filter_size> history_{};
    int history_position_ = 0;
    FilterState output_filter_;
    FilterCoefficients output_coefficients_;
    std::array<FilterCoefficients, operator_count> operator_coefficients_{};
    Reverb reverb_;
    bool reverb_muted_ = false;
    double lfo_phase_ = 0;
    std::uint32_t lfo_random_ = 0x12345678;
    float lfo_hold_ = 0;
    std::array<float, 22> modulation_{};
    std::array<double, operator_count> lfo_pitch_{};
    float modulated_gain_ = 0;
};

} // namespace agent_synth
