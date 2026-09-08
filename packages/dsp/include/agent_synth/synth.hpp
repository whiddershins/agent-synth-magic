#pragma once
#include <agent_synth/envelope.hpp>
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
enum OperatorParameter { ratio, detune, level, attack, decay, sustain, release };
constexpr int operator_index(int op, OperatorParameter parameter) noexcept {
    return global_parameter_count + op * operator_parameter_count + parameter;
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
    void panic() noexcept;
    void render(std::span<float> output) noexcept;
    [[nodiscard]] int active_voices() const noexcept;
    [[nodiscard]] double sample_rate() const noexcept { return sample_rate_; }

private:
    static constexpr int sine_size = 4096;
    static constexpr int filter_size = 127;
    struct OperatorState {
        double phase = 0.0;
        float previous = 0.0f;
        Envelope envelope;
    };
    struct Voice {
        std::array<OperatorState, operator_count> operators{};
        int note = -1;
        int algorithm = 0;
        float velocity = 0.0f;
        double frequency = 0.0;
        std::uint64_t age = 0;
        bool held = false;
        float previous = 0.0f;
        float tail = 0.0f;
        int tail_remaining = 0;
    };
    struct SmoothState {
        std::array<double, operator_count> multipliers{};
        std::array<float, operator_count> levels{};
        std::array<float, operator_count> sustains{};
        float gain = 0.0f;
        float feedback = 0.0f;
    };

    [[nodiscard]] float sine(double cycles) const noexcept;
    [[nodiscard]] float render_voice(Voice& voice) noexcept;
    [[nodiscard]] bool active(const Voice& voice) const noexcept;
    void update_targets() noexcept;
    void smooth() noexcept;

    double sample_rate_ = 48000.0;
    double internal_rate_ = 192000.0;
    float smoothing_ = 0.0f;
    int fade_samples_ = 576;
    std::uint64_t age_ = 0;
    Patch patch_ = Patch::initial();
    SmoothState current_{};
    SmoothState target_{};
    std::array<Voice, voice_count> voices_{};
    std::array<float, sine_size + 1> sine_table_{};
    std::array<float, filter_size> filter_{};
    std::array<float, filter_size> history_{};
    int history_position_ = 0;
};

} // namespace agent_synth
