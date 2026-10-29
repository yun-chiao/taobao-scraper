// ==========================================
// ⚙️ 你的專屬設定區
// ==========================================
// MY_API_KEY 與 GAS_WEB_APP_URL 放在 config.js（不進 git），範本見 config.example.js
const MY_PROMPT = `
Role (人設):
你現在是台灣原創手作飾品品牌「Mimi 飾物所」的品牌主理人兼文案長。你的語氣溫暖、感性、帶點藝術氣息，同時不失專業。你擅長觀察穿搭細節，並能將冰冷的飾品轉化為充滿溫度的生活故事。

Task (任務):
根據我提供的產品圖片描述或原始標題，撰寫適合放在 Shopee（蝦皮）或 Instagram 的產品描述。

Brand Tone (語氣規範):
語言: 使用繁體中文（台灣習慣用語）。
情感: 連結生活場景（例如：約會、通勤、穿搭風格如 Balletcore, 新中式）。
風格: 一定要有一個風格在標題中 請從以下選項找適合的 新中式 韓系 歐美 波希米雅風 海洋風 輕奢 森系(偏手工 色彩為淡的有彩色就算森系) 
標誌性環節: 必須包含「🐈 Mimi 碎碎唸」區塊，用比較口語、親切的口吻（像朋友在推薦）分享穿戴感受。
符號: 適度使用 emoji（如 ♡, ✨, 🏷️, 📦, 🐈）。
如果有2025新款, 2026新款等等 一律不要放在輸出文字中

Output Structure (輸出結構) 千萬只要這個輸出不要有什麼你好啊我是Mimi 跟你介紹....:
(標題) 格式：Mimi 飾物所｜ 高訂古著 +  風格標籤
（特別注意：標題適時務必幫我加上「925純銀」標籤！不是銀色的就千萬不要加）
「[一句充滿詩意的 Slogan]」
[產品描述全文，約 2-3 段，描述風格與穿搭建議]

🐈 Mimi 碎碎唸：
[以第一人稱分享私心喜愛的原因、材質優點或搭配小技巧]


📦 關於出貨：
Mimi 的飾品皆為親自嚴選的工作室單品，為了給妳最好的品質，下單後請耐心等待約 7-14 個工作天。美好的事物絕對值得等待，讓這份溫柔早日抵達妳的身邊♡

範例輸出為:
Mimi 飾物所｜【925純銀】流動幾何・極簡拉絲耳釘 2026爆款 冷淡風小眾設計 高級感 氣質耳環

「不需要繁瑣的點綴，光影的摺痕就是妳最迷人的氣場。」

這款耳釘將「極簡主義」發揮到了極致，流暢的弧面摺疊設計，打破了平面幾何的單調。表面採用了細緻的手工拉絲工藝，展現出一種低調、內斂的霧面金屬質感。不論是搭配俐落的西裝外套，還是復古的翻領襯衫，它都能在妳耳畔勾勒出一抹清冷的高級感，讓整個人散發出不隨波逐流的小眾氣質。

🐈 Mimi 碎碎唸：

這款耳釘真的是「不費力時髦」的教科書級單品！它的弧度設計非常巧妙，能從不同角度折射出柔和的光影，視覺上非常有立體感，卻又不會顯得浮誇。

這次特別準備了「質感銀」與「高級金」兩個色系。銀色款使用了 S925 全純銀材質，那種冷淡風的清脆感真的太適合日常通勤了；而金色則多了一份復古奢華的份量感。耳針的部分同樣採用 S925 全純銀，這可是 Mimi 的堅持，讓大家在追求風格的同時，也能讓耳朵感到最安心的呵護喔♡

🏷️ 商品細節：

材質：S925 全純銀（親膚抗敏）

工藝：精細手工拉絲、流體摺疊造型

顏色：質感亮銀色 / 復古拉絲金

風格：冷淡風、歐美極簡、高級感

📦 關於出貨：

Mimi 的飾品皆為親自嚴選的工作室單品，為了給妳最好的品質，下單後請耐心等待約 7-14 個工作天。美好的事物絕對值得等待，讓這份純粹的優雅早日抵達妳的身邊♡
`;
// ==========================================

