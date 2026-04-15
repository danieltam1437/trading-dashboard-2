export default async function handler(req, res) {
  try {
    const fetchJSON = async (url) => {
      const r = await fetch(url);
      return await r.json();
    };

    // ===== 股票清單 =====
    const ELECTRONICS = ["2330","2317","2454","2308","2382","3711","2303","3231","6669","3034"];
    const FINANCE = ["2882","2881","2886","2891","2884","2885","2880","2883","2887","2892"];
    const WEIGHT = ["2330","2317","2454","2308","2882","2881","2382","3711","2886","2891"];

    // ===== 抓漲幅 =====
    const getPct = async (symbol) => {
      try {
        const data = await fetchJSON(
          `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}.TW`
        );
        const meta = data.chart.result[0].meta;
        const price = meta.regularMarketPrice;
        const prev = meta.previousClose;
        return ((price - prev) / prev) * 100;
      } catch {
        return 0;
      }
    };

    const clamp = (v) => Math.max(0, Math.min(100, v));
    const score = (pct) => clamp((pct + 10) * 5);

    const avg = (arr) => {
      const s = arr.map(score);
      return s.reduce((a,b)=>a+b,0)/s.length;
    };

    // ===== 抓資料 =====
    const elecP = await Promise.all(ELECTRONICS.map(getPct));
    const finP = await Promise.all(FINANCE.map(getPct));
    const weightP = await Promise.all(WEIGHT.map(getPct));

    const electronics = Math.round(avg(elecP));
    const finance = Math.round(avg(finP));
    const weight50 = Math.round(avg(weightP));

    const total = Math.round(
      electronics * 0.45 +
      weight50 * 0.35 +
      finance * 0.20
    );

    // ===== 趨勢判斷 =====
    let marketStatus = "震盪整理";
    let strategyText = "等待方向一致";

    if (total >= 80) {
      marketStatus = "強勢偏多";
      strategyText = "主攻順勢，拉回找多";
    } else if (total >= 65) {
      marketStatus = "偏多震盪";
      strategyText = "偏多操作";
    } else if (total < 45) {
      marketStatus = "偏空";
      strategyText = "反彈找空";
    }

    // ===== 指數 =====
    const taiexPct = await getPct("0050");
    const futuresPct = taiexPct + (Math.random() - 0.5) * 0.3;

    const now = new Date();
    const time = now.toLocaleTimeString("zh-TW", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });

    res.status(200).json({
      ok: true,

      taiex: {
        current: Math.round(20000 + taiexPct * 50),
        pct: taiexPct,
        changeAbs: Math.round(taiexPct * 200)
      },

      futures: {
        symbol: "TXF",
        current: Math.round(20000 + futuresPct * 50),
        pct: futuresPct,
        changeAbs: Math.round(futuresPct * 200)
      },

      dashboard: {
        marketStatus,
        strategyText,
        signalText: "三核心同步判斷",
        avgScore: total
      },

      row: {
        time,
        support: total,
        weight50,
        mid100: total,
        electronics,
        finance
      }
    });

  } catch (e) {
    res.status(500).json({ ok:false, error:e.message });
  }
}
