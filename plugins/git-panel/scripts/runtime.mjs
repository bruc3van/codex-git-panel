import net from 'node:net';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {mkdir, readFile} from 'node:fs/promises';

export function workspaceKey(root) {
  const normalized = process.platform === 'win32' ? root.toLowerCase() : root;
  return createHash('sha256').update(normalized).digest('hex').slice(0, 32);
}
export async function runtimePaths(root) {
  const dir = path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'CodexGitPanel');
  await mkdir(dir, {recursive: true});
  const key = workspaceKey(root);
  return {record: path.join(dir, `workspace-${key}.json`),
    socket: process.platform === 'win32' ? `\\\\.\\pipe\\codex-git-panel-${key}` : path.join(os.tmpdir(), `codex-git-panel-${key}.sock`)};
}
export async function existingPanel(record, root) {
  try {
    const info = JSON.parse(await readFile(record, 'utf8'));
    const url = new URL(info.url);
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.hash || url.username || url.password) return;
    const response = await fetch(url.origin + '/api/heartbeat', {headers: {Authorization: 'Bearer ' + url.hash.slice(1)}, signal: AbortSignal.timeout(1500)});
    const data = await response.json();
    if (response.ok && data.protocol === 1 && workspaceKey(data.root) === workspaceKey(root)) return info.url;
  } catch {}
}
export async function acquireInstance(socket) {
  const server = net.createServer(client => client.end());
  const listen = () => new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(socket, () => {server.removeListener('error', reject); resolve(server);});
  });
  // Never unlink a contested socket: another launcher may already own it.
  return await listen();
}
