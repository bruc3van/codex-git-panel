import {execFile} from 'node:child_process';
import {stat, realpath} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';

const execute = promisify(execFile);
const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');

export async function repositoryFor(input) {
  if (!input) throw new Error('请提供本地 Git 仓库中的文件或目录。');
  const target = path.resolve(input);
  let info;
  try { info = await stat(target); }
  catch { throw new Error(`路径不存在或无法访问：${target}`); }
  const directory = info.isDirectory() ? target : path.dirname(target);
  try {
    const {stdout} = await execute('git', ['-C', directory, 'rev-parse', '--show-toplevel'], {windowsHide: true});
    return await realpath(stdout.trim());
  } catch (cause) {
    if (cause.code === 'ENOENT') throw new Error('找不到 Git，请先安装 Git 并确保它在 PATH 中。');
    // Only offer initialization for Git's specific non-repository error.
    if (!cause.stderr?.includes('not a git repository')) throw new Error(`Git 无法访问该目录：${cause.stderr || cause.message}`);
    const error = new Error(`无法找到 Git 仓库：${target}`);
    error.code = 'NOT_GIT';
    error.directory = directory;
    throw error;
  }
}

export async function initializeRepository(directory) {
  // Recheck first: never create a nested repository inside an existing worktree.
  try { return await repositoryFor(directory); }
  catch (error) { if (error.code !== 'NOT_GIT') throw error; }
  await execute('git', ['-C', directory, 'init'], {windowsHide: true});
  return await repositoryFor(directory);
}

async function confirmInitialization(directory) {
  if (process.platform !== 'win32') throw new Error(`此目录尚未初始化 Git：${directory}\n请确认后运行 git init，或使用 open.mjs --init <目录>。`);
  const {stdout} = await execute(powershell, ['-NoProfile', '-STA', '-Command',
    "Add-Type -AssemblyName System.Windows.Forms; $answer = [System.Windows.Forms.MessageBox]::Show(('Initialize a local Git repository in this folder?' + [Environment]::NewLine + [Environment]::NewLine + $env:CODEX_GIT_PANEL_INIT_DIR + [Environment]::NewLine + [Environment]::NewLine + 'No files will be committed. No remote is required.'), 'Git Panel', 'YesNo', 'Question', 'Button2'); Write-Output $answer"],
    {windowsHide: true, env: {...process.env, CODEX_GIT_PANEL_INIT_DIR: directory}});
  return stdout.trim() === 'Yes';
}

export function panelUrl(value) {
  const url = new URL(value.trim());
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || !url.hash || url.username || url.password) {
    throw new Error('启动器未返回有效的本地面板地址。');
  }
  return url.href;
}

export async function openPanel(input, {initialize = false} = {}) {
  let root;
  try { root = await repositoryFor(input); }
  catch (error) {
    if (error.code !== 'NOT_GIT') throw error;
    if (!initialize && !await confirmInitialization(error.directory)) return null;
    root = await initializeRepository(error.directory);
  }
  const {stdout} = await execute(process.execPath, [fileURLToPath(new URL('./launch.mjs', import.meta.url)), root], {windowsHide: true, timeout: 30000});
  const url = panelUrl(stdout);
  if (process.platform === 'win32') {
    // Pass the URL as data, never interpolate paths or credentials into shell code.
    await execute(powershell, ['-NoProfile', '-NonInteractive', '-Command', "$ErrorActionPreference = 'Stop'; Start-Process -FilePath $env:CODEX_GIT_PANEL_OPEN_URL"], {
      windowsHide: true, env: {...process.env, CODEX_GIT_PANEL_OPEN_URL: url}, timeout: 15000,
    });
  } else {
    await execute(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], {timeout: 15000});
  }
  return root;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const initialize = process.argv[2] === '--init';
    const root = await openPanel(process.argv[initialize ? 3 : 2], {initialize});
    console.log(root ? `Git Panel 已请求浏览器打开：${root}` : 'Git Panel：已取消初始化。');
  } catch (error) {
    console.error(`Git Panel：${error.message}`);
    process.exitCode = 1;
  }
}
