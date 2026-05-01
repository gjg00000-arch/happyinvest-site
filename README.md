# magic-indicator-site

정적 HTML·공통 CSS/JS 로 구성된 Magic 지표 공개 사이트입니다.

## 명령

| 명령 | 설명 |
|------|------|
| `npm install` | 의존성(html-validate) 설치 |
| `npm run build:nav` | `scripts/inject-site-nav.mjs` 실행 — 상단 `<nav class="site-nav">` 를 **단일 매니페스트** 기준으로 모든 HTML 에 주입 |
| `npm run build:seo` | `sitemap.xml`·`robots.txt` 생성(도메인은 `SITE_ORIGIN`, 기본 `https://magicindicatorglobal.com`; `admin/` 는 색인 배제·사이트맵 제외) |
| `npm run build:og` | `og:image` 를 `SITE_ORIGIN` 기준 **절대 URL**로 기입(SNS 미리보기 크롤러용; `data-relative` 제거) |
| `npm run lint:html` | `html-validate` 로 프로젝트 내 `*.html` 검사( `tools/`·`node_modules` 제외 ) |
| `npm run lint:links` | HTML 간 **`.html` 페이지 링크** 가 저장소에 존재하는지 검사 |
| `npm run build` | `build:nav` → `build:seo` → `build:og` → `lint:html` → `lint:links` — 배포·PR 전 전체 확인 |

루트 `404.html` 은 호스팅 설정에서 없는 URL 응답으로 지정하면 됩니다(Netlify·GitHub Pages·Cloudflare 등 문서 참고).

또 다른 검증 도메인에서 빌드할 때는 같은 빌드에 `SITE_ORIGIN` 만 맞추면 `sitemap.xml`·`robots.txt`·`og:image` 가 일관됩니다.

**상단 메뉴 변경 순서**

1. `scripts/inject-site-nav.mjs` 의 `PAGES` 배열(경로·`kind`·`active`)을 수정합니다.
2. `npm run build:nav` 로 내비를 갱신합니다.
3. `npm run build` 로 내비·사이트맵·린트·링크 검사를 한 번에 실행합니다.

같은 디렉터리의 `<nav>` 마크업·`aria-label` 문구를 손으로 바꾼 경우, 스크립트 정규식과 맞추거나 스크립트를 함께 수정해야 주입이 됩니다.

## 내부 운영(소규모 팀)

회원·역할·SSOT·실무 1인 기준 운영 레일(체크리스트·비상 권한·템플릿)은 **`사이트_구성_요약_제미나이용.md`** 의 **「소규모 팀(근로자 2명…)·운영 현실」** 절을 본다.

## 프런트·UX(최근 반영)

공통 `assets/site-ux.js`는 **theme-color / iOS 상태 표시줄** 동기화, **`referrer`(strict-origin-when-cross-origin)**, **viewport `viewport-fit`(노치 안전 영역)**, 지원 브라우저에서 **테마 전환 View Transitions** 를 처리합니다. 레이아웃·입력은 `assets/common.css` — **accent-color**, **scrollbar-gutter**, **`text-wrap: balance`(제목)** , 모바일 **내비 링크 최소 터치 높이**, `assets/site-ux.css` 의 **safe-area** 패딩 등을 참고하세요.

## HTML 검사 정책

`.htmlvalidate.json` 은 레거시 정적 페이지 특성상 인라인 스타일·일부 접근 규칙 등을 비활성화해 두었고, **원시 `&` 문자** 등은 `error` 로 유지합니다. 상세는 해당 파일 참고.

`lint:html` 은 경고를 기본으로 콘솔에 출력하지 않습니다. 항목별 로그가 필요하면 `LINT_HTML_VERBOSE=1` 환경 변수를 설정하세요(Windows PowerShell: `$env:LINT_HTML_VERBOSE='1'; npm run lint:html`).
