const admin = require('firebase-admin');

// 1. 初始化 Firebase (從環境變數讀取金鑰，這是最安全的方法)
// 在 GitHub Actions 裡，我們會把金鑰設定在 Secrets 裡
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// 模擬取得股價的函式 (未來你想接真實 API 就在這裡改)
async function fetchCurrentPrice(ticker) {
  // 這裡目前還是產生亂數，模擬 100~600 之間的股價
  // 如果你有申請 API (如 Finnhub, AlphaVantage)，就在這裡 fetch
  return Math.floor(Math.random() * 500) + 100;
}

async function runDailyRecord() {
  console.log('開始執行每日自動記帳...');
  const today = new Date().toISOString().split('T')[0];

  try {
    // 2. 抓取所有使用者 (如果只有你一個人，這也會運作)
    const usersSnapshot = await db.collection('users').get();

    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;
      console.log(`正在處理使用者: ${userId}`);

      // 3. 抓取該使用者的所有交易紀錄
      const transactionsSnapshot = await db.collection(`users/${userId}/transactions`).get();
      const transactions = transactionsSnapshot.docs.map(doc => doc.data());

      if (transactions.length === 0) continue;

      // 4. 計算目前的持倉 (邏輯同網頁版)
      const portfolio = {};

      transactions.sort((a, b) => new Date(a.date) - new Date(b.date));

      transactions.forEach(t => {
        if (!portfolio[t.ticker]) {
          portfolio[t.ticker] = { shares: 0, totalCost: 0 };
        }
        
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

      // 5. 針對還有持股的股票，抓價格並記錄
      for (const ticker in portfolio) {
        const stock = portfolio[ticker];
        
        // 只處理還有持股的 (shares > 0)
        if (stock.shares > 0.001) {
          const currentPrice = await fetchCurrentPrice(ticker);
          const marketValue = stock.shares * currentPrice;
          const profit = marketValue - stock.totalCost;

          console.log(`  - ${ticker}: 現價 ${currentPrice}, 獲利 ${profit.toFixed(2)}`);

          // 6. 寫入 price_history
          const historyRef = db.doc(`users/${userId}/price_history/${ticker}`);
          
          // 使用 arrayUnion 加入新紀錄，避免覆蓋舊的
          await historyRef.set({
            history: admin.firestore.FieldValue.arrayUnion({
              date: today,
              price: currentPrice,
              profit: parseFloat(profit.toFixed(2)),
              timestamp: Date.now()
            })
          }, { merge: true });
        }
      }
    }
    console.log('每日記帳完成！');
  } catch (error) {
    console.error('發生錯誤:', error);
    process.exit(1); // 讓 GitHub Action 知道出錯了
  }
}

runDailyRecord();
