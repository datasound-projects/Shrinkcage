import type { SerenaActivity, SerenaInstance } from './types.js';

/** A bounded journal of observed counters, never a fictional execution trace. */
export function createSerenaActivityLog(limit = 100) {
  const seen = new Map<string, { count: number; observedAt: string }>();
  let entries: SerenaActivity[] = []; let sequence = 0;
  return (instances: Pick<SerenaInstance, 'port' | 'rows'>[], observedAt: string): SerenaActivity[] => {
    const added: SerenaActivity[] = [];
    for (const instance of instances) for (const row of instance.rows) {
      if (row.calls === null || !Number.isSafeInteger(row.calls) || row.calls < 0 || !/^[A-Za-z_][A-Za-z0-9_.:-]{0,119}$/.test(row.name)) continue;
      const key = `${instance.port}/${row.name}`; const previous = seen.get(key);
      seen.set(key, { count: row.calls, observedAt });
      // An initial count describes existing usage. It is not a new call with a
      // known execution timestamp. Explicit zero establishes a baseline only.
      const kind = previous === undefined ? row.calls > 0 ? 'snapshot' : null : row.calls > previous.count ? 'calls' : row.calls < previous.count ? 'reset' : null;
      if (kind) added.push({ id: ++sequence, observedAt, since: previous?.observedAt ?? null, port: instance.port, tool: row.name, kind, count: kind === 'calls' ? row.calls - previous!.count : null, total: row.calls });
    }
    // Bound both retained events and baselines, including across disappearing
    // instances. Missing/offline counters leave the last valid baseline intact.
    while (seen.size > 4000) seen.delete(seen.keys().next().value!);
    if (added.length) entries = [...added.reverse(), ...entries].slice(0, limit);
    return entries;
  };
}
