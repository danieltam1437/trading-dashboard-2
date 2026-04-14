export default async function handler(req, res) {
  try {
    const MIS_BOOTSTRAP_URL = "https://mis.twse.com.tw/stock/fibest.jsp?lang=zh_tw";
    const MIS_QUOTE_URL = "https://mis.twse.com.tw/stock/api/getStockInfo.jsp";

    const INDEX_SYMBOLS = [
      "tse_t00.tw",   // 加權指數
      "tse_TW50.tw",  // 台灣50
      "tse_TWMC.tw",  // 中型100
      "tse_TWIT.tw",  // 電子類
      "tse_TWEI.tw"   // 金融保險類
    ];

    const WEIGHTED_STOCKS = [
      "tse_2330.tw",
      "tse_2317.tw",
      "tse_2454.tw",
      "tse_2308.tw",
      "tse_2881.tw",
      "tse_2882.tw",
      "tse_2891.tw",
      "tse_2886.tw",
      "tse_2412.tw",
      "tse_1301.tw",
      "tse_1303.tw"
    ];

    function toNumber(value) {
      if (value === undefined || value === null) return null;
      const raw = String(value).trim();
      if (!raw || raw === "-" || raw === "--") return null;

      const first = raw.split("_").find(v => v !== "-" && v !== "--" && v !== "");
      if (!first) return null;

      const cleaned = first.replace(/,/g, "");
      const num = Number(cleaned);
      return Number.isFinite(num) ? num : null;
    }

    function getCurrentPrice(item) {
      return (
        toNumber(item.z) ??
        toNumber(item.o) ??
        toNumber(item.h) ??
        toNumber(item.l) ??
        toNumber(item.y) ??
        null
      );
    }

    function pctChange(current, yesterday) {
      if (!Number.isFinite(current) || !Number.isFinite(yesterday) || yesterday === 0) {
        return 0;
      }
      return ((current - yesterday) / yesterday) * 100;
    }

    function pctToScore(pct, range = 2.5) {
      const normalized = ((pct + range) / (range * 2)) * 100;
      return Math.max(0, Math.min(100, Math.round(normalized)));
    }

    async function bootstrapSessionCookie() {
      const response = await fetch(MIS_BOOTSTRAP_URL, {
        headers: {
          "User-Agent": "Mozilla/5.0",
          "Accept": "text/html,application/xhtml+xml",
          "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8"
        }
      });

      const cookie = response.headers.get("set-cookie");
      return cookie || "";
    }

    async function fetchMisQuotes(symbols) {
      const cookie = await bootstrapSessionCookie();
      const ex_ch = symbols.join("|");

      const url = `${MIS_QUOTE_URL}?ex_ch=${encodeURIComponent(ex_ch)}&json=1&delay=0&_=${Date.now()}`;

      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0",
          "Accept": "application/json,text/plain,*/*",
          "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8",
          "Referer": "https://mis.twse.com.tw/stock/index.jsp",
          "Cookie": cookie
        }
      });

      if (!response.ok) {
        throw new Error(`MIS HTTP ${response.status}`);
      }

      const data = await response.json();
      return Array.isArray(data.msgArray) ? data.msgArray : [];
    }

    function buildQuoteMap(items) {
      const map = new Map();
      for (const item of items) {
        const key = item.ch || item.c || "";
        if (!key) continue;
        map.set(key, item);
      }
      return map;
    }

    function simplify(item, fallbackName = "") {
      const current = getCurrentPrice(item || {});
      const yesterday = toNumber(item?.y);
      const open = toNumber(item?.o);
      const high = toNumber(item?.h);
      const low = toNumber(item?.l);
      const volume = toNumber(item?.v);
      const lastVol = toNumber(item?.tv);

      return {
        code: item?.c || "",
        ch: item?.ch || "",
        name: item?.n || fallbackName || item?.c || "",
        time: item?.t || "",
        date: item?.d || "",
        current,
        yesterday,
        open,
        high,
        low,
        volume,
        lastVol,
        pct: Number(pctChange(current, yesterday).toFixed(2))
      };
    }

    const symbols = [...INDEX_SYMBOLS, ...WEIGHTED_STOCKS];
    const rawItems = await fetchMisQuotes(symbols);
    const quoteMap = buildQuoteMap(rawItems);

    const taiex = simplify(quoteMap.get("tse_t00.tw"), "加權指數");
    const tw50 = simplify(quoteMap.get("tse_TW50.tw"), "台灣50");
    const twmc = simplify(quoteMap.get("tse_TWMC.tw"), "中型100");
    const twit = simplify(quoteMap.get("tse_TWIT.tw"), "電子類");
    const twei = simplify(quoteMap.get("tse_TWEI.tw"), "金融保險類");

    const weightedStocks = WEIGHTED_STOCKS.map(sym => simplify(quoteMap.get(sym)));

    const validStocks = weightedStocks.filter(
      s => Number.isFinite(s.current) && Number.isFinite(s.yesterday)
    );

    const aboveYesterdayCount = validStocks.filter(s => s.current > s.yesterday).length;
    const supportScore = validStocks.length
      ? Math.round((aboveYesterdayCount / validStocks.length) * 100)
      : 0;

    const weight50Score = pctToScore(tw50.pct, 2.5);
    const mid100Score = pctToScore(twmc.pct, 2.5);
    const electronicsScore = pctToScore(twit.pct, 2.5);
    const financeScore = pctToScore(twei.pct, 2.5);

    const avgScore = Math.round(
      (supportScore + weight50Score + mid100Score + electronicsScore + financeScore) / 5
    );

    let marketStatus = "震盪整理";
    let strategyText = "等突破或拉回確認";
    let signalText = "訊號：結構分歧，避免追價";

    if (avgScore >= 70 && electronicsScore >= financeScore) {
      marketStatus = "強勢偏多";
      strategyText = "主攻順勢，拉回找多";
      signalText = "訊號：電子與權值同步偏強";
    } else if (avgScore <= 40) {
      marketStatus = "弱勢偏空";
      strategyText = "反彈保守，不追多";
      signalText = "訊號：支撐不足，先看風控";
    }

    const row = {
      time: taiex.time || new Date().toLocaleTimeString("zh-TW", { hour12: false }),
      support: supportScore,
      weight50: weight50Score,
      mid100: mid100Score,
      electronics: electronicsScore,
      finance: financeScore
    };

    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    return res.status(200).json({
      ok: true,
      updatedAt: Date.now(),
      taiex,
      indices: {
        tw50,
        twmc,
        twit,
        twei
      },
      weightedStocks,
      dashboard: {
        marketStatus,
        strategyText,
        signalText,
        avgScore
      },
      row
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message || "unknown error"
    });
  }
}
