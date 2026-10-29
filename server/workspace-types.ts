export type AgentId = 'codex' | 'claude' | 'gemini';
export interface AgentSettings { enabled: boolean; root: string | null }
export type Settings = Record<AgentId, AgentSettings>;
export interface SessionTokens {
  input: number | null; output: number | null; cached: number | null;
  cacheWrite: number | null; reasoning: number | null; total: number | null;
}
export interface SessionSummary {
  id: string; shortId: string; agent: AgentId; provider: string | null; model: string | null;
  project: { id: string; label: string }; startedAt: string | null; updatedAt: string;
  lastActivityAt: string | null; status: 'recorded' | 'updated-recently'; archived: boolean;
  tokens: SessionTokens; coverage: 'complete-file' | 'sampled'; usageBasis: string;
  observedToolCalls: number | null; version: string | null;
}
export interface SessionDetail extends SessionSummary {
  tools: { name: string; count: number; lastUsedAt: string | null }[];
  activity: { name: string; at: string | null }[];
  tokenHistory: { at: string; input: number | null; output: number | null; total: number | null }[];
  notes: string[];
}
export interface AgentConnector {
  id: AgentId; name: string; enabled: boolean; installed: boolean;
  process: 'observed' | 'not-observed' | 'unavailable';
  integration: 'local-history' | 'no-session-data' | 'unavailable' | 'disabled';
  rootLabels: string[]; customRoot: string | null; accessibleRoots: number;
  sessions: number; filesDiscovered: number; filesParsed: number; errors: string[];
  lastSuccess: string | null; capabilities: string[]; limits: string[]; sampledSessions: number;
}
export interface Workspace {
  updatedAt: string; version: string; platform: string; csrfToken: string;
  connectors: AgentConnector[]; totalSessions: number; projects: { id: string; label: string }[];
  providers: string[]; models: string[]; scanLimited: boolean; settingsError: string | null;
}
export interface SessionPage { items: SessionSummary[]; total: number; offset: number; limit: number; updatedAt: string }
