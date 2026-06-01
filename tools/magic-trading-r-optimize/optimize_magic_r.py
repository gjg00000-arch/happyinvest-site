#!/usr/bin/env python3
"""
MagicTrading 스타일 밴드 폭 r(%) 격자 탐색 — NQ E-mini 등에 대해 오프라인으로 후보 r를 스캔합니다.

- 매직라인: SMA(5,20,60,240) 평균 (Pine center 와 동일)
- 밴드: upper/lower = center * (1 ± r_pct/100)  ← 여기서 r_pct 를 한 개의 손잡이로 스캔
- 진입(단순화): 저가 < 기준선 < 고가 → 롱은 lower·숏은 upper 리밋 가정 체결
- 청산(단순화): 목표 = center ± maxNearDist (exitNearHalfBandPct), 손절 = 밴드 반폭의 stopBufferPct 만큼 바깥

주의: TV Pine 의 틱·인트라바·트레일·세션 필터·슬리피지와 다르므로 절대값은 참고용입니다.
      용도: 주기적으로 스캔 → Pine 의 Manual BaseR 또는 내부 상수 보정 시 가설 번호 확보.

종목별 틱·틱 밸류(USD): instrument_tick_specs.csv 의 tick_size·dollars_per_tick 을 편집·재사용.
내부에서는 dollars_per_point = dollars_per_tick / tick_size 로 PnL 을 맞춥니다.

예시:
  python optimize_magic_r.py --symbol NQ=F --interval 1h --period 730d --r-min 0.10 --r-max 0.80 --r-step 0.01
  python optimize_magic_r.py --watchlist --interval 1h --period 730d --r-step 0.01
  python optimize_magic_r.py --symbols "ES=F,CL=F,BTC-USD" --period 365d

1000틱 봉( TV 와 맞추려면 체결 틱 CSV 필요 ):
  python optimize_magic_r.py --tick-csv nq_ticks.csv --ticks-per-bar 1000 --symbol NQ=F --r-min 0.08 --r-max 1.2 --r-step 0.01
  # CSV: 체결가 열 하나 (컬럼명 price / last / close 중 하나 또는 --tick-price-col 지정)
"""

from __future__ import annotations

import argparse
import math
import sys
import traceback
from pathlib import Path
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

try:
    import yfinance as yf
except ImportError:
    print("pip install -r requirements.txt", file=sys.stderr)
    raise

def _parse_instrument_specs_csv(csv_path: Path) -> Dict[str, Tuple[float, float]]:
    """CSV: tick_size, dollars_per_tick → (tick, dollars_per_point=dtick/tick)."""
    raw = pd.read_csv(csv_path, encoding="utf-8-sig")
    raw.columns = [str(c).strip() for c in raw.columns]
    need = {"symbol", "tick_size", "dollars_per_tick"}
    if not need <= set(raw.columns):
        raise ValueError(f"instrument_tick_specs.csv 컬럼 부족: {list(raw.columns)}")
    out: Dict[str, Tuple[float, float]] = {}
    for _, row in raw.iterrows():
        sym = str(row["symbol"]).strip()
        if not sym or sym.startswith("#"):
            continue
        tick = float(row["tick_size"])
        dtick = float(row["dollars_per_tick"])
        if tick <= 0 or math.isnan(tick) or math.isnan(dtick):
            continue
        out[sym] = (tick, dtick / tick)
    return out


