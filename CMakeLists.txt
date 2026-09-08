cmake_minimum_required(VERSION 3.24)
project(AgentSynth VERSION 0.4.0 LANGUAGES CXX)

option(AGENT_SYNTH_BUILD_TESTS "Build native DSP tests" ON)
option(AGENT_SYNTH_SANITIZE "Enable address and undefined behavior sanitizers" OFF)

if(AGENT_SYNTH_BUILD_TESTS AND NOT EMSCRIPTEN)
    enable_testing()
endif()
add_subdirectory(packages/dsp)
