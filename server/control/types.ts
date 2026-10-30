export const TOOL_IDS = ['rtk', 'serena', 'headroom', 'codemem', 'litellm', 'langfuse'] as const;
export type ToolId = typeof TOOL_IDS[number];
export type ControlAgent = 'codex' | 'claude' | 'gemini';
export type Scope = 'process' | 'project' | 'user' | 'shared';
export type EvidenceStatus = 'unsupported' | 'missing' | 'installed' | 'configured' | 'service_healthy' | 'agent_connected' | 'effective' | 'usage_observed' | 'stale' | 'failed' | 'unknown';
export interface Evidence {
  tool: ToolId; status: EvidenceStatus; source: string; observedAt: string;
  scope: Scope; confidence: 'reported' | 'verified' | 'inconclusive';
  agentVersion: string | null; toolVersion: string | null; limitations: string[];
}
export interface OptimizerManifest {
  schemaVersion: 1; id: string; name: string; source: string; layers: string[];
  permissions: string[]; agents: ControlAgent[]; platforms: string[];
  minVersion: string | null; maxMajor: number | null;
  mechanism: 'hook' | 'mcp' | 'wrapper' | 'proxy' | 'observer';
  mode: 'managed' | 'guided'; dependencies: string[]; conflicts: string[];
  exclusive: string | null; restartRequired: boolean; metricSources: string[];
  ownership: string; installGuidance: string; limitations: string[];
}
export interface Detection {
  id: ToolId; installed: boolean; version: string | null; compatible: boolean;
  configured: boolean | null; serviceHealthy: boolean | null;
  agentConnected: boolean | null; effective: boolean | null; usageObserved: boolean | null;
  status: EvidenceStatus; checkedAt: string; binaryFingerprint: string | null;
  evidence: Evidence[]; diagnostics: string[];
  endpointPort?: number;
}
export interface AgentDetection { id: ControlAgent; installed: boolean; version: string | null; compatible: boolean; binaryFingerprint: string | null }
export interface ProfileTool { id: ToolId; required: boolean; priority: number }
export interface Profile {
  schemaVersion: 1; id: string; name: string; agent: ControlAgent; description: string;
  scope: 'process' | 'project'; fallback: 'explicit' | 'block'; tools: ProfileTool[];
}
export interface SavedProfile { profile: Profile; revision: number; builtin: boolean }
export interface ProjectRef { id: string; label: string }
export interface ConfigFacts {
  digests: Record<string, string>; errors: string[]; rtkHooks: number; headroomHooks: number;
  memoryHooks: number; serenaEntries: number; reservedMcp: boolean;
  ownedRtk: boolean; baselineConfounders: string[];
  hooksDisabled?: boolean;
  headroomEntries?: number; replaceSerenaEntry?: boolean; replaceHeadroomEntry?: boolean;
}
export interface PlanAction {
  id: string; tool: ToolId; phase: 'preflight' | 'activate' | 'verify' | 'cleanup';
  scope: Scope; description: string; permissions: string[]; resources: string[];
}
export interface OptimizationPlan {
  schemaVersion: 1; fingerprint: string; agent: ControlAgent; agentVersion: string | null;
  profile: string; profileRevision: number; project: ProjectRef; scope: 'process' | 'project';
  tools: ToolId[]; omitted: { id: string; reason: string }[];
  actions: PlanAction[]; errors: string[]; warnings: string[]; ready: boolean;
  evidence: Evidence[]; configDigests: Record<string, string>; launchCommand: string;
  approvalRequired: boolean;
  headroomPort: number | null;
  binaryFingerprints: Record<string,string|null>;
  shadowedMcp: ('serena'|'headroom')[];
}
export type ManagedStatus = 'planned' | 'preflight' | 'starting' | 'running' | 'degraded' | 'stopping' | 'exited' | 'failed' | 'abandoned';
export interface ManagedSession {
  schemaVersion: 1; id: string; origin: 'managed'; project: ProjectRef; agent: ControlAgent;
  agentVersion: string | null; profile: string; profileRevision: number; planFingerprint: string;
  status: ManagedStatus; startedAt: string; endedAt: string | null; heartbeatAt: string;
  exitCode: number | null; signal: string | null; plannedTools: ToolId[];
  appliedTools: ToolId[]; evidence: Evidence[]; diagnostics: string[];
  elapsedMs: number | null; toolActivity: { tool: ToolId; name: string; count: number; observedAt: string }[];
  metrics: MetricObservation[];
}
export interface MetricObservation {
  metric: string; value: number | null; unit: string; source: string; observed_at: string;
  scope: Scope; session_id?: string; measurement_method: string; confidence: 'reported' | 'inconclusive';
  coverage: string; source_version: string | null; is_estimate: boolean;
}
export interface Benchmark {
  schemaVersion: 1; id: string; baselineSession: string; optimizedSession: string;
  taskLabel: string; sameTask: boolean; sameGitState: boolean; sameModel: boolean;
  sameEffort: boolean; quality: 'passed' | 'failed' | 'not-reviewed'; createdAt: string;
  confounders: string[]; elapsedDifferenceMs: number | null;
  conclusion: string;
}
export interface SetupPreview {
  tool: 'rtk'; fingerprint: string; project: ProjectRef; scope: 'project';
  files: { path: string; beforeHash: string; afterHash: string; change: 'create' | 'update' | 'unchanged' }[];
  warnings: string[]; errors: string[]; ready: boolean; operation: 'setup' | 'undo';
}
export interface SetupReceipt { id: string; tool: ToolId; projectId: string; status: 'preparing' | 'applied' | 'undone' | 'conflict'; createdAt: string; version: string | null; files: { path: string; beforeHash: string; afterHash: string; backup: string | null; existed: boolean; temporary?: {name:string;dev:number;ino:number;hash:string} }[] }
export interface ControlState {
  schemaVersion: 1; version: string; platform: string; updatedAt: string;
  catalog: OptimizerManifest[]; detections: Detection[]; agents: AgentDetection[];
  profiles: SavedProfile[]; projects: ProjectRef[]; sessions: ManagedSession[];
  benchmarks: Benchmark[]; receipts: Pick<SetupReceipt, 'id' | 'tool' | 'projectId' | 'status' | 'createdAt' | 'version'>[];
  diagnostics: string[]; csrfToken: string;
}
