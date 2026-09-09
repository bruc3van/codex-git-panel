import {spawn, execFileSync} from 'node:child_process';
import {realpath} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {runtimePaths, existingPanel} from './runtime.mjs';

const root = await realpath(execFileSync('git', ['-C', path.resolve(process.argv[2] || '.'), 'rev-parse', '--show-toplevel'], {encoding: 'utf8', windowsHide: true}).trim());
const {record} = await runtimePaths(root);
let url = await existingPanel(record, root);
if (!url) {
  const child = spawn(process.execPath, [fileURLToPath(new URL('./server.mjs', import.meta.url)), root, record], {detached: true, stdio: 'ignore', windowsHide: true});
  child.unref();
  for (let i = 0; i < 80; i++) {
    await new Promise(resolve => setTimeout(resolve, 250));
    url = await existingPanel(record, root);
    if (url) break;
  }
}
if (!url) throw Error('启动失败，请手动运行 node scripts/server.mjs <仓库路径> 查看错误');
console.log(url);
