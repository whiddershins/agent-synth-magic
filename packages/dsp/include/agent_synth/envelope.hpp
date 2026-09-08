#pragma once

namespace agent_synth {

class Envelope {
public:
    void start(float attack_seconds, double sample_rate) noexcept;
    void release(float seconds, double sample_rate, bool force = false) noexcept;
    float next(float decay_seconds, float sustain, double sample_rate) noexcept;
    [[nodiscard]] bool active() const noexcept { return stage_ != Stage::idle; }

private:
    enum class Stage { idle, attack, decay, sustain, release };
    Stage stage_ = Stage::idle;
    float value_ = 0.0f;
    int remaining_ = 0;
};

} // namespace agent_synth
