// render-blog.mjs — 블로그 본문용 **가로** 이미지 렌더러 (네이버·티스토리 공용)
//
// 사용: node render-blog.mjs ../naver/images/2026-08-11-youtube.json
//   · 스펙 경로는 **현재 디렉터리 기준**으로 읽는다.
//   · meta.outDir은 **스펙 파일이 있는 폴더 기준**이다 — 스펙이 자기 출력 위치를
//     들고 다녀야 도구를 다른 채널에서 재사용해도 안 헷갈린다.
//
// ── 왜 여기 있나 (내용은 naver/, 도구는 cardnews/) ────────────────────
// playwright가 cardnews/node_modules와 blog/node_modules에만 있다. naver/에 두면
// import가 안 된다. palette.mjs·inspect.mjs도 여기 있어서 의존성 옆에 두는 게 맞다.
//
// ── 왜 render.js를 안 고치나 ─────────────────────────────────────────
// render.js는 1080x1350 세로 캐러셀 전용이고 W/H가 하드코딩(15줄)이다.
// 거기 손대면 예약된 캐러셀 8건이 전부 영향권에 들어간다. 그래서 안 건드린다.
//
// ── 왜 make-thumb.mjs를 안 쓰나 ──────────────────────────────────────
// 규격(1200x630)은 그게 맞다. 그런데 세 가지가 걸린다.
//   1) 푸터에 dhenddl1.tistory.com + @dhenddl1이 하드코딩돼 있다.
//      네이버 글에 티스토리 도메인과 인스타 핸들을 같이 박을 이유가 없다.
//   2) posts/*.md 프론트매터에서만 읽는다. 티스토리 연재 전용이다.
//   3) 레이아웃이 제목 카드 하나뿐이라 표를 못 그린다.
//
// ── 이 파일이 지키는 것 ──────────────────────────────────────────────
// ★ palette.mjs를 **import** 한다. make-thumb.mjs는 색을 복사해 갖고 있는데
//   (29줄), 그게 palette.mjs를 만든 이유였던 바로 그 어긋남이다. 참조로 가져온다.
// ★ inspect.mjs로 넘침을 잰다. 이미지는 잘려도 코드로는 안 잡힌다.
// ★ 계정 핸들·팔로우 유도를 **넣지 않는다.** 푸터 오른쪽은 1차 출처 도메인이다.
//   이 계정 정체성이 실측·1차출처라 그게 더 맞고, 유출 검사에도 안 걸린다.
//
// ⚠️ 유출 검사(naver/make-naver.mjs)는 텍스트만 본다. 이미지 안 글자는 못 잡는다.
//    그래서 여기서 애초에 안 넣는 쪽으로 막는다.

import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { loadTheme, rgba } from './palette.mjs';
import { inspect, report } from './inspect.mjs';

if (!process.argv[2]) {
  console.error('사용: node render-blog.mjs <스펙.json>');
  process.exit(1);
}
const specPath = resolve(process.cwd(), process.argv[2]);
const spec = JSON.parse(readFileSync(specPath, 'utf-8'));
const { meta, cards } = spec;

const { palette: pal, fonts } = loadTheme(meta);

const esc = (s) => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const ml = (s) => esc(s).replaceAll('\n', '<br>');

// 규격 기본값 1200x630 = OG 표준 1.91:1. make-thumb.mjs가 쓰는 값과 같다.
// 표는 줄 수만큼 세로가 필요해서 카드마다 size로 덮어쓸 수 있게 뒀다.
const DEF_W = 1200, DEF_H = 630;
const sizeOf = (c) => ({ w: c.size?.[0] ?? DEF_W, h: c.size?.[1] ?? DEF_H });

// 제목이 길면 잘리는 게 아니라 작아지게 한다 (make-thumb.mjs 실측값 그대로).
const titleSize = (n) => (n <= 20 ? 66 : n <= 30 ? 56 : n <= 40 ? 48 : 42);