def _coalesce_instrument_specs() -> Dict[str, Tuple[float, float]]:
    """
    instrument_tick_specs.csv 가 있으면 로드해 병합(우선).
    CSV 없거나 오류 시 아래 폴백만 사용.
    """
    fallback: Dict[str, Tuple[float, float]] = {
        "ES=F": (0.25, 50.0),
        "NQ=F": (0.25, 20.0),
        "YM=F": (1.0, 5.0),
        "RTY=F": (0.1, 50.0),
        "^N225": (5.0, 10.0),
        "^HSI": (1.0, 10.0),
        "CL=F": (0.01, 1000.0),
        "GC=F": (0.1, 100.0),
        "SI=F": (0.005, 5000.0),
        "BTC-USD": (0.01, 1.0),
        "ETH-USD": (0.01, 1.0),
        "SOL-USD": (0.01, 1.0),
        "XRP-USD": (0.0001, 1.0),
        "BNB-USD": (0.01, 1.0),
        "TSLA": (0.01, 1.0),
        "AAPL": (0.01, 1.0),
        "NVDA": (0.01, 1.0),
        "DX-Y.NYB": (0.05, 1.0),
        "EURUSD=X": (0.0001, 100000.0),
        "^TNX": (0.001, 10.0),
        "^IRX": (0.001, 10.0),
        "^VIX": (0.01, 10.0),
        "6E=F": (0.00005, 125000.0),
        "6J=F": (0.0000005, 12500000.0),
        "ZN=F": (0.015625, 1000.0),
        "K2=F": (0.05, 200.0),
        "ETHA": (0.01, 1.0),
        "US100_CF": (0.25, 20.0),
    }
    p = Path(__file__).resolve().parent / "instrument_tick_specs.csv"
    if not p.is_file():
        return fallback
    try:
        merged = dict(fallback)
        merged.update(_parse_instrument_specs_csv(p))
        return merged
    except Exception as exc:
        print(
            f"[warn] instrument_tick_specs.csv 로드 실패, 폴백 스펙 사용: {exc}",
            file=sys.stderr,
            flush=True,
        )
        return fallback


# yfinance 티커 → (tick, dollars_per_point). CSV가 있으면 tick·USD/tick 기준으로 덮어씀.
DEFAULT_INSTRUMENT_SPECS: Dict[str, Tuple[float, float]] = _coalesce_instrument_specs()

# 스크린샷 워치리스트 순서 (필요 시 티커만 수정)
DEFAULT_WATCHLIST: List[str] = [
    "ES=F",
    "NQ=F",
    "YM=F",
    "RTY=F",
    "^N225",
    "^HSI",
    "CL=F",
    "GC=F",
    "SI=F",
    "BTC-USD",
    "ETH-USD",
    "SOL-USD",
    "XRP-USD",
    "BNB-USD",
    "TSLA",
    "AAPL",
    "NVDA",
    "DX-Y.NYB",
    "EURUSD=X",
    "^TNX",
    "^IRX",
    "^VIX",
]


def sma(s: pd.Series, n: int) -> pd.Series:
    return s.rolling(n, min_periods=n).mean()


def magic_center(close: pd.Series) -> pd.Series:
    return (
        sma(close, 5) + sma(close, 20) + sma(close, 60) + sma(close, 240)
    ) / 4.0


def band_levels(center: pd.Series, r_pct: float) -> Tuple[pd.Series, pd.Series]:
    upper = center * (1.0 + r_pct / 100.0)
    lower = center * (1.0 - r_pct / 100.0)
    return upper, lower


@dataclass
class BacktestResult:
    r_pct: float
    pnl_points: float
    pnl_usd: float
    trades: int
    wins: int
    max_dd_usd: float


