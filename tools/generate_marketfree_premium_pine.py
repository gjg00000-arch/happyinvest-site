# one-shot: writes Dodam_MagicTrading_Marketfree.pine (Premium 백업 + posState + 테이블)
from pathlib import Path

OUT = Path(__file__).resolve().parent / "Dodam_MagicTrading_Marketfree.pine"

S = r"""//@version=5
// Dodam_MagicTrading_Marketfree — 마켓 잠금: marketfree (MagicPremium TSF 레인보우 백업 · 수동 유지, 생성기 미덮어쓰기)
// posState: +1 롱 / -1 숏 / 0 무포지션 = strategy.position_size 동기
strategy(
     "Dodam_MagicTrading_Marketfree",
     shorttitle       = "DMT_Free",
     overlay          = true,
     process_orders_on_close = true,
     pyramiding       = 0,
     initial_capital  = 100000,
     default_qty_type = strategy.fixed,
     default_qty_value = 1,
     commission_type  = strategy.commission.percent,
     commission_value = 0.04,
     max_lines_count  = 500,
     max_labels_count = 500
     )
STRAT_INIT_CAP = 100000.0

entryMode = input.string("Conservative", "Entry Mode", options = ["Conservative", "Attack"], group = "Mode")
baseRManual = input.float(0.0, "Manual BaseR (0=Auto)", minval = 0.0, step = 0.01, group = "Adjust")
useAutoFineTune = input.bool(true, "Auto Fine Tune", group = "Adjust")
manualFineTune = input.float(1.0, "Manual Fine Tune", minval = 0.25, maxval = 3.0, step = 0.01, group = "Adjust")
showSignals = input.bool(true, "Show Signals", group = "Signals")
useAlerts = input.bool(true, "Use alert() Messages", group = "Signals")
alertPayload = input.string("Text", "알림 본문 형식", options = ["Text", "JSON (webhook)"], group = "Signals", tooltip = "웹훅은 JSON 권장.")
attackEntryNearHalfBandPct = input.float(15.0, "Attack Entry Near Band (% of half band)", minval = 0.0, step = 0.5, group = "Signals")
exitNearHalfBandPct = input.float(15.0, "Exit Near Center (% of half band)", minval = 0.0, step = 0.5, group = "Signals")
stopBufferHalfBandPct = input.float(30.0, "Stop Buffer (% of half band)", minval = 0.0, step = 1.0, group = "Risk")
reentryCooldownBars = input.int(3, "Re-entry Cooldown Bars After Stop", minval = 0, group = "Risk")
useTrailingStop = input.bool(true, "Use Trailing Stop", group = "Risk")
trailStartHalfBandPct = input.float(35.0, "Trail Start (% of half band)", minval = 0.0, step = 1.0, group = "Risk")
trailOffsetHalfBandPct = input.float(20.0, "Trail Offset (% of half band)", minval = 0.0, step = 1.0, group = "Risk")
showSimStatsTable = input.bool(true, "시뮬 누적통계 테이블", group = "Signals")
simStatPosOpt = input.string("자동", "시뮬통계 표 위치", options = ["자동", "우상단", "우하단", "좌하단", "좌상단"], group = "Signals")
simStatAutoLookback = input.int(100, "자동 배치 구간(봉)", minval = 20, maxval = 500, group = "Signals")

LICENSE_FIELD = "marketfree"
f_license_ok(string field) =>
    switch str.lower(field)
        "marketfree" => true
        "marketfree_1weekfree" => true
        => false
licenseOk = f_license_ok(LICENSE_FIELD)
if barstate.isfirst and not licenseOk
    runtime.error("Dodam_MagicTrading_Marketfree: LICENSE_FIELD=" + LICENSE_FIELD)

// 웹훅 JSON에서 사용 — 전략 엔진 포지션과 동일 부호
posState = strategy.position_size > 0 ? 1 : strategy.position_size < 0 ? -1 : 0

sendRainbowStart = true
rbStartEvent = "magic_core_rb_online"

showTsfHighDots = true
showTsfLowDots = true
latchDotsOnClose = true
colTsfHigh = color.rgb(255, 0, 0)
colTsfLow = color.rgb(0, 200, 83)
dotWidth = 4
showRainbow = true
tPeriod = 12
maPeriod = 3
cT4 = color.rgb(101, 227, 13)
cT3 = color.rgb(255, 230, 0)
cT2 = color.rgb(255, 140, 0)
cT = color.rgb(255, 45, 45)
cT2m = color.rgb(204, 85, 0)
showRbFill = true
fillTranspRb = 38
lineWRb = 2
useGrayDown = true
trendMode = "T3"
cBear4 = color.rgb(230, 230, 236)
cBear3 = color.rgb(191, 196, 204)
cBear2 = color.rgb(142, 149, 160)
cBearT = color.rgb(94, 102, 112)
cBear2m = color.rgb(74, 85, 104)

autoWidenThresholdPct = 0.12
autoWidenTargetPct = 0.18
baseRMinPct = 0.08
baseRMaxPct = 6.0
stockBaseRPct = 1.0
cryptoBaseRPct = 0.5
btcBaseRPct = 0.5
ethBaseRPct = 0.5
solBaseRPct = 0.45
xrpBaseRPct = 0.40
bnbBaseRPct = 0.45
esBaseRPct = 0.18
nqBaseRPct = 0.20
ymBaseRPct = 0.18
rtyBaseRPct = 0.45
clBaseRPct = 1.5
gcBaseRPct = 1.0
siBaseRPct = 2.8
znBaseRPct = 0.2
k2BaseRPct = 1.0
sixEBaseRPct = 0.27
sixJBaseRPct = 0.27
volLen = 14
volRefLen = 100
volWeight = 0.08
vRatioClampLo = 0.82
vRatioClampHi = 1.18
volMultMin = 0.96
volMultMax = 1.12
autoTuneLen = 14
autoTuneRefLen = 100
autoTuneStrength = 0.50
autoTuneMin = 0.75
autoTuneMax = 1.50
autoTuneRatioLo = 0.70
autoTuneRatioHi = 1.60

px = close
tickSize = syminfo.mintick > 0.0 ? syminfo.mintick : math.max(px * 0.00001, 0.01)
tickPctRaw = px > 0.0 ? tickSize / px * 100.0 : na
baseRAutoLifted = not na(tickPctRaw) and tickPctRaw < autoWidenThresholdPct ? autoWidenTargetPct : tickPctRaw
baseRAutoCommon = not na(baseRAutoLifted) ? math.min(baseRMaxPct, math.max(baseRMinPct, baseRAutoLifted)) : na
tickerUpper = str.upper(syminfo.ticker)
isBTC = str.startswith(tickerUpper, "BTC")
isETH = str.startswith(tickerUpper, "ETH")
isSOL = str.startswith(tickerUpper, "SOL")
isXRP = str.startswith(tickerUpper, "XRP")
isBNB = str.startswith(tickerUpper, "BNB")
isES = str.startswith(tickerUpper, "ES")
isNQ = str.startswith(tickerUpper, "NQ")
isYM = str.startswith(tickerUpper, "YM")
isRTY = str.startswith(tickerUpper, "RTY")
isCL = str.startswith(tickerUpper, "CL")
isGC = str.startswith(tickerUpper, "GC")
isSI = str.startswith(tickerUpper, "SI")
isZN = str.startswith(tickerUpper, "ZN")
isK2 = str.startswith(tickerUpper, "K2")
is6E = str.startswith(tickerUpper, "6E")
is6J = str.startswith(tickerUpper, "6J")
baseRAuto = isBTC ? btcBaseRPct : isETH ? ethBaseRPct : isSOL ? solBaseRPct : isXRP ? xrpBaseRPct : isBNB ? bnbBaseRPct : syminfo.type == "crypto" ? cryptoBaseRPct : isES ? esBaseRPct : isNQ ? nqBaseRPct : isYM ? ymBaseRPct : isRTY ? rtyBaseRPct : isCL ? clBaseRPct : isGC ? gcBaseRPct : isSI ? siBaseRPct : isZN ? znBaseRPct : isK2 ? k2BaseRPct : is6E ? sixEBaseRPct : is6J ? sixJBaseRPct : syminfo.type == "stock" ? stockBaseRPct : baseRAutoCommon
baseR = baseRManual > 0.0 ? baseRManual : nz(baseRAuto, autoWidenTargetPct)
retPct = px[1] > 0.0 ? math.abs((px - px[1]) / px[1]) * 100.0 : 0.0
v = ta.sma(retPct, volLen)
vRef = ta.sma(v, volRefLen)
vRatio = vRef > 0.0 ? v / vRef : 1.0
vRatioVol = math.max(vRatioClampLo, math.min(vRatioClampHi, vRatio))
volMultRaw = 1.0 + volWeight * (vRatioVol - 1.0)
volMult = math.max(volMultMin, math.min(volMultMax, volMultRaw))
atrNow = ta.atr(autoTuneLen)
atrRef = ta.sma(atrNow, autoTuneRefLen)
autoTuneRatioRaw = atrRef > 0.0 ? atrNow / atrRef : 1.0
autoTuneRatio = math.max(autoTuneRatioLo, math.min(autoTuneRatioHi, autoTuneRatioRaw))
autoFineTuneRaw = 1.0 + autoTuneStrength * (autoTuneRatio - 1.0)
autoFineTune = math.max(autoTuneMin, math.min(autoTuneMax, autoFineTuneRaw))
fineTune = useAutoFineTune ? autoFineTune : manualFineTune
rPct = baseR * volMult * fineTune
smaCt5 = ta.sma(close, 5)
smaCt20 = ta.sma(close, 20)
smaCt60 = ta.sma(close, 60)
smaCt240 = ta.sma(close, 240)
center = (smaCt240 + smaCt60 + smaCt20 + smaCt5) / 4.0
upper = center * (1.0 + rPct / 100.0)
lower = center * (1.0 - rPct / 100.0)

lr0 = ta.linreg(close, tPeriod, 0)
lr1 = ta.linreg(close, tPeriod, 1)
T_raw = lr0 + (lr0 - lr1)
T2_val = ta.ema(T_raw, maPeriod)
T3_val = ta.ema(T2_val, maPeriod)
T4_val = ta.ema(T3_val, maPeriod)
T2m_val = T2_val < T_raw ? T2_val : T_raw
var float tsfStepHigh = na
var float tsfStepLow = na
doLatch = latchDotsOnClose ? barstate.isconfirmed : true
if doLatch
    if na(tsfStepHigh)
        tsfStepHigh := T_raw
        tsfStepLow := T_raw
    else
        tsfStepHigh := T_raw > T_raw[1] ? T_raw : tsfStepHigh
        tsfStepLow := T_raw < T_raw[1] ? T_raw : tsfStepLow
trendRefSeries() =>
    switch trendMode
        "T" => T_raw
        "T2" => T2_val
        "T3" => T3_val
        "T4" => T4_val
        "T_기울기3" => T_raw
        => T3_val
trRef = trendRefSeries()
tUpDir = na(trRef[1]) ? true : trRef > trRef[1]
tUpSlope3 = ta.linreg(T_raw, 3, 0) > ta.linreg(T_raw, 3, 1)
trendUp = trendMode == "T_기울기3" ? tUpSlope3 : tUpDir
lineColRb(bull, bear) =>
    useGrayDown and not trendUp ? bear : bull
bandColRb(bull, bear) =>
    base = lineColRb(bull, bear)
    showRbFill ? color.new(base, fillTranspRb) : color(na)

useJsonAlerts = alertPayload == "JSON (webhook)"
jsonEsc(string x) =>
    str.replace_all(str.replace_all(x, "\\", "\\\\"), "\"", "\\\"")
f_jsonBuy() =>
    string msg = "MagicCore BUY " + entryMode + " " + syminfo.ticker + " " + timeframe.period + " C=" + str.tostring(close, format.mintick)
    "{\"event\":\"magic_core_buy\",\"kind\":\"signal\",\"entry_mode\":\"" + entryMode + "\",\"license_pack\":\"" + LICENSE_FIELD + "\",\"pos_state\":" + str.tostring(posState) + ",\"ticker\":\"" + syminfo.ticker + "\",\"exchange\":\"" + syminfo.prefix + "\",\"tf\":\"" + timeframe.period + "\",\"close\":" + str.tostring(close) + ",\"bar_time\":" + str.tostring(time) + ",\"text\":\"" + jsonEsc(msg) + "\"}"
f_jsonSell() =>
    string msg = "MagicCore SELL " + entryMode + " " + syminfo.ticker + " " + timeframe.period + " C=" + str.tostring(close, format.mintick)
    "{\"event\":\"magic_core_sell\",\"kind\":\"signal\",\"entry_mode\":\"" + entryMode + "\",\"license_pack\":\"" + LICENSE_FIELD + "\",\"pos_state\":" + str.tostring(posState) + ",\"ticker\":\"" + syminfo.ticker + "\",\"exchange\":\"" + syminfo.prefix + "\",\"tf\":\"" + timeframe.period + "\",\"close\":" + str.tostring(close) + ",\"bar_time\":" + str.tostring(time) + ",\"text\":\"" + jsonEsc(msg) + "\"}"
f_jsonExit() =>
    string msg = "MagicCore EXIT " + syminfo.ticker + " " + timeframe.period + " C=" + str.tostring(close, format.mintick)
    "{\"event\":\"magic_core_exit\",\"kind\":\"signal\",\"license_pack\":\"" + LICENSE_FIELD + "\",\"pos_state\":" + str.tostring(posState) + ",\"ticker\":\"" + syminfo.ticker + "\",\"exchange\":\"" + syminfo.prefix + "\",\"tf\":\"" + timeframe.period + "\",\"close\":" + str.tostring(close) + ",\"bar_time\":" + str.tostring(time) + ",\"text\":\"" + jsonEsc(msg) + "\"}"
f_jsonStop() =>
    string msg = "MagicCore STOP fixed " + syminfo.ticker + " " + timeframe.period + " C=" + str.tostring(close, format.mintick)
    "{\"event\":\"magic_core_stop\",\"kind\":\"signal\",\"stop_type\":\"fixed\",\"license_pack\":\"" + LICENSE_FIELD + "\",\"pos_state\":" + str.tostring(posState) + ",\"ticker\":\"" + syminfo.ticker + "\",\"exchange\":\"" + syminfo.prefix + "\",\"close\":" + str.tostring(close) + ",\"bar_time\":" + str.tostring(time) + ",\"text\":\"" + jsonEsc(msg) + "\"}"
f_jsonTrail() =>
    string msg = "MagicCore STOP trail " + syminfo.ticker + " " + timeframe.period + " C=" + str.tostring(close, format.mintick)
    "{\"event\":\"magic_core_stop\",\"kind\":\"signal\",\"stop_type\":\"trail\",\"license_pack\":\"" + LICENSE_FIELD + "\",\"pos_state\":" + str.tostring(posState) + ",\"ticker\":\"" + syminfo.ticker + "\",\"exchange\":\"" + syminfo.prefix + "\",\"close\":" + str.tostring(close) + ",\"bar_time\":" + str.tostring(time) + ",\"text\":\"" + jsonEsc(msg) + "\"}"
f_jsonRainbowStart() =>
    string msg = "MagicCore RAINBOW START " + syminfo.ticker + " " + timeframe.period + " C=" + str.tostring(close, format.mintick)
    "{\"event\":\"" + rbStartEvent + "\",\"kind\":\"strategy_rainbow_start\",\"license_pack\":\"" + LICENSE_FIELD + "\",\"script\":\"Dodam_MagicTrading_Marketfree\",\"ticker\":\"" + syminfo.ticker + "\",\"exchange\":\"" + syminfo.prefix + "\",\"tf\":\"" + timeframe.period + "\",\"close\":" + str.tostring(close) + ",\"bar_time\":" + str.tostring(time) + ",\"text\":\"" + jsonEsc(msg) + "\"}"

isLong = posState == 1
isShort = posState == -1
isFlat = posState == 0
halfBand = upper - center
attackEntryNearDist = math.max(halfBand * attackEntryNearHalfBandPct / 100.0, syminfo.mintick * 5.0)
maxNearDist = math.max(halfBand * exitNearHalfBandPct / 100.0, syminfo.mintick * 5.0)
distNearestCenter = math.min(math.abs(low - center), math.min(math.abs(high - center), math.abs(close - center)))
stopBuffer = halfBand * stopBufferHalfBandPct / 100.0
trailStart = halfBand * trailStartHalfBandPct / 100.0
trailOffset = halfBand * trailOffsetHalfBandPct / 100.0
dynamicLongStop = lower - stopBuffer
dynamicShortStop = upper + stopBuffer
longTarget = center - maxNearDist
shortTarget = center + maxNearDist
conservativeBuyRaw = ta.crossover(close, lower)
conservativeSellRaw = ta.crossunder(close, upper)
attackBuyRaw = low <= lower + attackEntryNearDist
attackSellRaw = high >= upper - attackEntryNearDist
entryBuyRaw = entryMode == "Attack" ? attackBuyRaw : conservativeBuyRaw
entrySellRaw = entryMode == "Attack" ? attackSellRaw : conservativeSellRaw
var float longBest = na
var float shortBest = na
var float fixedLongStop = na
var float fixedShortStop = na
if isLong
    longBest := na(longBest) ? high : math.max(longBest, high)
else
    longBest := na
if isShort
    shortBest := na(shortBest) ? low : math.min(shortBest, low)
else
    shortBest := na
if isFlat
    fixedLongStop := na
    fixedShortStop := na
longTrailActive = useTrailingStop and isLong and not na(longBest) and longBest >= strategy.position_avg_price + trailStart
shortTrailActive = useTrailingStop and isShort and not na(shortBest) and shortBest <= strategy.position_avg_price - trailStart
longTrailStopRaw = longBest - trailOffset
shortTrailStopRaw = shortBest + trailOffset
longTrailStop = longTrailActive ? math.max(strategy.position_avg_price + tickSize, longTrailStopRaw) : na
shortTrailStop = shortTrailActive ? math.min(strategy.position_avg_price - tickSize, shortTrailStopRaw) : na
baseLongStop = not na(fixedLongStop) ? fixedLongStop : dynamicLongStop
baseShortStop = not na(fixedShortStop) ? fixedShortStop : dynamicShortStop
longProtectStop = longTrailActive ? math.max(baseLongStop, longTrailStop) : baseLongStop
shortProtectStop = shortTrailActive ? math.min(baseShortStop, shortTrailStop) : baseShortStop
exitCrossCenter = (isShort and ta.crossunder(close, center)) or (isLong and ta.crossover(close, center))
exitSpanCenter = not isFlat and low <= center and high >= center
exitNearCenter = not isFlat and exitNearHalfBandPct > 0.0 and distNearestCenter <= maxNearDist
exitLongNearCenter = isLong and high >= center - maxNearDist
exitShortNearCenter = isShort and low <= center + maxNearDist
trailStopLong = longTrailActive and low <= longTrailStop
trailStopShort = shortTrailActive and high >= shortTrailStop
magicTrailStop = trailStopLong or trailStopShort
stopLong = isLong and low <= longProtectStop
stopShort = isShort and high >= shortProtectStop
magicStop = not magicTrailStop and (stopLong or stopShort)
magicExit = not magicStop and not magicTrailStop and (exitCrossCenter or exitSpanCenter or exitNearCenter or exitLongNearCenter or exitShortNearCenter)
magicTrailStopOnce = magicTrailStop and not magicTrailStop[1]
magicStopOnce = magicStop and not magicStop[1]
magicExitOnce = magicExit and not magicExit[1]
var int lastStopBar = na
if magicStop or magicTrailStop
    lastStopBar := bar_index
cooldownActive = not na(lastStopBar) and bar_index - lastStopBar <= reentryCooldownBars
canEnter = isFlat and not cooldownActive and not magicExit and not magicStop and not magicTrailStop
magicBuy = entryBuyRaw and canEnter
magicSell = entrySellRaw and canEnter
magicBuyOnce = magicBuy and not magicBuy[1]
magicSellOnce = magicSell and not magicSell[1]
// 보유 중 청산 표시 1회 — 무포지션(포지션=0)에서만 리셋
var bool exitConsumed = false
if strategy.position_size == 0
    exitConsumed := false
exitRaw = magicTrailStopOnce or magicStopOnce or magicExitOnce
holding = strategy.position_size != 0
exitTrigger = holding and not exitConsumed and exitRaw
if exitTrigger
    exitConsumed := true
showTrailExit = exitTrigger and magicTrailStopOnce
showStopExit = exitTrigger and magicStopOnce and not magicTrailStopOnce
showProfitExit = exitTrigger and magicExitOnce and not magicTrailStopOnce and not magicStopOnce
if licenseOk and magicSell
    fixedShortStop := dynamicShortStop
    strategy.entry("S", strategy.short, qty = 1, comment = entryMode == "Attack" ? "Attack Short" : "Short Entry")
else if licenseOk and magicBuy
    fixedLongStop := dynamicLongStop
    strategy.entry("L", strategy.long, qty = 1, comment = entryMode == "Attack" ? "Attack Long" : "Long Entry")
if isLong
    strategy.exit("LX", from_entry = "L", limit = longTarget, stop = longProtectStop, comment_profit = "MagicExit Long", comment_loss = longTrailActive ? "Trail Long" : "FixedStop Long")
if isShort
    strategy.exit("SX", from_entry = "S", limit = shortTarget, stop = shortProtectStop, comment_profit = "MagicExit Short", comment_loss = shortTrailActive ? "Trail Short" : "FixedStop Short")
if useAlerts and barstate.isconfirmed and licenseOk
    if useJsonAlerts
        if magicBuyOnce
            alert(f_jsonBuy(), alert.freq_once_per_bar_close)
        if magicSellOnce
            alert(f_jsonSell(), alert.freq_once_per_bar_close)
        if showTrailExit
            alert(f_jsonTrail(), alert.freq_once_per_bar_close)
        else if showStopExit
            alert(f_jsonStop(), alert.freq_once_per_bar_close)
        else if showProfitExit
            alert(f_jsonExit(), alert.freq_once_per_bar_close)
    else
        if magicBuyOnce
            alert("MagicCore · " + entryMode + " Buy signal", alert.freq_once_per_bar_close)
        if magicSellOnce
            alert("MagicCore · " + entryMode + " Sell signal", alert.freq_once_per_bar_close)
        if showTrailExit
            alert("MagicCore · Trailing stop signal", alert.freq_once_per_bar_close)
        else if showStopExit
            alert("MagicCore · Fixed stop signal", alert.freq_once_per_bar_close)
        else if showProfitExit
            alert("MagicCore · Exit signal", alert.freq_once_per_bar_close)
varip bool _rbStartSent = false
if sendRainbowStart and showRainbow and barstate.isconfirmed and barstate.isrealtime and licenseOk and not _rbStartSent
    alert(f_jsonRainbowStart(), alert.freq_once_per_bar_close)
    _rbStartSent := true
alertcondition(licenseOk and useAlerts and magicBuyOnce, "MagicCore Buy", "MagicCore · Buy signal")
alertcondition(licenseOk and useAlerts and magicSellOnce, "MagicCore Sell", "MagicCore · Sell signal")
alertcondition(licenseOk and useAlerts and showTrailExit, "MagicCore Trail Stop", "MagicCore · Trailing stop signal")
alertcondition(licenseOk and useAlerts and showStopExit, "MagicCore Fixed Stop", "MagicCore · Fixed stop signal")
alertcondition(licenseOk and useAlerts and showProfitExit, "MagicCore Exit", "MagicCore · Exit signal")

closedRealizedApprox = strategy.netprofit - nz(strategy.openprofit, 0.0)
var float simEqPeak = 0.0
var float simMaxDdAbs = 0.0
var int simFirstTradeTime = na
if strategy.closedtrades > 0 and na(simFirstTradeTime)
    simFirstTradeTime := time
simEqPeak := math.max(simEqPeak, closedRealizedApprox)
simMaxDdAbs := math.max(simMaxDdAbs, simEqPeak - closedRealizedApprox)
simTradeCount = strategy.closedtrades
avgRealizedPerTrade = simTradeCount > 0 ? closedRealizedApprox / simTradeCount : na
mddPctOfInit = STRAT_INIT_CAP > 0 ? 100.0 * simMaxDdAbs / STRAT_INIT_CAP : na
unrealPnl = nz(strategy.openprofit, 0.0)
simLbAuto = math.min(simStatAutoLookback, bar_index + 1)
simRangeMid = (ta.highest(high, simLbAuto) + ta.lowest(low, simLbAuto)) * 0.5
autoStatUseBottomLeft = close > simRangeMid
f_fmtChartTime(int t) =>
    str.format_time(t, "yyyy-MM-dd HH:mm", syminfo.timezone)

plot(center, "Center", color = color.green, linewidth = 5)
plot(upper, "Upper", color = color.red, linewidth = 2)
plot(lower, "Lower", color = color.blue, linewidth = 2)
rb4 = plot(showRainbow ? T4_val : na, title = "RB T4", color = lineColRb(cT4, cBear4), linewidth = lineWRb)
rb3 = plot(showRainbow ? T3_val : na, title = "RB T3", color = lineColRb(cT3, cBear3), linewidth = lineWRb)
rb2 = plot(showRainbow ? T2_val : na, title = "RB T2", color = lineColRb(cT2, cBear2), linewidth = lineWRb)
rbT = plot(showRainbow ? T_raw : na, title = "RB T", color = lineColRb(cT, cBearT), linewidth = lineWRb)
rb2m = plot(showRainbow ? T2m_val : na, title = "RB T2-", color = lineColRb(cT2m, cBear2m), linewidth = lineWRb)
fill(rb4, rb3, color = showRainbow ? bandColRb(cT4, cBear4) : na)
fill(rb3, rb2, color = showRainbow ? bandColRb(cT3, cBear3) : na)
fill(rb2, rbT, color = showRainbow ? bandColRb(cT2, cBear2) : na)
fill(rbT, rb2m, color = showRainbow ? bandColRb(cT, cBearT) : na)
plot(showTsfHighDots ? tsfStepHigh : na, title = "TSF 고점 (점)", color = colTsfHigh, style = plot.style_circles, linewidth = dotWidth)
plot(showTsfLowDots ? tsfStepLow : na, title = "TSF 저점 (점)", color = colTsfLow, style = plot.style_circles, linewidth = dotWidth)
plotshape(showSignals and magicBuyOnce, title = "MagicBuy", style = shape.triangleup, location = location.belowbar, size = size.small, color = color.lime, text = "BUY", textcolor = color.white)
plotshape(showSignals and magicSellOnce, title = "MagicSell", style = shape.triangledown, location = location.abovebar, size = size.small, color = color.red, text = "SELL", textcolor = color.white)
plotshape(showSignals and showProfitExit ? close : na, title = "MagicExit", style = shape.xcross, location = location.absolute, size = size.small, color = color.yellow, text = "EXIT", textcolor = color.white)
plotshape(showSignals and showStopExit ? close : na, title = "MagicFixedStop", style = shape.xcross, location = location.absolute, size = size.small, color = color.orange, text = "STOP", textcolor = color.white)
plotshape(showSignals and showTrailExit ? close : na, title = "MagicTrailStop", style = shape.xcross, location = location.absolute, size = size.small, color = color.aqua, text = "TRAIL", textcolor = color.white)
plot(baseR, "Applied BaseR (%)", display = display.status_line)
plot(baseRAuto, "Auto BaseR (%)", display = display.status_line)
plot(fineTune, "Applied Fine Tune (x)", display = display.status_line)
plot(rPct, "Applied R (%)", display = display.status_line)

panelBg = color.rgb(19, 23, 34)
autoBlue = color.rgb(79, 195, 247)
manualOrange = color.rgb(255, 183, 77)
var table simStatTR = table.new(position.top_right, 2, 8, border_width = 1, frame_color = color.new(color.gray, 50), bgcolor = color.new(panelBg, 10))
var table simStatTL = table.new(position.top_left, 2, 8, border_width = 1, frame_color = color.new(color.gray, 50), bgcolor = color.new(panelBg, 10))
var table simStatBR = table.new(position.bottom_center, 2, 8, border_width = 1, frame_color = color.new(color.gray, 50), bgcolor = color.new(panelBg, 10))
var table simStatBL = table.new(position.bottom_left, 2, 8, border_width = 1, frame_color = color.new(color.gray, 50), bgcolor = color.new(panelBg, 10))
fillSimStatTable(table tbl, string periodTxt, string pvStr, string mddCell) =>
    table.cell(tbl, 0, 0, "누적통계(1계약)", text_color = color.white, text_size = size.small, bgcolor = color.new(panelBg, 5))
    table.cell(tbl, 1, 0, syminfo.ticker, text_color = color.silver, text_size = size.small, bgcolor = color.new(panelBg, 5))
    table.cell(tbl, 0, 1, "1틱", text_color = color.silver, text_size = size.small)
    table.cell(tbl, 1, 1, str.tostring(syminfo.mintick, format.mintick), text_color = color.aqua, text_size = size.small)
    table.cell(tbl, 0, 2, "1포인트 가치", text_color = color.silver, text_size = size.small)
    table.cell(tbl, 1, 2, pvStr, text_color = color.aqua, text_size = size.small)
    table.cell(tbl, 0, 3, "거래기간", text_color = color.silver, text_size = size.small)
    table.cell(tbl, 1, 3, periodTxt, text_color = color.white, text_size = size.small)
    table.cell(tbl, 0, 4, "거래횟수", text_color = color.silver, text_size = size.small)
    table.cell(tbl, 1, 4, str.tostring(simTradeCount), text_color = color.white, text_size = size.small)
    table.cell(tbl, 0, 5, "누적실현(근사)", text_color = color.silver, text_size = size.small)
    table.cell(tbl, 1, 5, str.tostring(closedRealizedApprox, "#.##"), text_color = closedRealizedApprox >= 0 ? color.teal : color.red, text_size = size.small)
    table.cell(tbl, 0, 6, "거래당 평균", text_color = color.silver, text_size = size.small)
    table.cell(tbl, 1, 6, simTradeCount > 0 ? str.tostring(avgRealizedPerTrade, "#.##") : "—", text_color = simTradeCount > 0 and avgRealizedPerTrade >= 0 ? color.teal : color.red, text_size = size.small)
    table.cell(tbl, 0, 7, "MDD(실현)", text_color = color.silver, text_size = size.small)
    table.cell(tbl, 1, 7, mddCell, text_color = color.orange, text_size = size.small)
var table info = table.new(position.bottom_right, 2, 12, border_width = 1, frame_color = color.new(color.gray, 50), bgcolor = color.new(panelBg, 15))
var label infoLabel = na
isChartLastForUi = barstate.islast or bar_index == last_bar_index
if isChartLastForUi and showSimStatsTable
    periodTxt = na(simFirstTradeTime) ? "거래 없음" : f_fmtChartTime(simFirstTradeTime) + " ~ " + f_fmtChartTime(time)
    pvStr = na(syminfo.pointvalue) or syminfo.pointvalue == 0 ? "— (na)" : str.tostring(syminfo.pointvalue, "#.######")
    mddCell = str.tostring(simMaxDdAbs, "#.##") + " · 초기대비 " + str.tostring(nz(mddPctOfInit, 0.0), "#.##") + "%"
    table.clear(simStatTR, 0, 0, 1, 7)
    table.clear(simStatTL, 0, 0, 1, 7)
    table.clear(simStatBR, 0, 0, 1, 7)
    table.clear(simStatBL, 0, 0, 1, 7)
    if simStatPosOpt == "자동"
        if autoStatUseBottomLeft
            fillSimStatTable(simStatBL, periodTxt, pvStr, mddCell)
        else
            fillSimStatTable(simStatTR, periodTxt, pvStr, mddCell)
    else if simStatPosOpt == "우상단"
        fillSimStatTable(simStatTR, periodTxt, pvStr, mddCell)
    else if simStatPosOpt == "좌상단"
        fillSimStatTable(simStatTL, periodTxt, pvStr, mddCell)
    else if simStatPosOpt == "우하단"
        fillSimStatTable(simStatBR, periodTxt, pvStr, mddCell)
    else
        fillSimStatTable(simStatBL, periodTxt, pvStr, mddCell)
if isChartLastForUi and not showSimStatsTable
    table.clear(simStatTR, 0, 0, 1, 7)
    table.clear(simStatTL, 0, 0, 1, 7)
    table.clear(simStatBR, 0, 0, 1, 7)
    table.clear(simStatBL, 0, 0, 1, 7)
if isChartLastForUi
    table.cell(info, 0, 0, "Entry Mode", text_color = color.silver, text_size = size.small)
    table.cell(info, 1, 0, entryMode, text_color = entryMode == "Attack" ? color.orange : color.aqua, text_size = size.small)
    table.cell(info, 0, 1, "Attack Near", text_color = color.silver, text_size = size.small)
    table.cell(info, 1, 1, str.tostring(attackEntryNearHalfBandPct, "#.##") + "%", text_color = color.aqua, text_size = size.small)
    table.cell(info, 0, 2, "Stop Type", text_color = color.silver, text_size = size.small)
    table.cell(info, 1, 2, "Fixed at Entry", text_color = color.orange, text_size = size.small)
    table.cell(info, 0, 3, "Auto BaseR", text_color = color.silver, text_size = size.small)
    table.cell(info, 1, 3, str.tostring(baseRAuto, "#.######") + "%", text_color = color.new(autoBlue, 0), text_size = size.small)
    table.cell(info, 0, 4, "Applied BaseR", text_color = color.silver, text_size = size.small)
    table.cell(info, 1, 4, (baseRManual > 0.0 ? "Manual " : "Auto ") + str.tostring(baseR, "#.######") + "%", text_color = baseRManual > 0.0 ? color.new(manualOrange, 0) : color.new(autoBlue, 0), text_size = size.small)
    table.cell(info, 0, 5, "Fine Tune Mode", text_color = color.silver, text_size = size.small)
    table.cell(info, 1, 5, useAutoFineTune ? "Auto" : "Manual", text_color = useAutoFineTune ? color.new(autoBlue, 0) : color.new(manualOrange, 0), text_size = size.small)
    table.cell(info, 0, 6, "Applied Fine Tune", text_color = color.silver, text_size = size.small)
    table.cell(info, 1, 6, str.tostring(fineTune, "#.##") + "x", text_color = fineTune != 1.0 ? color.new(manualOrange, 0) : color.new(autoBlue, 0), text_size = size.small)
    table.cell(info, 0, 7, "Applied R", text_color = color.silver, text_size = size.small)
    table.cell(info, 1, 7, str.tostring(rPct, "#.######") + "%", text_color = color.new(autoBlue, 0), text_size = size.small)
    table.cell(info, 0, 8, "포지션(posState)", text_color = color.silver, text_size = size.small)
    table.cell(info, 1, 8, posState == 0 ? "0 (무포지션)" : posState == 1 ? "+1 롱" : "-1 숏", text_color = color.aqua, text_size = size.small)
    table.cell(info, 0, 9, "누적실현(근사)", text_color = color.silver, text_size = size.small)
    table.cell(info, 1, 9, str.tostring(closedRealizedApprox, "#.##"), text_color = closedRealizedApprox >= 0 ? color.teal : color.red, text_size = size.small)
    table.cell(info, 0, 10, "미실현", text_color = color.silver, text_size = size.small)
    table.cell(info, 1, 10, str.tostring(unrealPnl, "#.##"), text_color = unrealPnl >= 0 ? color.teal : color.red, text_size = size.small)
    table.cell(info, 0, 11, "posState 값", text_color = color.silver, text_size = size.small)
    table.cell(info, 1, 11, str.tostring(posState), text_color = color.silver, text_size = size.small)
    labelText = "Mode " + entryMode + " · posState=" + str.tostring(posState) + "\nStop Fixed at Entry\nBaseR " + str.tostring(baseR, "#.######") + "%\nR " + str.tostring(rPct, "#.######") + "%"
    if na(infoLabel)
        infoLabel := label.new(bar_index, upper, labelText, style = label.style_label_left, textcolor = color.white, color = color.new(panelBg, 10), size = size.small)
    else
        label.set_xy(infoLabel, bar_index, upper)
        label.set_text(infoLabel, labelText)
        label.set_textcolor(infoLabel, color.white)
        label.set_color(infoLabel, color.new(panelBg, 10))
"""

if __name__ == "__main__":
    OUT.write_text(S, encoding="utf-8")
    print("wrote", OUT.name, len(S))
