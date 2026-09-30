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

// ★ 2026-09-02: 상단 바 제목과 kicker 를 **인자로 받는다.**
//   연재 회차는 `ep-NN.sh` · `$ EP.NN · 카테고리` 로 그대로 넘기고,
//   공지처럼 회차 번호가 없는 글은 다른 라벨을 넘긴다.
//   ⛔ 별도 스크립트를 만들지 않았다 — 이 파일 머리말이 경고한 그 함정이다
//     (*"사람이 복사하면 갈라지고 스크립트가 복사하면 안 갈라진다"*). 팔레트는 한 곳에 둔다.
const page$ = ({ barTitle, kicker, main, sub }) => `<!doctype html><meta charset="utf-8">
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
  <span class="bartitle mono">${esc(barTitle)} — AI 자동화 · 개발자 부업</span>
</div>
<div class="main">
  <div class="kicker mono">${esc(kicker)}</div>
  <h1>${esc(main)}</h1>
  ${sub ? `<div class="sub">${esc(sub)}</div>` : ''}
  <div class="rule"></div>
</div>
<div class="foot mono"><span>dhenddl1.tistory.com</span><span class="r">@dhenddl1</span></div>`;

// ── 공지용 경로 (2026-09-02 신설) ──────────────────────────────
//   사용: node make-thumb.mjs --notice notice/notice-tistory.md
//   공지는 회차 번호가 없어서 `ep`·`publishDate` 규칙을 못 쓴다.
//   ⛔ 그렇다고 posts/ 에 가짜 ep 를 넣지 않는다 — 연재 번호가 오염된다.
//   출력 이름은 원고 파일명을 그대로 쓴다(`notice-tistory.png`).
const argv = process.argv.slice(2);
const noticeIdx = argv.indexOf('--notice');
const noticePath = noticeIdx >= 0 ? argv[noticeIdx + 1] : '';

// ── 필수 페이지용 경로 (2026-09-21 신설) ─────────────────────────────────
//   사용: node make-thumb.mjs --pages
//   소개·문의·개인정보처리방침은 **본문에 이미지가 하나도 없다.** 그러면 티스토리가
//   대표이미지를 못 고르고 **기본 로고**가 뜬다 — 이 파일 머리말이 EP.01 에서 확인한 그 문제다.
//   ⛔ 별도 스크립트를 만들지 않았다. 머리말 경고 그대로다 —
//     *"사람이 복사하면 갈라지고 스크립트가 복사하면 안 갈라진다. 팔레트는 한 곳에 둔다."*
//   ⛔ 문구를 여기 박지 않는다 — `pages/thumbs.json` 이 단일 출처다. 이 파일은 그걸 읽기만 한다.
const PAGES = argv.includes('--pages');

const filter = (noticePath || PAGES) ? '' : argv[0];
const files = (noticePath || PAGES)
  ? []
  : (await readdir(SRC)).filter((f) => f.endsWith('.md')).filter((f) => !filter || f.startsWith(filter));
if (!noticePath && !PAGES && !files.length) { console.error('대상 없음'); process.exit(1); }

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });

if (PAGES) {
  const spec = JSON.parse(await readFile(path.join('pages', 'thumbs.json'), 'utf8'));
  const 목록 = spec.pages ?? [];
  if (!목록.length) { console.error('⚠️ pages/thumbs.json 에 pages 가 비어 있다'); process.exit(1); }
  for (const p of 목록) {
    for (const k of ['key', 'barTitle', 'kicker', 'main']) {
      if (!p[k]) { console.error(`⚠️ ${p.key ?? '(key 없음)'} — ${k} 가 비어 있다`); process.exit(1); }
    }
    await page.setContent(page$({ barTitle: p.barTitle, kicker: p.kicker, main: p.main, sub: p.sub ?? '' }));
    const out = path.join(OUT, `page-${p.key}.png`);
    await page.screenshot({ path: out });
    console.log(`  page-${p.key}.png  ${W}×${H}  주제목 ${p.main.length}자(${titleSize(p.main.length)}px)${p.sub ? ` · 부제목 ${p.sub.length}자` : ''}`);
  }
  await browser.close();
  process.exit(0);
}

if (noticePath) {
  const raw = await readFile(noticePath, 'utf8');
  const fm = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm) { console.error(`⚠️ ${noticePath} — frontmatter 없음`); process.exit(1); }
  const get = (k) => (fm[1].match(new RegExp(`^${k}:\\s*(.+)$`, 'm')) ?? [])[1]?.trim() ?? '';
  const title = get('title');
  if (!title) { console.error('⚠️ title 이 없다'); process.exit(1); }
  const [main, ...rest] = title.split(' — ');
  const sub = rest.join(' — ');
  const stem = path.basename(noticePath, '.md');
  await page.setContent(page$({ barTitle: 'notice.sh', kicker: '$ 공지 · 자료 받는 곳', main, sub }));
  const out = path.join(OUT, `${stem}.png`);
  await page.screenshot({ path: out });
  console.log(`  ${stem}.png  ${W}×${H}  주제목 ${main.length}자(${titleSize(main.length)}px)${sub ? ` · 부제목 ${sub.length}자` : ' · 부제목 없음'}`);
  await browser.close();
  process.exit(0);
}

for (const f of files) {
  const raw = await readFile(path.join(SRC, f), 'utf8');
  const fm = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm) { console.error(`  ⚠️ ${f} — frontmatter 없음`); continue; }
  const get = (k) => (fm[1].match(new RegExp(`^${k}:\\s*(.+)$`, 'm')) ?? [])[1]?.trim() ?? '';

  const ep = String(get('ep') || '00').padStart(2, '0');
  // ★ 파일명에 발행일을 박는다 (2026-08-26). make-paste.mjs 가 같은 규칙으로 이 파일을 찾는다.
  //   ⛔ 이미지 안의 `ep-NN.sh` 는 그대로 둔다 — 그건 터미널 제목이지 파일 이름이 아니다.
  const pubDate = get('publishDate');
  const stem = /^\d{4}-\d{2}-\d{2}$/.test(pubDate) ? `ep-${ep}-${pubDate}` : `ep-${ep}`;
  const title = get('title');
  const category = get('category') || '자동화 구축기';
  const [main, ...rest] = title.split(' — ');
  const sub = rest.join(' — ');

  await page.setContent(page$({
    barTitle: `ep-${ep}.sh`,
    kicker: `$ EP.${ep} · ${category}`,
    main,
    sub,
  }));
  const file = path.join(OUT, `${stem}.png`);
  await page.screenshot({ path: file });
  console.log(`  ${stem}.png  ${W}×${H}  주제목 ${main.length}자(${titleSize(main.length)}px)${sub ? ` · 부제목 ${sub.length}자` : ' · 부제목 없음'}`);
}

await browser.close();
console.log(`\n완료 → ${path.resolve(OUT)}`);