def backtest_simple(
    ohlc: pd.DataFrame,
    r_pct: float,
    *,
    exit_near_half_band_pct: float = 15.0,
    stop_buffer_half_band_pct: float = 30.0,
    tick: float = 0.25,
    dollars_per_point: float = 20.0,
    warmup: int = 240,
) -> BacktestResult:
    """
    바 단위 단순 시뮬. 포지션 1계약, 숏 신호가 롱과 겹치면 숏 우선(Pine 과 동일 취지).
    """
    c = ohlc["Close"].astype(float)
    h = ohlc["High"].astype(float)
    l = ohlc["Low"].astype(float)
    center = magic_center(c)
    upper, lower = band_levels(center, r_pct)

    pos = 0  # 0 flat, 1 long, -1 short
    entry = 0.0
    prot = 0.0
    tgt = 0.0

    pnl_usd = 0.0
    eq = 0.0
    peak = 0.0
    max_dd = 0.0
    trades = 0
    wins = 0

    n = len(ohlc)
    for i in range(max(warmup, 1), n):
        ci = float(c.iloc[i])
        hi = float(h.iloc[i])
        li = float(l.iloc[i])
        cen = float(center.iloc[i])
        up = float(upper.iloc[i])
        lo = float(lower.iloc[i])
        if any(math.isnan(x) for x in (ci, hi, li, cen, up, lo)):
            continue

        half_band = (up - cen)
        if half_band <= 0:
            continue
        max_near = max(half_band * exit_near_half_band_pct / 100.0, tick * 5.0)
        sbuf = half_band * stop_buffer_half_band_pct / 100.0

        # 청산 우선
        if pos == 1:
            if li <= prot:
                pts = prot - entry
                pnl = pts * dollars_per_point
                pnl_usd += pnl
                eq += pnl
                trades += 1
                if pnl > 0:
                    wins += 1
                pos = 0
            elif hi >= tgt:
                pts = tgt - entry
                pnl = pts * dollars_per_point
                pnl_usd += pnl
                eq += pnl
                trades += 1
                if pnl > 0:
                    wins += 1
                pos = 0
        elif pos == -1:
            if hi >= prot:
                pts = entry - prot
                pnl = pts * dollars_per_point
                pnl_usd += pnl
                eq += pnl
                trades += 1
                if pnl > 0:
                    wins += 1
                pos = 0
            elif li <= tgt:
                pts = entry - tgt
                pnl = pts * dollars_per_point
                pnl_usd += pnl
                eq += pnl
                trades += 1
                if pnl > 0:
                    wins += 1
                pos = 0

        peak = max(peak, eq)
        max_dd = max(max_dd, peak - eq)

        if pos != 0:
            continue

        straddle_long = (hi > lo) and (lo > li)
        straddle_short = (hi > up) and (up > li)
        if straddle_short and straddle_long:
            pos = -1
            entry = up
            prot = up + sbuf
            tgt = cen + max_near
        elif straddle_short:
            pos = -1
            entry = up
            prot = up + sbuf
            tgt = cen + max_near
        elif straddle_long:
            pos = 1
            entry = lo
            prot = lo - sbuf
            tgt = cen - max_near

    return BacktestResult(
        r_pct=r_pct,
        pnl_points=pnl_usd / dollars_per_point if dollars_per_point else 0.0,
        pnl_usd=pnl_usd,
        trades=trades,
        wins=wins,
        max_dd_usd=max_dd,
    )


def download(symbol: str, interval: str, period: str) -> pd.DataFrame:
    df = yf.download(
        symbol,
        period=period,
        interval=interval,
        auto_adjust=False,
        progress=False,
    )
    if df.empty:
        raise ValueError(f"빈 데이터: {symbol} period={period} interval={interval}")
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = [str(c[0]) for c in df.columns]
    df = df.rename(columns=str.title)
    need = {"Open", "High", "Low", "Close"}
    if not need <= set(df.columns):
        raise ValueError(f"컬럼 부족: {df.columns.tolist()}")
    return df.dropna(subset=["Close"])


def download_safe(symbol: str, interval: str, period: str) -> Optional[pd.DataFrame]:
    try:
        return download(symbol, interval, period)
    except Exception as exc:
        print(f"[skip] {symbol}: {exc}", file=sys.stderr)
        return None


def _normalize_csv_header_names(columns: object) -> List[str]:
    """BOM·앞뒤 공백 제거 후 컬럼명 정리 (TV CSV 첫 열 '\ufefftime' 대응)."""
    out: List[str] = []
    for c in list(columns):
        s = str(c).strip().lstrip("\ufeff").strip()
        out.append(s)
    return out


