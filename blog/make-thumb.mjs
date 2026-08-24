// 티스토리 대표이미지(=OG 이미지) 생성기
//
// 없으면 공유·검색 카드에 **티스토리 기본 로고**가 뜬다 (2026-08-10 EP.01에서 확인).
// `twitter:card`가 summary_large_image라 이미지가 크게 나와서 더 티난다.
//
// 규격 1200×630 — OG 표준 1.91:1. 티스토리 대표이미지도 이걸 그대로 쓴다.
// 팔레트는 render.js와 동일 — 카드뉴스·릴스·파비콘과 같은 얼굴.
//
// 제목은 프론트매터에서 읽고 ` — ` 로 주/부 제목을 가른다.
// (연재 제목이 전부 이 형식이다. 없으면 통째로 주제목으로 쓴다.)
//
// 사용: node make-thumb.mjs          (전체)
//       node make-thumb.mjs ep-01    (하나만)

import { chromium } from 'playwright';
import { readdir, readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const W = 1200, H = 630;
const SRC = 'posts', OUT = path.join('out', 'thumb');

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// 주제목 길이에 따라 폰트를 줄인다 — 넘치면 잘리는 게 아니라 작아지게
const titleSize = (n) => (n <= 20 ? 66 : n <= 30 ? 56 : n <= 40 ? 48 : 42);

const page$ = ({ ep, main, sub, category }) => `<!doctype html><meta charset="utf-8">
<style>
  :root{--bg:#0d1117;--panel:#161b22;--line:#30363d;--text:#e6edf3;--dim:#9aa4b2;--accent:#3fb950;}
  *{box-sizing:border-box;margin:0;padding:0}
  /* 세로를 flex로 정확히 3등분한다 — 예전 판은 .body에 고정 높이를 줘서
     푸터가 630px 밖으로 밀려 잘렸다(초록 선도 가장자리에 걸림). */
  body{width:${W}px;height:${H}px;background:var(--bg);overflow:hidden;
       display:flex;flex-direction:column;
       font-family:'Pretendard Variable',Pretendard,'Noto Sans KR','Malgun Gothic',sans-serif}
  .mono{font-family:'Cascadia Code','D2Coding',Consolas,monospace}
  .bar{flex:0 0 auto;display:flex;align-items:center;gap:9px;padding:20px 30px;
       background:var(--panel);border-bottom:1px solid var(--line)}
  .dot{width:14px;height:14px;border-radius:50%;display:inline-block}
  .bartitle{margin-left:14px;color:var(--dim);font-size:21px}
  .main{flex:1 1 auto;min-height:0;padding:0 62px;
        display:flex;flex-direction:column;justify-content:center}
  .kicker{color:var(--accent);font-size:25px;font-weight:800;letter-spacing:.02em;margin-bottom:24px}
  h1{color:var(--text);font-size:${titleSize(main.length)}px;line-height:1.28;font-weight:800;
     letter-spacing:-.02em;word-break:keep-all}
  .sub{margin-top:20px;color:var(--dim);font-size:29px;line-height:1.45;word-break:keep-all}
  .rule{margin-top:32px;height:6px;background:var(--accent);width:120px;border-radius:3px}
  .foot{flex:0 0 auto;display:flex;justify-content:space-between;align-items:center;
        padding:0 62px 34px;color:var(--line);font-size:21px}
  .foot .r{color:var(--dim)}
</style>
<div class="bar">
  <span class="dot" style="background:#ff5f56"></span>
  <span class="dot" style="background:#ffbd2e"></span>
  <span class="dot" style="background:#27c93f"></span>
  <span class="bartitle mono">ep-${ep}.sh — 무인 수익 실험</span>
</div>
<div class="main">
  <div class="kicker mono">$ EP.${ep} · ${esc(category)}</div>
  <h1>${esc(main)}</h1>
  ${sub ? `<div class="sub">${esc(sub)}</div>` : ''}
  <div class="rule"></div>
</div>
<div class="foot mono"><span>dhenddl1.tistory.com</span><span class="r">@dhenddl1</span></div>`;

const filter = process.argv[2];
const files = (await readdir(SRC)).filter((f) => f.endsWith('.md')).filter((f) => !filter || f.startsWith(filter));
if (!files.length) { console.error('대상 없음'); process.exit(1); }

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });

for (const f of files) {
  const raw = await readFile(path.join(SRC, f), 'utf8');
  const fm = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm) { console.error(`  ⚠️ ${f} — frontmatter 없음`); continue; }
  const get = (k) => (fm[1].match(new RegExp(`^${k}:\\s*(.+)$`, 'm')) ?? [])[1]?.trim() ?? '';

  const ep = String(get('ep') || '00').padStart(2, '0');
  const title = get('title');
  const category = get('category') || '자동화 구축기';
  const [main, ...rest] = title.split(' — ');
  const sub = rest.join(' — ');

  await page.setContent(page$({ ep, main, sub, category }));
  const file = path.join(OUT, `ep-${ep}.png`);
  await page.screenshot({ path: file });
  console.log(`  ep-${ep}.png  ${W}×${H}  주제목 ${main.length}자(${titleSize(main.length)}px)${sub ? ` · 부제목 ${sub.length}자` : ' · 부제목 없음'}`);
}

await browser.close();
console.log(`\n완료 → ${path.resolve(OUT)}`);
