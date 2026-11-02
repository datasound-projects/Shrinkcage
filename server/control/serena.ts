import { access, readdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';
import { readBounded } from './paths.js';
import { runBounded, type Executable } from './probe.js';
import { ControlError } from './schema.js';

const LANGUAGE_MARKERS: ReadonlyArray<readonly [string, string]> = [
  ['tsconfig.json', 'typescript'],
  ['package.json', 'typescript'],
  ['pyproject.toml', 'python'],
  ['requirements.txt', 'python'],
  ['setup.py', 'python'],
  ['Cargo.toml', 'rust'],
  ['go.mod', 'go'],
  ['pom.xml', 'java'],
  ['build.gradle', 'java'],
  ['build.gradle.kts', 'kotlin'],
  ['Package.swift', 'swift'],
  ['composer.json', 'php'],
  ['Gemfile', 'ruby'],
  ['mix.exs', 'elixir'],
  ['CMakeLists.txt', 'cpp'],
];

const SOURCE_EXTENSIONS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\.(?:ts|tsx|js|jsx|mjs|cjs)$/i, 'typescript'],
  [/\.py$/i, 'python'],
  [/\.rs$/i, 'rust'],
  [/\.go$/i, 'go'],
  [/\.java$/i, 'java'],
  [/\.kt$/i, 'kotlin'],
  [/\.swift$/i, 'swift'],
  [/\.php$/i, 'php'],
  [/\.rb$/i, 'ruby'],
  [/\.(?:ex|exs)$/i, 'elixir'],
  [/\.(?:c|cc|cpp|cxx|h|hh|hpp|hxx)$/i, 'cpp'],
  [/\.cs$/i, 'csharp'],
];

const IGNORED_DIRECTORIES = new Set([
  '.git', '.hg', '.svn', '.venv', 'venv', 'node_modules', 'dist', 'build',
  'coverage', '__pycache__', 'target', 'vendor',
]);

async function inferFromSources(project: string): Promise<string | null> {
  const counts = new Map<string, number>();
  let visited = 0;
  const scan = async (directory: string, depth: number): Promise<void> => {
    if (depth > 2 || visited >= 4_000) return;
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (++visited > 4_000) return;
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (!IGNORED_DIRECTORIES.has(entry.name) && !entry.name.startsWith('.')) {
          await scan(join(directory, entry.name), depth + 1);
        }
        continue;
      }
      if (!entry.isFile()) continue;
      const match = SOURCE_EXTENSIONS.find(([pattern]) => pattern.test(entry.name));
      if (match) counts.set(match[1], (counts.get(match[1]) ?? 0) + 1);
    }
  };
  await scan(project, 0);
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (!ranked.length) return null;
  if (ranked.length === 1 || ranked[0][1] >= 3 && ranked[0][1] >= ranked[1][1] * 2) return ranked[0][0];
  return null;
}

async function inferLanguage(project: string): Promise<string | null> {
  for (const [file, language] of LANGUAGE_MARKERS) {
    try {
      await access(join(project, file), constants.R_OK);
      return language;
    } catch {
      // Try the next deterministic project marker.
    }
  }
  return inferFromSources(project);
}

/** Prepare Serena through its reviewed CLI before starting the coding agent. */
export async function prepareSerenaProject(
  binary: Executable,
  project: string,
  env: NodeJS.ProcessEnv,
): Promise<void> {
  const configurationPath = join(project, '.serena', 'project.yml');
  let configuration = await readBounded(configurationPath, 262_144);

  if (configuration === null) {
    const language = await inferLanguage(project);
    if (!language) {
      throw new ControlError(
        'Serena cannot infer this project language safely. Create its project configuration with an explicit language, then retry.',
      );
    }
    const created = await runBounded(
      binary,
      ['project', 'create', '--language', language, project],
      { cwd: project, env, timeout: 30_000 },
    );
    if (created.code !== 0) {
      throw new ControlError(
        'Serena project setup failed. Run its project-create command in a terminal, review the error, then retry.',
      );
    }
    configuration = await readBounded(configurationPath, 262_144);
  }

  if (!configuration) {
    throw new ControlError('Serena project setup did not create a readable project configuration.');
  }
  if (/^\s*language_servers\s*:\s*\[\s*\]\s*$/m.test(configuration.toString('utf8'))) {
    throw new ControlError(
      'Serena project has no language server. Choose the project language in .serena/project.yml, then retry.',
    );
  }

  const checked = await runBounded(
    binary,
    ['project', 'health-check', project],
    { cwd: project, env, timeout: 240_000 },
  );
  if (checked.code !== 0) {
    throw new ControlError(
      'Serena health check failed. Its language server or dependency setup needs attention before this stack can launch.',
    );
  }
}
