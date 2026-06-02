# One Week Free Trial Webhook Guard

TradingView 웹훅의 `tv_id: "{{username}}"` 또는 MT5 식별값을 받아 `one_week_free_trials` 컬렉션에서 7일 무료 체험 사용 여부를 관리합니다.

## MongoDB 컬렉션

### `one_week_free_trials`

주요 필드:

- `subject_key`: `trv:<tv_id>` 또는 `mt5:<server>:<account>`, unique
- `trv_id`: TradingView 로그인 ID
- `mt5_account`: MT5 계좌 번호 또는 로그인 ID
- `mt5_server`: MT5 서버명
- `first_seen_at`: 최초 웹훅 유입 시각
- `trial_started_at`: 체험 시작 시각
- `expires_at`: 최초 시작 기준 7일 뒤
- `status`: `active` 또는 `expired`
- `webhook_seen_count`: 해당 식별자의 웹훅 유입 횟수

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
POST /api/webhooks/signals/one-week-free
```

요청 JSON 예:

```json
{
  "event": "magic_core_buy",
  "magic_signal": "buy",
  "tv_id": "tradingview_user",
  "mt5_account": "12345678",
  "mt5_server": "Broker-Live",
  "license_pack": "DMT_Free_1Week",
  "tickerid": "NASDAQ:AAPL"
}
```

동작:

- 최초 유입 식별자는 `one_week_free_trials`에 삽입하고 통과합니다.
- 기존 식별자는 최초 시작 시각 기준 7일 이내면 통과합니다.
- 7일을 초과하면 `403 Forbidden`으로 차단하고 감사 로그를 남깁니다.

만료 안내 메시지:

```text
무료 체험 기간 1주일이 만료되었습니다. 지속적인 시그널 연동 및 틱 차트 트레이딩을 원하시면 공식 홈페이지(magicindicatorglobal.com)에서 정규 과금 플랜을 확인하세요.
```