def load_price_series_from_csv(path: str, price_col: Optional[str]) -> pd.Series:
    """
    틱(또는 순서 있는 체결) CSV에서 가격 열만 읽습니다. 시간 열은 정렬용으로만 쓸 수 있음.
    """
    pth = Path(path).expanduser()
    if not pth.is_absolute():
        pth = (Path.cwd() / pth).resolve()
    if not pth.is_file():
        cwd = Path.cwd().resolve()
        raise FileNotFoundError(
            f"CSV 파일이 없습니다: {pth}\n"
            f"  현재 작업 폴더: {cwd}\n"
            f"  --tick-csv 에 전체 경로를 주거나, CSV를 위 폴더에 두세요.\n"
            f"  예: C:\\data\\nq_ticks.csv"
        )
    raw = pd.read_csv(pth, encoding="utf-8-sig")
    raw.columns = _normalize_csv_header_names(raw.columns)
    col = price_col
    if col is None or col not in raw.columns:
        for c in raw.columns:
            cl = c.lower()
            if cl in ("price", "last", "close", "trade", "trd", "px"):
                col = c
                break
        else:
            raise ValueError(
                f"가격 컬럼을 찾을 수 없습니다. 컬럼: {list(raw.columns)} — "
                f"price/last/close 중 하나를 쓰거나 --tick-price-col 을 지정하세요."
            )
    time_candidates = [c for c in raw.columns if c.lower() in ("time", "timestamp", "ts", "datetime", "date")]
    s = pd.to_numeric(raw[col], errors="coerce")
    if time_candidates:
        tcol = time_candidates[0]
        try:
            order = pd.to_datetime(raw[tcol], errors="coerce")
            s = s.loc[order.sort_values().index]
        except Exception:
            pass
    s = s.dropna().reset_index(drop=True)
    if len(s) < 10:
        raise ValueError("유효 틱(가격) 개수가 너무 적습니다.")
    return s


def load_ohlc_csv(path: str) -> pd.DataFrame:
    """
    TradingView 등에서 받은 이미 집계된 봉 CSV (time, open, high, low, close).
    backtest_simple 이 요구하는 Open/High/Low/Close 컬럼으로 맞춥니다.
    """
    pth = Path(path).expanduser()
    if not pth.is_absolute():
        pth = (Path.cwd() / pth).resolve()
    if not pth.is_file():
        raise FileNotFoundError(str(pth))
    raw = pd.read_csv(pth, encoding="utf-8-sig")
    raw.columns = _normalize_csv_header_names(raw.columns)
    lower_map = {c.lower(): c for c in raw.columns}
    for need in ("open", "high", "low", "close"):
        if need not in lower_map:
            raise ValueError(
                f"OHLC CSV 에 open/high/low/close 가 필요합니다. 컬럼: {list(raw.columns)}"
            )
    out = pd.DataFrame(
        {
            "Open": pd.to_numeric(raw[lower_map["open"]], errors="coerce"),
            "High": pd.to_numeric(raw[lower_map["high"]], errors="coerce"),
            "Low": pd.to_numeric(raw[lower_map["low"]], errors="coerce"),
            "Close": pd.to_numeric(raw[lower_map["close"]], errors="coerce"),
        }
    )
    out = out.dropna()
    if len(out) < 300:
        raise ValueError(f"유효 봉 수 부족: {len(out)} (300 미만)")
    return out


def tv_ohlc_csv_time_stats(path: str) -> Tuple[str, str, int]:
    """
    TV OHLC CSV 의 time/date 등 열에서 첫·마지막 시각과 고유 캘린더 일 수(UTC 날짜 기준).
    열이 없거나 파싱 실패 시 ("", "", 0).
    """
    pth = Path(path).expanduser().resolve()
    if not pth.is_file():
        return "", "", 0
    peek = pd.read_csv(pth, nrows=5, encoding="utf-8-sig")
    peek.columns = _normalize_csv_header_names(peek.columns)
    lower = {c.lower(): c for c in peek.columns}
    tc = None
    for key in ("time", "date", "datetime", "timestamp", "일시"):
        if key in lower:
            tc = lower[key]
            break
    if tc is None:
        return "", "", 0
    tcol = pd.read_csv(pth, usecols=[tc], encoding="utf-8-sig")
    tcol.columns = _normalize_csv_header_names(tcol.columns)
    # usecols 후 실제 열 이름이 tc 와 다를 수 있음(BOM 등)
    tname = list(tcol.columns)[0]
    ts = pd.to_datetime(tcol[tname], utc=True, errors="coerce").dropna()
    if ts.empty:
        return "", "", 0
    start = ts.iloc[0].strftime("%Y-%m-%d")
    end = ts.iloc[-1].strftime("%Y-%m-%d")
    ndays = int(ts.dt.normalize().nunique())
    return start, end, ndays


