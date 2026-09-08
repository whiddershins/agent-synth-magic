import { initialPatch, validatePatch } from './patch';
import type { Patch } from './patch';
import type { ParameterId } from './parameters.generated';

function preset(name: string, algorithm: number, operators: number[][], feedback = 0): Patch {
  const patch = initialPatch();
  patch.name = name;
  patch.parameters.algorithm = algorithm;
  patch.parameters.feedback = feedback;
  const fields = ['ratio', 'level', 'attack', 'decay', 'sustain', 'release'] as const;
  operators.forEach((values, index) => fields.forEach((field, column) => {
    patch.parameters[`op${index + 1}.${field}` as ParameterId] = values[column]!;
  }));
  return validatePatch(patch);
}
function variation(name: string, changes: Partial<Patch['parameters']>): Patch {
  const patch = initialPatch();
  patch.name = name;
  Object.assign(patch.parameters, changes);
  return validatePatch(patch);
}

export const presets: readonly Patch[] = [
  preset('Glass garden', 0, [
    [1, .9, .004, 1.4, .08, 1.2], [3.5, .31, .002, .45, .015, .4],
    [2, .35, .006, 1.1, .04, 1.4], [7, .14, .003, .3, .01, .35],
    [1, .18, .003, 1.8, .02, 1.8], [11, .09, .001, .16, 0, .25],
  ], .13),
  preset('Soft electric', 0, [
    [1, .9, .006, 1.2, .16, .4], [1, .22, .003, .45, .025, .24],
    [1, .65, .008, 1.8, .1, .5], [3, .12, .004, .65, .02, .25],
    [2, .16, .002, .25, 0, .18], [14, .06, .001, .12, 0, .1],
  ]),
  preset('Rubber bass', 3, [
    [.5, .85, .003, .6, .6, .15], [1, .29, .002, .22, .07, .1], [2, .1, .001, .12, 0, .05],
    [1, .55, .004, .5, .3, .12], [2, .15, .001, .17, .01, .08], [1, .11, .001, .1, 0, .06],
  ], .2),
  preset('Slow orbit', 2, [
    [1, .65, .85, 1.5, .72, 2.3], [1, .18, 1.2, 2, .4, 1.5], [2, .07, 2, 2.5, .65, 2],
    [3, .08, .7, 1.6, .25, 2.2], [4.01, .04, 2.2, 2.4, .3, 2], [1.005, .13, 1.4, 2, .45, 2.4],
  ], .25),
  preset('Copper wire', 1, [
    [1, .8, .008, .7, .25, .6], [2, .3, .003, .45, .1, .35], [3, .2, .005, .3, .12, .35],
    [1, .12, .002, .5, .08, .2], [5, .1, .004, .26, .02, .2], [7, .1, .001, .18, 0, .1],
  ], .6),
  initialPatch(),
  variation('Breath & wood', {
    algorithm: 3, gain: .38, 'op1.level': .8, 'op1.attack': .06, 'op1.sustain': .8, 'op1.release': .16,
    'op4.waveform': 4, 'op4.level': .12, 'op4.attack': .04, 'op4.sustain': .7, 'op4.release': .14,
    'filter.type': 1, 'filter.cutoff': 5800,
  }),
  variation('Falling drum', {
    algorithm: 2, gain: .5, 'op1.ratio': .5, 'op1.level': .9, 'op1.attack': .001, 'op1.decay': .7,
    'op1.sustain': 0, 'op1.release': .24, 'op2.waveform': 4, 'op2.level': .07, 'op2.attack': .001,
    'op2.decay': .035, 'op2.sustain': 0, 'pitch.amount': 24, 'pitch.decay': .075,
    'filter.type': 1, 'filter.cutoff': 4200,
  }),
  variation('Warm saw', {
    'op1.waveform': 2, 'op1.level': .65, 'op1.attack': .035, 'op1.sustain': .7,
    'op3.waveform': 2, 'op3.level': .6, 'op3.detune': 7, 'op3.attack': .035, 'op3.sustain': .7,
    'op5.waveform': 1, 'op5.level': .22, 'op5.ratio': .5, 'op5.hold': .08, 'op5.sustain': .7,
    'filter.type': 1, 'filter.cutoff': 1800, 'filter.resonance': 1.2,
  }),
];
