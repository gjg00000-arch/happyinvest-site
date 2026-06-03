# Dodam MagicTrading MultiChart Fixed 배포 가이드

이 문서는 `4.Dodam_MagicTrading_Regular.pine`을 TradingView Invite-only Script로 배포하고, MongoDB/Redis/Invite-only 자동화 파이프라인과 연결하는 최종 운영 절차입니다.

## 1. Pine 배포 대상

- 소스 파일: `C:\Users\gjg00\자동매매\pine\4.Dodam_MagicTrading_Regular.pine`
- TradingView 스크립트명: `Dodam_MagicTrading_Regular`
- `license_pack`: `Dodam_MagicTrading_MultiChart_Fixed`
- Alert Message: `{{alert_message}}`
- Webhook URL: 운영 서버의 `POST /api/signals/webhook`

TradingView에서 Pine Editor에 전체 소스를 붙여넣고 저장한 뒤, Publish Script 메뉴에서 Invite-only로 발행합니다. 발행 후에는 정회원 원장과 Invite-only 자동화가 같은 스크립트 ID를 바라보도록 `TRADINGVIEW_INVITE_SCRIPT_ID`를 맞춥니다.

## 2. 필수 웹훅 필드

Pine 웹훅 JSON은 아래 필드를 반드시 포함합니다.

```json
{
  "secure_token": "dmt_free_auth_9823f71a",
  "license_pack": "Dodam_MagicTrading_MultiChart_Fixed",
  "tv_id": "{{username}}",
  "tickerid": "EXCHANGE:SYMBOL",
  "timenow": 1780465200000
}
```

`tv_id`, `tickerid`, `timenow`는 MongoDB 사용자 원장, 차트 수량 제한, Redis 디바운싱의 핵심 키입니다.

## 3. 운영 환경변수

```text
MONGODB_URI=...
MONGODB_DB=magic_indicator
TRIAL_WEBHOOK_SECURE_TOKEN=dmt_free_auth_9823f71a
TRIAL_WEBHOOK_SECURE_TOKENS=dmt_free_auth_9823f71a,dmt_permanent_auth_7712a
TRIAL_WEBHOOK_DEBOUNCE_MS=5000
TRIAL_WEBHOOK_REDIS_URL=redis://...
TRADINGVIEW_WEBHOOK_IP_ALLOWLIST=52.89.214.238,34.212.75.30,54.112.49.92,54.112.51.100
LICENSE_ALERT_WEBHOOK_URL=https://example.internal/license-alert
LICENSE_ALERT_WEBHOOK_TOKEN=replace-with-secret
TRADINGVIEW_INVITE_REVOKE_URL=https://example.internal/invite-only/revoke
TRADINGVIEW_INVITE_ADD_URL=https://example.internal/invite-only/add
TRADINGVIEW_INVITE_TOKEN=replace-with-secret
TRADINGVIEW_INVITE_SCRIPT_ID=Dodam_MagicTrading_MultiChart_Fixed
MULTICHART_SESSION_RESET_TOKEN=replace-with-secret
```

## 4. MongoDB users 원장

정회원 문서는 아래 필드를 갖춰야 합니다.

```json
{
  "trv_id": "tradingview_user",
  "tier_type": "MultiChart_Fixed",
  "status": "active",
  "active_charts_limit": 1,
  "current_registered_tickers": [],
  "expires_at": "2026-07-03T06:00:00.000Z"
}
```

요금 산식:

- 1개: `$4,999`
- 2~19개: `$4,999 + ((개수 - 1) * $500)`
- 20개 이상: `active_charts_limit = 999`, `$19,999` 무제한 정액

정산 확인:

```powershell
curl -X POST http://localhost:3071/api/admin/multichart-fixed/quote -H "Content-Type: application/json" -d "{\"chart_count\":20}"
```

## 5. 한도 초과 동작

새 `tickerid`가 들어왔고 `current_registered_tickers.length >= active_charts_limit`이면 서버는 즉시 아래를 실행합니다.

- `users.status = "halted"`
- `limit_blocked_*` 필드 기록
- `LICENSE_ALERT_WEBHOOK_URL`로 카톡/텔레그램/메일/SMS 게이트웨이에 경고 전달
- `TRADINGVIEW_INVITE_REVOKE_URL`로 Invite-only Delete 호출
- 응답은 `403 active_charts_limit_exceeded`

Pine은 직접 웹훅 응답을 읽을 수 없으므로, 실제 강제 마비는 Invite-only Delete가 담당합니다. 운영자가 Pine의 `Backend Lock` 입력에 `LIMIT_EXCEEDED` 또는 `HALTED`를 넣으면 차트 자체도 `runtime.error`와 블랙아웃으로 즉시 멈춥니다.

## 6. 세션 초기화

홈페이지 마이페이지의 `[실시간 세션 초기화]` 버튼은 아래 API를 호출합니다.

```powershell
curl -X POST http://localhost:3071/api/admin/multichart-fixed/session-reset `
  -H "Authorization: Bearer <MULTICHART_SESSION_RESET_TOKEN>" `
  -H "Content-Type: application/json" `
  -d "{\"tv_id\":\"tradingview_user\"}"
```

서버 동작:

- `current_registered_tickers = []`
- `status = "active"`
- `TRADINGVIEW_INVITE_ADD_URL`로 Invite-only Add 호출

## 7. 검증 명령

```powershell
npm run check --prefix "server/one-week-free-trial"
```

운영 배포 전에는 다음을 확인합니다.

- TradingView Alert Message가 `{{alert_message}}`인지 확인
- Redis 키가 `webhook:{tv_id}:{tickerid}` 형식으로 5초 잠기는지 확인
- 한도 초과 테스트 시 `status: halted`와 알림/Invite Delete 결과가 `signal_webhook_events`에 남는지 확인
- 세션 초기화 API 호출 후 `current_registered_tickers`가 비고 `status: active`로 복구되는지 확인
