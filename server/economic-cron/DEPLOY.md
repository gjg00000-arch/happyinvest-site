# 경제 지표 사전 알림 — Cron 웹훅 배포 가이드

Finnhub 등은 보통 “발표 임박”을 푸시하지 않습니다. 이 서비스는 **주기적으로 POST를 받아** 캘린더를 당겨오고, 조건에 맞으면 **텔레그램**으로 보냅니다.

## 1. 준비

- Finnhub API 키 (무료 등록)
- Telegram Bot 토큰, 채팅 ID
- **CRON_SECRET**: 외부 스케줄러가 요청할 때 쓰는 임의 긴 문자열 (유출 금지)

`env.example`을 복사해 `.env`를 만들고 값을 채웁니다.

## 2. Docker Compose (권장)

```bash
cd server/economic-cron
cp env.example .env
# .env 편집
mkdir -p data
docker compose up -d --build
curl -sS http://127.0.0.1:8787/health
```

`STATE_FILE`은 Compose에서 `/app/data/sent_state.json`으로 고정됩니다. `data/`는 호스트에 마운트되어 재시작 후에도 중복 알림을 막습니다.

## 3. Nginx

동일 호스트에서 API·정적 사이트와 같이 쓰려면 `nginx-snippet.conf` 내용을 `server { ... }` 안에 넣고 `nginx -t` 후 reload 하세요.  
공개 URL 예: `POST https://magicindicatorglobal.com/v1/cron/economic-calendar`

## 4. 외부 Cron

1~3분마다 **POST** (본문 불필요). 헤더 예:

- `Authorization: Bearer <CRON_SECRET>`  
  또는  
- `X-Cron-Secret: <CRON_SECRET>`

수동 확인:

```bash
curl -sS -X POST "https://YOUR_DOMAIN/v1/cron/economic-calendar" \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

응답 예: `{"ok":true,"checked":N,"sent":0}` — `sent`는 해당 호출에서 실제로 텔레그램을 보낸 건수입니다.

## 5. Python 대안

저장소 `tools/econ-news-telegram-alert/`에서 `.env` 설정 후:

```bash
python run.py --once
```

같은 URL에서 **서버가 subprocess로 위 명령만 실행**하도록 래핑해도 됩니다(별도 구현).

## 6. systemd (Docker 없이 Node 직접)

`node`가 PATH에 있다고 가정:

```ini
[Unit]
Description=Economic calendar cron webhook
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/economic-cron
EnvironmentFile=/opt/economic-cron/.env
ExecStart=/usr/bin/node server.mjs
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

`STATE_FILE`은 쓰기 가능한 절대 경로로 지정하세요.

## 7. 시각이 맞지 않을 때

`.env`에서 `SOURCE_TIMEZONE` / `DISPLAY_TIMEZONE`을 조정합니다. 미국 지표는 `America/New_York`이 자주 쓰입니다.

## 8. TRV Pine과의 관계

차트 전략(`Dodam_MagicTrading_Marketfree.pine` 등)의 **세션·손실 쿨다운**은 TV 안에서 동작합니다. 본 서비스는 **텔레그램 일정 안내**용이며, Pine과 HTTP로 직접 연동하지 않습니다.
