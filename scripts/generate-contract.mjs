import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

const contract = JSON.parse(await readFile(new URL('../contracts/instrument.json', import.meta.url), 'utf8'));
const parameters = [...contract.globalParameters];
for (let op = 1; op <= contract.operatorCount; op++) {
  for (const parameter of contract.operatorParameters) {
    const id = `op${op}.${parameter.id}`;
    parameters.push({ ...parameter, id, default: contract.initialOverrides[id] ?? parameter.default, operator: op });
  }
}
const number = (value) => Number.isInteger(value) ? `${value}.0f` : `${value}f`;
const cpp = `// Generated from contracts/instrument.json. Run npm run generate.\n#pragma once\n#include <array>\n\nnamespace agent_synth {\nstruct ParameterDefinition {\n    const char* id;\n    float minimum;\n    float maximum;\n    float initial;\n    bool integer;\n};\ninline constexpr int parameter_count = ${parameters.length};\ninline constexpr std::array<ParameterDefinition, parameter_count> parameter_definitions {{\n${parameters.map(p => `    {${JSON.stringify(p.id)}, ${number(p.min)}, ${number(p.max)}, ${number(p.default)}, ${Boolean(p.integer)}},`).join('\n')}\n}};\nstruct Routing {\n    std::array<unsigned, 6> inputs;\n    unsigned carriers;\n    int carrier_count;\n};\ninline constexpr std::array<Routing, ${contract.algorithms.length}> routings {{\n${contract.algorithms.map(a => {
  const inputs = Array(6).fill(0);
  for (const [from, to] of a.edges) inputs[to - 1] |= 1 << (from - 1);
  const carriers = a.carriers.reduce((mask, op) => mask | (1 << (op - 1)), 0);
  return `    {{{${inputs.join(', ')}}}, ${carriers}, ${a.carriers.length}},`;
}).join('\n')}\n}};\n} // namespace agent_synth\n`;
const ts = `// Generated from contracts/instrument.json. Run npm run generate.\nexport const instrument = ${JSON.stringify({ schemaVersion: contract.schemaVersion, id: contract.id, name: contract.name, operatorCount: contract.operatorCount, voiceCount: contract.voiceCount, algorithms: contract.algorithms }, null, 2)} as const;\nexport const parameters = ${JSON.stringify(parameters, null, 2)} as const;\nexport type ParameterId = typeof parameters[number]['id'];\n`;
for (const [path, contents] of [
  ['packages/dsp/include/agent_synth/parameters.generated.hpp', cpp],
  ['packages/web/src/parameters.generated.ts', ts],
]) {
  const target = new URL(`../${path}`, import.meta.url);
  if (process.argv.includes('--check')) {
    if (await readFile(target, 'utf8') !== contents) throw new Error(`Stale contract: ${path}. Run npm run generate.`);
  } else {
    await mkdir(dirname(target.pathname), { recursive: true });
    await writeFile(target, contents);
  }
}
