export interface MidiNotes {
  press(source: string, note: number, velocity?: number): Promise<void>;
  release(source: string): void;
  releasePrefix(prefix: string): void;
  expression(prefix: string, values: { cents?: number; pressure?: number; timbre?: number }): void;
}
export interface MidiOptions { mode: 'classic' | 'lower' | 'upper'; memberRange: number; masterRange: number }
interface Channel { bend: number; pressure: number; timbre: number; pedal: boolean; range?: number; rpnMsb: number; rpnLsb: number; dataMsb: number; dataLsb: number }
interface Device { channels: Channel[]; mode: MidiOptions['mode']; members: number }
export function createMidiRouter(notes: MidiNotes, initial: MidiOptions) {
  let options = initial;
  const devices = new Map<string, Device>();
  const deferred = new Map<string, { id: string; channel: number }>();
  const prefix = (id: string, channel?: number) => `midi:${encodeURIComponent(id)}:${channel === undefined ? '' : `${channel}:`}`;
  const device = (id: string) => {
    let value = devices.get(id);
    if (!value) {
      value = { mode: options.mode, members: 15, channels: Array.from({ length: 16 }, () => ({ bend: 0, pressure: 1, timbre: .5, pedal: false, rpnMsb: 127, rpnLsb: 127, dataMsb: 0, dataLsb: 0 })) };
      devices.set(id, value);
    }
    return value;
  };
  const masterFor = (d: Device, channel: number): number | undefined => {
    if (d.mode === 'lower' && channel>0 && channel<=d.members) return 0;
    if (d.mode === 'upper' && channel<15 && channel>=15-d.members) return 15;
    return undefined;
  };
  const apply = (id: string, channel: number) => {
    const d = device(id), c = d.channels[channel]!;
    const master = masterFor(d,channel), m = master === undefined ? undefined : d.channels[master]!;
    const range = c.range ?? (master === undefined ? options.masterRange : options.memberRange);
    const cents = 100*(c.bend*range + (m ? m.bend*(m.range ?? options.masterRange) : 0));
    notes.expression(prefix(id,channel), { cents, pressure: c.pressure*(m?.pressure ?? 1), timbre: Math.min(1,Math.max(0,c.timbre+(m ? m.timbre-.5 : 0))) });
  };
  const refreshExpression = (id: string) => { for (let ch=0; ch<16; ch++) apply(id,ch); };
  const sustained = (id: string, channel: number) => {
    const d=device(id), master=masterFor(d,channel);
    return d.channels[channel]!.pedal || (master !== undefined && d.channels[master]!.pedal);
  };
  const flush = () => { for (const [source, value] of deferred) if (!sustained(value.id,value.channel)) { notes.release(source); deferred.delete(source); } };
  const release = (id?: string) => {
    notes.releasePrefix(id === undefined ? 'midi:' : prefix(id));
    if (id === undefined) { devices.clear(); deferred.clear(); }
    else { devices.delete(id); for (const [source, value] of deferred) if (value.id===id) deferred.delete(source); }
  };
  const message = (id: string, bytes: Uint8Array | null) => {
    if (!bytes || bytes.length<2 || bytes[0]!<0x80 || bytes[0]!>=0xf0 || bytes[1]!>127) return;
    const command=bytes[0]!&0xf0, channel=bytes[0]!&15, key=bytes[1]!, value=bytes[2] ?? 0;
    if (command!==0xd0 && (bytes.length<3 || value>127)) return;
    const d=device(id), c=d.channels[channel]!, source=prefix(id,channel)+key;
    if (command===0x90 && value>0) {
      deferred.delete(source);
      notes.release(source);
      void notes.press(source,key,value/127);
      apply(id,channel);
    } else if (command===0x80 || (command===0x90 && value===0)) {
      if (sustained(id,channel)) deferred.set(source,{id,channel}); else notes.release(source);
    } else if (command===0xe0) {
      const raw=(value<<7)|key;
      c.bend=(raw-8192)/(raw<8192 ? 8192 : 8191); refreshExpression(id);
    } else if (command===0xd0) { c.pressure=key/127; refreshExpression(id); }

    else if (command===0xb0) {
      if (key===64) { c.pedal=value>=64; flush(); }
      else if (key===74) { c.timbre=value/127; refreshExpression(id); }
      else if (key===101) c.rpnMsb=value;
      else if (key===100) c.rpnLsb=value;
      else if (key===6 || key===38) {
        if (key===6) { c.dataMsb=value; c.dataLsb=0; } else c.dataLsb=value;
        if (c.rpnMsb===0 && c.rpnLsb===0) { c.range=Math.min(masterFor(d,channel)===undefined ? 48 : 96,c.dataMsb+c.dataLsb/100); refreshExpression(id); }
        else if (c.rpnMsb===0 && c.rpnLsb===6 && key===6 && (channel===0 || channel===15) && value<=15) {
          notes.releasePrefix(prefix(id));
          for (const source of deferred.keys()) if (source.startsWith(prefix(id))) deferred.delete(source);
          for (const ch of d.channels) { ch.range=undefined; ch.pedal=false; ch.bend=0; ch.pressure=1; ch.timbre=.5; }
          d.mode=value===0 ? 'classic' : channel===0 ? 'lower' : 'upper'; d.members=value;
        }
      } else if (key===121) { c.bend=0; c.pressure=1; c.timbre=.5; c.pedal=false; refreshExpression(id); flush(); }
      else if (key===120 || key===123) {
        const master=d.mode==='lower' ? 0 : d.mode==='upper' ? 15 : -1;
        const target=channel===master ? prefix(id) : prefix(id,channel);
        notes.releasePrefix(target);
        for (const source of deferred.keys()) if (source.startsWith(target)) deferred.delete(source);
        c.pedal=false;
      }
    }
  };
  return { message, release, configure: (value: MidiOptions) => { release(); options=value; }, reset: () => { devices.clear(); deferred.clear(); } };
}
