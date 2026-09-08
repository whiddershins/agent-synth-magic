#pragma once
#include <algorithm>
#include <array>
#include <cmath>
#include <numbers>

namespace agent_synth {
struct FilterCoefficients {
    double g = 0, k = 1, a1 = 1;
    std::array<float, 4> mix{1, 0, 0, 0};
    void configure(double cutoff, double resonance, double rate) noexcept {
        g = std::tan(std::numbers::pi * std::clamp(cutoff, 20.0, rate * 0.1125) / rate);
        k = 1 / resonance; a1 = 1 / (1 + g * (g + k));
    }
};
struct FilterState {
    double ic1 = 0, ic2 = 0;
    float next(float input, const FilterCoefficients& c) noexcept {
        if (c.mix[0] == 1) { ic1 = ic2 = 0; return input; }
        const double band = c.a1 * (ic1 + c.g * (input - ic2));
        const double low = ic2 + c.g * band;
        ic1 = 2 * band - ic1; ic2 = 2 * low - ic2;
        if (std::abs(ic1) < 1e-20) ic1 = 0;
        if (std::abs(ic2) < 1e-20) ic2 = 0;
        const double high = input - c.k * band - low;
        return static_cast<float>(c.mix[0]*input + c.mix[1]*low + c.mix[2]*high + c.mix[3]*band);
    }
};

// Four damped feedback combs followed by two allpasses. Storage is fixed even
// at 192 kHz; prepare computes delay lengths outside playback.
class Reverb {
    struct Comb { std::array<float, 9000> data{}; int length = 1, position = 0; float damped = 0; };
    struct Allpass { std::array<float, 2048> data{}; int length = 1, position = 0; };
    std::array<Comb, 4> combs_{};
    std::array<Allpass, 2> allpasses_{};
    double rate_ = 48000;
    bool empty_ = true;
public:
    [[nodiscard]] bool active() const noexcept { return !empty_; }
    void clear() noexcept {
        for (auto& c : combs_) { c.data.fill(0); c.position = 0; c.damped = 0; }
        for (auto& a : allpasses_) { a.data.fill(0); a.position = 0; }
        empty_ = true;
    }
    void prepare(double rate) noexcept {
        rate_ = rate;
        constexpr std::array<double,4> times{.0297, .0371, .0411, .0437};
        for (int i=0; i<4; ++i) combs_[i].length = static_cast<int>(times[i]*rate) | 1;
        allpasses_[0].length = static_cast<int>(.005*rate) | 1;
        allpasses_[1].length = static_cast<int>(.0017*rate) | 1;
        clear();
    }
    float next(float input, float mix, float decay, float damping) noexcept {
        if (mix < 1e-6f) { if (!empty_) clear(); return input; }
        empty_ = false;
        float wet = 0;
        for (auto& c : combs_) {
            const float delayed = c.data[c.position];
            c.damped = delayed * (1-damping) + c.damped*damping;
            if (std::abs(c.damped) < 1e-20f) c.damped = 0;
            const float feedback = static_cast<float>(std::pow(.001, c.length/(rate_*decay)));
            c.data[c.position] = input*.25f + c.damped*feedback;
            c.position = (c.position+1)%c.length; wet += delayed;
        }
        for (auto& a : allpasses_) {
            const float delayed = a.data[a.position];
            const float output = delayed - .5f*wet;
            a.data[a.position] = wet + .5f*output;
            a.position = (a.position+1)%a.length; wet = output;
        }
        return input*(1-mix) + wet*mix;
    }
};
} // namespace agent_synth
