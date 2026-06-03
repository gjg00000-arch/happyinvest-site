# MagicIndicator 5종 TradingView 배포 마스터 가이드

이 문서는 `C:\Users\gjg00\자동매매\pine` 폴더의 5종 Pine Script와 MongoDB/Redis/TradingView Invite-only 자동화 서버를 최종 동기화하는 운영 기준입니다.

## 1. 배포 파일 매핑

| No | Pine 파일 | 플랜 | `license_pack` | 토큰 | 게시 방식 |
|---:|---|---|---|---|---|
| 1 | `Dodam Triple Momentum Panel [3Months Free].pine` | 3개월 무료 체험판 | `DMT_Free_3Month` | `dmt_free_auth_9823f71a` | Invite-only + Protected |
| 2 | `Dodam MagicTrading Strategy [1Week Free].pine` | 1주일 무료 체험판 | `DMT_Free_1Week` | `dmt_free_auth_9823f71a` | Invite-only + Protected |
| 3 | `Dodam MagicTrading Strategy [1Month Event].pine` | 1달 유료 이벤트 | `Dodam_MagicTrading_1MonthEvent` | `dmt_free_auth_9823f71a` | Invite-only + Protected |
| 4 | `Dodam MagicTrading Strategy [Regular].pine` | 정규 다중차트 종량제 | `Dodam_MagicTrading_MultiChart_Fixed` | `dmt_free_auth_9823f71a` | Invite-only + Protected |
| 5 | `Dodam Triple Momentum Panel [Permanent].pine` | 정규 시작자 영구제공 | `Dodam_Triple_Momentum_Panel_Permanent` | `dmt_permanent_auth_7712a` | Invite-only + Protected |

TradingView Alert의 Message 칸은 모든 빌드에서 `{{alert_message}}`를 사용합니다.

## 2. 서버 웹훅 진입로

공통 웹훅 URL:

```text
POST /api/signals/webhook
```

결제/가입 자동화 URL:

```text
POST /api/webhooks/whop
POST /api/webhooks/paypal/ipn
POST /api/payment/webhook
POST /api/free-trial/apply
```

서버는 아래 순서로 처리합니다.

1. TradingView IP allowlist 확인
2. `secure_token` 확인
3. `license_pack` 분기
4. `tv_id` 정규화 및 MongoDB lookup
5. Redis/인메모리 `webhook:{tv_id}:{tickerid}` 5초 디바운싱
6. 플랜별 권한 검사
7. 통과 시 MT5/브로커 또는 Invite-only 후속 파이프라인으로 전달

## 3. 플랜별 서버 권한 검사

### No. 1: 3개월 무료 체험판

- `license_pack`: `DMT_Free_3Month`
- 원장: `users`, 감사 로그: `signal_webhook_events`
- 기간: PayPal 0원 구독 승인으로 생성된 `users.expires_at` 기준 90일
- 홈페이지 무료 신청 및 PayPal 0원 승인 시 `/api/free-trial/apply` 또는 PayPal 웹훅이 `users` 원장을 만들고 Invite-only Add를 호출합니다.
- TradingView 웹훅만으로 무료 원장을 신규 생성하지 않습니다.
- 만료 시: `403 trial_period_expired`

### No. 2: 1주일 무료 체험판

- `license_pack`: `DMT_Free_1Week`
- 원장: `users`, 감사 로그: `signal_webhook_events`
- 기간: PayPal 0원 구독 승인으로 생성된 `users.expires_at` 기준 7일
- 홈페이지 무료 신청 및 PayPal 0원 승인 시 `/api/free-trial/apply` 또는 PayPal 웹훅이 `users` 원장을 만들고 Invite-only Add를 호출합니다.
- TradingView 웹훅만으로 무료 원장을 신규 생성하지 않습니다.
- 만료 시: `403 trial_period_expired`

### No. 3: 1달 이벤트

- `license_pack`: `Dodam_MagicTrading_1MonthEvent`
- 원장: `users`
- 조건: 정회원/유료 플랜 계열, `status: active`, 유효한 `expires_at`
- 무료 체험 원장은 생성하지 않습니다.
- Whop/PayPal 결제 성공 웹훅이 들어오면 `expires_at = now + 30일`로 users 원장을 갱신하고 Invite-only Add를 호출합니다.

### No. 4: 정규 다중차트 종량제

- `license_pack`: `Dodam_MagicTrading_MultiChart_Fixed`
- 원장: `users`
- 조건: 정회원 계열, `tier_type: MultiChart_Fixed`, `status: active`, 유효한 `expires_at`
- Whop/PayPal 결제 성공 웹훅이 들어오면 결제 수량에 맞춰 `active_charts_limit`를 갱신하고 Invite-only Add를 호출합니다.
- 차트 제한:
  - `active_charts_limit = 1`: `$4,999`
  - `2~19`: `$4,999 + ((개수 - 1) * $500)`
  - `20개 이상`: `active_charts_limit = 999`, `$19,999`
- 신규 `tickerid`가 제한을 초과하면:
  - `users.status = "halted"`
  - `limit_blocked_*` 필드 기록
  - `LICENSE_ALERT_WEBHOOK_URL`로 카톡/텔레그램/메일/SMS 게이트웨이 호출
  - `TRADINGVIEW_INVITE_REVOKE_URL`로 Invite-only Delete 호출
  - 서버 응답: `403 active_charts_limit_exceeded`

세션 초기화:

```text
POST /api/admin/multichart-fixed/session-reset
Authorization: Bearer <MULTICHART_SESSION_RESET_TOKEN>
```

효과:

- `current_registered_tickers = []`
- `status = "active"`
- `TRADINGVIEW_INVITE_ADD_URL`로 Invite-only Add 호출

### No. 5: 정규 시작자 영구제공

