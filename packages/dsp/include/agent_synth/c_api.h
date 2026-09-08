#pragma once

#ifdef __cplusplus
extern "C" {
#endif

// WebAssembly ABI v3: one independent Synth per module instance.
// All functions are synchronous and must be called from the same owning thread.
int synth_schema_version(void);
int synth_parameter_count(void);
int synth_capacity(void);
int synth_init(double sample_rate);
float* synth_patch_buffer(void);
int synth_apply_patch(void);
int synth_note_on(int note, float velocity);
void synth_note_off(int note);
int synth_note_on_id(int id, int note, float velocity, float cents);
void synth_note_off_id(int id);
int synth_expression(int id, float cents, float pressure, float timbre);
void synth_panic(void);
int synth_render(int frames);
float* synth_output_buffer(void);
int synth_active_voices(void);

#ifdef __cplusplus
}
#endif
