// Builds the website as plain files in ./out for the Android app.
// The server routes cannot be exported, so they are set aside while it builds, then put back.
import { renameSync, existsSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const api = 'src/app/api';
const aside = '.api-aside';
if (existsSync(aside)) rmSync(aside, { recursive: true });
renameSync(api, aside);
let code = 1;
try {
  rmSync('.next', { recursive: true, force: true });
  code = spawnSync('npx', ['next', 'build'], { stdio: 'inherit', env: { ...process.env, STATIC_EXPORT: '1', NEXT_PUBLIC_STATIC: '1' } }).status ?? 1;
} finally {
  renameSync(aside, api);
  rmSync('.next', { recursive: true, force: true });
}
process.exit(code);
