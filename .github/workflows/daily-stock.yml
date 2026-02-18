const admin = require('firebase-admin');
const axios = require('axios'); // 引入抓取工具

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
const FINNHUB_TOKEN = process.env.FINNHUB_API_KEY;

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// 延遲函式：避免請求太快被 API 擋掉
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// --- 核心修改：向 Finnhub 抓取真實股價 ---
async function fetchCurrentPrice(ticker) {
  try {
    const url = `https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${FINNHUB_TOKEN}`;
    const response = await axios.get(url);
    
    // Finnhub 回傳的 'c' 欄位代表 Current Price (現價)
    const price = response.data.c;
    
    if (price && price !== 0) {
      return price;
    } else {
      console.warn(`  ⚠️ 找不到 ${ticker} 的股價，可能代號錯誤或休市中`);
      return null;
    }
  } catch (error) {
    console.error(`  ❌ 抓取 ${ticker} 失敗:`, error.message);
    return null;
  }
}

async function runDailyRecord() {
  console.log('開始執行真實股價自動記帳...');
  const today = new Date().toISOString().split('T')[0];

  try {
    const usersSnapshot = await db.collection('users').get();

    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;
      const transactionsSnapshot = await db.collection(`users/${userId}/transactions`).get();
      const transactions = transactionsSnapshot.docs.map(doc => doc.data());

      if (transactions.length === 0) continue;

      const portfolio = {};
      transactions.sort((a, b) => new Date(a.date) - new Date(b.date));
      transactions.forEach(t => {
        if (!portfolio[t.ticker]) portfolio[t.ticker] = { shares: 0, totalCost: 0 };
        const p = parseFloat(t.price);
        const s = parseFloat(t.shares);
        if (t.type === 'Buy') {
          portfolio[t.ticker].totalCost += p * s;
          portfolio[t.ticker].shares += s;
        } else if (t.type === 'Sell' && portfolio[t.ticker].shares > 0) {
          const ratio = s / portfolio[t.ticker].shares;
          portfolio[t.ticker].totalCost -= portfolio[t.ticker].totalCost * ratio;
          portfolio[t.ticker].shares -= s;
        } else if (t.type === 'Split') {
          portfolio[t.ticker].shares *= p;
        }
      });

      for (const ticker in portfolio) {
        const stock = portfolio[ticker];
        if (stock.shares > 0.001) {
          // 抓取真實價格
          const currentPrice = await fetchCurrentPrice(ticker);
          
          if (currentPrice) {
            const marketValue = stock.shares * currentPrice;
            const profit = marketValue - stock.totalCost;

            const historyRef = db.doc(`users/${userId}/price_history/${ticker}`);
            await historyRef.set({
              history: admin.firestore.FieldValue.arrayUnion({
                date: today,
                price: currentPrice,
                profit: parseFloat(profit.toFixed(2)),
                timestamp: Date.now()
              })
            }, { merge: true });
            console.log(`  ✅ ${ticker}: 成功記錄真實股價 $${currentPrice}`);
          }
          
          // 抓完一支，休息 2 秒，禮貌待人，API 才不會擋你
          await delay(2000); 
        }
      }
    }
    console.log('今日真實數據記錄完成！');
  } catch (error) {
    console.error('執行失敗:', error);
    process.exit(1);
  }
}

runDailyRecord();
