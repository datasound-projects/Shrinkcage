export type Value = number | null;
export type State = 'connected' | 'degraded' | 'offline';
export interface Metric { label: string; value: Value | string; unit?: string; scope: string; source: string }
export interface Point { date: string; saved: Value; calls: Value; input: Value; output: Value }
export interface Periods { hourly: Point[]; daily: Point[]; weekly: Point[]; monthly: Point[] }
export interface CommandRow { name: string; count: Value; input: Value; output: Value; saved: Value; percent: Value; date?: string }
export interface ToolRow { name: string; calls: Value; input: Value; output: Value; active: boolean | null }
export interface Base { state: State; checkedAt: string; lastSuccess: string | null; errors: string[]; notes: string[] }
export interface Headroom extends Base {
  healthy: boolean; metrics: Metric[]; saved: Value; percent: Value; requests: Value;
  telemetry: 'on' | 'off' | 'unknown'; periods: Periods; dashboard: string;
  recent: { date: string; input: Value; output: Value; saved: Value; percent: Value; exact: boolean | null }[];
}
export interface Rtk extends Base {
  commands: Value; saved: Value; percent: Value; input: Value; output: Value;
  perCommand: Value; rows: CommandRow[]; recent: CommandRow[]; periods: Periods;
  detailSource: string; metrics: Metric[];
}
export interface SerenaInstance {
  port: number; dashboard: string; state: State; calls: Value; rows: ToolRow[];
  activeTools: Value; availableTools: Value; project: string | null; context: string | null;
  languages: string[]; modes: string[]; client: string | null; interface: string | null;
  errors: string[]; statsAvailable: boolean; activity: 'recorded' | 'empty' | 'unavailable'; statsSource: string;
}
export interface SerenaActivity {
  id: number; observedAt: string; since: string | null; port: number; tool: string;
  kind: 'snapshot' | 'calls' | 'reset'; count: Value; total: number;
}
export interface Serena extends Base {
  instances: SerenaInstance[]; ports: number[]; calls: Value; rows: ToolRow[]; history: Point[];
  activity: 'recorded' | 'empty' | 'unavailable'; reportingInstances: number; emptyInstances: number; unavailableInstances: number;
  activityLog: SerenaActivity[];
}
export interface Service { name: string; port: number; listening: boolean | null; reachable: boolean; integration: string; process: string | null; pid: number | null; dashboard: string | null }
export interface Dashboard { updatedAt: string; headroom: Headroom; rtk: Rtk; serena: Serena; services: Service[]; systemErrors: string[]; snapshots: boolean }
