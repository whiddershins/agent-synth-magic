#include <agent_synth/envelope.hpp>
#include <algorithm>

namespace agent_synth {
namespace {
int duration(float seconds, double sample_rate) noexcept {
    return std::max(1, static_cast<int>(seconds * sample_rate));
}
}

void Envelope::start(float seconds, double sample_rate, float delay_seconds, float hold_seconds) noexcept {
    value_ = 0.0f;
    attack_duration_ = duration(seconds, sample_rate);
    hold_duration_ = hold_seconds > 0 ? duration(hold_seconds, sample_rate) : 0;
    remaining_ = delay_seconds > 0 ? duration(delay_seconds, sample_rate) : attack_duration_;
    stage_ = delay_seconds > 0 ? Stage::delay : Stage::attack;
}

void Envelope::release(float seconds, double sample_rate, bool force) noexcept {
    if (stage_ == Stage::idle || (stage_ == Stage::release && !force)) return;
    remaining_ = duration(seconds, sample_rate);
    stage_ = Stage::release;
}

float Envelope::next(float decay_seconds, float sustain, double sample_rate) noexcept {
    switch (stage_) {
    case Stage::idle: return 0.0f;
    case Stage::delay:
        if (--remaining_ == 0) { stage_ = Stage::attack; remaining_ = attack_duration_; }
        break;
    case Stage::sustain: value_ = sustain; break;
    case Stage::attack:
        value_ += (1.0f - value_) / static_cast<float>(remaining_);
        if (--remaining_ == 0) {
            value_ = 1.0f;
            stage_ = hold_duration_ > 0 ? Stage::hold : Stage::decay;
            remaining_ = hold_duration_ > 0 ? hold_duration_ : duration(decay_seconds, sample_rate);
        }
        break;
    case Stage::hold:
        if (--remaining_ == 0) { stage_ = Stage::decay; remaining_ = duration(decay_seconds, sample_rate); }
        break;
    case Stage::decay:
        value_ += (sustain - value_) / static_cast<float>(remaining_);
        if (--remaining_ == 0) stage_ = Stage::sustain;
        break;
    case Stage::release:
        value_ -= value_ / static_cast<float>(remaining_);
        if (--remaining_ == 0) {
            value_ = 0.0f;
            stage_ = Stage::idle;
        }
        break;
    }
    return value_;
}

} // namespace agent_synth
