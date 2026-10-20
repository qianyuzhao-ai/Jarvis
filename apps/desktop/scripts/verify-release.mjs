import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../../..');
const rootVersion = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).version;
const appVersion = JSON.parse(
  readFileSync(resolve(root, 'apps/desktop/package.json'), 'utf8'),
).version;
const tag = process.argv[2];
if (tag !== `v${rootVersion}` || appVersion !== rootVersion) {
  throw new Error(`版本不一致：标签 ${tag}，工作区 ${rootVersion}，桌面应用 ${appVersion}`);
}