def aggregate_ticks_to_ohlc(
    price_series: pd.Series,
    ticks_per_bar: int,
    *,
    drop_partial_last_bar: bool,
) -> pd.DataFrame:
    """연속 체결가를 N틱마다 O/H/L/C 한 봉으로 묶습니다 (TV N-틱 봉과 동일한 집계 정의)."""
    if ticks_per_bar < 1:
        raise ValueError("ticks_per_bar >= 1")
    p = price_series.astype(float).reset_index(drop=True)
    n = int(p.shape[0])
    if n < ticks_per_bar:
        raise ValueError(f"틱 수 {n} < ticks_per_bar {ticks_per_bar}")
    if drop_partial_last_bar:
        n_full = (n // ticks_per_bar) * ticks_per_bar
        if n_full < ticks_per_bar:
            raise ValueError("완전한 N틱 봉이 없습니다.")
        p = p.iloc[:n_full]
    g = np.arange(len(p)) // ticks_per_bar
    tmp = pd.DataFrame({"p": p.values})
    ohlc = (
        tmp.groupby(g, sort=True)
        .agg(Open=("p", "first"), High=("p", "max"), Low=("p", "min"), Close=("p", "last"))
        .reset_index(drop=True)
    )
    return ohlc


def build_grid(r_min: float, r_max: float, r_step: float) -> List[float]:
    grid: List[float] = []
    x = r_min
    while x <= r_max + 1e-9:
        grid.append(round(x, 6))
        x += r_step
    return grid


def resolve_spec(symbol: str, tick: Optional[float], dpp: Optional[float]) -> Tuple[float, float]:
    if tick is not None and dpp is not None:
        return tick, dpp
    if symbol in DEFAULT_INSTRUMENT_SPECS:
        t0, d0 = DEFAULT_INSTRUMENT_SPECS[symbol]
        return tick if tick is not None else t0, dpp if dpp is not None else d0
    return tick if tick is not None else 0.01, dpp if dpp is not None else 1.0


def find_best_r(
    df: pd.DataFrame,
    grid: List[float],
    *,
    exit_near_pct: float,
    stop_buffer_pct: float,
    tick: float,
    dollars_per_point: float,
) -> Tuple[BacktestResult, List[BacktestResult]]:
    results: List[BacktestResult] = []
    for r in grid:
        results.append(
            backtest_simple(
                df,
                r,
                exit_near_half_band_pct=exit_near_pct,
                stop_buffer_half_band_pct=stop_buffer_pct,
                tick=tick,
                dollars_per_point=dollars_per_point,
            )
        )
    results.sort(key=lambda z: z.pnl_usd, reverse=True)
    return results[0], results


def robust_r_mean_top_k(results_pnl_desc: List[BacktestResult], k: int) -> Tuple[float, int]:
    """
    상위 k개 격자(수익 PnL 순)의 r_pct 산술평균 (PnL 1위 포함).
    참고용; Pine 반영용 기본 권장값은 robust_r_exclude_best_mean 을 씁니다.
    """
    if not results_pnl_desc:
        return float("nan"), 0
    kk = max(1, k)
    take = results_pnl_desc[: min(kk, len(results_pnl_desc))]
    mean_r = sum(t.r_pct for t in take) / len(take)
    return mean_r, len(take)


def robust_r_exclude_best_mean(results_pnl_desc: List[BacktestResult], k: int) -> Tuple[float, int]:
    """
    PnL 1위 격자(단일 argmax)를 제외하고, 그다음 상위 k개 격자의 r_pct 산술평균.
    격자 스캔에서 나온 최고 한 점은 표본 노이즈에 과하게 맞춰질 수 있어,
    과적합을 줄이려면 이 값을 권장 r 로 쓰는 것이 안전합니다.
    """
    if len(results_pnl_desc) <= 1:
        return float("nan"), 0
    kk = max(1, k)
    tail = results_pnl_desc[1 : 1 + kk]
    if not tail:
        return float("nan"), 0
    mean_r = sum(t.r_pct for t in tail) / len(tail)
    return mean_r, len(tail)


def run_single_symbol_report(
    symbol: str,
    args: argparse.Namespace,
    grid: List[float],
    *,
    df: Optional[pd.DataFrame] = None,
    tick_override: Optional[float] = None,
    dpp_override: Optional[float] = None,
    source_note: str = "",
) -> Optional[Tuple[BacktestResult, float, float]]:
    if df is None:
        df = download_safe(symbol, args.interval, args.period)
    nb = 0 if df is None else len(df)
    if df is None or nb < 300:
        print(f"[skip] {symbol}: 데이터 부족 (bars={nb})")
        return None
    tick, dpp = resolve_spec(symbol, tick_override, dpp_override)
    extra = f" {source_note}" if source_note else ""
    print(f"\n--- {symbol} bars={len(df)} tick={tick} $/pt={dpp}{extra} ---")
    best, results = find_best_r(
        df,
        grid,
        exit_near_pct=args.exit_near_pct,
        stop_buffer_pct=args.stop_buffer_pct,
        tick=tick,
        dollars_per_point=dpp,
    )
    print(f"{'r_pct':>8} {'trades':>7} {'win%':>7} {'PnL_USD':>12} {'maxDD_USD':>12}")
    for r in results[: args.top]:
        wr = 100.0 * r.wins / r.trades if r.trades else 0.0
        print(
            f"{r.r_pct:8.4f} {r.trades:7d} {wr:6.1f}% {r.pnl_usd:12.2f} {r.max_dd_usd:12.2f}"
        )
    r_robust, n_rob = robust_r_exclude_best_mean(results, args.robust_top_k)
    r_mean_incl_topk, n_incl = robust_r_mean_top_k(results, args.robust_top_k)
    rob_bt = backtest_simple(
        df,
        r_robust,
        exit_near_half_band_pct=args.exit_near_pct,
        stop_buffer_half_band_pct=args.stop_buffer_pct,
        tick=tick,
        dollars_per_point=dpp,
    )
    print(
        f"==> 단일 최대 PnL 격자점 (과적합 위험·참고만): r={best.r_pct:.4f}% | "
        f"PnL_USD={best.pnl_usd:.2f} | trades={best.trades}"
    )
    print(
        f"==> 권장 r (PnL 1위 제외, 그다음 상위 {n_rob}개 r 평균): {r_robust:.4f}% | "
        f"동일 백테 재검증 PnL_USD={rob_bt.pnl_usd:.2f} | trades={rob_bt.trades}"
    )
    print(
        f"    참고: 상위 {n_incl}개 전체 평균(1위 포함)={r_mean_incl_topk:.4f}% "
        f"(Pine 기본값에는 위 권장 r 우선)"
    )
    return best, r_robust, r_mean_incl_topk


def main() -> None:
    ap = argparse.ArgumentParser(description="MagicTrading r(%) grid search (offline)")
    ap.add_argument("--symbol", default=None, help="단일 yfinance 심볼 (기본: 배치 시 미사용)")
    ap.add_argument(
        "--watchlist",
        action="store_true",
        help=f"기본 워치리스트 {len(DEFAULT_WATCHLIST)}종 일괄 스캔",
    )
    ap.add_argument(
        "--symbols",
        default=None,
        help='쉼표 구분 심볼 목록. 예: "ES=F,NQ=F,BTC-USD"',
    )
    ap.add_argument("--interval", default="1h", help="1h, 1d 등")
    ap.add_argument("--period", default="730d", help="예: 365d, 730d, max")
    ap.add_argument("--r-min", type=float, default=0.08, help="스캔 r%% 하한")
    ap.add_argument("--r-max", type=float, default=1.20, help="스캔 r%% 상한")
    ap.add_argument("--r-step", type=float, default=0.01, help="격자 간격 (퍼센트 포인트)")
    ap.add_argument("--exit-near-pct", type=float, default=15.0, help="익절: 반배 대비 %% (Pine exitNearHalfBandPct)")
    ap.add_argument("--stop-buffer-pct", type=float, default=30.0, help="손절 버퍼: 반배 대비 %%")
    ap.add_argument("--tick", type=float, default=None, help="최소 변동단위 (미지정 시 종목 표 참조)")
    ap.add_argument("--dollars-per-point", type=float, default=None, help="1포인트당 USD (미지정 시 종목 표 참조)")
    ap.add_argument("--top", type=int, default=15, help="심볼당 상위 N개 격자 출력")
    ap.add_argument(
        "--robust-top-k",
        type=int,
        default=10,
        help=(
            "과적합 완화 권장 r: PnL 1위 격자는 제외하고, 그다음 상위 K개 격자의 r%% 산술평균 "
            "(단일 최대 PnL 점·상위K전체평균은 참고용으로만 출력)"
        ),
    )
    ap.add_argument("--csv", default=None, help="요약 CSV 저장 경로 (종목별 최적 r)")
    ap.add_argument(
        "--tick-csv",
        default=None,
        help="체결 틱 CSV 경로. 지정 시 yfinance 시간봉 대신 N틱 OHLC로 최적화 (단일 종목만)",
    )
    ap.add_argument(
        "--ticks-per-bar",
        type=int,
        default=1000,
        help="틱 CSV 집계: N틱마다 1봉 (TV 1000틱 차트면 1000)",
    )
    ap.add_argument(
        "--tick-price-col",
        default=None,
        help="틱 CSV 가격 컬럼명 (미지정 시 price/last/close 등 자동 탐지)",
    )
    ap.add_argument(
        "--drop-partial-last-bar",
        action="store_true",
        help="마지막 N틱 미만 봉 제외 (데이터 길이가 N으로 나눠떨어지게 자름)",
    )
    ap.add_argument(
        "--ohlc-csv",
        default=None,
        help="이미 집계된 봉 CSV (TV 내보내기: time,open,high,low,close). "
        "1000틱 봉 등 재집계 없이 그대로 사용. --tick-csv 와 동시 사용 불가.",
    )
    args = ap.parse_args()

    # 구버전과 혼동 방지: 이 줄이 보이면 최신 스크립트입니다.
    _script = Path(__file__).resolve()
    print(f"[optimize_magic_r] 실행 파일: {_script}", flush=True)
    print(f"[optimize_magic_r] tick-csv 지원 빌드: 2026-02-11", flush=True)

    if args.tick_csv and args.ohlc_csv:
        print("오류: --tick-csv 와 --ohlc-csv 는 동시에 쓸 수 없습니다.", file=sys.stderr)
        sys.exit(2)
    if (args.tick_csv or args.ohlc_csv) and (args.watchlist or args.symbols):
        print(
            "오류: --tick-csv / --ohlc-csv 는 단일 시계열 전용입니다. --watchlist / --symbols 와 함께 쓸 수 없습니다.",
            file=sys.stderr,
        )
        sys.exit(2)

    grid = build_grid(args.r_min, args.r_max, args.r_step)

    preloaded: Dict[str, pd.DataFrame] = {}
    if args.ohlc_csv:
        cand = Path(args.ohlc_csv).expanduser()
        if not cand.is_absolute():
            cand = (Path.cwd() / cand).resolve()
        print(f"[ohlc-csv] 경로: {cand}", flush=True)
        print(f"[ohlc-csv] 존재: {cand.is_file()}", flush=True)
        try:
            ohlc_df = load_ohlc_csv(str(cand))
        except Exception:
            print("OHLC CSV 처리 실패:", file=sys.stderr, flush=True)
            traceback.print_exc(file=sys.stderr)
            sys.exit(1)
        sym_o = args.symbol or "OHLC_CSV"
        preloaded[sym_o] = ohlc_df
        symbols = [sym_o]
        print(f"OHLC CSV: {len(ohlc_df)}봉 (집계 없음, TV 내보내기 그대로)", flush=True)
    elif args.tick_csv:
        cand = Path(args.tick_csv).expanduser()
        if not cand.is_absolute():
            cand = (Path.cwd() / cand).resolve()
        print(f"[tick-csv] 찾는 경로: {cand}", flush=True)
        print(f"[tick-csv] 파일 존재: {cand.is_file()}", flush=True)
        if not cand.is_file():
            print(
                "\nCSV가 없습니다. 아래 중 하나를 하세요.\n"
                "  1) 브로커/데이터에서 받은 틱 파일을 위 경로에 두거나\n"
                '  2) 전체 경로로 실행: --tick-csv "D:\\data\\nq_ticks.csv"\n'
                "  3) 스크립트가 최신인지 확인 (이 메시지가 보이면 최신입니다).\n",
                flush=True,
            )
            sys.exit(1)
        try:
            px = load_price_series_from_csv(str(cand), args.tick_price_col)
            ohlc_tb = aggregate_ticks_to_ohlc(
                px,
                args.ticks_per_bar,
                drop_partial_last_bar=args.drop_partial_last_bar,
            )
        except Exception:
            print("틱 CSV 처리 실패 (상세):", file=sys.stderr, flush=True)
            traceback.print_exc(file=sys.stderr)
            sys.exit(1)
        sym_tick = args.symbol or "TICK_N"
        preloaded[sym_tick] = ohlc_tb
        symbols = [sym_tick]
        print(
            f"틱 CSV: {args.tick_csv} → {len(px)}틱 → {len(ohlc_tb)}봉 "
            f"({args.ticks_per_bar}틱/봉, partial_drop={args.drop_partial_last_bar})"
        )
    elif args.symbols:
        symbols = [s.strip() for s in args.symbols.split(",") if s.strip()]
    elif args.watchlist:
        symbols = list(DEFAULT_WATCHLIST)
    elif args.symbol:
        symbols = [args.symbol]
    else:
        symbols = ["NQ=F"]

    batch = len(symbols) > 1
    summary: List[Tuple[str, float, float, float, int, float, float, float]] = []

    for sym in symbols:
        src = ""
        if args.tick_csv and sym in preloaded:
            src = f"[{args.ticks_per_bar}-틱봉·CSV]"
        rep = run_single_symbol_report(
            sym,
            args,
            grid,
            df=preloaded.get(sym),
            tick_override=args.tick,
            dpp_override=args.dollars_per_point,
            source_note=src,
        )
        if rep is not None:
            best, r_robust, r_mean_incl = rep
            wr = 100.0 * best.wins / best.trades if best.trades else 0.0
            calmar = best.pnl_usd / best.max_dd_usd if best.max_dd_usd > 1e-6 else float("nan")
            summary.append(
                (sym, best.r_pct, r_robust, r_mean_incl, best.trades, wr, best.pnl_usd, calmar)
            )

    if batch and summary:
        print("\n" + "=" * 90)
        print(
            "=== 종목별 r 요약 — max_PnL(참고) vs 권장(PnL1위 제외·상위K 평균) ==="
        )
        print(
            f"{'symbol':<14} {'r_maxPnL':>10} {'r_recommend':>10} {'trades':>7} "
            f"{'win%':>7} {'PnL@max':>12} {'PnL/maxDD':>12}"
        )
        for row in summary:
            sym, br, rr, _rincl, tr, wr, pnl, cm = row
            print(f"{sym:<14} {br:10.4f} {rr:10.4f} {tr:7d} {wr:6.1f}% {pnl:12.2f} {cm:12.4f}")
        print(
            "\nr_recommend = PnL 1위 격자를 뺀 다음 K개 격자 r 평균(과적합 완화). "
            "Pine·Manual BaseR 는 이 값 우선."
        )
        print(
            "종목 간 PnL 직접 비교는 dollars_per_point 근사라 어렵습니다. 종목별로 TV 재검증하세요."
        )

    if args.csv and summary:
        out = pd.DataFrame(
            summary,
            columns=[
                "symbol",
                "r_max_pnl_pct",
                "r_robust_mean_pct",
                "r_mean_topk_including_max_pct",
                "trades_at_max",
                "win_pct",
                "pnl_usd_at_max",
                "pnl_over_maxdd",
            ],
        )
        out.to_csv(args.csv, index=False)
        print(f"\nCSV 저장: {args.csv}")

    if not batch and summary:
        _, best_r, r_robust, r_incl, *_ = summary[0]
        print("\n=== Pine 에 반영 시 참고 ===")
        print(
            f"단일 최대 PnL 격자 r ≈ {best_r:.4f}% (참고만, 과적합 가능)"
        )
        print(
            f"권장 r (PnL 1위 제외·다음 {args.robust_top_k}개 평균) ≈ {r_robust:.4f}% "
            "— Manual BaseR·baseRPct 정렬 시 우선 적용 권장."
        )
        print(
            f"참고: 상위 {args.robust_top_k}개 전체 평균(1위 포함) ≈ {r_incl:.4f}%"
        )
        if args.tick_csv or args.ohlc_csv:
            print(
                "CSV 기준: TV 1000틱 봉과 완전 일치하려면 동일 데이터원·동일 집계가 필요합니다."
            )


if __name__ == "__main__":
    main()