const css = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  :root {
    --bg: ${pal.bg}; --panel: ${pal.panel}; --line: ${pal.line};
    --text: ${pal.text}; --dim: ${pal.dim}; --accent: ${pal.accent};
    --accent-dim: ${pal.accentDim}; --danger: ${pal.danger};
  }
  body { background: #000; font-family: ${fonts.sans}; }
  .mono { font-family: ${fonts.mono}; }
  .card {
    background: var(--bg); color: var(--text); position: relative; overflow: hidden;
    display: flex; flex-direction: column; margin-bottom: 40px;
  }
  .glow {
    position: absolute; width: 760px; height: 760px; border-radius: 50%;
    background: radial-gradient(circle, ${rgba(pal.accent, 0.13)} 0%, transparent 62%);
    top: -300px; right: -240px; pointer-events: none;
  }
  .bar {
    flex: 0 0 auto; display: flex; align-items: center; gap: 9px;
    padding: 20px 30px; background: var(--panel); border-bottom: 1px solid var(--line);
  }
  .dot { width: 14px; height: 14px; border-radius: 50%; display: inline-block; }
  .bartitle { margin-left: 14px; color: var(--dim); font-size: 21px; }
  .main {
    flex: 1 1 auto; min-height: 0; padding: 0 62px;
    display: flex; flex-direction: column; justify-content: center; position: relative;
  }
  /* 조용한 압축 대신 시끄러운 넘침으로 만든다.
     .main이 flex 컬럼이라 자식은 기본 flex-shrink:1이다. 높이가 모자라면 자식이
     **압축**되는데, .rows에 overflow:hidden이 있어서 압축된 만큼 내용이 사라진다.
     그건 요소가 카드 경계 **안에** 있어서 inspect.mjs의 넘침 검사에 안 걸린다.
     flex-shrink:0이면 압축 대신 밖으로 넘치고, 그건 잡힌다. 여백은 size로 맞춘다.
     ⚠️ 2026-08-11 표가 잘렸을 때 **이걸 원인으로 짚었는데 틀렸다.** 진짜 원인은
     뷰포트였다(아래 pageH 주석). 이 줄은 그 사건의 해결책이 아니라 예방책이다. */
  .main > * { flex-shrink: 0; }
  .kicker { color: var(--accent); font-size: 25px; font-weight: 800; letter-spacing: .02em; margin-bottom: 24px; }
  .kicker.mono::before { content: "$ "; opacity: .7; }
  /* 고아 줄 방지 — render.js 63줄과 같은 이유 */
  h1, h2, .sub, .note, .c1 { text-wrap: pretty; word-break: keep-all; }
  h1 { color: var(--text); line-height: 1.28; font-weight: 800; letter-spacing: -.02em; }
  h2 { color: var(--text); font-size: 44px; line-height: 1.3; font-weight: 800; letter-spacing: -.02em; }
  .sub { margin-top: 20px; color: var(--dim); font-size: 29px; line-height: 1.45; }
  .rule { margin-top: 32px; height: 6px; background: var(--accent); width: 120px; border-radius: 3px; }
  .foot {
    flex: 0 0 auto; display: flex; justify-content: space-between; align-items: center;
    padding: 0 62px 34px; color: var(--line); font-size: 21px;
  }
  .foot .r { color: var(--dim); }

  /* --- compare: 현재 -> 변경 후 --- */
  .rows { margin-top: 34px; border: 1px solid var(--line); border-radius: 18px; overflow: hidden; }
  .row { display: flex; align-items: center; gap: 20px; padding: 24px 34px; border-top: 1px solid var(--line); }
  .row:first-child { border-top: 0; background: var(--panel); }
  .row.same { background: ${rgba(pal.accent, 0.08)}; }
  .row .c1 { flex: 1.5; font-size: 32px; }
  .row .c2 { flex: 1; text-align: right; font-size: 38px; font-weight: 800; color: var(--dim); }
  .row .c3 { flex: 0 0 46px; text-align: center; font-size: 30px; color: var(--dim); }
  .row .c4 { flex: 1; text-align: right; font-size: 38px; font-weight: 800; color: var(--accent); }
  .row.same .c4 { color: var(--text); }
  .row .tag { flex: 0 0 92px; text-align: right; font-size: 24px; color: var(--dim); }
  .row.same .tag { color: var(--accent); }
  .note { margin-top: 26px; font-size: 26px; line-height: 1.5; color: var(--dim); }

  /* --- quote: 1차 원문 인용 ---
     ⚠️ 이건 **캡처가 아니라 인용 카드**다. 남의 화면처럼 보이게 만들면 안 된다.
        우리 팔레트·우리 크롬바를 그대로 써서 "우리가 옮겨 적었다"가 보이게 둔다.
        출처는 푸터에 도메인으로 박는다. */
  .items { margin-top: 30px; display: flex; flex-direction: column; gap: 18px; }
  .item {
    display: flex; gap: 18px; align-items: baseline;
    background: var(--panel); border: 1px solid var(--line); border-radius: 14px;
    padding: 22px 28px; font-size: 29px; line-height: 1.4;
  }
  .item::before { content: "·"; color: var(--accent); font-weight: 800; flex: 0 0 auto; }
  /* 항목이 ✅/❌로 시작하면 불릿이 겹쳐 마커가 둘이 된다 → 스펙에서 noBullet으로 끈다 */
  .items.nobullet .item::before { content: none; }
  .punch {
    margin-top: 30px; font-size: 34px; font-weight: 800; color: var(--accent);
    display: flex; align-items: center; gap: 16px;
  }

  /* --- grid: 가로 두 축 대조 (플랫폼 x 눈금) ---
     ★ 셀에 tone:"weak"를 주면 흐리게 + 꼬리표가 붙는다. 출처 등급이 다른 값을
        **같은 표에 나란히 두면 안 되기** 때문이다. 이 계정은 1차/2차 구분이 자산이다. */
  .grid { margin-top: 30px; border: 1px solid var(--line); border-radius: 18px; overflow: hidden; }
  .grow { display: flex; align-items: stretch; border-top: 1px solid var(--line); }
  .grow:first-child { border-top: 0; background: var(--panel); }
  .grow.hi { background: ${rgba(pal.accent, 0.1)}; }
  .gh {
    flex: 0 0 220px; padding: 26px 30px; font-size: 34px; font-weight: 800;
    display: flex; align-items: center;
  }
  .grow.hi .gh { color: var(--accent); }
  .grow:first-child .gh { font-size: 26px; font-weight: 400; color: var(--dim); }
  .gc {
    flex: 1; padding: 26px 30px; font-size: 29px; line-height: 1.35;
    border-left: 1px solid var(--line); display: flex; flex-direction: column; justify-content: center;
  }
  .grow:first-child .gc { font-size: 26px; color: var(--dim); }
  .gc.weak { color: var(--dim); }
  .gc .tail { margin-top: 8px; font-size: 22px; color: var(--danger); }
`;

const bar = (c) => `
  <div class="bar">
    <span class="dot" style="background:${pal.dots[0]}"></span>
    <span class="dot" style="background:${pal.dots[1]}"></span>
    <span class="dot" style="background:${pal.dots[2]}"></span>
    <span class="bartitle mono">${esc(c.barTitle ?? meta.barTitle ?? '')}</span>
  </div>`;

// 푸터 오른쪽은 **1차 출처 도메인**이다. 계정 핸들이 아니다 (파일 머리말 참고).
const foot = (c) => `
  <div class="foot mono">
    <span>${esc(c.footLeft ?? meta.footLeft ?? '')}</span>
    <span class="r">${esc(c.footRight ?? meta.footRight ?? '')}</span>
  </div>`;

function renderCard(c, i) {
  const { w, h } = sizeOf(c);
  let main = '';

  if (c.type === 'compare') {
    main = `
      <div class="kicker mono">${esc(c.kicker)}</div>
      <h2>${ml(c.heading)}</h2>
      <div class="rows mono">
        ${c.rows.map((r) => `
          <div class="row ${r.same ? 'same' : ''}">
            <span class="c1">${esc(r.label)}</span>
            <span class="c2">${esc(r.now)}</span>
            <span class="c3">→</span>
            <span class="c4">${esc(r.next)}</span>
            <span class="tag">${esc(r.tag ?? '')}</span>
          </div>`).join('')}
      </div>
      ${c.note ? `<div class="note">${ml(c.note)}</div>` : ''}`;
  } else if (c.type === 'grid') {
    const cell = (x) => typeof x === 'string'
      ? `<div class="gc">${ml(x)}</div>`
      : `<div class="gc ${x.tone === 'weak' ? 'weak' : ''}">${ml(x.text)}${x.tail ? `<span class="tail">${ml(x.tail)}</span>` : ''}</div>`;
    main = `
      <div class="kicker mono">${esc(c.kicker)}</div>
      <h2>${ml(c.heading)}</h2>
      <div class="grid">
        <div class="grow"><div class="gh mono">${esc(c.corner ?? '')}</div>${c.cols.map((t) => `<div class="gc mono">${esc(t)}</div>`).join('')}</div>
        ${c.rows.map((r) => `
          <div class="grow ${r.hi ? 'hi' : ''}">
            <div class="gh mono">${esc(r.head)}</div>
            ${r.cells.map(cell).join('')}
          </div>`).join('')}
      </div>
      ${c.punch ? `<div class="punch">${ml(c.punch)}</div>` : ''}
      ${c.note ? `<div class="note">${ml(c.note)}</div>` : ''}`;
  } else if (c.type === 'quote') {
    main = `
      <div class="kicker mono">${esc(c.kicker)}</div>
      <h2>${ml(c.heading)}</h2>
      <div class="items ${c.noBullet ? 'nobullet' : ''}">
        ${c.items.map((t) => `<div class="item">${ml(t)}</div>`).join('')}
      </div>
      ${c.punch ? `<div class="punch">${ml(c.punch)}</div>` : ''}
      ${c.note ? `<div class="note">${ml(c.note)}</div>` : ''}`;
  } else {
    main = `
      <div class="kicker mono">${esc(c.kicker)}</div>
      <h1 style="font-size:${titleSize(c.title.replace(/\n/g, '').length)}px">${ml(c.title)}</h1>
      ${c.sub ? `<div class="sub">${ml(c.sub)}</div>` : ''}
      <div class="rule"></div>`;
  }

  return `<div class="card" id="c${i}" style="width:${w}px;height:${h}px">
    <div class="glow"></div>${bar(c)}<div class="main">${main}</div>${foot(c)}</div>`;
}

const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>${css}</style></head>
<body>${cards.map(renderCard).join('\n')}</body></html>`;

const outDir = resolve(dirname(specPath), meta.outDir);
mkdirSync(outDir, { recursive: true });

// ★★★ 뷰포트를 **페이지 전체 높이**로 잡는다 (2026-08-11 실제로 당함).
//   처음엔 "가장 큰 카드 높이"로 잡았다. render.js가 그렇게 하는데, 거긴 카드가
//   전부 같은 크기라 첫 카드가 곧 전체였다. 여기선 카드가 여러 개고 크기가 달라서
//   **두 번째 카드가 뷰포트 밖(y=670)에서 시작**했고, locator.screenshot()이
//   스크롤해 잡으면서 아래쪽 내용이 통째로 빠진 이미지가 나왔다.
//   ⚠️ 그때 DOM은 **멀쩡했다** — 실측하니 3줄 다 있고 넘침 0이었다.
//   자기검사(inspect.mjs)도 정상이라고 맞게 답했다. 레이아웃이 아니라 **캡처**가
//   문제였다. 그래서 눈으로 이미지를 안 봤으면 못 잡는다.
//   전체를 화면 안에 놓으면 스크롤이 아예 안 일어난다.
const maxW = Math.max(...cards.map((c) => sizeOf(c).w));
const pageH = cards.reduce((a, c) => a + sizeOf(c).h + 40, 0);  // 40 = .card margin-bottom

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: maxW, height: pageH }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'networkidle' });

