# Three Month Free Course Webhook Guard

TradingView 웹훅의 `tv_id: "{{username}}"`를 받아 `POST /api/signals/webhook` 직전에서 3개월 무료 코스 사용 여부를 관리합니다.

## MongoDB 컬렉션

### `free_trial_accesses`

주요 필드:

- `subject_key`: `trv:<tv_id>`
- `trv_id`: TradingView 로그인 ID
- `tv_id`: TradingView 로그인 ID 원문 정규화 값
- `started_at`: 최초 웹훅 유입 시각
- `started_at_kst`: 최초 웹훅 유입 시각 KST 문자열
- `trial_started_at`: 체험 시작 시각
- `expire_at`: 최초 시작 기준 90일(3개월 코스) 뒤
- `expire_at_kst`: 최초 시작 기준 90일(3개월 코스) 뒤 KST 문자열
- `expires_at`: 호환용 만료 시각 필드
- `status`: `active` 또는 `expired`
- `webhook_seen_count`: 해당 식별자의 웹훅 유입 횟수

### `one_week_free_trials`

3개월 무료 코스 웹훅 전용 보조 가드/미러 원장입니다. 신규 `tv_id`가 들어오면 `free_trial_accesses`와 함께 미러링할 수 있습니다.

### `signal_webhook_events`

허용/차단 이벤트를 감사 로그로 기록합니다. `ttl_managed: true`가 포함되므로 TTL 정책과 함께 운용할 수 있습니다.

## 실행

```powershell
Copy-Item env.example .env
npm install
npm start
```

또는 상위 폴더에서:

```powershell
npm install --prefix server/one-week-free-trial
npm start --prefix server/one-week-free-trial
```

## 웹훅 엔드포인트

```text
POST /api/signals/webhook
POST /api/webhooks/signals/three-month-free
POST /api/webhooks/signals/one-week-free
```

요청 JSON 예:

```json
{
  "event": "magic_core_buy",
  "magic_signal": "buy",
  "secure_token": "dmt_free_auth_9823f71a",
  "tv_id": "tradingview_user",
  "mt5_account": "12345678",
  "mt5_server": "Broker-Live",
  "license_pack": "DMT_Free_3Month",
  "tickerid": "NASDAQ:AAPL",
  "timenow": 1780465200000
}
```

정회원 1달 이벤트 빌드는 `license_pack`에 아래 값을 사용합니다.

```json
{
  "license_pack": "Dodam_MagicTrading_1MonthEvent",
  "secure_token": "dmt_free_auth_9823f71a",
  "tv_id": "tradingview_user",
  "tickerid": "NASDAQ:AAPL"
}
```

다중 차트 정액제 정회원 빌드는 `license_pack`에 아래 값을 사용합니다.

```json
{
  "event": "magic_core_rb_online",
  "license_pack": "Dodam_MagicTrading_MultiChart_Fixed",
  "secure_token": "dmt_free_auth_9823f71a",
  "tv_id": "tradingview_user",
  "tickerid": "NASDAQ:AAPL",
  "tf": "60"
}
```

정규플랜 시작자 영구제공 빌드는 `license_pack`에 아래 값을 사용합니다.

```json
{
  "event": "dodam_triple_momentum_online",
  "license_pack": "Dodam_Triple_Momentum_Panel_Permanent",
  "secure_token": "dmt_permanent_auth_7712a",
  "tv_id": "tradingview_user",
  "tickerid": "NASDAQ:AAPL",
  "tf": "60",
  "timenow": 1780465200000
}
```

동작:

- `secure_token`이 서버의 `TRIAL_WEBHOOK_SECURE_TOKENS` 허용 목록과 다르면 `401 Unauthorized`로 차단합니다.
- `license_pack`이 지원 라이선스(`DMT_Free_*`, `Dodam_MagicTrading_1MonthEvent`, `Dodam_MagicTrading_MultiChart_Fixed`, `Dodam_Triple_Momentum_Panel_Permanent`)가 아니면 `401 Unauthorized`로 차단합니다.
- 발송 IP는 기본 TradingView 웹훅 IP(`52.89.214.238`, `34.212.75.30`, `54.112.49.92`, `54.112.51.100`)만 허용합니다. 프록시/로드밸런서 뒤에서는 `x-forwarded-for` 원본 IP가 보존되어야 합니다.
- 같은 `tv_id + tickerid` 조합은 Redis 키 `webhook:{tv_id}:{tickerid}`로 `TRIAL_WEBHOOK_DEBOUNCE_MS` 동안 잠급니다. 중복이면 DB 기록 없이 `200 OK`와 `duplicate_webhook_debounced`로 드롭합니다. 기본값은 5초입니다.
- `TRIAL_WEBHOOK_REDIS_URL` 또는 `REDIS_URL`이 있으면 Redis `SET NX PX`로 디바운싱합니다. 로컬 개발처럼 Redis가 없을 때만 인메모리 캐시로 fallback합니다.
- 최초 유입 `tv_id`는 `free_trial_accesses`에 삽입하고 통과합니다.
- 기존 식별자는 최초 시작 시각 기준 90일(3개월 코스) 이내면 통과합니다.
- 90일을 초과하면 `403 Forbidden`으로 차단하고 감사 로그를 남깁니다.
- `Dodam_MagicTrading_1MonthEvent`는 무료 원장을 만들지 않고 `users` 컬렉션에서 같은 `tv_id` 사용자를 찾습니다. 해당 사용자가 정회원/유료 플랜 계열이고 `status`가 active이며 `expires_at` 계열 만료일이 현재 이후일 때만 통과합니다.
- `Dodam_MagicTrading_MultiChart_Fixed`는 `users` 컬렉션의 `tier_type: "MultiChart_Fixed"`, `status: "active"`, 유효한 `expires_at`, `active_charts_limit`, `current_registered_tickers`를 기준으로 차트 수량을 제한합니다.
- 한도 초과 신규 `tickerid`가 감지되면 `users.status`를 `halted`로 전환하고, 알림 웹훅(`LICENSE_ALERT_WEBHOOK_URL`)과 Invite-only Delete API(`TRADINGVIEW_INVITE_REVOKE_URL`)를 즉시 호출합니다.
- `Dodam_Triple_Momentum_Panel_Permanent`는 `users` 컬렉션에서 같은 `tv_id` 사용자를 찾고 `status: active` 또는 `Regular_Permanent` 계열을 확인합니다. 이 플랜은 영구 제공이므로 `expires_at` 만료 검사를 건너뛰며, 만료 회수 스케줄러 대상에서도 제외됩니다.

