#pragma once

namespace agent_synth {

class Envelope {
public:
    void start(float attack_seconds, double sample_rate, float delay_seconds = 0, float hold_seconds = 0) noexcept;
    void release(float seconds, double sample_rate, bool force = false) noexcept;
    float next(float decay_seconds, float sustain, double sample_rate) noexcept;
    [[nodiscard]] bool active() const noexcept { return stage_ != Stage::idle; }

private:
    enum class Stage { idle, delay, attack, hold, decay, sustain, release };
    Stage stage_ = Stage::idle;
    float value_ = 0.0f;
    int remaining_ = 0;
    int attack_duration_ = 1;
    int hold_duration_ = 0;
};

} // namespace agent_synth
