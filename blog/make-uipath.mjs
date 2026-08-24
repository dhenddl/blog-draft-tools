// 블로그용 "화면 경로 도식" 생성기
//
// 왜 스크린샷이 아니라 도식인가:
//   ① 메타·티스토리 UI는 자주 바뀐다 — 스크린샷은 몇 달이면 낡고, 낡은 스크린샷은 없는 것보다 나쁘다
//   ② 대시보드 캡처에는 앱 ID·사용자 ID가 찍힌다. 도식은 마스킹 실수 위험이 0이다
//   ③ 이미 지나간 화면(테스터 초대 수락 등)은 재현이 아예 불가능하다
//   ④ render.js와 같은 팔레트라 카드뉴스·릴스와 얼굴이 같다
//
// ⚠️ 도식은 스크린샷을 대체하지 않는다. 재현 가능한 화면은 실물을 찍어 같이 넣는다.
// ⚠️ ★ 경로 단계는 확인된 것만 적는다. 모르면 `확인필요: true`로 두고 지어내지 않는다.
//
// 사용: node make-uipath.mjs uipath/ep-01.json

import { chromium } from 'playwright';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const W = 1200;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const stepRow = (label, i, total, isTarget) => `
  <li class="step${isTarget ? ' target' : ''}">
    <span class="num">${String(i + 1).padStart(2, '0')}</span>
    <span class="label">${esc(label)}</span>
    ${isTarget ? '<span class="here">여기</span>' : ''}
    ${i < total - 1 ? '<span class="arrow">↓</span>' : ''}
  </li>`;

const card = (p) => `
<div class="card">
  <div class="bar">
    <span class="dot" style="background:#ff5f56"></span>
    <span class="dot" style="background:#ffbd2e"></span>
    <span class="dot" style="background:#27c93f"></span>
    <span class="bartitle mono">${esc(p.platform)}</span>
  </div>
  <div class="body">
    <div class="kicker">${esc(p.kicker ?? '화면 경로')}</div>
    <h1>${esc(p.title)}</h1>
    <ol class="steps">
      ${p.steps.map((s, i) => stepRow(s, i, p.steps.length, i === p.steps.length - 1)).join('')}
    </ol>
    ${p.action ? `<div class="action"><b>할 일</b> · ${esc(p.action)}</div>` : ''}
    ${p.note ? `<div class="note">${esc(p.note)}</div>` : ''}
    ${p.확인필요 ? `<div class="warn">⚠️ 이 경로의 중간 단계는 미확인 — 화면에서 직접 확인 후 확정할 것</div>` : ''}
  </div>
  <div class="foot mono">무인 수익 실험 · dhenddl1.tistory.com</div>
</div>`;

const page$ = (p) => `<!doctype html><meta charset="utf-8">
<style>
  :root{--bg:#0d1117;--panel:#161b22;--line:#30363d;--text:#e6edf3;--dim:#9aa4b2;--accent:#3fb950;}
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:transparent;width:${W}px;
       font-family:'Pretendard Variable',Pretendard,'Noto Sans KR','Malgun Gothic',sans-serif}
  .mono{font-family:'Cascadia Code','D2Coding',Consolas,monospace}
  .card{background:var(--bg);border:1px solid var(--line);border-radius:16px;overflow:hidden}
  .bar{display:flex;align-items:center;gap:9px;padding:16px 22px;background:var(--panel);
       border-bottom:1px solid var(--line)}
  .dot{width:13px;height:13px;border-radius:50%;display:inline-block}
  .bartitle{margin-left:12px;color:var(--dim);font-size:19px}
  .body{padding:38px 46px 30px}
  .kicker{color:var(--accent);font-size:21px;font-weight:700;margin-bottom:10px}
  h1{color:var(--text);font-size:40px;line-height:1.3;font-weight:800;margin-bottom:32px}
  .steps{list-style:none}
  .step{display:flex;align-items:center;gap:16px;position:relative;
        padding:15px 20px;margin-bottom:34px;background:var(--panel);
        border:1px solid var(--line);border-radius:11px}
  .step:last-child{margin-bottom:8px}
  .num{color:var(--dim);font-size:19px;font-family:'Cascadia Code',Consolas,monospace}
  .label{color:var(--text);font-size:27px;font-weight:600}
  .step.target{border-color:var(--accent);background:#0f2417}
  .step.target .label{color:var(--accent);font-weight:800}
  .here{margin-left:auto;background:var(--accent);color:#04260f;
        font-size:17px;font-weight:800;padding:5px 13px;border-radius:6px}
  .arrow{position:absolute;left:34px;bottom:-31px;color:var(--line);font-size:24px;line-height:1}
  .action{margin-top:26px;padding:17px 20px;border-left:4px solid var(--accent);
          background:var(--panel);color:var(--text);font-size:23px;border-radius:0 9px 9px 0}
  .action b{color:var(--accent)}
  .note{margin-top:15px;color:var(--dim);font-size:21px;line-height:1.55}
  .warn{margin-top:15px;color:#ffbd2e;font-size:20px;line-height:1.5}
  .foot{padding:15px 46px 20px;color:var(--line);font-size:17px;text-align:right}
</style>
${card(p)}`;

const specPath = process.argv[2];
if (!specPath) { console.error('사용: node make-uipath.mjs uipath/ep-01.json'); process.exit(1); }

const spec = JSON.parse(await readFile(specPath, 'utf8'));
const outDir = path.join('out', spec.out);
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: 800 }, deviceScaleFactor: 2 });

for (const p of spec.paths) {
  await page.setContent(page$(p));
  const el = await page.$('.card');
  const file = path.join(outDir, `${p.id}.png`);
  await el.screenshot({ path: file, omitBackground: true });
  const { height } = await el.boundingBox();
  console.log(`  ${p.id}.png  ${W}×${Math.round(height)}  ${p.확인필요 ? '⚠️ 미확인 단계 포함' : ''}`);
}

await browser.close();
console.log(`\n완료 → ${path.resolve(outDir)}`);