## 다중 차트 정액제 users 스키마

```json
{
  "tier_type": "MultiChart_Fixed",
  "active_charts_limit": 1,
  "current_registered_tickers": ["nasdaq:aapl"],
  "expires_at": "2026-07-03T06:00:00.000Z",
  "status": "active"
}
```

요금 산식:

- 1개: `$4,999`
- 2~19개: `$4,999 + ((개수 - 1) * $500)`
- 20개 이상: `active_charts_limit = 999`, `$19,999` 무제한 정액

정산 확인용 내부 엔드포인트:

```http
POST /api/admin/multichart-fixed/quote
Content-Type: application/json

{ "chart_count": 20 }
```

실시간 세션 초기화 API:

```http
POST /api/admin/multichart-fixed/session-reset
Authorization: Bearer <MULTICHART_SESSION_RESET_TOKEN>
Content-Type: application/json

{ "tv_id": "tradingview_user" }
```

이 API는 `current_registered_tickers`를 빈 배열로 만들고 `status`를 `active`로 복구한 뒤, `TRADINGVIEW_INVITE_ADD_URL`이 설정되어 있으면 Invite-only Add 파이프라인을 호출합니다.

만료 회수:

```powershell
npm run revoke:expired-multichart
```

이 스크립트는 매 시간 또는 매일 자정 크론에서 실행합니다. `expires_at <= now`인 `MultiChart_Fixed` 정회원을 `expired`로 바꾸고 `current_registered_tickers`를 비운 뒤, `TRADINGVIEW_INVITE_REVOKE_URL`이 설정되어 있으면 외부 Invite-only 삭제 파이프라인을 호출합니다.

## 환경변수

```text
TRIAL_WEBHOOK_SECURE_TOKEN=dmt_free_auth_9823f71a
TRIAL_WEBHOOK_SECURE_TOKENS=dmt_free_auth_9823f71a,dmt_permanent_auth_7712a
TRIAL_WEBHOOK_DEBOUNCE_MS=5000
TRIAL_WEBHOOK_REDIS_URL=redis://localhost:6379
TRADINGVIEW_WEBHOOK_IP_ALLOWLIST=52.89.214.238,34.212.75.30,54.112.49.92,54.112.51.100
LICENSE_ALERT_WEBHOOK_URL=https://example.internal/license-alert
LICENSE_ALERT_WEBHOOK_TOKEN=replace-with-secret
TRADINGVIEW_INVITE_REVOKE_URL=https://example.internal/invite-only/revoke
TRADINGVIEW_INVITE_ADD_URL=https://example.internal/invite-only/add
TRADINGVIEW_INVITE_TOKEN=replace-with-secret
TRADINGVIEW_INVITE_SCRIPT_ID=Dodam_MagicTrading_MultiChart_Fixed
MULTICHART_SESSION_RESET_TOKEN=replace-with-secret
MULTICHART_EXPIRY_SCAN_LIMIT=500
```

## TradingView Alert 설정

스크립트 내부 `alert(f_jsonStart(), ...)`에서 생성한 JSON을 그대로 보내야 합니다.
TradingView 알림 생성 화면의 Message 칸에는 `{{alert_message}}`를 넣고, 웹훅 URL은 이 서버의 `POST /api/signals/webhook` 주소를 사용하세요.

만료 안내 메시지:

```text
무료 체험 기간 3개월이 만료되었습니다. 지속적인 시그널 연동 및 틱 차트 트레이딩을 원하시면 공식 홈페이지(magicindicatorglobal.com)에서 정규 과금 플랜을 확인하세요.
```