// 呼叫 Gemini AI
async function generateCopywriting(productTitle) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${MY_API_KEY}`;
  const fullPrompt = `${MY_PROMPT}\n\n商品原標題：${productTitle}`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: fullPrompt }] }]
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`[狀態碼 ${response.status}] Google 伺服器說：${errorText}`);
    }
    
    const data = await response.json();
    return data.candidates[0].content.parts[0].text;
    
  } catch (err) {
    throw new Error(`連線錯誤細節：${err.message}`);
  }
}

// 產生 Excel
function exportToShopeeExcel(title, aiDescription, images) {
  const rowData = {
    "商品名稱": title,
    "商品描述": aiDescription,
    "商品圖片 1": images[0] || "",
    "商品圖片 2": images[1] || "",
    "商品圖片 3": images[2] || "",
    "商品圖片 4": images[3] || "",
    "商品圖片 5": images[4] || ""
  };

  const worksheet = XLSX.utils.json_to_sheet([rowData]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "蝦皮上傳資料");
  XLSX.writeFile(workbook, `蝦皮上傳_${new Date().getTime()}.xlsx`);
}

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("圖片格式轉換失敗"));
    reader.readAsDataURL(blob);
  });
}

async function imageUrlToDataUrl(imageUrl) {
  const response = await fetch(imageUrl, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`圖片下載失敗（${response.status}）`);
  }

  const imageBlob = await response.blob();
  return blobToDataURL(imageBlob);
}

function trimTitleForCover(title) {
  if (!title) return "Mimi 飾物所精選飾品";
  const normalized = title.replace(/\s+/g, " ").trim();
  return normalized.length > 28 ? `${normalized.slice(0, 28)}...` : normalized;
}

async function generateImage(productTitle, productImageUrl) {
  if (!window.html2canvas) {
    throw new Error("html2canvas 尚未載入");
  }

  const template = document.getElementById("design-template");
  const templateTitle = document.getElementById("templateTitle");
  const templateProductImage = document.getElementById("templateProductImage");

  if (!template || !templateTitle || !templateProductImage) {
    throw new Error("找不到設計模板元素");
  }

  templateTitle.textContent = trimTitleForCover(productTitle);

  // 先將遠端圖片轉成 data URL，避免 html2canvas 遇到跨網域污染畫布。
  const imageDataUrl = await imageUrlToDataUrl(productImageUrl);

  await new Promise((resolve, reject) => {
    templateProductImage.onload = () => resolve();
    templateProductImage.onerror = () => reject(new Error("模板圖片載入失敗"));
    templateProductImage.src = imageDataUrl;
  });

  const canvas = await window.html2canvas(template, {
    backgroundColor: null,
    width: 800,
    height: 800,
    useCORS: true,
    allowTaint: false,
    scale: 1
  });

  return canvas.toDataURL("image/png", 1.0);
}

async function uploadToGoogleSheets(title, description, images, price) {
  const payload = { title, description, images, price };

  try {
    const response = await fetch(GAS_WEB_APP_URL, {
      method: "POST",
      // 使用 text/plain 避免觸發 OPTIONS 預檢請求
      headers: { "Content-Type": "text/plain;charset=utf-8" }, 
      body: JSON.stringify(payload)
    });

    // 這裡我們不再讀取 response，因為 no-cors 或某些情況下讀不到
    return true; 
  } catch (err) {
    throw new Error(`連線到 Google 時被攔截: ${err.message}`);
  }
}

// 4. 修改主按鈕的執行流程
document.getElementById('actionBtn').addEventListener('click', async () => {
  const resultDiv = document.getElementById('result');
  const price = document.getElementById('itemPrice').value;
  const previewWrapper = document.getElementById('previewWrapper');
  const generatedPreview = document.getElementById('generatedPreview');
  const downloadImageBtn = document.getElementById('downloadImageBtn');

  if (!MY_API_KEY || MY_API_KEY.includes("請在這裡貼上")) {
    resultDiv.innerHTML = "<span style='color:red;'>❌ 請先把 config.example.js 複製成 config.js，並填入你的 API Key！</span>";
    return;
  }

  resultDiv.innerHTML = "<span class='status'>⏳ 第一步：正在抓取淘寶圖片與標題...</span>";
  if (previewWrapper && generatedPreview && downloadImageBtn) {
    previewWrapper.style.display = 'none';
    generatedPreview.src = '';
    downloadImageBtn.style.display = 'none';
    downloadImageBtn.onclick = null;
  }

  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (tab.url.includes("taobao.com") || tab.url.includes("tmall.com")) {
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js'] 
    }, async (injectionResults) => {
      const data = injectionResults[0].result;
      
      if (data && data.title && data.imageUrls && data.imageUrls.length > 0) {
        try {
          resultDiv.innerHTML += "<br><br><span class='status'>🧠 第二步：正在請 AI 撰寫蝦皮文案...</span>";
          
          // 取得 AI 產出的完整原始文案
          const fullAiRawText = await generateCopywriting(data.title);
          
          // --- 關鍵邏輯：拆分標題與內文 ---
          // 將文案按行拆分
          const lines = fullAiRawText.trim().split('\n');
          // 第一行作為「商品名稱」
          const shopeeTitle = lines[0].trim();
          // 剩下的部分合併回去，作為「商品描述」
          const shopeeDescription = lines.slice(1).join('\n').trim();
          // ----------------------------

          try {
            resultDiv.innerHTML += "<br><br><span class='status'>🎨 第三步：正在生成商品首圖...</span>";
            const base64Image = await generateImage(shopeeTitle, data.imageUrls[0]);

            if (previewWrapper && generatedPreview && downloadImageBtn) {
              generatedPreview.src = base64Image;
              previewWrapper.style.display = 'block';
              downloadImageBtn.style.display = 'block';
              downloadImageBtn.onclick = () => {
                chrome.downloads.download({
                  url: base64Image,
                  filename: `Mimi_商品首圖_${Date.now()}.png`,
                  saveAs: true
                });
              };
            }

            resultDiv.innerHTML += "<br><span style='color:green;'>✅ 首圖已完成，可預覽與下載。</span>";
          } catch (coverError) {
            resultDiv.innerHTML += `<br><span style='color:#cc7a00;'>⚠️ 首圖生成失敗：${coverError.message}</span>`;
          }

            try {
                resultDiv.innerHTML += "<br><br><span class='status'>📊 第四步：正在同步至 Google Sheets...</span>";
                
                // 呼叫新函數
                await uploadToGoogleSheets(shopeeTitle, shopeeDescription, data.imageUrls, price);
                
                resultDiv.innerHTML += "<br><br><span style='color:green; font-weight:bold;'>✅ 全部完成！資料已寫入 Google Sheet。</span>";
            } catch (err) {
                resultDiv.innerHTML += `<br><br><span style='color:red;'>❌ 同步失敗：${err.message}</span>`;
            }
          
        } catch (error) {
          resultDiv.innerHTML += `<br><br><span style='color:red;'>❌ AI 處理失敗：${error.message}</span>`;
        }
      } else {
        resultDiv.innerHTML = "抓取失敗，找不到商品資訊或圖片。";
      }
    });
  } else {
    resultDiv.innerHTML = "請在淘寶或天貓商品頁面使用！";
  }
});