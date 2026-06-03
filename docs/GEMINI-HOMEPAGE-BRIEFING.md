# Gemini용 · Magic Indicator 홈·제품 맥락 브리핑

> 용도: Google Gemini 또는 유사 LLM에 붙여 넣어 홈 카피, FAQ, 번역, 내부 요약의 기준 컨텍스트로 사용합니다.  
> 법적 약관·결제 세부는 `legal/`, `billing/` 원문이 우선입니다.

---

## 1. 공식 사이트·운영 기준

- **공개 홈 SSOT**: `https://magicindicatorglobal.com/`
- **정적 사이트 원본 Git 루트**: `C:\Users\gjg00\자동매매\magic-indicator-site`
- **GitHub 백업 원격**: `https://github.com/gjg00000-arch/happyinvest-site.git`
- **배포 대상**: S3 `magicindicator-global-web-6145` + CloudFront `E2Y7ZN7QM8A91S`
- **최근 배포 확인**: 2026-06-03 18:41 KST 기준, `users` 단일 원장·Invite-only 5종 Pine·Telegram `tg_id` 릴레이 연동 최종 배포 준비 완료
- `happyinvests.com`은 공개 카피·SEO·OG·canonical 기준으로 사용하지 않습니다. 공개 기준 도메인은 `magicindicatorglobal.com` 하나입니다.

---

## 2. 홈페이지·빌드 기준

- 메인 랜딩: `index.html`
- 모바일 요약판: `m/index.html`
- 공통 UX/i18n: `assets/site-ux.js`, `assets/home-extra-i18n.js`, `assets/guide-doc-i18n.js`
- 홈 가격표·시장 라이선스 설명은 `assets/home-philosophy.css`의 다크모드 대비 기준을 따릅니다.
- 리치 텍스트 에디터는 `assets/board-rte.js`의 **순수 Web Standard API** 구현입니다. `document.execCommand`, Tiptap, ProseMirror 같은 외부 에디터 의존으로 설명하지 않습니다.

### 빌드/검증 명령

`npm run verify`는 현재 다음 순서로 작동합니다.

1. `build:nav`
2. `build:seo`
3. `build:og`
4. `build:home-extra-i18n`
5. `build:guide-doc-i18n`
6. `lint:html`
7. `lint:links`
8. `lint:admin-links`

`lint:admin-links`는 공개 HTML/JS 안에 `href="admin/..."`, `../admin/...`, `https://magicindicatorglobal.com/admin/...` 링크가 재노출되면 실패합니다.

---

## 3. 공개 내비·관리자 경로 원칙

- 공개 내비게이션에는 `관리자`, `admin/index.html`, `admin/monitor.html` 링크를 넣지 않습니다.
- `scripts/inject-site-nav.mjs`는 공개 페이지 내비에서 관리자 링크를 생성하지 않도록 정리되어 있습니다.
- `admin/` 파일 자체는 운영 콘솔 파일일 수 있으나, 공개 사이트맵·robots·내비·고객 카피에서 노출하지 않습니다.
- `/admin/*`의 물리 접근 통제는 정적 사이트 코드가 아니라 CloudFront/WAF 또는 별도 인증 레이어에서 처리해야 합니다.

---

## 4. 핵심 제품: MagicTrading

- TradingView/Pine 전략과 MT5 환경을 함께 안내합니다.
- Conservative 진입은 단순 종가 돌파가 아니라 한 봉 안에서 밴드를 OHLC가 가로지르는 straddle 방식으로 설명합니다.
- `canEnter`는 같은 봉에서 익절·고정스탑·트레일스탑 조건이 켜지면 진입을 막아 청산 직후 재진입 왜곡을 줄이는 구조입니다.
- 당일 손실 합산 제어는 `strategy.closedtrades.profit` 기준이며, TradingView가 계좌 자본 대비 실시간 % 손실 한도를 직접 알 수 없다는 한계를 보완하는 회수 기반 휴식 장치입니다.
- 손실 집계 시작점은 차트 적용 후 첫 재계산 시점의 `barstate.islast` 스냅샷 이후로 설명합니다. 과거 깊은 백테스트 종료 건을 실시간 운용 손실처럼 누적한다고 말하지 않습니다.
- TradingView 알림은 JSON webhook을 권장하며, `magic_signal`, `license_pack`, `tickerid`, `tg_id` 등 식별 필드를 포함할 수 있습니다.
- 무료/유료 Pine 5종 웹훅은 TradingView 예약어 `{{username}}`를 `"tv_id":"{{username}}"`로 포함하고, `license_pack`, `ledger:"users"`, `invite_only:true`, `protected_source:true`, `tickerid`, `timenow`를 함께 보냅니다. MagicTrading 3종은 사용자 입력값 `tg_id`도 함께 보내며, 백엔드는 권한 가드 통과 직후 Telegram Bot API로 BUY/SELL/청산 Markdown 알림을 릴레이합니다.
- 백엔드 `POST /api/signals/webhook` 앞단의 `checkTrialWebhookEntitlement`는 무료 체험도 더 이상 별도 무료 이벤트 컬렉션에 신규 생성하지 않습니다. PayPal 0원 결제 또는 홈페이지 가입 웹훅으로 `users` 단일 원장에 생성된 `tv_id + license_pack + expires_at + status`가 정본입니다.
- 3개월 무료 코스 Pine 배포본은 `Dodam Triple Momentum Panel [3Months Free]`이며 `license_pack`은 `DMT_Free_3Month`입니다. 1주 무료 코스 Pine 배포본은 `Dodam MagicTrading Strategy [1Week Free]`이며 `license_pack`은 `DMT_Free_1Week`입니다.
- Pine은 사용자별 실제 만료일·중복 사용 여부를 확정하지 않습니다. 실제 최초 체험일, 7일/90일 만료, 중복 사용 차단, Invite-only Add/Delete는 MongoDB `users` 원장과 `signal_webhook_events` 감사 로그가 정본입니다.
- 웹훅 URL은 비공개로 취급합니다. 브로커 API 키나 민감 키를 알림 본문·Pine 스크립트에 넣지 않습니다.
- 전략 리포트와 브로커 체결은 동일하지 않습니다. limit 체결, 틱 차트, 슬리피지, 수수료 차이를 항상 고지합니다.

