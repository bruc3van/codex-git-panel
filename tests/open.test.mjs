import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, realpath} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import {repositoryFor, panelUrl, initializeRepository} from '../plugins/git-panel/scripts/open.mjs';

test('Open in resolves files, nested directories and linked worktrees without changing Git state', async () => {
  const base = await mkdtemp(path.join(os.tmpdir(), 'panel-open-'));
  const root = path.join(base, '中文 repo & space');
  await mkdir(root);
  const git = (...args) => execFileSync('git', ['-C', root, ...args], {encoding: 'utf8', windowsHide: true});
  git('init');
  await mkdir(path.join(root, 'nested'));
  const file = path.join(root, 'nested', '文档 & test.txt');
  await writeFile(file, 'test');
  const before = git('status', '--porcelain');
  for (const input of [root, path.dirname(file), file]) assert.equal(await repositoryFor(input), await realpath(root));
  assert.equal(git('status', '--porcelain'), before);
  git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '--allow-empty', '-m', 'initial');
  const worktree = path.join(base, 'linked worktree');
  git('worktree', 'add', '--detach', worktree);
  assert.equal(await repositoryFor(worktree), await realpath(worktree));
  await assert.rejects(repositoryFor(base), /无法找到 Git 仓库/);
  await assert.rejects(repositoryFor(path.join(base, 'missing')), /路径不存在/);
  await assert.rejects(repositoryFor(), /请提供/);
});

test('browser URL keeps session fragment and rejects non-local targets', () => {
  assert.equal(panelUrl('http://127.0.0.1:1234/#credential\n'), 'http://127.0.0.1:1234/#credential');
  for (const url of ['https://example.com/#token', 'file:///tmp/test', 'http://127.0.0.1:1234/', 'http://user@127.0.0.1:1234/#token']) {
    assert.throws(() => panelUrl(url));
  }
});

test('explicit initialization creates a local repository without staging or remote and avoids nested repositories', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'panel-init-'));
  await writeFile(path.join(root, 'notes.txt'), 'local notes');
  assert.equal(await initializeRepository(root), await realpath(root));
  const git = (...args) => execFileSync('git', ['-C', root, ...args], {encoding: 'utf8', windowsHide: true});
  assert.equal(git('remote'), '');
  assert.equal(git('diff', '--cached', '--name-only'), '');
  assert.match(git('status', '--porcelain'), /\?\? notes.txt/);
  const child = path.join(root, 'child');
  await mkdir(child);
  assert.equal(await initializeRepository(child), await realpath(root));
  await assert.rejects(realpath(path.join(child, '.git')));
});
