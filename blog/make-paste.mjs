// 티스토리 붙여넣기용 변환기
//
// posts/*.md 는 작업용 파일이라 그대로 붙이면 안 된다:
//   ① YAML frontmatter — 내 메타데이터지 본문이 아니다
//   ② `# 제목` H1 — 티스토리는 제목 입력칸이 따로 있어서 두 번 나온다
// 둘을 떼어내고, 제목은 따로 뽑아 맨 위에 주석으로 붙인다.
//
// 🖼️ 마커는 **일부러 남긴다** — 그 자리에 실제 이미지를 넣어야 하니까.
// 자동으로 지우면 이미지 넣는 걸 잊는다.
//
// ★ 단 마커를 인용문(`> 🖼️ …`)이 아니라 **HTML 주석**으로 바꾼다.
//   인용문은 깜빡하고 안 지우면 발행글에 그대로 보인다.
//   주석은 안 지워도 화면에 안 나온다 — 실수의 대가가 다르다.
//
// 사용: node make-paste.mjs            (전체)
//       node make-paste.mjs ep-01      (하나만)

import { readdir, readFile, writeFile, mkdir, access } from 'node:fs/promises';
import path from 'node:path';

const SRC = 'posts';
const OUT = 'paste';

// ── 티스토리 마크다운 렌더 함정 검사 ──────────────────────────
// 2026-08-10 EP.01 게시 테스트에서 실제로 깨진 것들. 전부 미리보기 전엔 안 보인다.
function lint(body) {
  const nocode = body.replace(/```[\s\S]*?```/g, '');
  const out = [];

  // ① 볼드가 인라인 코드를 감싸면 파서가 흐트러진다 — **`x`** 는 `*x**` 로 나온다
  for (const m of nocode.matchAll(/\*\*`[^`\n]+`\*\*/g))
    out.push(['볼드+코드 겹침', m[0], '볼드를 빼고 코드만 남길 것']);

  // ② 홑별표 이탤릭은 한국어 조사가 바로 붙으면 안 닫힌다 (별표가 그대로 노출)
  for (const m of nocode.matchAll(/(?<!\*)\*(?!\*)[^*\n]{1,80}?\*(?!\*)/g))
    out.push(['홑별표 이탤릭', m[0].slice(0, 40), '따옴표나 볼드로 대체할 것']);

  // ③ 표 첫 열이 길면 한국어가 단어 중간에서 줄바꿈된다 ("이미지 형/식")
  for (const line of nocode.match(/^\|.+\|\s*$/gm) ?? []) {
    const c = line.replace(/^\||\|\s*$/g, '').split('|').map((x) => x.trim());
    if (!c[0] || /^[-: ]+$/.test(c[0])) continue;
    const label = c[0].replace(/[*`]/g, '');
    if (label.length >= 5) out.push(['표 첫 열이 김', label, '4자 이내·공백 없이']);
  }
  return out;
}

const filter = process.argv[2];
await mkdir(OUT, { recursive: true });
let lintTotal = 0;
const thumbMissing = [];

const files = (await readdir(SRC))
  .filter((f) => f.endsWith('.md'))
  .filter((f) => !filter || f.startsWith(filter));

if (!files.length) { console.error(`대상 없음 (필터: ${filter ?? '없음'})`); process.exit(1); }