- `license_pack`: `Dodam_Triple_Momentum_Panel_Permanent`
- 원장: `users`
- 조건: `Regular_Permanent` 계열 또는 정회원 계열, `status: active`
- `expires_at` 만료 체크는 의도적으로 skip합니다.
- 만료 회수 스케줄러에서 `permanent_access: true`는 제외됩니다.
- 관리자가 `status`를 `inactive` 또는 `halted`로 바꾸는 경우에만 운영 자동화에서 Invite-only Delete를 수행합니다.

## 4. MongoDB users 필드 기준

권장 필드:

```json
{
  "trv_id": "tradingview_user",
  "tv_id": "tradingview_user",
  "tradingview_username": "tradingview_user",
  "tier_type": "MultiChart_Fixed",
  "status": "active",
  "active_charts_limit": 1,
  "current_registered_tickers": [],
  "expires_at": "2026-07-03T06:00:00.000Z",
  "permanent_access": false
}
```

서버는 `trv_id`, `tv_id`, `tradingview_username`을 case-insensitive collation으로 조회합니다.

## 5. 운영 환경변수

```text
MONGODB_URI=...
MONGODB_DB=magic_indicator
TRIAL_WEBHOOK_SECURE_TOKEN=dmt_free_auth_9823f71a
PERMANENT_WEBHOOK_SECURE_TOKEN=dmt_permanent_auth_7712a
TRIAL_WEBHOOK_SECURE_TOKENS=dmt_free_auth_9823f71a
PAYMENT_WEBHOOK_SECRET=replace-with-secret
FREE_TRIAL_APPLY_TOKEN=replace-with-secret
PAYPAL_FREE_1W_PLAN_ID=replace-with-paypal-7day-free-trial-plan-id
PAYPAL_FREE_3M_PLAN_ID=replace-with-paypal-90day-free-trial-plan-id
TRIAL_WEBHOOK_DEBOUNCE_MS=5000
TRIAL_WEBHOOK_REDIS_URL=redis://...
TRADINGVIEW_WEBHOOK_IP_ALLOWLIST=52.89.214.238,34.212.75.30,54.112.49.92,54.112.51.100
LICENSE_ALERT_WEBHOOK_URL=https://example.internal/license-alert
LICENSE_ALERT_WEBHOOK_TOKEN=replace-with-secret
EMAIL_WARNING_WEBHOOK_URL=https://example.internal/email-warning
EMAIL_WARNING_WEBHOOK_TOKEN=replace-with-secret
MT5_PUSH_WEBHOOK_URL=https://example.internal/mt5-push
MT5_PUSH_WEBHOOK_TOKEN=replace-with-secret
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=notice@example.com
SMTP_PASS=replace-with-secret
SMTP_FROM=notice@example.com
TRADINGVIEW_INVITE_REVOKE_URL=https://example.internal/invite-only/revoke
TRADINGVIEW_INVITE_ADD_URL=https://example.internal/invite-only/add
TRADINGVIEW_INVITE_TOKEN=replace-with-secret
TRADINGVIEW_INVITE_SCRIPT_ID=Dodam_MagicTrading_MultiChart_Fixed
MULTICHART_SESSION_RESET_TOKEN=replace-with-secret
MULTICHART_EXPIRY_SCAN_LIMIT=500
EXPIRY_SCAN_LIMIT=1000
```

`PERMANENT_WEBHOOK_SECURE_TOKEN`은 Permanent license_pack에서만 인정됩니다.

## 6. TradingView Publish 절차

1. Pine Editor에 대상 파일 전체를 붙여넣습니다.
2. 컴파일 오류가 없으면 Save합니다.
3. 무료판은 Public 또는 제한 공개 정책에 맞게 게시합니다.
4. 유료/정규/Permanent 빌드는 Protected 또는 Invite-only로 게시합니다.
5. 각 스크립트의 Alert를 만들고 Message를 `{{alert_message}}`로 설정합니다.
6. Webhook URL을 운영 서버의 `/api/signals/webhook`으로 설정합니다.
7. 게시 후 Invite-only 자동화가 사용하는 script id와 `TRADINGVIEW_INVITE_SCRIPT_ID`를 일치시킵니다.

## 7. 검증 체크리스트

서버 문법 체크:

```powershell
npm run check --prefix "server/one-week-free-trial"
```

만료 회수 크론:

```powershell
npm run revoke:expired --prefix "server/one-week-free-trial"
npm run warn:renewal --prefix "server/one-week-free-trial"
```

무중단 배포:

```bash
DEPLOY_HOST=your-host DEPLOY_USER=ubuntu DEPLOY_PATH=/opt/magic-one-week-free-trial PM2_APP_NAME=magic-one-week-free-trial-webhook ./deploy_backend.sh
```

운영 검증:

- `DMT_Free_3Month`가 `users.license_pack`과 `users.expires_at` 기준 90일 만료인지 확인
- `DMT_Free_1Week`가 `users.license_pack`과 `users.expires_at` 기준 7일 만료인지 확인
- `Dodam_MagicTrading_1MonthEvent`가 `users.status: active`와 `expires_at`를 요구하는지 확인
- `Dodam_MagicTrading_MultiChart_Fixed`가 `current_registered_tickers` 한도를 초과하면 `halted`로 전환하는지 확인
- 한도 초과 시 알림 웹훅과 Invite-only Delete가 감사 로그에 남는지 확인
- 세션 초기화 API 호출 후 배열이 비고 Invite-only Add가 호출되는지 확인
- `Dodam_Triple_Momentum_Panel_Permanent`는 `expires_at` 없이 통과하고 만료 스케줄러에서 제외되는지 확인
- Redis에 `webhook:{tv_id}:{tickerid}` 키가 5초간 잠기는지 확인
