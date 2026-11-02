import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { executable } from '../server/control/probe.js';
import { prepareSerenaProject } from '../server/control/serena.js';
import { fakeWorkspace } from './control-fixtures.js';

test('Serena preflight creates a language project and verifies its health', async () => {
  const fixture = await fakeWorkspace();
  try {
    const binary = await executable('serena', fixture.env);
    assert.ok(binary);
    await prepareSerenaProject(binary, fixture.project, fixture.env);
    assert.match(await readFile(join(fixture.project, '.serena', 'project.yml'), 'utf8'), /typescript/);
  } finally {
    await fixture.close();
  }
});

test('Serena preflight refuses to guess an unknown project language', async () => {
  const fixture = await fakeWorkspace();
  try {
    const unknown = join(fixture.root, 'unknown-project');
    await mkdir(unknown);
    const binary = await executable('serena', fixture.env);
    assert.ok(binary);
    await assert.rejects(prepareSerenaProject(binary, unknown, fixture.env), /cannot infer this project language safely/);
  } finally {
    await fixture.close();
  }
});

test('Serena preflight infers a source-only Python project without manual YAML', async () => {
  const fixture = await fakeWorkspace();
  try {
    const sourceOnly = join(fixture.root, 'source-only');
    await mkdir(sourceOnly);
    await writeFile(join(sourceOnly, 'agent.py'), 'VALUE = 1\n');
    const binary = await executable('serena', fixture.env);
    assert.ok(binary);
    await prepareSerenaProject(binary, sourceOnly, fixture.env);
    assert.match(await readFile(join(sourceOnly, '.serena', 'project.yml'), 'utf8'), /language_servers: \[python\]/);
  } finally {
    await fixture.close();
  }
});

test('Serena preflight blocks an unhealthy semantic backend', async () => {
  const fixture = await fakeWorkspace();
  try {
    const binary = await executable('serena', fixture.env);
    assert.ok(binary);
    await assert.rejects(
      prepareSerenaProject(binary, fixture.project, { ...fixture.env, FIXTURE_SERENA_UNHEALTHY: '1' }),
      /health check failed/,
    );
  } finally {
    await fixture.close();
  }
});
