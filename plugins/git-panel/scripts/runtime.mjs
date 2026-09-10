import net from 'node:net';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {mkdir, readFile, chmod, lstat, open, unlink} from 'node:fs/promises';

export function workspaceKey(root) {
  const normalized = process.platform === 'win32' ? root.toLowerCase() : root;
  return createHash('sha256').update(normalized).digest('hex').slice(0, 32);
}
async function privateDirectory(dir) {
  await mkdir(dir, {recursive: true, mode: 0o700});
  if(process.platform !== 'win32') {
    const info = await lstat(dir);
    if(!info.isDirectory() || info.uid !== process.getuid()) throw Error('Runtime directory must be owned by the current user');
    await chmod(dir, 0o700);
  }
  return dir;
}
export async function runtimePaths(root) {
  const dir = path.join(process.platform === 'win32' ? process.env.LOCALAPPDATA || os.homedir() : process.env.XDG_RUNTIME_DIR || path.join(os.homedir(), '.local', 'share'), 'CodexGitPanel');
  await privateDirectory(dir);
  const key = workspaceKey(root);
  // Keep below macOS's Unix-domain socket path limit, even with long home/XDG paths.
  const socketDir = process.platform === 'win32' ? dir : await privateDirectory(`/tmp/codex-gp-${process.getuid()}`);
  return {record: path.join(dir, `workspace-${key}.json`),
    socket: process.platform === 'win32' ? `\\\\.\\pipe\\codex-git-panel-${key}` : path.join(socketDir, `${key}.sock`)};
}
export function processAlive(pid) {
  if(!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {process.kill(pid, 0); return true;} catch(error) {return error.code !== 'ESRCH';}
}
export async function existingPanel(record, root) {
  try {
    const info = JSON.parse(await readFile(record, 'utf8'));
    if(!processAlive(info.pid)) return;
    const url = new URL(info.url);
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.hash || url.username || url.password) return;
    const response = await fetch(url.origin + '/api/heartbeat', {redirect: 'error', headers: {Authorization: 'Bearer ' + url.hash.slice(1)}, signal: AbortSignal.timeout(1500)});
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
  try {return await listen();} catch(error) {
    if(process.platform === 'win32' || error.code !== 'EADDRINUSE') throw error;
    // Serialize stale-socket recovery. Never remove a live or unverified endpoint.
    // A crash during recovery fails closed; the diagnostic names its lock file.
    const lock = socket + '.recovery';
    let handle;
    try {handle = await open(lock, 'wx', 0o600);} catch(cause) {
      throw new Error(`Socket recovery already running or interrupted: ${lock}`, {cause});
    }
    try {
      const info = await lstat(socket).catch(e => {if(e.code !== 'ENOENT') throw e;});
      if(info) {
        if(!info.isSocket() || info.uid !== process.getuid()) throw error;
        const stale = await new Promise(resolve => {
          const client = net.createConnection(socket);
          client.once('connect', () => {client.destroy(); resolve(false);});
          client.once('error', e => resolve(e.code === 'ECONNREFUSED'));
          client.setTimeout(1500, () => {client.destroy(); resolve(false);});
        });
        if(!stale) throw error;
        await unlink(socket);
      }
      return await listen();
    } finally {await handle.close(); await unlink(lock);}
  }
}
