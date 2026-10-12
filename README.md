# Pixora

### 讓每張圖片，各得其所。

在自己的 Windows 電腦上，用本機 AI 尋找圖片、審核分類，再整理到真正的資料夾。圖片不需上傳做推論，檔案的歸處由你決定。

[產品網站與操作導覽](https://liutouo.github.io/Pixora-releases/) · [下載 Windows 版](https://github.com/LiuTouo/Pixora-releases/releases/latest) · [回報問題](https://github.com/LiuTouo/Pixora-releases/issues)

![Pixora 圖庫：以真實資料夾瀏覽示範圖片](docs/assets/library.webp)

> 此儲存庫提供 Windows 發行檔與公開產品文件，不提供產品原始碼。此頁操作說明與截圖以已驗證的 **v0.3.7** 為準；下載連結會前往最新發行版。

## 下載與安裝

前往 [最新發行版](https://github.com/LiuTouo/Pixora-releases/releases/latest)，在 Assets 選擇：

| 版本 | 使用方式 |
| --- | --- |
| `*-setup.exe` 安裝版 | 下載後執行安裝程式，依畫面指示完成安裝。 |
| `*-portable.zip` 免安裝版 | **完整解壓縮**到可寫入的資料夾，再執行 `Pixora.exe`。保留隨附的 `analysis` 資料夾，不要只取出執行檔。 |

不需另外安裝 Python、Rust 或 Node.js。請確認下載來源是此儲存庫的 Releases；若安全軟體提出警示，先核對來源與警示內容，不要停用保護。

- **Windows x64**，已測試 Windows 11；需要 Microsoft WebView2 Runtime。
- GPU 為選配：可使用 DirectML 加速，無法使用 GPU 時回到 CPU。
- 第一次下載模型與選用的 GPU 套件需要網路；模型準備完成後可離線推論。基本圖庫瀏覽不需先下載模型。

## 第一次使用

1. 選擇「建立圖庫」或「開啟既有資料夾」。Pixora 只索引登錄的圖庫；圖片留在你選擇的真實資料夾。
2. 從「圖庫」瀏覽資料夾，雙擊預覽圖片。標籤、收藏、星等不會改變檔案位置；搬移、改名則會改動磁碟上的檔案。建議先以已備份的小資料夾熟悉操作。
3. 開啟 **設定 → 本機 AI 與運算裝置**，準備模型；運算裝置與 GPU 套件也在這裡。無 GPU 可使用 CPU。
4. 若要使用語意／相似圖片搜尋，在同頁的「背景分析佇列」選擇分析範圍，按「加入分析佇列」，等待圖片分析完成。模型就緒不代表圖片已完成分析；這個步驟建立搜尋資料，不會搬檔。
5. 回到圖庫，在「搜尋方式」切換語意搜尋，使用**英文描述**，例如 `a photograph of a cat`；也可從圖片資訊找相似圖片。一般文字搜尋比對檔名與相對路徑。

![v0.3.7 的本機 AI 與運算裝置設定](docs/assets/setup.webp)

## 先確認，再整理

智慧整理是輔助判斷，不是自動替你決定所有圖片的分類。

1. **選範圍**：開始整理，選擇資料夾、整理方式與要保留原處的集合。
2. **人工審核**：確認分類群組、命名及目的地；不確定的圖片可以稍後處理。此時尚未搬檔。
3. **預覽並套用**：核對逐檔目的地與實際影響，再確認套用。只加標籤也會先預覽。
4. **查看結果與復原**：完成後查看結果；智慧整理的「最近操作」可復原，紀錄跨程式重啟保存。遇到原位置被占用或檔案已變更時，會列出衝突，不任意覆寫。

![智慧整理：確認分類與歸處](docs/assets/review.webp)

[觀看四步操作導覽](https://liutouo.github.io/Pixora-releases/#guide)

## 檔案、隱私與復原邊界

- **本機推論**：圖片不會上傳做 AI 推論；初次下載模型仍需連線。
- **原圖另外備份**：「設定 → 圖庫維護與備份」匯出的是管理資料，**不包含原始圖片**，不能代替原圖備份。
- **一般搬移／改名**：`Ctrl+Z` 只復原本次工作階段的操作。
- **智慧整理**：使用持久化操作紀錄復原，可跨重啟；仍需核對檔案狀態，不保證能覆蓋後續變更。
- **刪除**：請從 Windows 回收筒還原；不是上述 Undo。

## 工程設計

介面與檔案運算分工：React／TypeScript 呈現桌面介面，Rust 協調檔案、SQLite 與本機索引。CLIP＋ONNX 產生圖片／文字向量，USearch／HNSW 搜尋後以 SQLite 對應圖片；PCA／HDBSCAN 輔助未知內容群聚，最終分類仍經人工審核。

設計重點是 GPU／CPU 備援、內容與模型版本快取、可重建索引，以及預覽、衝突核對和持久化復原，而不是把相似度當作分類正確率。

[工程設計與量測邊界](https://liutouo.github.io/Pixora-releases/#engineering) 收錄歷史合成向量 benchmark 與公開證據。完整百萬張真實圖片的端到端產品驗收尚未完成。

## 畫面與素材來源

畫面來自 **v0.3.7 同版本、隔離的 debug 測試建置**，內嵌 production 前端，以 CDP 擷取；不是未發行的新介面。使用真實 CPU 推論，8 張示範圖片來自 4 個不同視覺素材，實際搬移並復原 2 個檔案。這是小型操作示範，**不是辨識準確率 benchmark**。[擷取紀錄](docs/evidence/capture-provenance.json)

示範素材取自 [scikit-image data](https://scikit-image.org/docs/stable/api/skimage.data.html)：NASA 太空人照片（公有領域）；Chelsea 貓咪／Stefan van der Walt、咖啡／Rachel Michetti、馬匹／Andreas Preuss（Openclipart），後三者為 CC0。Pixora 品牌圖像使用提供的原始素材。

遇到問題請到 [Issues](https://github.com/LiuTouo/Pixora-releases/issues) 附上版本、重現步驟與錯誤訊息；請先遮蔽私人路徑、圖片及其他個人資訊。
