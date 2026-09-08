include(GNUInstallDirs)
include(CMakePackageConfigHelpers)

add_library(agent_synth STATIC src/synth.cpp src/envelope.cpp)
add_library(AgentSynth::dsp ALIAS agent_synth)
set_target_properties(agent_synth PROPERTIES EXPORT_NAME dsp POSITION_INDEPENDENT_CODE ON)
target_compile_features(agent_synth PUBLIC cxx_std_20)
target_include_directories(agent_synth PUBLIC
    $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>
    $<INSTALL_INTERFACE:${CMAKE_INSTALL_INCLUDEDIR}>)
target_compile_options(agent_synth PRIVATE -Wall -Wextra -Wpedantic -Werror -fno-exceptions -fno-rtti)

if(AGENT_SYNTH_SANITIZE AND NOT EMSCRIPTEN)
    target_compile_options(agent_synth PUBLIC -fsanitize=address,undefined -fno-omit-frame-pointer)
    target_link_options(agent_synth PUBLIC -fsanitize=address,undefined)
endif()

if(EMSCRIPTEN)
    add_executable(agent_synth_wasm src/c_api.cpp)
    target_link_libraries(agent_synth_wasm PRIVATE agent_synth)
    set_target_properties(agent_synth_wasm PROPERTIES OUTPUT_NAME agent-synth SUFFIX .wasm)
    target_link_options(agent_synth_wasm PRIVATE
        --no-entry -sSTANDALONE_WASM=1 -sFILESYSTEM=0 -sALLOW_MEMORY_GROWTH=0
        -sINITIAL_MEMORY=16777216 -sSTACK_SIZE=65536 -sMALLOC=none
        -sERROR_ON_UNDEFINED_SYMBOLS=1)
else()
    add_executable(synth_render src/render_cli.cpp)
    target_link_libraries(synth_render PRIVATE agent_synth)
    if(AGENT_SYNTH_BUILD_TESTS)
        add_executable(synth_tests tests/synth_tests.cpp src/c_api.cpp)
        target_link_libraries(synth_tests PRIVATE agent_synth)
        target_compile_options(synth_tests PRIVATE -Wall -Wextra -Wpedantic -Werror)
        add_test(NAME synth_behavior COMMAND synth_tests)
    endif()
endif()

install(TARGETS agent_synth EXPORT AgentSynthTargets ARCHIVE DESTINATION ${CMAKE_INSTALL_LIBDIR})
install(DIRECTORY include/ DESTINATION ${CMAKE_INSTALL_INCLUDEDIR})
install(EXPORT AgentSynthTargets NAMESPACE AgentSynth:: DESTINATION ${CMAKE_INSTALL_LIBDIR}/cmake/AgentSynth)
configure_package_config_file(cmake/AgentSynthConfig.cmake.in
    ${CMAKE_CURRENT_BINARY_DIR}/AgentSynthConfig.cmake
    INSTALL_DESTINATION ${CMAKE_INSTALL_LIBDIR}/cmake/AgentSynth)
write_basic_package_version_file(${CMAKE_CURRENT_BINARY_DIR}/AgentSynthConfigVersion.cmake
    VERSION ${PROJECT_VERSION} COMPATIBILITY SameMajorVersion)
install(FILES ${CMAKE_CURRENT_BINARY_DIR}/AgentSynthConfig.cmake
    ${CMAKE_CURRENT_BINARY_DIR}/AgentSynthConfigVersion.cmake
    DESTINATION ${CMAKE_INSTALL_LIBDIR}/cmake/AgentSynth)
