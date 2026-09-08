import { instrument } from '../parameters.generated';

const svgNamespace = 'http://www.w3.org/2000/svg';
function shape(name: string, attributes: Record<string, string>): SVGElement {
  const element = document.createElementNS(svgNamespace, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  return element;
}

export function renderRouting(svg: SVGSVGElement, algorithmId: number): void {
  const algorithm = instrument.algorithms[algorithmId]!;
  const positions: [number, number][][] = [
    [[40, 102], [40, 40], [120, 102], [120, 40], [200, 102], [200, 40]],
    [[200, 102], [120, 102], [40, 102], [40, 40], [120, 40], [200, 40]],
    [[120, 112], [24, 38], [72, 38], [120, 38], [168, 38], [216, 38]],
    [[65, 128], [65, 78], [65, 28], [175, 128], [175, 78], [175, 28]],
  ];
  const coordinates = positions[algorithmId]!;
  svg.replaceChildren();
  svg.setAttribute('aria-label', `${algorithm.name}: ${algorithm.edges.map(([from, to]) => `${from} modulates ${to}`).join(', ')}`);
  const defs = shape('defs', {});
  const marker = shape('marker', { id: 'routing-arrow', markerWidth: '6', markerHeight: '6', refX: '5', refY: '3', orient: 'auto', markerUnits: 'userSpaceOnUse' });
  marker.append(shape('path', { d: 'M0 0 L6 3 L0 6', fill: 'none', stroke: '#989e95', 'stroke-width': '1.3' }));
  defs.append(marker); svg.append(defs);
  for (const [from, to] of algorithm.edges) {
    const [x1, y1] = coordinates[from - 1]!;
    const [x2, y2] = coordinates[to - 1]!;
    const distance = Math.hypot(x2 - x1, y2 - y1);
    svg.append(shape('line', {
      x1: String(x1 + (x2 - x1) * 17 / distance), y1: String(y1 + (y2 - y1) * 17 / distance),
      x2: String(x2 - (x2 - x1) * 21 / distance), y2: String(y2 - (y2 - y1) * 21 / distance),
      stroke: '#989e95', 'stroke-width': '1.4', 'marker-end': 'url(#routing-arrow)',
    }));
  }
  for (let op = 1; op <= 6; op++) {
    const [x, y] = coordinates[op - 1]!;
    const carrier = (algorithm.carriers as readonly number[]).includes(op);
    svg.append(shape('circle', { cx: String(x), cy: String(y), r: '16', fill: carrier ? '#155e52' : '#ecece4', stroke: carrier ? '#155e52' : '#c9cec3' }));
    const text = shape('text', { x: String(x), y: String(y + 4), 'text-anchor': 'middle', fill: carrier ? '#fff' : '#566058', 'font-size': '12', 'font-family': 'monospace' });
    text.textContent = String(op); svg.append(text);
  }
}
