#pragma once

#ifdef __cplusplus
extern "C" {
#endif

// WebAssembly ABI v1: one independent Synth per module instance.
// All functions are synchronous and must be called from the same owning thread.
int synth_schema_version(void);
int synth_parameter_count(void);
int synth_capacity(void);
int synth_init(double sample_rate);
float* synth_patch_buffer(void);
int synth_apply_patch(void);
int synth_note_on(int note, float velocity);
void synth_note_off(int note);
void synth_panic(void);
int synth_render(int frames);
float* synth_output_buffer(void);
int synth_active_voices(void);

#ifdef __cplusplus
}
#endif
