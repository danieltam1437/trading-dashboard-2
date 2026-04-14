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

    if (!result || !Array.isArray(result.data) || result.data.length === 0) {
      throw new Error("TradingView returned empty data");
    }

    const taiex = result.data[0];
    const stocks = result.data.slice(1);

    if (!taiex || !Array.isArray(taiex.d)) {
      throw new Error("TAIEX data format invalid");
    }

    let indexPrice = Number(taiex.d[0] ?? 0);
    let indexChangePct = Number(taiex.d[1] ?? 0);
    let indexChangeAbs = Number(taiex.d[2] ?? 0);

    // 修正加權指數縮放問題：若回傳 2055，改成 20550
    if (indexPrice > 0 && indexPrice < 10000) {
      indexPrice = indexPrice * 10;
      indexChangeAbs = indexChangeAbs * 10;
    }

    const validStocks = stocks.filter(item => {
      return item && Array.isArray(item.d) && typeof item.d[1] === "number";
    });

    const upCount = validStocks.filter(item => item.d[1] > 0).length;
    const support = validStocks.length
      ? Math.round((upCount / validStocks.length) * 100)
      : 0;

    const clamp = (v, min = 0, max = 100) => Math.max(min, Math.min(max, v));

    const weight50 = clamp(Math.round(50 + indexChangePct * 8));
    const mid100 = clamp(Math.round(50 + indexChangePct * 6));
    const electronics = clamp(Math.round(55 + indexChangePct * 9));
    const finance = clamp(Math.round(45 + indexChangePct * 5));

    const avgScore = Math.round(
      (support + weight50 + mid100 + electronics + finance) / 5
    );

    let marketStatus = "震盪整理";
    let strategyText = "先觀望，等方向確認";
    let signalText = "訊號：結構中性";

    if (avgScore >= 70) {
      marketStatus = "強勢偏多";
      strategyText = "主攻順勢，拉回找多";
      signalText = "訊號：結構偏多，電子領先";
    } else if (avgScore <= 40) {
      marketStatus = "弱勢偏空";
      strategyText = "反彈保守，不追多";
      signalText = "訊號：結構偏弱，先看風控";
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
        current: Number(indexPrice.toFixed(2)),
        pct: Number(indexChangePct.toFixed(2)),
        changeAbs: Number(indexChangeAbs.toFixed(2))
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
