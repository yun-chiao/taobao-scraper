(function() {
  let itemTitle = "找不到標題";
  let imageUrls = []; 

  // 把縮圖網址還原成高清大圖的魔法函數
  function getHighResUrl(url) {
    if (!url) return null;
    let cleanUrl = url.replace(/_\d+x\d+.*\.jpg.*/, ''); 
    if (cleanUrl.startsWith('//')) cleanUrl = 'https:' + cleanUrl;
    return cleanUrl;
  }

  try {
    // 1. 抓標題
    const titleEl = document.querySelector('h1[class*="Title"], .tb-main-title, h1');
    itemTitle = titleEl ? titleEl.innerText.trim() : document.title.replace('-淘宝网', '').trim();

    // 2. 精準狙擊：只找「縮圖列表」裡面的圖片 (Thumbnail List)
    // 這些 class 是淘寶/天貓專門用來放那 5 張小圖的容器
    const thumbSelectors = [
      'ul[class*="thumbnails"] img', // 涵蓋新版淘寶與天貓
      'div[class*="thumbnails"] img',
      '#J_UlThumb img',              // 舊版淘寶
      '.tb-thumb img'                // 舊版天貓
    ];

    let foundInGallery = false;
    
    for (let selector of thumbSelectors) {
      const imgs = document.querySelectorAll(selector);
      
      // 如果這個列表裡面有圖片
      if (imgs.length > 0) {
        imgs.forEach(img => {
          let src = img.src || img.getAttribute('data-src');
          if (src) {
            let highRes = getHighResUrl(src);
            
            // 確保網址存在、沒有重複，且過濾掉有時候會混在縮圖裡的「播放鍵(play) icon」
            if (highRes && !highRes.includes('play') && !imageUrls.includes(highRes)) {
              imageUrls.push(highRes);
            }
          }
        });
        
        // 只要成功在任何一個縮圖列表抓到東西，就標記成功並跳出迴圈
        if (imageUrls.length > 0) {
          foundInGallery = true;
          break; 
        }
      }
    }

    // 3. 備用方案 (只有在上面真的全失敗時才執行)
    if (!foundInGallery) {
      const allImages = document.querySelectorAll('img');
      allImages.forEach(img => {
        let src = img.src || img.getAttribute('data-src');
        if (src && (src.includes('alicdn.com') || src.includes('tbcdn.cn'))) {
          let lowSrc = src.toLowerCase();
          // 超級嚴格的黑名單
          const blackList = ['icon', 'logo', 'tfs', 'assets', 'shop_logo', 'avatar', 'rank', 'brand', 'spaceball'];
          const isBlacklisted = blackList.some(keyword => lowSrc.includes(keyword));
          // 必須明確包含 imgextra (商家上傳的專屬圖庫)
          const isProductImg = lowSrc.includes('imgextra') || lowSrc.includes('bao/uploaded');

          if (!isBlacklisted && isProductImg) {
            let highRes = getHighResUrl(src);
            if (highRes && !imageUrls.includes(highRes) && imageUrls.length < 5) {
              imageUrls.push(highRes);
            }
          }
        }
      });
    }

  } catch (error) {
    console.error(error);
  }

  return { title: itemTitle, imageUrls: imageUrls };
})();