# Drift Quest 洋流漂流任務

以國中海洋科學為核心的互動式網頁遊戲。學生操作一枚可調整深度、海錨與小帆的科學漂流瓶，利用季節洋流從 A 地抵達 B 地；進階關卡加入颱風外圍影響、海龜導航與鯨魚遷徙等遊戲元素。專案為純 HTML、CSS、JavaScript，可直接託管於 GitHub Pages。

> 本遊戲用於教學，不可作為航海、救難、氣象或野外活動決策依據。

## 已完成內容

- 12 個循序漸進關卡：洋流方向、季節、深度、颱風、生態夥伴與自由模式。
- 臺灣、菲律賓北部、琉球與日本南部海域互動地圖。
- 洋流粒子與向量箭頭動畫。
- 0、10、30、50 公尺四層深度。
- 月份、帆面積、海錨、電量與模擬速度控制。
- 颱風外圍流況與危險核心判定。
- 海龜、鯨魚一次性導航協助。
- 漂流軌跡、距離、速度、科學觀察與任務報告。
- 手機、平板與電腦響應式版面。
- Copernicus Marine 洋流與 NOAA IBTrACS 颱風資料更新腳本。
- GitHub Actions 自動部署 GitHub Pages。

## 立即預覽

直接用瀏覽器開啟 `index.html` 時，部分瀏覽器會阻擋 JSON 載入，因此建議使用本機伺服器：

```bash
python3 -m http.server 8080
```

再開啟：

```text
http://localhost:8080
```

## 部署到 GitHub Pages

### 方法一：使用專案內建 GitHub Actions

1. 在 GitHub 建立新的 repository，例如 `drift-quest`。
2. 將本專案所有檔案上傳到 repository 的 `main` 分支。
3. 開啟 repository 的 **Settings → Pages**。
4. 在 **Build and deployment → Source** 選擇 **GitHub Actions**。
5. 開啟 **Actions**，執行 `Deploy GitHub Pages`；之後每次推送到 `main` 都會自動部署。
6. 網址通常為：

```text
https://你的帳號.github.io/drift-quest/
```

### 方法二：直接從分支部署

也可在 **Settings → Pages** 選擇 `Deploy from a branch`，分支選 `main`、資料夾選 `/(root)`。此方式不需要執行 workflow，但無法利用更新資料後立即部署的流程。

## 洋流資料模式

### 預設：內建教學資料

`data/ocean/current-latest.json` 已包含可立即玩的簡化洋流場。其設計參考臺灣東側北向主要流帶、臺灣海峽季節變化與琉球附近渦流，但不是逐日觀測或正式海洋預報。

首頁右上角若顯示 **教學資料**，代表目前使用此模式。

重新產生教學資料：

```bash
python3 scripts/generate_demo_currents.py
```

### 選用：Copernicus Marine 真實洋流

專案的 `scripts/fetch_copernicus_currents.py` 會讀取 Copernicus Marine 的全球海洋物理分析與預報產品：

- Product：`GLOBAL_ANALYSISFORECAST_PHY_001_024`
- Dataset：`cmems_mod_glo_phy-cur_anfc_0.083deg_P1M-m`
- Variables：`uo`、`vo`
- 區域：112–145°E、15–38°N
- 深度：選取最接近 0、10、30、50 m 的原生水層
- 時間：預設前一個完整年度的 12 個月月平均

Copernicus Marine 全球分析預報產品為 1/12° 全球海洋模式，提供三維洋流與 50 個垂直層。下載需要免費 Copernicus Marine 帳號。

### 設定 GitHub Secrets

在 repository 開啟：

**Settings → Secrets and variables → Actions → New repository secret**

建立：

| Secret 名稱 | 內容 |
|---|---|
| `COPERNICUSMARINE_USERNAME` | Copernicus Marine 帳號或電子郵件 |
| `COPERNICUSMARINE_PASSWORD` | Copernicus Marine 密碼 |