for (const f of files) {
  const raw = await readFile(path.join(SRC, f), 'utf8');

  // ① frontmatter 제거
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!m) { console.error(`  ⚠️ ${f} — frontmatter 없음, 건너뜀`); continue; }
  let body = raw.slice(m[0].length);

  // ② H1 한 줄 제거 + 제목으로 뽑기
  const h1 = body.match(/^\s*#\s+(.+?)\s*\r?\n/);
  const title = h1 ? h1[1] : '(제목 없음 — 확인 필요)';
  if (h1) body = body.slice(h1[0].length);
  body = body.replace(/^\s+/, '');

  // 🖼️ 마커를 눈에 띄는 HTML 주석으로 교체 + 직전 h2(어느 절인지)를 같이 적는다
  const shots = [];
  {
    const lines = body.split(/\r?\n/);
    let section = '(도입부)';
    for (let i = 0; i < lines.length; i++) {
      const h2 = lines[i].match(/^##\s+(.+?)\s*$/);
      if (h2) { section = h2[1]; continue; }
      const mk = lines[i].match(/^>?\s*🖼️\s*`?([^`\n]+?)`?\s*$/);
      if (!mk) continue;
      const file = mk[1].trim();
      shots.push({ file, section });
      const n = shots.length;
      lines[i] =
        `<!-- ══════════ 이미지 ${n} ══════════\n` +
        `     파일: ${file}\n` +
        `     위치: 「${section}」 절\n` +
        `     → 여기에 이미지를 넣고, 이 주석 전체를 지우세요\n` +
        `     (안 지워도 화면엔 안 보입니다)\n` +
        `═══════════════════════════════ -->`;
    }
    body = lines.join('\n');
  }

  // ③ 대표이미지 실물 확인
  //
  // 2026-08-21 EP.09 가 정확히 이 자리에서 빠졌다.
  // 종전 체크리스트는 `out/thumb/ep-NN.png` 라는 **리터럴 문자열**이었다 —
  // NN 이 치환되지도 않고 파일을 stat 하지도 않아서,
  // 이미지가 있는 편과 없는 편의 출력이 글자 단위로 같았다.
  // 항목이 체크리스트에 있어도 파일을 안 보면 못 잡는다.
  //
  // 없으면 티스토리 기본 로고가 나간다 (2026-08-10 EP.01 에서 확인).
  const epSlug = f.replace(/^(ep-\d+).*$/, '$1');
  const thumbRel = path.join('out', 'thumb', `${epSlug}.png`);
  const hasThumb = await access(thumbRel).then(() => true, () => false);
  if (!hasThumb) thumbMissing.push(epSlug);

  // ④ 인용구 개수 — ③과 같은 이유로 **센다.**
  //
  // 2026-08-24: 사용자가 발행된 EP.07을 보고 *"인용구가 잘못 적용된 듯"*이라고 했다.
  // DOM 을 열어보니 마크다운 `> ` 가 티스토리에서 `data-ke-style="style1"` 로 들어가는데,
  // 이 스킨에서 style1 은 **시각 표시가 하나도 없다** — `::before` content 가 `none` 이라
  // 따옴표 글리프가 안 그려지고, `border-left`·`background` 도 없다.
  // 남는 건 `padding-top: 34px` 빈 공간과 가운데 정렬된 세리프 한 줄뿐이라
  // **인용구인지 알아볼 수가 없다.** 같은 스킨에서 style2 는 왼쪽 4px 세로선,
  // style3 은 사방 테두리 + 회색 배경이 나온다(실측).
  // EP.05 도 같은 상태로 나가 있다. 회차 문제가 아니라 **style1 + 이 스킨의 조합**이다.
  //
  // 🖼️ 마커는 위에서 이미 HTML 주석으로 바뀌었으므로 여기 남은 `>` 는 진짜 인용구다.
  const quoteCount = body.split(/\r?\n/).filter((l) => /^>\s*\S/.test(l)).length;

  const head =
    `<!-- ⚠️ 이 주석 블록은 붙여넣지 마세요. 아래 "===== 여기부터 =====" 다음부터 복사합니다.\n\n` +
    `【티스토리 제목칸】\n${title}\n\n` +
    (shots.length
      ? `【이미지 ${shots.length}장 — 본문 안 주석 자리에】\n` +
        shots.map((s, i) => `  ${i + 1}. ${s.file}\n     → 「${s.section}」 절`).join('\n') + '\n\n'
      : `【이미지 없음】\n\n`) +
    `【발행 전 확인】\n` +
    `  □ 마크다운 모드로 시작했는가 (글 쓰기 시작할 때 선택)\n` +
    `  □ 표가 표로 보이는가\n` +
    `  □ 코드블록이 회색 상자인가\n` +
    `  □ 제목이 본문에 또 나오지 않는가\n` +
    `  □ 카테고리 = 자동화 구축기 · 홈주제 = IT 인터넷\n` +
    (hasThumb
      ? `  □ 대표이미지 = ${thumbRel}   (파일 있음 — 확인됨)\n`
      : `  ⛔ 대표이미지 없음! → node make-thumb.mjs ${epSlug} 먼저 실행\n`) +
    (quoteCount
      ? `  ⛔ 인용구 ${quoteCount}곳 — 스타일을 「왼쪽 세로선」으로 바꿔라\n` +
        `     마크다운 > 는 style1(따옴표)로 들어가는데 이 스킨은 그 글리프를 안 그린다.\n` +
        `     그러면 테두리·배경도 없어서 인용구인지 알아볼 수 없다 (EP.05·EP.07이 그 상태로 나갔다).\n` +
        `     고치는 법: 인용구 블록 클릭 → 스타일 아이콘 → 두 번째(왼쪽 세로선)\n`
      : '') +
    `  ★ 기본 = 「공개」인가        ← 2026-08-10 EP.01이 비공개로 나갔다\n` +
    `  ★ 발행일 = 「예약」 + 날짜 맞나\n` +
    `  ★ 발행 후 로그아웃 상태(다른 브라우저)에서 URL 열어볼 것\n` +
    `-->\n\n` +
    `<!-- ===================== 여기부터 복사 ===================== -->\n\n`;

  const outName = f.replace(/^(ep-\d+).*$/, '$1.md');
  await writeFile(path.join(OUT, outName), head + body);

  const plain = body.replace(/```[\s\S]*?```/g, '').replace(/[#*|`>\-]/g, '').replace(/\s+/g, '');
  console.log(`  ${outName.padEnd(9)} ${plain.length.toLocaleString().padStart(6)}자 · 이미지 ${shots.length}장 · 대표이미지 ${hasThumb ? '있음' : '⛔ 없음'}${quoteCount ? ` · ⛔ 인용구 ${quoteCount}곳(스타일 바꿀 것)` : ''}`);
  shots.forEach((s,i)=>console.log(`      ${i+1}. ${s.file}  →  「${s.section}」`));
  console.log(`    제목: ${title}`);

  const issues = lint(body);
  lintTotal += issues.length;
  for (const [kind, sample, fix] of issues)
    console.log(`    ⚠️ ${kind}: ${sample}  →  ${fix}`);
}

console.log(`\n완료 → ${path.resolve(OUT)}`);
console.log('⚠️ 맨 위 주석 블록은 안내용이다. 티스토리에 붙일 때는 그 아래부터 복사할 것.');
console.log(lintTotal ? `\n❌ 렌더 함정 ${lintTotal}건 — 고치고 다시 돌릴 것` : '\n✅ 렌더 함정 0건');

// 대표이미지는 렌더 함정과 같은 등급으로 취급한다 — 둘 다 발행 전에만 잡을 수 있고,
// 놓치면 발행물에 남는다. 렌더 함정이 exitCode 1 이면 이것도 1 이어야 한다.
if (thumbMissing.length) {
  console.log(`\n⛔ 대표이미지 없음 ${thumbMissing.length}건 — ${thumbMissing.join(' ')}`);
  console.log(`   → node make-thumb.mjs ${thumbMissing[0]}   (없으면 티스토리 기본 로고가 나간다)`);
} else {
  console.log('✅ 대표이미지 전량 확인');
}

if (lintTotal || thumbMissing.length) process.exitCode = 1;
