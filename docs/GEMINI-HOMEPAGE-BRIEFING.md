# Gemini용 · Magic Indicator 홈·제품 맥락 브리핑

> 용도: Google Gemini(또는 유사 LLM)에 **한 번에 붙여 넣어** 카피 검토·FAQ 초안·번역·내부 요약을 맞출 때 사용하는 **단일 출처 컨텍스트**입니다.  
> 법적 약관·결제 세부는 `legal/`, `billing/` 원문이 우선입니다.

---

## 1. 공식 사이트

- **공개 홈**: `https://magicindicatorglobal.com/`
- 정적 사이트 루트: 저장소 `magic-indicator-site/`
- 메인 랜딩: `index.html` — 매직 차트 스크린 아래 **`ml-chart-guide`** 블록에 옵티마이징·손절·Filters·당일 손실 합산·교재형 철학(엘더 등 % 규칙 vs TV 한계) 요약

---

## 2. 핵심 제품: MagicTrading (TradingView · Pine Strategy)

- **소스 단일 코어**: `tools/magic-core-rule-strategy.pine`  
- **마켓별 배포**: `tools/_gen-dodam-variants.py` → `Dodam_MagicTrading_*.pine` (LICENSE_FIELD만 바꿔 생성)
- **오버레이 전략**: 중심선·상·하 밴드 + TSF 레인보우(추세 시각화), 진입은 **limit** (롱 `lower`, 숏 `upper`), **qty=1**, `pyramiding=0`

### 2.1 진입

- **Conservative**: 한 봉에서 밴드를 **OHLC 가로지름(straddle)** — 롱 `high > lower and low < lower`, 숏 `high > upper and low < upper` (종가 crossover만이 아님).
- **Attack**: 반밴딩 대비 %로 밴드 **근처**에서 더 이른 진입.

### 2.2 청산 순서 (같은 봉)

1. 고정 손절 (`magicStop`)  
2. 트레일 (`magicTrailStop`)  
3. 매직 존·센터·목표 등 익절 (`magicProfitExit`)

### 2.3 `canEnter` (진입 필터 한 줄)

다음이 **모두** 만족할 때만 `magicBuy` / `magicSell`:

- 포지션 **플랫**
- 고정 손절 직후 **재진입 쿨다운** 끝남 (`reentryCooldownBars`, 고정 손만)
- 진입 신호 **최소 봉 간격** 만족
- **그 봉**에 익절/고정 스탑/트레일 조건이 켜지면 진입 불가 *(같은 봉 청산·재진입 억제)*
- **volatile window**(입력: 「변동 큰 장 시작 구간 진입 차단」)— 개장 초 변동 시간대 차단. 홈·레이블에서는 **“volatile window”** 용어로 통일 (전체 세션 차단 아님)
- 연패 뒤 **봉 쿨다운**
- 선택 시 **당일 손실 청산 합산 N회** 도달 후 시그널 정지 (`SYS_DAILY_LOSS_SUM_HALT_CAP = 6`, 사용자 입력 2~6, 기본 3)

### 2.4 손실 집계 (연패·당일 합산)

- TV는 **계좌 자본·% 손실 한도**를 모름 → 회수 기반 **당일 손실 청산 합산**으로 강제 휴식.
- **`strategy.closedtrades.profit`**(청산 손익) 사용. `strategy.closedtrades.netprofit()` API 없음.
- **카운팅 시작**: 차트 적용 후 첫 재계산 끝 **`barstate.islast`**에서 `strategy.closedtrades` 스냅샷 → 그 **이전** 종료 건은 집계에서 제외 (**과거 깊은 백테만 따라가며 누적하지 않음**). 실매매 여부와 무관, **시그널 기준**.

### 2.5 기술 메모

- `strategy.position_size`는 **float** — 스냅 변수도 float.
- `commission_value = 0.0` — 수수료·슬리피지는 **유저가 별도 감안**.
- `volatileOpenPreset` 기본값은 options 배열 문자열과 **완전 일치**해야 함 (`"Auto (KR or US 종목 자동)"`).
- `volatileMorningBlock`: 전역 줄바꿈 `switch` 할당 회피를 위해 **`fVolatileMorningBlockFromPreset()`** 함수 사용.

### 2.6 웹·보안 안내 (요약)

- 알림은 **JSON (webhook)** 권장 필드에 `magic_signal`, `license_pack`(마켓 식별·비밀 아님), `tickerid` 등 포함.
- **웹훅 URL 비공개** 권장. 브로커 API 키는 알림 본문/스크립트에 넣지 않음.

---

## 3. 고객용 문서 연결

| 경로 | 내용 |
|------|------|
| `guide/magictrading-strategy-inputs-ko.html` | Inputs, **FAQ — 신호가 안 나올 때**(canEnter, 같은 봉 청산) |
| `index.html` — `ml-chart-guide` | 홈 카피: volatile window, 당일 합산, 적용 시점 스냅 |
| `docs/HOMEPAGE-REVIEW-GUIDE.md` | 운영자용 사이트 점검 |

---

## 4. Gemini에게 맡길 때 **피해야 할 과장**

- `process_orders_on_close = false`를 **리페인팅 방지**와 동일시하지 말 것.
- 전략 리포트 = **브로커 체결 재현 보장 없음**(limit·틱 차트 차이).
- “완벽”“즉시 실전 무조건” 같은 표현은 **교육·참고** 톤에 맞게 완화.

---

## 5. 갱신 시점

- 이 파일은 레포 변경과 함께 수동 동기화. Pine·홈 카피·가이드 FAQ를 바꾼 뒤 **한 단락이라도 불일치**하면 여기부터 고칩니다.
