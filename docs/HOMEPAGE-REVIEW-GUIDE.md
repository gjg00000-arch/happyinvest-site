# Magic Indicator 홈페이지 검토 안내서

> 목적: Magic Indicator 정적 사이트의 정보 구조, 보안 노출면, 결제·약관 정책, 배포 절차를 한 문서에서 점검하기 위함입니다.  
> 대상 디렉터리: `C:\Users\gjg00\자동매매\magic-indicator-site`

---

## 1. 단일 원본·배포 기준

- **Git 원본 폴더**: `C:\Users\gjg00\자동매매\magic-indicator-site`
- **GitHub 원격**: `https://github.com/gjg00000-arch/happyinvest-site.git`
- **공식 공개 도메인**: `https://magicindicatorglobal.com/`
- **S3 버킷**: `magicindicator-global-web-6145`
- **CloudFront 배포**: `E2Y7ZN7QM8A91S`
- **최근 배포 무효화**: `I4YJ9FUEINA7TPKBDWU3G795S9`, 완료 확인

운영 원칙: 홈페이지 Git 작업은 `magic-indicator-site`에서만 수행합니다. 상위 폴더나 API 폴더에서 Git 커밋·푸시하지 않습니다.

---

## 2. 빌드·검증 파이프라인

`package.json` 기준:

| 명령 | 역할 |
|------|------|
| `npm run build:nav` | 전역 내비 주입 |
| `npm run build:seo` | `sitemap.xml`, `robots.txt` 생성 |
| `npm run build:og` | OG URL 절대경로 보정 |
| `npm run build:home-extra-i18n` | 홈 추가 콘텐츠 다국어 번들 생성 |
| `npm run build:guide-doc-i18n` | 가이드 문서 다국어 번들 생성 |
| `npm run lint:html` | HTML 구조 검사 |
| `npm run lint:links` | 내부 링크 검사 |
| `npm run lint:admin-links` | 공개 HTML/JS의 관리자 링크 노출 차단 |
| `npm run verify` | 전체 빌드·검증 |

검토자는 배포 전 `npm run verify` 통과를 기본 조건으로 봅니다.

---

## 3. 전역 내비게이션

공개 내비 대표 항목:

| 링크 | 역할 |
|------|------|
| `index.html` | 랜딩·요약·가격표 |
| `guide/index.html` | 가이드 허브 |
| `guide/usage.html` | 통합 사용 안내 |
| `guide/usage-trv.html` | TradingView 안내 |
| `guide/usage-mt5.html` | MT5 안내 |
| `downloads/index.html` | 배포물·설치 진입 |
| `registration/index.html` | 가입·등록 |
| `registration/login.html` | 로그인 |
| `verify/index.html` | 본인인증 |
| `billing/index.html` | 구독·결제 |
| `events/index.html` | 이벤트 |
| `membership/index.html` | 회원혜택 |
| `reflection/index.html` | 실전후기 |
| `contact/index.html` | 문의 |
| `boards/index.html` | 모임터 |
| `legal/index.html` | 약관·정책 |
| `head-daily-report/index.html` | 본부 데일리 |
| `integrations/index.html` | 연동 안내 |

공개 내비에는 `admin/index.html`, `admin/monitor.html` 링크를 넣지 않습니다.

---

## 4. 관리자 경로 보안 점검

- `admin/` 파일은 운영 콘솔 파일일 수 있으나 공개 내비·사이트맵·robots·고객 카피에 노출하지 않습니다.
- `scripts/lint-admin-links.mjs`가 공개 HTML/JS의 `admin/` 링크를 차단합니다.
- 보안은 “링크를 안 보여주는 것”으로 끝나지 않습니다. 실제 `/admin/*` 접근 통제는 WAF, 인증, IP allowlist 등 인프라 레이어에서 처리해야 합니다.
- `npm run build:seo`는 `admin/*`을 sitemap에서 제외하는 방향을 유지해야 합니다.

---

## 5. 도메인·SEO 기준

- canonical, OG, sitemap, robots 기준 도메인은 `magicindicatorglobal.com`입니다.
- `happyinvests.com`은 공개 도메인 SSOT가 아닙니다. 신규 카피·SEO·API 기준으로 추가하지 않습니다.
- 검토 명령 예:
  - `npm run verify`
  - `rg "happyinvests\\.com|admin/index\\.html|admin/monitor\\.html" .`

---

## 6. 메인·모바일 페이지 점검

### `index.html`

- 제품 철학, 가격표, 신청 플로우, 약관·결제 진입을 함께 담은 랜딩입니다.
- 가격표·시장 라이선스 설명은 다크모드 대비가 깨지지 않아야 합니다.
- 운영팀 내부 원장 확인 문구는 공개 관리자 링크로 바꾸지 않습니다.

### `m/index.html`

- 모바일 요약판입니다.
- 빌드 호환용 숨김 `nav.site-nav` 구조가 유지되어야 합니다.
- 다국어 빌드 후 `aria-label`, 숨김 내비, 주요 CTA가 깨지지 않는지 확인합니다.

---

## 7. 결제·약관 검토

### 사용자 카피

