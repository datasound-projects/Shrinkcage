import type { SerenaActivity } from '../server/types';

const number = (n: number) => n.toLocaleString();
const fullDate = (s: string) => new Date(s).toLocaleString();
function detail(entry: SerenaActivity) {
  return entry.kind === 'calls' ? `+${number(entry.count!)} ${entry.count === 1 ? 'call' : 'calls'}` : entry.kind === 'reset' ? `Counter reset · ${number(entry.total)} recorded` : `${number(entry.total)} recorded · first observed`;
}
function timing(entry: SerenaActivity) {
  return entry.kind === 'calls' ? `Counter increase observed between ${fullDate(entry.since!)} and ${fullDate(entry.observedAt)}. Exact call times and ordering are not supplied.` : entry.kind === 'reset' ? `A lower counter was observed at ${fullDate(entry.observedAt)}; no new call count is inferred.` : `Existing counter first observed at ${fullDate(entry.observedAt)}. The original call time is not supplied.`;
}
export default function SerenaActivityLog({ entries, preview = false, onExplore }: { entries: SerenaActivity[]; preview?: boolean; onExplore?: () => void }) {
  return <div className={`serena-log${preview ? ' activity-preview' : ''}`}>
    <div className="serena-log-heading"><div><h3>{preview ? 'Recent activity' : 'Tool activity'}</h3><p>{preview ? 'Serena · observed tool calls' : 'Tool names and observed call updates'}</p></div><span className="log-count">{preview ? 'Live feed' : `${entries.length} / 100 entries`}</span></div>
    <div className="serena-log-window" role="log" aria-label={preview ? 'Recent Serena activity' : 'Serena tool activity'} aria-live={preview ? 'off' : 'polite'} aria-relevant="additions" tabIndex={0}>
      {entries.length ? <ol>{entries.map(entry => <li key={entry.id} data-kind={entry.kind} title={timing(entry)}>
        <time dateTime={entry.observedAt}>{new Date(entry.observedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time>
        <div className="serena-log-tool"><code title={entry.tool}><i className={`event-marker ${entry.kind}`}/>{entry.tool}</code><span>{detail(entry)}</span></div>
        <code className="serena-log-port" title="Serena dashboard instance">:{entry.port}</code>
      </li>)}</ol> : <div className="serena-log-empty"><strong>Waiting for tool activity</strong><p>Entries appear when Serena reports per-tool call counters.</p></div>}
    </div>
    {preview ? <a className="activity-link" href="#serena" onClick={onExplore}>Explore Serena activity <span aria-hidden="true">→</span></a> : <p className="serena-log-caption">Observation times · calls within a refresh are grouped · first observations show existing counts · this monitor session only.</p>}
  </div>;
}
