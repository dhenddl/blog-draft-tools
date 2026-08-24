# blog-draft-tools

티스토리·네이버 블로그 **초안까지 자동, 발행은 손**으로 하는 도구 4개.

## 먼저 — 이건 발행 도구가 아닙니다

클론해서 돌리면 **글이 올라가지 않습니다.** 붙여넣을 파일과 이미지가 나옵니다.

그렇게 만든 게 아니라, **그렇게밖에 안 됩니다.**

| | 공식 발행 API |
|---|---|
| 티스토리 | **2024-02 완전 종료** |
| 네이버 블로그 | **2020-05-06 종료**(`writePost.json`) |

남은 경로는 브라우저 자동화뿐인데, 저희는 거기까지 가지 않기로 했습니다. 자동 발행은 계정 제재 위험이 있고, 무엇보다 **발행 직전에 사람이 한 번 보는 단계를 없애고 싶지 않았습니다.**

그래서 이 저장소의 범위는 **원고 → 붙여넣을 것**까지입니다.

## 도구 4개

```bash
npm install && npx playwright install chromium
```

| | 하는 일 |
|---|---|
| `blog/make-paste.mjs` | `posts/*.md` → 티스토리 에디터에 **붙여넣을 마크다운**. frontmatter와 H1을 떼고, 이미지 자리는 남깁니다 |
| `blog/make-thumb.mjs` | 대표이미지(OG) **1200×630** PNG |
| `blog/make-uipath.mjs` | **화면 경로 도식** — 스크린샷 대신 쓰는 UI 안내 이미지 |
| `cardnews/render-blog.mjs` | 본문 삽입용 가로 이미지 (JSON 스펙 → PNG) |

⚠️ **`make-paste.mjs`와 `make-thumb.mjs`는 `posts/`를 현재 디렉터리 기준으로 찾습니다.** `blog/` 안에서 실행하세요.

```bash
cd blog
mkdir -p posts uipath           # 여러분의 원고와 스펙을 넣는 자리

node make-paste.mjs             # posts/ 전체 → paste/
node make-paste.mjs ep-01       # 하나만
node make-thumb.mjs ep-01       # → out/thumb/
node make-uipath.mjs uipath/ep-01.json

cd ../cardnews
node render-blog.mjs path/to/spec.json
```

이 저장소에는 저희 원고가 들어 있지 않습니다. `posts/*.md`는 YAML frontmatter에 `title`이 있고 본문이 `# 제목`으로 시작하는 형식을 가정합니다 — `make-thumb.mjs`가 제목을 ` — `로 갈라 주/부 제목을 만듭니다.

## 실제로 걸렸던 것들

이 도구들은 전부 **한 번 깨진 다음에** 생겼습니다.

**① 대표이미지를 안 만들면 티스토리 기본 로고가 뜹니다**
`twitter:card`가 `summary_large_image`라 공유 카드에서 크게 나와 더 눈에 띕니다. → `make-thumb.mjs`

**② 인용구 스타일이 스킨에 따라 아무 표시도 안 남습니다**
티스토리 에디터의 인용구 3종 중 「따옴표」형(`data-ke-style="style1"`)은 스킨이 `::before` content를 `none`으로 두면 **테두리도 배경도 없이 위쪽 여백만 남습니다.** 발행 후 두 편에서 그렇게 됐습니다. → **「왼쪽 세로선」형을 쓰세요.**

**③ 스크린샷은 낡고, ID가 찍힙니다**
대시보드 캡처에는 앱 ID·사용자 ID가 들어갑니다. 마스킹은 잊기 쉽고 UI는 몇 달이면 바뀝니다. **도식은 마스킹 실수 위험이 0입니다.** → `make-uipath.mjs`
⚠️ 다만 도식이 스크린샷을 대체하지는 않습니다. 재현 가능한 화면은 실물도 같이 넣으세요.

**④ 볼드가 인라인 코드를 감싸면 티스토리 파서가 흐트러집니다**
`**` + 백틱 조합이 그대로 글자로 나옵니다. `make-paste.mjs`가 검사해서 경고합니다.

## 티스토리와 네이버는 다릅니다

한 플랫폼만 하면 안 보이는 대비입니다.

| | 티스토리 | 네이버 |
|---|---|---|
| 마크다운 | 받습니다 | **안 받습니다**(평문만) |
| 이미지 | **핫링크** — 원본을 매번 때립니다 | **재호스팅** |
| 대표이미지 | 직접 넣어야 합니다 | 자동으로 잡힙니다 |
| 발행 | 붙여넣기 | 붙여넣기 |
| 맞춤법 검사 | — | **고유명사를 쪼갭니다** |

네이버 쪽 초안 변환기는 이 저장소에 없습니다. 저희 내부 문서 구조에 묶여 있어서 클론하면 그대로 죽습니다. 대신 **본문 이미지 도구(`render-blog.mjs`)는 JSON 스펙만 받으므로 양쪽에 다 씁니다.**

## 바꿔야 할 것

⚠️ **푸터에 저희 계정이 하드코딩돼 있습니다.**

- `blog/make-thumb.mjs` — `dhenddl1.tistory.com` / `@dhenddl1`
- `blog/make-uipath.mjs` — `무인 수익 실험 · dhenddl1.tistory.com`

여러분 것으로 바꿔서 쓰세요. 그리고 **결과물에 남의 계정명·브랜드가 남지 않게** 한 번 확인하시는 걸 권합니다.

색은 `cardnews/palette.mjs` 한 곳에서 옵니다. 거기만 바꾸면 네 도구의 얼굴이 같이 바뀝니다.

## 만든 곳

AI 자동화 실측을 공개하는 계정에서 나왔습니다 — [@dhenddl1](https://www.instagram.com/dhenddl1)
인스타그램·스레드 무인 발행 쪽은 따로 있습니다: [instagram-threads-autopublish](https://github.com/dhenddl/instagram-threads-autopublish)

MIT.
