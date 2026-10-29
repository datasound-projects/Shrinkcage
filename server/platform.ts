import { access, stat } from 'node:fs/promises';
import { constants, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';
import { run } from './util.js';
export function appDataDir(platform = process.platform, home = homedir(), env = process.env) {
  if (env.SHRINKCAGE_DATA_DIR) return env.SHRINKCAGE_DATA_DIR;
  if (env.SHRINKAGE_DATA_DIR) return env.SHRINKAGE_DATA_DIR;
  const parent = platform === 'darwin' ? join(home, 'Library', 'Application Support') : platform === 'win32' ? env.APPDATA || join(home, 'AppData', 'Roaming') : env.XDG_CONFIG_HOME || join(home, '.config');
  const current = join(parent, platform === 'linux' ? 'shrinkcage' : 'Shrinkcage');
  const legacy = join(parent, platform === 'linux' ? 'shrinkage' : 'Shrinkage');
  return !existsSync(current) && existsSync(legacy) ? legacy : current;
}
export async function findBinary(name: string, platform = process.platform, env = process.env): Promise<boolean> {
  const extensions = platform === 'win32' ? ['', '.exe', '.cmd', '.bat'] : [''];
  for (const directory of (env.PATH || env.Path || '').split(platform === 'win32' ? ';' : delimiter).filter(Boolean)) {
    if (/^[\\/]{2}/.test(directory)) continue;
    for (const extension of extensions) {
      try { const file = join(directory.replace(/^"|"$/g,''), name + extension); if (!(await stat(file)).isFile()) continue; await access(file, platform === 'win32' ? constants.F_OK : constants.X_OK); return true; }
      catch { /* keep searching; never execute the detected agent */ }
    }
  }
  return false;
}
export async function processNames(): Promise<string[] | null> {
  try {
    const text = process.platform === 'win32' ? await run('tasklist.exe', ['/FO','CSV','/NH']) : await run('ps', ['-A','-o','comm=']);
    return text.split('\n').map(line => process.platform === 'win32' ? line.match(/^"([^"]+)"/)?.[1] || '' : line.trim()).filter(Boolean);
  } catch { return null; }
}
export function agentProcess(name: string, processes: string[] | null): 'observed' | 'not-observed' | 'unavailable' {
  if (!processes) return 'unavailable';
  return processes.some(p => p.replace(/\\/g,'/').split('/').at(-1)?.toLowerCase().replace(/\.exe$/,'') === name) ? 'observed' : 'not-observed';
}
