import { SCOPE_LABELS } from '../../../bridge/src/protocol';
import type { Scope } from '../../../bridge/src/protocol';
import { AgentClient } from './client';
import type { Host } from './client';
import type { AudioController } from '../audio/controller';

const button = (label: string, action: () => void): HTMLButtonElement => { const node = document.createElement('button'); node.className = 'quiet-button'; node.textContent = label; node.addEventListener('click', action); return node; };
const text = (tag: string, value: string): HTMLElement => { const node = document.createElement(tag); node.textContent = value; return node; };
export function agentPanel(container: HTMLElement, host: Host, audio: AudioController, enableAudio: () => Promise<void>): AgentClient {
  const client = new AgentClient(host, audio, render);
  const selections = new Map<string, Set<Scope>>();
  function render(): void {
    container.replaceChildren();
    const top = document.createElement('div'); top.className = 'agent-heading';
    top.append(text('strong', 'AGENT CONNECTION'), text('span', client.connected ? 'Connected to this tab' : 'Give your agent temporary access to this instrument'));
    top.append(button(client.connected ? 'End session' : client.busy ? 'Connecting…' : 'Connect agent', () => { if (client.connected) client.disconnect(); else void client.connect(); }));
    container.append(top);
    if (client.connected && client.state) {
      const pairing = document.createElement('div'); pairing.className = 'agent-pairing';
      const valid = client.state.codeAvailable && Date.now() < client.state.codeExpiresAt;
      if (valid) {
        pairing.append(text('span', 'Pairing code · 5 minutes'), text('code', client.code));
        pairing.append(button('Copy pairing prompt', () => { void navigator.clipboard.writeText(client.prompt()).then(() => client.log('Pairing prompt copied. Send it to your agent.')).catch(() => client.log('Clipboard unavailable. Select and copy the connection instructions below.')); }));
        const details = document.createElement('details'); details.append(text('summary', 'Connection instructions'));
        const instructions = document.createElement('textarea'); instructions.readOnly = true; instructions.value = client.prompt(); instructions.setAttribute('aria-label', 'Agent pairing prompt'); details.append(instructions); pairing.append(details);
      } else pairing.append(text('span', 'Code used or expired.'), button('New pairing code', () => client.send({ type: 'new_code' })));
      container.append(pairing);
      for (const request of client.state.pairings) {
        const row = document.createElement('div'); row.className = 'agent-request'; row.dataset.pairingId = request.id;
        row.append(text('strong', `${request.name} wants access`));
        if (!selections.has(request.id)) selections.set(request.id, new Set(request.scopes));
        const selected = selections.get(request.id)!;
        for (const scope of request.scopes) {
          const label = document.createElement('label'); const input = document.createElement('input'); input.type = 'checkbox'; input.checked = selected.has(scope);
          input.addEventListener('change', () => { if (input.checked) selected.add(scope); else selected.delete(scope); });
          label.append(input, document.createTextNode(SCOPE_LABELS[scope])); row.append(label);
        }
        const approve = button(`Approve ${request.name}`, () => {
          if (!selected.size) { client.log('Select at least one permission.'); return; }
          approve.disabled = true;
          // Activate speakers inside this explicit user gesture, before any await.
          void (selected.has('synth.play') ? enableAudio() : Promise.resolve()).then(() => client.decide(request.id, true, [...selected])).catch(error => { client.log((error as Error).message); approve.disabled = false; });
        });
        row.append(approve, button(`Deny ${request.name}`, () => client.decide(request.id, false, []))); container.append(row);
      }
      for (const grant of client.state.agents) {
        const row = document.createElement('div'); row.className = 'agent-grant';
        row.append(text('strong', grant.name), text('span', `${grant.scopes.map(scope => SCOPE_LABELS[scope]).join(' · ')} · expires ${new Date(grant.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`), button(`Disconnect ${grant.name}`, () => client.revoke(grant.id))); container.append(row);
      }
    }
    if (client.activity.length) { const log = document.createElement('ol'); log.className = 'agent-activity'; log.setAttribute('aria-label', 'Recent agent activity'); for (const item of client.activity) log.append(text('li', item)); container.append(log); }
  }
  render(); return client;
}
