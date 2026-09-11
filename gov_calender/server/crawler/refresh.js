// 수집 + 내보내기를 한 번에. (PROJECT_SPEC.md §7)
//   npm run refresh                    최신 8건 수집 후 프론트 반영
//   npm run refresh -- --limit=40      최신 40건
//   npm run refresh -- --full --pages=60
//   npm run refresh -- --seCode=01     고시
// run.js 에 전달되는 플래그를 그대로 받아 넘긴 뒤, 성공하면 export 까지 실행한다.
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const passthrough = process.argv.slice(2);

const step = (label, script, args = []) => {
  console.log(`\n▶ ${label}`);
  const r = spawnSync(process.execPath, [resolve(here, script), ...args], { stdio: 'inherit' });
  if (r.status !== 0) {
    console.error(`✗ ${label} 실패 (exit ${r.status}) — 이후 단계 중단`);
    process.exit(r.status || 1);
  }
};

step('공고 수집', 'run.js', passthrough);
step('프론트 데이터 반영 (src/data/announcements.json)', '../export.js');
console.log('\n✓ 완료 — npm run dev 로 확인하세요.');