請勿把帳號密碼直接寫入 JavaScript、Python 或 repository。設定後，手動執行 Actions 裡的 `Update Ocean Data`。成功時首頁右上角會改為 **真實洋流**。

更新工作預設每月執行一次。也可以在手動執行時輸入指定年份。

## 颱風資料

`scripts/fetch_ibtracs.py` 會下載 NOAA NCEI 的 IBTrACS v04r01 最近三年資料，篩選西北太平洋並輸出至：

```text
data/typhoons/ibtracs-latest.json
```

目前固定關卡使用經過校準的「教學颱風路徑」，確保任務難度與路線可控；IBTrACS 資料已準備給後續的歷史颱風瀏覽與教師自訂關卡使用。IBTrACS 是全球熱帶氣旋最佳路徑整合資料，不等同即時警報或預報。

## 專案結構

```text
.
├── index.html
├── css/
│   └── style.css
├── js/
│   ├── app.js
│   ├── missions.js
│   ├── current-provider.js
│   └── current-layer.js
├── data/
│   ├── ocean/current-latest.json
│   └── typhoons/ibtracs-latest.json
├── scripts/
│   ├── generate_demo_currents.py
│   ├── fetch_copernicus_currents.py
│   └── fetch_ibtracs.py
└── .github/workflows/
    ├── deploy-pages.yml
    └── update-ocean-data.yml
```

## 調整或新增關卡

關卡都在 `js/missions.js`。基本格式：

```javascript
{
  id: "m13",
  chapter: "自訂章節",
  title: "新任務",
  story: "任務故事",
  difficulty: 2,
  start: { lat: 22.0, lon: 122.0, label: "A 地" },
  target: { lat: 26.0, lon: 126.0, label: "B 地", radiusKm: 130 },
  month: 7,
  allowedMonths: [6, 7, 8],
  maxDays: 25,
  maxDepth: 50,
  recommendedDepth: 10,
  rules: ["25 天內", "可調深度"],
  tip: "給學生的提示",
  successText: "成功說明",
  failText: "重新挑戰提示"
}
```

可選欄位包括：

- `requireDepth`：投放前最低深度。
- `depthChangeLimit`：最多調整深度次數。
- `typhoon`：教學颱風路徑與影響半徑。
- `animal`：海龜或鯨魚協助。
- `freeMode`：允許點擊地圖自訂 A、B 地。

## 教學建議

1. 第一輪只開啟洋流箭頭，讓學生預測路線。
2. 第二輪改變月份，要求學生比較季節差異。
3. 第三輪開放深度切換，記錄每次切換前後的方向與速度。
4. 颱風關卡討論「借力」與「避險」的差異。
5. 讓學生截圖漂流軌跡，以文字說明成功或失敗原因。

## 外部服務與授權注意

- 地圖圖磚使用 OpenStreetMap，正式大量使用時應遵守其 Tile Usage Policy，或改用自己的圖磚服務。
- Leaflet 由 unpkg CDN 載入；若學校網路會阻擋 CDN，可將 Leaflet 檔案下載到專案內。
- Copernicus Marine 與 NOAA 資料應保留來源與引用資訊。
- 「搭乘海龜／鯨魚」為遊戲化表現，課堂中應強調不可接觸或干擾野生動物。

## 主要資料來源

- Copernicus Marine Global Ocean Physics Analysis and Forecast：<https://data.marine.copernicus.eu/product/GLOBAL_ANALYSISFORECAST_PHY_001_024/description>
- Copernicus Marine Toolbox：<https://toolbox-docs.marine.copernicus.eu/>
- NOAA NCEI IBTrACS：<https://www.ncei.noaa.gov/products/international-best-track-archive>
- OpenStreetMap：<https://www.openstreetmap.org/>

## License

程式碼採 MIT License。第三方地圖、資料與套件仍依各自授權及使用條款辦理。
