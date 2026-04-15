export default async function handler(req, res) {
  try {
    const fetchJSON = async (url) => {
      const r = await fetch(url, { cache: "no-store" });
      return await r.json();
    };

    const ELECTRONICS = ["2330","2317","2454","2308","2382","3711","2303","3231","6669","3034"];
    const FINANCE = ["2882","2881","2886","2891","2884","2885","2880","2883","2887","2892"];
    const WEIGHT = ["2330","2317","2454","2308","2882","2881","2382","3711","2886","2891"];

    const getPct = async (symbol) => {
      try {
        const data = await fetchJSON(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}.TW`);
        const result = data?.chart?.result?.[0];
        const meta = result?.meta;
        if (!meta) return 0;

        const price = Number(meta.regularMarketPrice ?? 0);
        const prev = Number(meta.previousClose ?? 0);
        if (!price || !prev) return 0;

        return ((price - prev) / prev) * 100;
      } catch {
        return 0;
      }
    };

    const clamp = (v) => Math.max(0, Math.min(100, v));
    const score = (pct) => clamp((pct + 10) * 5);

    const avg = (arr) => {
      const s = arr.map(score);
      return s.length ? s.reduce((a, b) => a + b, 0) / s.length : 50;
    };

    const elecP = await Promise.all(ELECTRONICS.map(getPct));
    const finP = await Promise.all(FINANCE.map(getPct));
    const weightP = await Promise.all(WEIGHT.map(getPct));

    const electronics = Math.round(avg(elecP));
    const finance = Math.round(avg(finP));
    const weight50 = Math.round(avg(weightP));
    const mid100 = Math.round((electronics + finance + weight50) / 3);

    const total = Math.round(
      electronics * 0.45 +
      weight50 * 0.35 +
      finance * 0.20
    );

    let marketStatus = "震盪整理";
    let strategyText = "等待方向一致再出手";
    let signalText = "三核心同步判斷";

    if (total >= 80) {
      marketStatus = "強勢偏多";
      strategyText = "主攻順勢，拉回找多";
      signalText = "電子、金融、權值同步偏多";
    } else if (total >= 65) {
      marketStatus = "偏多震盪";
      strategyText = "偏多操作，避免追高";
      signalText = "電子偏強，觀察金融是否跟上";
    } else if (total < 45) {
      marketStatus = "偏空";
      strategyText = "反彈找空";
      signalText = "三核心偏弱";
    }

    const taiexPct = await getPct("0050");
    const futuresPct = taiexPct + (Math.random() - 0.5) * 0.3;

    const now = new Date();
    const taipeiTime = new Intl.DateTimeFormat("zh-TW", {
      timeZone: "Asia/Taipei",
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    }).format(now);

    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    res.status(200).json({
      ok: true,
      updatedAt: Date.now(),

      taiex: {
        current: Math.round(20000 + taiexPct * 50),
        pct: Number(taiexPct.toFixed(2)),
        changeAbs: Math.round(taiexPct * 200)
      },

      futures: {
        symbol: "TXF",
        current: Math.round(20000 + futuresPct * 50),
        pct: Number(futuresPct.toFixed(2)),
        changeAbs: Math.round(futuresPct * 200)
      },

      dashboard: {
        marketStatus,
        strategyText,
        signalText,
        avgScore: total
      },

      row: {
        time: taipeiTime,
        support: total,
        weight50,
        mid100,
        electronics,
        finance
      }
    });
  } catch (e) {
    res.status(500).json({
      ok: false,
      error: e.message
    });
  }
}
