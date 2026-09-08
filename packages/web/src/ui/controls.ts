import { definitions } from '../patch';
import type { ParameterDefinition, Patch, PatchStore } from '../patch';
import { instrument } from '../parameters.generated';

export function formatValue(value: number, definition: ParameterDefinition): string {
  if (definition.unit === 'seconds') return value < 1 ? `${Math.round(value * 1000)} ms` : `${value.toFixed(2)} s`;
  if (definition.unit === 'cents') return `${value > 0 ? '+' : ''}${Math.round(value)} ct`;
  if (definition.unit === 'multiple') return `${value.toFixed(2)}×`;
  if (definition.unit === 'radians') return value.toFixed(2);
  return `${Math.round(value * 100)}%`;
}

export function makeControl(definition: ParameterDefinition, store: PatchStore, onError: (message: string) => void): { element: HTMLElement; update(patch: Patch): void } {
  const element = document.createElement('div');
  element.className = 'parameter';
  const context = definition.operator ? `Operator ${definition.operator} ` : '';
  const inputId = `parameter-${definition.id}`;
  element.innerHTML = `<div class="parameter-label"><label for="${inputId}">${definition.label}</label><output></output></div><div class="parameter-input"><input id="${inputId}" type="range" aria-label="${context}${definition.label}" /><input class="number-input" type="number" aria-label="${context}${definition.label} value" /></div>`;
  element.title = definition.description;
  const range = element.querySelector<HTMLInputElement>('input[type=range]')!;
  const number = element.querySelector<HTMLInputElement>('input[type=number]')!;
  const output = element.querySelector('output')!;
  const logarithmic = definition.scale === 'log';
  range.min = logarithmic ? '0' : String(definition.min);
  range.max = logarithmic ? '1' : String(definition.max);
  range.step = logarithmic ? '.001' : String(definition.step);
  number.min = String(definition.min);
  number.max = String(definition.max);
  number.step = String(definition.step);
  const update = (patch: Patch) => {
    const value = patch.parameters[definition.id];
    const normalized = logarithmic ? Math.log(value / definition.min) / Math.log(definition.max / definition.min) : (value - definition.min) / (definition.max - definition.min);
    range.value = logarithmic ? String(normalized) : String(value);
    range.style.setProperty('--fill', `${normalized * 100}%`);
    range.setAttribute('aria-valuetext', formatValue(value, definition));
    number.value = String(Number(value.toFixed(4)));
    output.textContent = formatValue(value, definition);
  };
  const commit = (value: number) => {
    try { store.edit({ [definition.id]: value }); }
    catch (error) { onError((error as Error).message); update(store.read().patch); }
  };
  range.addEventListener('input', () => {
    const value = logarithmic ? definition.min * (definition.max / definition.min) ** Number(range.value) : Number(range.value);
    commit(Math.min(definition.max, Math.max(definition.min, Number(value.toFixed(4)))));
  });
  number.addEventListener('change', () => commit(number.valueAsNumber));
  return { element, update };
}

export function operatorControls(container: HTMLElement, store: PatchStore, onError: (message: string) => void): (patch: Patch) => void {
  const updates: ((patch: Patch) => void)[] = [];
  for (let op = 1; op <= 6; op++) {
    const card = document.createElement('section');
    card.className = 'operator-card';
    card.innerHTML = `<header class="operator-heading"><div><span class="operator-number">0${op}</span><h2>Operator ${op}</h2></div><span class="role"></span></header><div class="tone-controls"></div><div class="envelope-heading"><span>ENVELOPE</span><svg viewBox="0 0 110 22" aria-hidden="true"><path class="envelope-line" /></svg></div><div class="envelope-controls"></div>`;
    for (const definition of definitions.filter((p) => p.operator === op)) {
      const control = makeControl(definition, store, onError);
      const isTone = ['ratio', 'detune', 'level'].some((field) => definition.id.endsWith(`.${field}`));
      card.querySelector(isTone ? '.tone-controls' : '.envelope-controls')!.append(control.element);
      updates.push(control.update);
    }
    const role = card.querySelector('.role')!;
    const path = card.querySelector('.envelope-line')!;
    updates.push((patch) => {
      const algorithm = instrument.algorithms[patch.parameters.algorithm]!;
      const carrier = (algorithm.carriers as readonly number[]).includes(op);
      role.textContent = carrier ? 'CARRIER' : 'MODULATOR';
      card.classList.toggle('carrier', carrier);
      const parameter = (field: string) => patch.parameters[`op${op}.${field}` as keyof Patch['parameters']];
      const a = 4 + 25 * Math.log1p(parameter('attack')) / Math.log(6);
      const d = a + 6 + 25 * Math.log1p(parameter('decay')) / Math.log(9);
      const y = 20 - parameter('sustain') * 18;
      const r = 8 + 20 * Math.log1p(parameter('release')) / Math.log(9);
      path.setAttribute('d', `M1 20 L${a} 2 L${d} ${y} L${105 - r} ${y} L105 20`);
    });
    container.append(card);
  }
  return (patch) => updates.forEach((update) => update(patch));
}