### 2026-06-03 17:51 KST Invite-only Pine 5종·단일 원장 최종 싱크

1. `Dodam Triple Momentum Panel [3Months Free]` / `DODAM 3M FREE`
2. `Dodam MagicTrading Strategy [1Week Free]` / `DODAM 1W FREE`
3. `Dodam MagicTrading Strategy [1Month Event]` / `DODAM 1M EVENT`
4. `Dodam MagicTrading Strategy [Regular]` / `DODAM REGULAR`
5. `Dodam Triple Momentum Panel [Permanent]` / `DODAM PERM`

표시용 `title`·`shorttitle`은 글로벌 마케팅 이름으로 정리했지만, 백엔드 매칭용 `LICENSE_FIELD` 값은 바꾸지 않습니다. `DMT_Free_1Week`, `DMT_Free_3Month`, `Dodam_MagicTrading_1MonthEvent`, `Dodam_MagicTrading_MultiChart_Fixed`, `Dodam_Triple_Momentum_Panel_Permanent`가 서버 검증 정본입니다. 5종 모두 TradingView 배포 규격은 **Invite-only + Protected Source**이며, 웹훅 JSON에 `ledger:"users"` 메타를 포함합니다.

---

## 5. 결제·약관·권한 운영 기준

- 결제 전에는 약관 전자서명 스냅샷 `legal_acceptance_id`가 필수입니다.
- `payment_requests`는 플랜 코드와 약관 범위를 서버에서 검증한 뒤 생성해야 합니다.
- 회사 정책상 1개월 초과 장기 선결제, 연회원, 다월 선납형 SKU는 생성하지 않습니다.
- 권한 판별은 `users` 단일 원장을 정본으로 봅니다. 무료 체험 전용 컬렉션은 런타임 신규 쓰기/조회 대상이 아니며, 기존 데이터는 `npm run migrate:free-trials-to-users`로 `users`에 이관합니다.
- 가상자산·Ledger 관련 카피는 “고객 입금 신고/운영 확인” 범위로 설명합니다. 자동 Ledger 하드웨어 연동처럼 오해될 표현은 피합니다.
- 이벤트 기간 중 1개월 이벤트 사용자가 정규 상위 플랜을 선결제하면 중복 결제로 차단하지 않고, `users.expires_at = 기존 expires_at + 30일 + 보너스 1일`로 가산합니다.
- 선결제 성공 시 기존 `paypal_subscription_id`가 있으면 PayPal Subscriptions cancel API를 호출해 자동 결제 스케줄을 파기합니다.
- 선결제 완료 후에는 문자/카카오, 이메일 웹훅, SMTP, MT5 푸시로 `Dodam MagicTrading Strategy [Regular]` 전환 안내를 발송합니다.
- PayPal 0원 구독 생성(`BILLING.SUBSCRIPTION.CREATED`)은 `users` 문서에 `tv_id`, `license_pack`, `status`, `expires_at`, `paypal_subscription_id`, `backendRegularPrepaidConfirmed:false`를 저장하고, 저장 직후 TradingView Invite-only 5종 권한 Add User를 자동 호출합니다.
- 실시간 시그널 텔레그램 릴레이는 `POST /api/signals/webhook`에서 `checkTrialWebhookEntitlement(db)`와 Redis 5초 디바운싱 통과 후 실행됩니다. `TELEGRAM_BOT_TOKEN` 또는 `DODAM_TELEGRAM_BOT_TOKEN`이 없거나 `tg_id`가 비어 있으면 텔레그램만 skip하고 메인 웹훅 정산망은 계속 진행합니다.

---

## 6. 고객용 주요 문서 연결

| 경로 | 내용 |
|------|------|
| `index.html` | 랜딩·가격표·제품 철학·신청 플로우 |
| `m/index.html` | 모바일 요약 대시보드 |
| `billing/index.html` | 구독·결제·환불·송금·크립토 안내 |
| `guide/magictrading-strategy-inputs-ko.html` | MagicTrading 입력값·FAQ |
| `legal/index.html` | 약관·정책 허브 |
| `docs/HOMEPAGE-REVIEW-GUIDE.md` | 운영자용 검토 체크리스트 |
| `docs/GEMINI-MONGODB-BRIEFING.md` | MongoDB·API 데이터 관계 요약 |

---

## 7. Gemini에게 맡길 때 피해야 할 과장

- “완벽”, “무조건 수익”, “브로커 체결 보장” 같은 표현은 금지합니다.
- TradingView 백테스트를 실계좌 체결 재현으로 설명하지 않습니다.
- `process_orders_on_close = false`를 리페인팅 방지와 동일시하지 않습니다.
- 관리자 경로를 “숨겼으니 안전하다”고 말하지 않습니다. 접근 통제는 WAF/인증 레이어에서 별도 처리해야 합니다.

---

## 8. 갱신 시점

- 기준 갱신: 2026-06-03 18:41 KST
- 이 파일은 홈 카피, 결제 정책, 공개 내비, 배포·Git 원본 기준이 바뀔 때 함께 갱신합니다.
