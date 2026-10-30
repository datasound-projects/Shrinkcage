export const TRUST_STATES=['candidate','under_review','approved','suspended','deprecated','rejected'] as const;
export type TrustState=typeof TRUST_STATES[number];
export const CAPABILITIES=['catalog','guided-install','automated-install','managed-config','session-activation','runtime-telemetry'] as const;
export type Capability=typeof CAPABILITIES[number];
export interface Reference {label:string;url:string;kind:'repository'|'documentation'|'release'|'license'|'package'|'security'|'test'|'review';observedAt:string}
export interface AdmissionGate {id:number;name:string;status:'passed'|'partial'|'failed'|'unavailable'|'not-applicable';method:'static-metadata'|'upstream-documentation'|'native-interface'|'isolated-test'|'maintainer-review'|'unavailable';summary:string;references:string[]}
export interface RegistryEntry {
  id:string;name:string;summary:string;category:string;tags:string[];role:'direct'|'supporting';
  source:{repository:string;repositoryId:number|null;url:string;documentation:string;licenseUrl:string;readmeUrl:string;readmeSha:string|null;forkOf:string|null};
  license:{expression:string;family:'open-source'|'source-available'|'mixed'|'unknown';notes:string};
  upstream:{version:string|null;releaseUrl:string|null;releasedAt:string|null;pushedAt:string|null;checkedAt:string;archived:boolean;issues:number|null;ci:string|null;history:{version:string;url:string;publishedAt:string|null}[]};
  packages:{registry:'npm'|'pypi'|'crates';name:string;version:string|null;url:string;repositoryMatches:boolean|null;integrity:string|null;checkedAt:string}[];
  compatibility:{agents:{id:'codex'|'claude';support:'adapter-tested'|'documented'|'unknown'|'unsupported';notes:string}[];platforms:string[];architectures:string[];billing:{subscription:'native-preserved'|'documented'|'unknown'|'unsupported'|'not-applicable';api:'native-preserved'|'documented'|'unknown'|'unsupported'|'not-applicable'};mechanisms:string[];dependencies:string[];conflicts:string[];isolation:'process'|'guided'|'external'|'unknown';requirements:string[];limitations:string[]};
  integration:{adapterId:string|null;capabilities:Capability[];executables:string[];minVersion:string|null;maxMajor:number|null};
  security:{permissions:string[];network:string;warnings:string[];advisories:{state:'checked'|'unavailable'|'reported';count:number|null;checkedAt:string|null;url:string};dependencyAudit:'not-performed'|'artifact-reviewed'};
  evidence:{references:Reference[];benchmarks:{kind:'upstream-reported'|'independent'|'not-measured';summary:string;url:string;methodology:string;limitations:string[]}[];gates:AdmissionGate[]};
  trust:{state:TrustState;reviewedAt:string|null;reviewer:string|null;scope:'candidate'|'metadata-guided'|'managed-adapter';reviewedVersion:string|null;decision:string;limitations:string[]};
}
export interface RegistryCatalog {schemaVersion:1;taxonomyVersion:1;version:string;revision:number;publishedAt:string;repository:'datasound-projects/Shrinkcage';entries:RegistryEntry[]}
export interface Integrity {schemaVersion:1;version:string;revision:number;sha256:string}
export interface Candidate {schemaVersion:1;id:string;entry:RegistryEntry;discoveredAt:string;lastCheckedAt:string;sources:string[];classification:{category:string;confidence:'documented'|'heuristic'|'unknown';reasons:string[]};diagnostics:string[];previousVersion:string|null;adapterProposal?:{template:'mcp-stdio'|'review-required';manifest:import('../control/sdk/types.js').PluginManifest|null;diagnostics:string[]}}
export interface RegistryCache {catalog:RegistryCatalog;sha256:string;source:'bundled'|'cached';fetchedAt:string|null;commit:string|null}
export interface LocalRegistryState {entryId:string;adapterId:string|null;state:'not-installed'|'installed'|'needs-configuration'|'compatible'|'ready'|'managed'|'verified-active'|'degraded'|'unsupported';installed:boolean|null;compatible:boolean;version:string|null;observedAt:string|null;capabilities:Capability[];reasons:string[]}
export interface DiscoveryJob {id:string;state:'running'|'completed'|'failed'|'cancelled';startedAt:string;finishedAt:string|null;processed:number;added:number;errors:string[];rateLimitedUntil:string|null}
