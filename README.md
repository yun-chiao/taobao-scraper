# Listio（上架所）— 淘寶／天貓／1688 → 蝦皮 AI 品牌化上架工作台

> 將淘寶、天貓、1688 商品頁一鍵轉化為具有台灣品牌語氣、800×800 品牌首圖、智慧定價與蝦皮批量上傳 Excel 的 Chrome 擴充功能與微型 SaaS。

## 1. 如何在 Chrome 載入擴充功能（免編譯、即開即用）

1. 打開 Chrome 瀏覽器，前往 `chrome://extensions`。
2. 開啟右上角的 **「開發人員模式 (Developer mode)」**。
3. 點選左上角 **「載入未封裝項目 (Load unpacked)」**，選擇本專案下的 **`extension`** 資料夾。
4. 點選瀏覽器右上角工具列的 **Listio 圖示**，即會在右側開啟常駐 **Side Panel 工作台**。
5. 初次開啟會進入 **30 秒賣場引導（Onboarding）**：只需填賣場名稱、選文案語氣與首圖配色。
   - 預設使用 **Listio 雲端免費方案：終身 10 件**，不用註冊、不用 API Key（擴充功能會自動向 `server/` 後端換一組匿名裝置 token）。
   - 進階：到 **設定 → 方案與金鑰 → 自備 Gemini 金鑰**，貼上你的 [Google AI Studio API Key](https://aistudio.google.com/apikey) 即可不計件數使用。

## 2. 離線預覽 UI（不需安裝擴充也能在瀏覽器直接預覽）

在專案根目錄啟動任一靜態伺服器（例如 `python3 -m http.server 8765`），即可開啟以下預覽網址：
- **Side Panel 首頁（偵測商品頁＋最近清單）**：`http://localhost:8765/extension/src/sidepanel/index.html?mock=1&view=home`
- **Side Panel 審稿工作台（首圖渲染＋文案編輯＋定價）**：`http://localhost:8765/extension/src/sidepanel/index.html?mock=1&view=job`
- **Side Panel 初次品牌引導（Onboarding）**：`http://localhost:8765/extension/src/sidepanel/index.html?mock=1&view=onboarding`
- **Side Panel 免費額度用完的狀態**：`http://localhost:8765/extension/src/sidepanel/index.html?mock=1&view=home&used=10`
- **Side Panel 自備金鑰模式**：`http://localhost:8765/extension/src/sidepanel/index.html?mock=1&view=home&mode=byok`
- **4 款首圖模板預覽畫廊**：`http://localhost:8765/extension/src/sidepanel/cover/preview.html`
- **Options 品牌工作台與訂閱設定**：`http://localhost:8765/extension/src/options/index.html?mock=1`

## 3. 執行單元測試

```bash
for f in tests/*.test.mjs; do node "$f"; done
```

## 4. 驗證

- 端對端使用者驗證清單（預覽環境 F1–F9 ＋ 真實 Chrome F10）：[docs/E2E_VERIFICATION.md](docs/E2E_VERIFICATION.md)
- 介面與資料契約：[CONTRACT.md](CONTRACT.md)
