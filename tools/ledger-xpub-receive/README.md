# Ledger xPub → BTC 받기 주소 파생 (미리 준비)

## 검토 요약 (요청하신 방식과의 관계)

| 항목 | 검토 |
|------|------|
| **xPub로 인덱스별 주소** | BIP32/BIP44 계열에서 **계정(account) 노드의 확장 공개키**만 있으면, **비하드닝 하위** `change / address_index` 를 공개키만으로 파생할 수 있어, 수령(받기) 주소를 인덱스 순으로 생성하는 설계는 타당합니다. |
| **python-bitcoinlib / bip32utils** | 레거시 **xpub + P2PKH(1…)** 위주에는 쓰기 쉽지만, Ledger 기본에 가까운 **zpub(네이티브 SegWit, bc1…)**·**ypub(중첩 SegWit)** 까지 엔코딩하려면 별도 Bech32/P2SH-WPKH 로직이 필요합니다. |
| **이 폴더의 선택** | **`bip-utils`** 한 번에 xpub/ypub/zpub 인식 + 주소 형식까지 처리합니다. (요청 문구에 맞춰 “같은 계열”로 문서에만 `bip32utils`를 언급해 두었습니다.) |
| **보안** | **xpub/ypub/zpub 유출 = 해당 계정 아래 모든 받기 주소·잔액 추적 가능**. 저장소·로그·이슈에 실키를 넣지 마세요. `.gitignore`에 `.env` 패턴을 넣어 두었습니다. |
| **운영** | 상용에서는 **서버에 시드/개인키 없음**, DB에는 **인덱스·주소·입금 대조 상태**만 두는 패턴이 일반적입니다. |

## 설치

```bash
cd tools/ledger-xpub-receive
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

## 사용

```bash
# Windows PowerShell 예: 확장키는 환경변수 또는 --ext-key
$env:RECEIVE_EXT_KEY = "zpub…"
python derive_receive_address.py --no-meta 12

# 한 줄로
python derive_receive_address.py --ext-key=zpub… --no-meta 12

# 구간 출력 (탭 구분)
python derive_receive_address.py --ext-key=zpub… --range 0-9 --no-meta
```

- **접두어**: 현재 BTC **메인넷** 체결로 `zpub` / `ypub` / `xpub` 만 처리합니다 (`tpub` 등은 다른 코인 타입 매핑이 필요).
- **받기 vs 내부 주소**: 기본은 받기 **`CHAIN_EXT`**. 테스트용으로만 `--internal` 주면 내부 체인(변경 주소 방향에 가까움)으로 파생합니다.

## 결과 확인

니모닉으로 지역적으로 파생 결과를 같은 라이브러리로 교차 검증하면(시드 미공유, 로컬만) 디버깅에 도움이 됩니다.