// 넘침 검사 — render.js 232줄과 같은 장치. 안전 여백은 가로 카드라 더 좁게 잡는다
// (세로 카드의 .inner padding-bottom 72px에 해당하는 값이 여기선 .foot 34px이다).
const inspection = await inspect(page, cards.map((_, i) => `#c${i}`), { safeBottom: 12 });
const renderErrors = report(inspection, (_, i) =>
  `${String(i + 1).padStart(2, '0')}번 (${cards[i].type ?? 'cover'}) ${cards[i].heading ?? cards[i].title ?? ''}`.trim());

for (let i = 0; i < cards.length; i++) {
  const name = cards[i].name ?? `img-${String(i + 1).padStart(2, '0')}`;
  await page.locator(`#c${i}`).screenshot({ path: resolve(outDir, `${name}.png`) });
  const { w, h } = sizeOf(cards[i]);
  console.log(`rendered: ${name}.png  ${w}x${h}`);
}
await browser.close();
console.log(`done. ${cards.length} images -> ${outDir}`);

// 네이버는 PNG를 그대로 받는다. JPEG 변환은 안 한다
// (인스타 API가 JPEG만 받아서 render.js가 둘 다 뽑는 것이고, 여기선 필요 없다).

if (renderErrors) {
  console.error(`\n❌ 렌더 오류 ${renderErrors}건 — 붙여넣기 전에 고칠 것`);
  process.exitCode = 1;
}