- 1개월 초과 장기 선결제, 연회원, 다월 선납형 상품을 판매 가능처럼 표현하지 않습니다.
- 이벤트·무료·쿠폰·정규·비즈 월 과금의 환불 가능 여부를 `legal/` 원문과 맞춥니다.
- 가상자산 결제는 “입금 신고와 운영팀 확인” 기준입니다. Ledger 하드웨어 자동 연동처럼 설명하지 않습니다.

### 서버 가드

백엔드 기준:

- `legal_acceptance_id` 필수
- 플랜 코드와 약관 scope 일치 검증
- `unknown` 플랜 코드 거부
- `plans` 카탈로그에 문서가 있는 경우 1개월 초과·연간·선납형 SKU 거부

프런트엔드 카피는 이 서버 정책을 우회할 수 없다는 전제로 씁니다.

---

## 8. 권한·체험·레거시

- 권한 판별은 `users`, `free_trial_accesses`, `trial_indicator_entitlements` 병합 구조를 전제로 합니다.
- 무인 1주 무료 체험 웹훅은 `one_week_free_trials` 컬렉션에서 `trv_id`, `mt5_account`, `mt5_server`와 최초 유입 시각을 관리합니다.
- `tv_id` 또는 MT5 식별값이 최초 유입이면 7일 체험 원장을 만들고, 기존 식별값은 최초 시작 시각 기준 7일 초과 시 403으로 차단합니다.
- TradingView 1주 무료 Pine은 `Dodam_MagicTrading_Marketfree_1weekfree.pine` 배포본을 기준으로 봅니다. `showTrialGuide`가 켜져 있으면 `MagicTrading 1-Week Trial Mode\n공식 정규 플랜은 홈페이지에서 확인하세요.` 고정 안내만 표시합니다.
- Pine 차트는 체험 일차나 만료 여부를 계산하지 않습니다. 실제 7일 제한, 중복 사용 차단, 만료 감사 로그는 서버 웹훅과 `one_week_free_trials` 원장이 정본입니다.
- `trial_indicator_entitlements`는 레거시 호환 계층입니다. 즉시 삭제하지 않고 백필·검증·롤백 계획 후 제거합니다.
- TRV username, MT5 계좌+서버, 이메일 등 운영 확인 정보는 공개 admin URL이 아니라 내부 원장 확인 문구로 안내합니다.

---

## 9. 리치 텍스트 에디터

- `assets/board-rte.js`는 순수 Web Standard API 기반입니다.
- 마케팅·문서에서 Tiptap, ProseMirror, `document.execCommand` 기반으로 설명하지 않습니다.
- 게시판 에디터 검토 시 `contentEditable`, `Selection`, `Range`, DOM 조작, hidden 필드 동기화 흐름을 기준으로 봅니다.

---

## 10. 배포 절차

권장 배포:

1. `npm run verify`
2. `npm run deploy:s3:py`
3. CloudFront invalidation 완료 확인
4. `git status --short --branch`
5. `git push`

정적 사이트 배포 스크립트는 S3 sync 후 HTML short cache sync, CloudFront invalidation을 수행합니다.

---

## 11. 운영 체크리스트

- `npm run verify` 통과
- `lint:admin-links` 통과
- `sitemap.xml`에 `admin/*` 없음
- 공개 HTML/JS에 `admin/index.html`, `admin/monitor.html` 링크 없음
- 공개 도메인 문자열이 `magicindicatorglobal.com` 기준
- `m/index.html`의 숨김 `site-nav` 유지
- 가격표·송금 테이블 다크모드 가독성 확인
- 결제 페이지의 1개월 상한·약관 필수 문구 확인
- 크립토·Ledger 문구가 자동 연동으로 오해되지 않는지 확인
- 배포 후 CloudFront invalidation 완료 확인
- Git 작업은 `magic-indicator-site`에서만 수행

---

## 12. 고도화 권장 과제

- **시그널 웹훅 로그 TTL**: `SIGNAL_WEBHOOK_EVENTS_TTL_DAYS=90`처럼 양수를 설정해 `signal_webhook_events` 비대화를 운영 정책에 맞게 제어합니다.
- **Stale Prepared 알림**: `payment_requests`가 생성된 뒤 PG 웹훅 누락·지연으로 `prepared` 상태에 오래 머무는 건을 백오피스 Dead Letter 또는 stale 알림으로 끌어올리는 설계를 권장합니다.
- **레거시 권한 이관**: `trial_indicator_entitlements`는 백필, 샘플 검증, 롤백 플랜, 읽기 병합 제거 순서로 단계 이관합니다.
- **WAF 접근 통제**: 공개 링크 제거와 별개로 `/admin/*`는 CloudFront WAF, 인증, IP allowlist로 물리 접근 통제를 확인합니다.

---

## 13. 갱신 시점

- 기준 갱신: 2026-06-02 22:34 KST
- 최근 반영 항목:
  - 공개 관리자 링크 제거
  - `lint:admin-links` 추가
  - 다국어 빌드 후 검증 순서 조정
  - CloudFront 배포·무효화 확인
  - Git 원본 `magic-indicator-site` 단일화
  - 결제 요청 서버 가드 기준 문서화
  - TTL, stale prepared, 레거시 권한 이관 권장 과제 반영
  - 1주 무료 Pine 고정 안내 메시지와 백엔드 만료 정본 경계 반영