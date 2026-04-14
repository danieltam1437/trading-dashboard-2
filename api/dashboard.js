export default async function handler(req, res) {
  try {
    const response = await fetch("https://scanner.tradingview.com/taiwan/scan", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        symbols: {
          tickers: [
            "TWSE:TAIEX",
            "TAIFEX:TXF1!",
            "TWSE:2330",
            "TWSE:2317",
            "TWSE:2454",
            "TWSE:2308",
            "TWSE:2881",
            "TWSE:2882",
            "TWSE:2891"
          ]
        },
        columns: ["close", "change", "change_abs"]
      })
    });

    if (!response.ok) {
      throw new Error(`TradingView HTTP ${response.status}`);
    }

    const result = await response.json();

    if (!result || !Array.isArray(result.data) || result.data.length < 2) {
      throw new Error("TradingView returned empty data");
    }

    const taiexRaw = result.data[0];
    const txfRaw = result.data[1];
    const stocks = result.data.slice(2);

    if (!taiexRaw?.d || !txfRaw?.d) {
      throw new Error("Index or futures data format invalid");
    }

    function toNum(v) {
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    }

    function normalizeMajorIndexPrice(price, changeAbs) {
      let p = toNum(price);
      let c = toNum(changeAbs);

      // 修正 2055 -> 20550 這種情況
      if (p > 0 && p < 10000) {
        p = p * 10;
        c = c * 10;
      }

      return {
        current: Number(p.toFixed(2)),
        changeAbs: Number(c.toFixed(2))
      };
    }

    const taiexNormalized = normalizeMajorIndexPrice(
      taiexRaw.d[0],
      taiexRaw.d[2]
    );

    const txfNormalized = normalizeMajorIndexPrice(
      txfRaw.d[0],
      txfRaw.d[2]
    );

    const taiexCurrent = taiexNormalized.current;
    const taiexPct = Number(toNum(taiexRaw.d[1]).toFixed(2));
    const taiexChangeAbs = taiexNormalized.changeAbs;

    const txfCurrent = txfNormalized.current;
    const txfPct = Number(toNum(txfRaw.d[1]).toFixed(2));
    const txfChangeAbs = txfNormalized.changeAbs;

    const validStocks = stocks.filter(item => {
      return item && Array.isArray(item.d) && typeof item.d[1] === "number";
    });

    const upCount = validStocks.filter(item => item.d[1] > 0).length;
    const support = validStocks.length
      ? Math.round((upCount / validStocks.length) * 100)
      : 0;

    const clamp = (v, min = 0, max = 100) => Math.max(min, Math.min(max, v));

    const weight50 = clamp(Math.round(50 + taiexPct * 8));
    const mid100 = clamp(Math.round(50 + taiexPct * 6));
    const electronics = clamp(Math.round(55 + taiexPct * 9));
    const finance = clamp(Math.round(45 + taiexPct * 5));

    const avgScore = Math.round(
      (support + weight50 + mid100 + electronics + finance) / 5
    );

    const futuresBasis = Number((txfCurrent - taiexCurrent).toFixed(2));

    let marketStatus = "震盪整理";
    let strategyText = "先觀望，等方向確認";
    let signalText = "訊號：結構中性";

    if (avgScore >= 70 && txfPct >= taiexPct - 0.3) {
      marketStatus = "強勢偏多";
      strategyText = "主攻順勢，拉回找多";
      signalText = "訊號：結構偏多，期現同步";
    } else if (avgScore <= 40 && txfPct <= taiexPct + 0.3) {
      marketStatus = "弱勢偏空";
      strategyText = "反彈保守，不追多";
      signalText = "訊號：結構偏弱，期現同步偏空";
    } else {
      marketStatus = "震盪整理";
      strategyText = "等期現方向一致再出手";
      signalText = "訊號：期現分歧，避免追單";
    }

    const now = new Date();
    const timeText = now.toLocaleTimeString("zh-TW", {
      hour12: false,
      timeZone: "Asia/Taipei"
    });

    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    return res.status(200).json({
      ok: true,
      updatedAt: Date.now(),
      taiex: {
        current: taiexCurrent,
        pct: taiexPct,
        changeAbs: taiexChangeAbs
      },
      futures: {
        symbol: "TXF1!",
        current: txfCurrent,
        pct: txfPct,
        changeAbs: txfChangeAbs,
        basis: futuresBasis
      },
      dashboard: {
        marketStatus,
        strategyText,
        signalText,
        avgScore
      },
      row: {
        time: timeText,
        support,
        weight50,
        mid100,
        electronics,
        finance
      }
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message || "unknown error"
    });
  }
}
