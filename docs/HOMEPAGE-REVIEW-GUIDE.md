# Magic Indicator 홈페이지 검토 안내서

> 목적: 전체 정보 구조·정책·기술적 전제를 한 문서에서 점검하기 위함.  
> 이미지·캡처는 제외하고, 페이지·링크·기능 단위로 정리했다.  
> 대상 디렉터리: 저장소 내 `magic-indicator-site/` 정적 웹 프로젝트.

---

## 공식 웹사이트 (기준 URL)

**운영·배포·문서·외부 안내에서 사용하는 공식 주소는 다음과 같습니다.**

| 항목 | 값 |
|------|-----|
| **공식 홈페이지** | **[https://magicindicatorglobal.com/](https://magicindicatorglobal.com/)** |
| 용도 | 랜딩, 가이드, 가입·결제, OG·canonical, `api-base` 메타, JSON-LD Organization `url` 의 **단일 출처** |

- 이메일·광고·봇·외부 결제 페이지 등에 사이트 주소를 적을 때는 **위 URL을 그대로**(슬래시 포함) 강조하는 것이 좋다.
- 다른 도메인으로 미러 배포할 경우, 이 문서·`index.html` 헤더·빌드 스크립트의 `SITE_ORIGIN`을 **일괄** 맞춰야 한다.

---

## 1. 성격 및 배포 형태

- **정적 HTML 사이트**다. 페이지는 `.html`, 공통 스타일은 `assets/*.css`, 클라이언트 스크립트는 페이지 하단 또는 `assets`에 인라인/연동된다.
- **빌드 스크립트**(`package.json`):  
  - `npm run build` → 내비 주입(`build:nav`), SEO 파일(`build:seo`), OG 절대 URL(`build:og`), HTML 린트(`lint:html`), 링크 점검(`lint:links`) 순서로 실행된다.
- 배포 후 **도메인·API 베이스 URL**은 HTML 메타 또는 스크립트에 하드코딩된 값이 페이지마다 다를 수 있다. 검토 시 **실제 결제 도메인·API 도메인**을 각 파일의 `canonical`, `og:url`, `meta name="api-base"` 등과 교차 확인할 것을 권한다. **정적 소스 기준(2026-05 검토 반영):** `*.html`·`assets/admin-monitor.js`의 절대 URL은 `https://magicindicatorglobal.com` 으로 통일되어 있다(`SITE_ORIGIN` 기본값도 동일). 별 도메인으로 배포하면 빌드·메타 재확인이 필요하다.

---

## 2. 사이트 목적 요약

- 광고 문구 요지: **복잡한 분석보다 방향·구간·신호 중심**으로 차트 보조 도구와 가이드를 제공한다.
- **TradingView(TRV,Pine)** 환경과 **MetaTrader 5** 환경을 모두 노출한다.
- 상품 원칙(메인·가이드에 반복 등장): MT5 배포물은 **`틱(Tick) 차트 전용 .ex5`** 중심으로 설명된다. 일반 M1/M5 봉 전용 빌드를 판매·배포하지 않는다는 취지의 안내가 있다.
- **회원 이메일**, **본인인증**, **구독·결제 채널**, **약관**, **커뮤니티(모임터)**, **관리 도구**까지 한 사이트에 묶어둔 **허브** 구조다.

---

## 3. 전역 내비게이션(대표 메뉴 역할)

헤더·내비는 스크립트로 동기화될 수 있으나, 메인 기준 순서대로 기능은 다음과 같다.

| 링크(대표) | 역할 |
|-----------|------|
| 메인 (`index.html`) | 랜딩·요약·CMS 슬롯 |
| 가이드 (`guide/index.html`) | 문서 허브 |
| 지표 사용 (`guide/usage.html`) | 공통 사용 안내 |
| TRV (`guide/usage-trv.html`) | 트레이딩뷰 상세 |
| MT5 (`guide/usage-mt5.html`) | MT5 상세 · 틱 전용 원칙 |
| 다운로드 (`downloads/index.html`) | 배포물·설치 진입점 |
| SMS 시그널 (`registration/sms-addon.html` 등) | 월패키지 부가 과금 진입 |
| 가입·등록 (`registration/index.html`) | 가입 플로우 |
| 본인인증 (`verify/index.html`) | KYC 근거 페이지 |
| 구독·결제 (`billing/index.html`) | PayPal·은행송금·크립토·환불·가입 플랜 UI |
| 이벤트 (`events/index.html`) | 단기 과금 이벤트 |
| 회원혜택 (`membership/index.html`) | 혜택 설명 |
| 실전후기 (`reflection/index.html`) | 레퍼런스 |
| 문의 (`contact/index.html`) | 티켓·인보이스 이슈 |
| 모임터 (`boards/index.html`) | 게시판·내장 기능 |
| 약관·정책 (`legal/index.html`) | 법무 문서 인덱스 |
| 본부 데일리 (`head-daily-report/index.html`) | 내부/운영 표면 |
| 관리자 (`admin/index.html`) | 운영 콘솔 진입 |
| 연동 (`integrations/index.html`) | TRV·MT5 ID 저장·API 패턴 안내 |

**모바일 경로**: `m/index.html` 별도 두는 구조일 수 있다(간략판).

---

## 4. 메인 페이지 특이사항

- 상단 배너·CI 이미지는 시각 요소지만, 접근성 `alt`는 정의되어 있다.
- **`#cms-home-slot`**: “관리자가 저장한 HTML이 있으면 API에서 주입” 주석이 있다. 즉 일부 카피는 **백엔드/CMS 연동 스크립트**에 의존할 수 있다. 검토 시 API 미연결 상태와 연결 상태의 차이를 구분해야 한다.
- JSON-LD `Organization`: 회사 명·alternateName·`url`이 스키마에 박혀 있다.
- 매직라인 빠른 시작 3단계: 차트 적용 → 플랜 → 신호 확인 등 **제품 신념**(심플·실행)을 카피로 고정했다.
- **매직 차트 블록(스크린샷 아래)**: 교재형 일·주·월 노트와 ‘손실 뒤 쉼’, **계좌 % 규격은 지표 단독 제공 불가** → **당일 손실 청산 회수** 강제 휴식, **volatile window**(변동 시작 창)·**카운팅은 차트 적용 이후 새 종료 순번부터**(과거 시뮬 전량 소급 집계 아님)·옵티마이징·Risk·Filters·가이드 FAQ 링크(`index.html`·코어 Pine 교차 검증).

---

## 5. 가이드 허브(`guide/`)

| 파일 | 내용 초점 |
|------|-----------|
| `index.html` | 전체 순서 안내 카드(PCS), 계정·인증 블록 링크 |
| `usage.html` | 통합 사용 안내 진입 |
| `usage-trv.html` | TRV 전용 세부 |
| `usage-mt5.html` | MT5·틱 전용 강조 |
| `magictrading-strategy-inputs-ko.html` | 입력 파라미터(모드 등) 안내 · **Filters**·**신호 미발생 FAQ(canEnter)** |
| `tradingview-magic-r.html` | 특정 레퍼런스성 문구 |

신규 운영자는 **TRV 사용자 vs MT5 사용자**별로 받을 질문이 갈라지므로, 위 세 파일의 중복 표현 여부만 정리하면 대응 품질이 좋아진다.

---

## 6. 가입·등록·추가 정책(`registration/`)

- `index.html`: 정회원·등록 신청 진입점, 약관·동의 블록, 체험 플랜 파라미터(`?signup=1` 등 결제 페이지와 호흡 맞춤).
- `associate.html`: 연계 가입 또는 조직 규격이 필요할 경우.
- `sms-addon.html`: SMS 시그널 월 과금 패키지(건수 과금 선택).

검토 포인트: **이벤트 환불 불가 고지**, **무료 체험 조건**(TRV ID 또는 MT5 계좌+서버) 문구와 `billing/`의 조항이 교차 검증된다.

---

## 7. 본인인증(`verify/`)

- 본 개인 정보 수집·인증 업체 연동 결과를 회원 상태와 맞물리는 페이지로 가정된다.
- 가입 순서에서는 “가입 → 본인인증 → 결제” 단계 형태가 UI에 명시된다.

---

## 8. 구독·결제(`billing/index.html`) — 상세

이 페이지가 **외부 PG·직접 송금·크립토·환불** 등 가장 많은 카피를 가진 허브다.

### 8.1 납부 채널 원칙(페이지 카피 기준 요약)

1. **PayPal(카드)**: 소액·가입 계열 우선 채널. Airwallex는 “고객 직접 송금용이 아니라 PayPal 정산용”으로 반복된다.
2. **은행 외화 직접 송금**: 인보이스와 연동되는 **글로벌 수취 계좌**를 `#wire-route-picker`에서 선택(통화·지역별 카드 렌더).
3. **크립토**: 메이저 우선·잡코인 수동 견적·네트워크·꼼꼼한 알림 플랫폼 카피.
4. **원화 법인(우리은행 등)**: 환율·만 원 절산·금액 꼬리표 개념.

### 8.2 “월 과금 상한” 회사 정책

- 카피 어딘가에 **1개월을 넘은 선결제 불가**(연 회원 형태 불가 등) 회사 규약이 존재한다. PG·판매 페이지와 모순이 없는지 별도 검토 필요.

### 8.3 환불·정규·이벤트

- 요청 폼(UI), 원화 반환 입력·달러 입력 구분 등이 존재한다.
- 클라이언트가 로그인 이메일 기준 **환불 예상 계산**(API 필요) 패턴이다.
- **정규·비즈(월)** vs **이벤트·무료·쿠폰 불가**를 법 페이지와 문자열 레벨로 맞출 것.

### 8.4 SMS 시그널 월패키지

- `billing/` 상단 카드처럼 “문자 과금 패키지(200건/500건…)” 카피가 있다. 과금 페이지는 `registration/sms-addon.html`과 일치해야 한다.

### 8.5 현금 송금 — 동적 선택 UI (“현금 송금 계좌 선택”, `#wire-route-picker`)

두 단계 콤보로 **통화별로 가능한 수취 지역만** 채워지고, 해당 조합으로 **표 테이블**이 렌더링된다는 구조가 스크립트에 구현되어 있다.

- **1단계: 납부 통화 선택** (`#wire-ccy-select`) — USD·KRW·EUR·GBP·JPY·AUD·CAD·CHF·HKD·CNY·SGD·NOK·NZD·SEK 등.
- **2단계: 수취 계좌 국가·지역 선택** (`#wire-country-select`) — 통화에 따라 재구축된다. 라벨에 은행명이 포함된 형태(예: “미국 — Community Federal…”).

통화별 **수취 지역 집합(스크립트 설계)**

| 통화 | 지역 코드·의미 |
|------|----------------|
| KRW | KR 만 (우리은행 법인 원화 등) |
| USD | US(Community Federal Savings Bank), SG(DBS 멀티) |
| CAD | CA (Digital Commerce Bank) |
| AUD | AU (ANZ 계열 카피) |
| HKD | HK (Standard Chartered 카피) |
| EUR | DE (Banking Circle IBAN), SG (DBS 동일 번호 다른 통화) |
| GBP | GB (Airwallex UK 카피), SG (DBS) |
| SGD 등 싱가 다통화 | SG 만 (계좌 1줄 세트 반복 활용: CNY CHF JPY 등) |

표에 포함되는 세부항목 유형 예: 글로벌 명의 `haengbokdoam invest co ltd` 계열 문자열 vs 한국 **정식 법인명** 문자열 분리 필요 지점, SWIFT·IBAN·routing·branch code·정렬코드 등.

- **납부 통화 변경 시** 페이지 하단 UX 토스트로 **수취 지역 콤보가 바뀌었음**을 안내한다(처음 로드 때는 표시 안 함).

- 인페이지 앵커는 **`#wire-route-picker`** 로 맞춘다.

- **EUR · DE(Banking Circle)**: 미국 CFSB용과 유사하게 **국내/EU 은행 IBAN 입력 예시** 점선 카드가 동적 블록에 붙는다.

- 각 글로벌 카피에서는 **Beneficiary명·코드(IBAN 등)**를 인보이스·표시 카드와 **완전 일치**시키도록 안내한다.

추가로 **미국 USD** 선택 시에는 “국내 은행 해외송금 입력 예시(점선 카드)”가 붙도록 되어 있다는 점 검토 가능.

컴파일/QA 체크: 실제 브라우저에서 통화 변경 시 콤보 옵션 리셋, 상단 통화 칩바(`currency-chip`)와 연동 불일치(칩 미지원 통화 선택 시 모든 칩 off) 같은 UX가 존재한다.

### 8.6 정적 패널(과거 레거시)

- 옛 하나은행 전용 정적 블록(`#aw-usd-base`)은 **마크업에서 제거**되었다. 송금 안내는 `#wire-route-picker` 동적 표 + 인보이스만 신뢰 근거로 둔다.

---

## 9. 약관·정책(`legal/`)

| 문서 성격 예시 |
|----------------|
| `terms.html`: 기본 약관 |
| `privacy.html`: 개인정보 |
| `refund.html`: 환불 공식 및 PG 심사용 요약 레퍼 |
| `plan-terms-nonrefund.html`: 환불 불가 총괄 |
| `terms-magictrading-regular.html`: 정규 특약 |
| `terms-magictrading-event.html`: 이벤트 |
| `terms-magictrading-free-trial.html`: 무료 체험 특약 |
| `access-matrix.html`: 접근권 레벨 참고표 |

허브 `legal/index.html`에 **PG 결제 관점 한눈에** 박스가 있다. 카피 수정 시 허브 vs 본문 이중 수정 위험이 있다.

---

## 10. 연동 페이지(`integrations/index.html`)

- TRV 사용자명 처리(@ 제거)·MT5 **계좌 번호 + 서버** 조합 라이선스 설계 근거를 설명한다.
- 헤더 `X-User-Id` 패턴(API 사전 패턴)·모임터와 이메일 일치 같은 운영 룰이 서술되어 있다.

---

## 11. 게시판·관리도구

### 11.1 모임터(`boards/index.html`)

- 쿼리 `?board=` 로 게시판 분기 패턴 존재(예 `event_promo_shoutout` 링크).
- 인증 상태에 따라 기능이 분기될 가능성 높음(클라이언트 라우팅 포함).

### 11.2 관리자(`admin/`)

- `index.html`: 전역 운영.
- `monitor.html`: 상태 모니터·특화 UI일 수 있다.
- 접근 차단 필요(패스워드·IP·별도 레이어)—배포 시 보안 검토 대상이다.

---

## 12. 기타 단일 기능 페이지

| 경로 | 용도 |
|------|------|
| `events/index.html` | 한시 이벤트 요금 진입점 |
| `membership/index.html` | 혜택 카피 |
| `reflection/index.html` | 사례 카피 |
| `contact/index.html` | CS·토스 인보이스 링크 |
| `downloads/index.html` | 배포 패키지·주의 고지 |
| `telegram-chat-id/index.html` | 텔레그램 채널 ID 안내 등 |
| `head-daily-report/index.html` | 내부 커뮤니케이션/리포트 |
| `404.html` | 페이지 없음 처리 |
| `m/index.html` | 모바일 요약판 |

---

## 13. 주요 에셋(이미지 제외 개념)

- `assets/common.css`: 전역 레이아웃.
- `assets/site-ux.css`: UI 공통 패턴(toast 포함 추정)·버튼.
- 페이지별 특화 스타일: `billing` 암호화 입금 카드류, 보드 내장 등.
- 빌드 시 내비 주입·SEO 메타 수정 스크립트 (`scripts/`).

---

## 14. 검토 체크리스트(운영 준비)

1. **도메인 단일화**: `canonical`/OG/`api-base` 문자열 교차 검사(정적 소스는 `magicindicatorglobal.com` 로 정리됨).
2. **법적 카피 vs 결제 UI**: 무료 체험·자동 유료 불가 표현·연회비 불가·환불 수식 문자열 교차 검사.
3. **외화 표시**: 페이지 정적 패널 vs 동적 JS 테이블이 **금액·계좌·SWIFT 불일치**를 내지 않는지 검사(CFSB·DBS 각각 업데이트 시 이중 패치 점수).
4. **은행 카피**: 글로벌 명의 문자열 표기 차이와 한국 증빙용 법인명 표기 차이를 고객이 혼동하지 않게 순서 또는 주석 정리 검토.
5. **관리자(`admin/`)**: IP 화이트리스트·별도 인증·역프록시 등 **인프라·API 권한**을 운영·보안과 교차 검증(경로 숨김만으로는 부족).
6. **링크 순회**: `npm run lint:links` 실행 후 깨진 링크 0 타깃 확인.
7. **접근성**: 이미지 `alt`, 폼 레이블, `aria-live` 존재(결제 패널) 등 간단 패스.

---

## 15. 업데이트 이력(문서 작성 기준 포함 사항)

- **2026-05 (외부 검토 반영·코드 정리)**: 전역 `https://happyinvests.com` → `https://magicindicatorglobal.com` 치환, `billing` 상단 **브랜드·법인 안내** 문구, `#wire-route-picker` 통화 변경 **토스트**, **EUR IBAN 점선 예시 카드** 등.
- **2026-05 (하나은행 노출 종료)**: 공개 카피·법무·메인 등에서 하나은행(KEB Hana)·해당 계좌 번호 노출 삭제; USD 라우팅은 US·SG 중심, `#aw-usd-base` 마크업 **삭제**.
- 본 안내에는 **통화별 수취 지역 콤보 + 글로벌 계좌 다건** 브랜치가 반영된 결제 패널 구조 요약을 포함하였다.
- 실제 라우팅 번호·IBAN 변경은 원천 레지스트리와 대조해야 하며 웹 카피는 그 복제물일 뿐이다.

---

## 16. 이 문서 활용처

LLM에게 “컨텍스트로 줄 설명만” 줄 때에는 **위 [공식 웹사이트](#공식-웹사이트-기준-url)** 한 줄과 섹션 3·8·10을 우선 붙여 넣고, 법 무결성은 반드시 `legal/` 원문 교차 검증을 명시하면 재현 가능한 리뷰가 된다. Pine·홈 카피·가이드를 한 덩어리로 줄 때는 별첨 **`docs/GEMINI-HOMEPAGE-BRIEFING.md`**(제미나이 등 외부 LLM용 브리핑)와 이 문서를 함께 쓸 수 있다. 고객에게 사이트 안내를 줄 때는 **`https://magicindicatorglobal.com/`** 를 명시적으로 적는 것을 권장한다.

---

*파일 생성 위치*: `magic-indicator-site/docs/HOMEPAGE-REVIEW-GUIDE.md`  
*내용 근거*: 프로젝트 내 HTML 헤더·네비 구조 및 `billing` 동적 선택 스크립트 설계.
