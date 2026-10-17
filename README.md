# 曲匠 AI — 一句話做一首歌

網站放在 Vercel；真正「作曲」的是你自己的電腦：**Claude（用你的 Claude 訂閱）寫詞作曲 → ACE-Step 1.5 在你的顯示卡上唱出來 → MP3 上傳到 Vercel Blob → 網頁上播放、下載。**
介面參考 [Mureka](https://www.mureka.ai/)：簡易／自訂兩種模式、我的作品清單、底部播放器、每次生成兩個版本。

```
瀏覽器 ──► Vercel (Next.js)                         你的電腦（不用開 port）
            ├─ POST /api/jobs   建立工作 ─► Upstash Redis 佇列 ◄── worker 每 10 秒來拿工作
            ├─ GET  /api/jobs   查進度                              │
            └─ 播放 / 下載 ◄── Vercel Blob ◄── 上傳 MP3 ◄────────────┤
                                                                     ├─ claude -p  → 歌名、歌詞、曲風、BPM、調性
                                                                     └─ ACE-Step 1.5 (localhost:8001) → 有人聲的歌曲
```

worker 只會「往外」連到你的網站，所以不需要固定 IP、不用開防火牆、也不用 ngrok。

---

## AI 音樂怎麼做（研究摘要）

| 做法 | 例子 | 優點 | 缺點 |
|---|---|---|---|
| 雲端服務 | Suno、Udio、Mureka、ElevenLabs Music | 品質最好 | 要付費、要 API、內容在別人家 |
| **本機開源歌曲模型** | **ACE-Step 1.5**（MIT）、SongGeneration 2／LeVo（需 10GB+ VRAM）、YuE（需 16GB+） | 免費、離線、可商用、有人聲 | 要 GPU |
| LLM 寫譜 + 合成器 | LLM 寫 ABC/MIDI → FluidSynth | 不用 GPU | 沒有人聲、音色陽春 |

Claude 本身不會輸出聲音，所以這個專案讓 **Claude 當詞曲作者／製作人**（ACE-Step 官方也建議 caption 用英文描述曲風樂器、歌詞用 `[Verse] [Chorus]` 標段落），**ACE-Step 1.5 當樂團和歌手**。實測你的 RTX 4060（8GB）跑 turbo 模型：2 分 20 秒的歌一次兩個版本約 30 秒；精緻模式約 3–8 分鐘。
ACE-Step 沒開的時候，worker 會自動改用「內建合成器」：Claude 直接寫和弦、旋律音符、鼓的節奏，由程式合成成純音樂（不用下載任何模型）。

---

## 參考 Mureka 的做法（全部在你電腦上跑）

| Mureka | 這個專案 |
|---|---|
| Easy 模式：一句話 → AI 寫詞、決定曲風 | Claude 依描述寫歌名、歌詞段落、英文曲風、BPM、調性 |
| Reference：上傳一首歌當風格參考 | `worker/references/` 參考曲庫，ACE-Step 用其中約 30 秒當音色／編曲參考；網站上可選「自動」（依描述挑）或指定 |
| O1 推理模型：先想結構再生成 | 「精緻模式」：ACE-Step 的 5Hz 規劃模型先產生整首歌的骨架，再由主模型生成（8GB 顯卡上規劃模型跑在 CPU，較慢） |
| 每次生成 2 首 | `ACESTEP_BATCH=2` |

**新增參考歌曲**：把 wav / mp3 放進 `worker/references/`，在 `references.json` 加一筆（`id`、顯示名稱、檔名、觸發用關鍵字）。worker 每 10 分鐘把清單同步到網站，不用重新部署。參考音檔不會進 git。

---

## 資料夾

```
web/       Next.js 網站（部署到 Vercel，Root Directory 設成 web）
worker/    你電腦上的服務（Node.js 24，不用編譯）
  references/  參考曲庫（references.json + 音檔）
  examples/    範例歌曲企劃（可不經 Claude 直接渲染測試）
engines/   ACE-Step-1.5（已安裝在這裡，不進 git）
start-all.bat      一次開 ACE-Step + worker
start-acestep.bat  只開 ACE-Step（第一次會自動下載模型）
start-worker.bat   只開 worker（掛掉會自動重啟）
```

---

## 一、部署網站到 Vercel

1. 把這個資料夾推到 GitHub（`.gitignore` 已排除 `engines/`、`.env`），在 Vercel **Add New → Project** 匯入，**Root Directory 選 `web`**。
   （或在 `web/` 裡執行 `npx vercel` 用 CLI 部署。）
2. 專案 → **Storage**：
   - **Create → Upstash（Redis）** → Connect to project。會自動加上 `KV_REST_API_URL`、`KV_REST_API_TOKEN`。
   - **Create → Blob**，存取權選 **Public** → Connect。會自動加上 `BLOB_READ_WRITE_TOKEN`。
3. **Settings → Environment Variables** 加上：
   - `WORKER_SECRET`：一串夠長的亂數（PowerShell：`-join ((48..57)+(97..122) | Get-Random -Count 40 | % {[char]$_})`）
   - `ACCESS_CODE`（選填）：設了之後要輸入通行碼才能生成，建議設，只給隊友／朋友。
4. 重新部署（Deployments → Redeploy），打開網站，左下角應該顯示「生成服務離線」（因為電腦端還沒開）。

## 二、設定你的電腦

1. **登入 Claude（給長時間執行的服務用）**，在一般終端機執行：
   ```bash
   claude setup-token
   ```
   瀏覽器登入後會拿到一組長效 token，貼到 `worker/.env` 的 `CLAUDE_CODE_OAUTH_TOKEN=`。
2. 編輯 `worker/.env`（範本：`worker/.env.example`）：
   ```
   SITE_URL=https://你的網站.vercel.app
   WORKER_SECRET=跟 Vercel 上一樣的值
   CLAUDE_CODE_OAUTH_TOKEN=上一步的 token
   ```
3. 雙擊 **`start-all.bat`**。
   - ACE-Step 第一次啟動會下載模型（幾 GB，看網速要一段時間），看到 `Uvicorn running on http://127.0.0.1:8001` 就好了。
   - worker 視窗會顯示 `引擎設定：auto（ACE-Step 在線）`。
4. 回到網站，左下角變成「生成服務在線」，就可以開始做歌了。

電腦關機或 worker 沒開時，網站還是可以送出，工作會排隊，等你開機後依序生成。

---

## 本機測試（不用 Vercel）

```bash
cd web
npm run dev
```
沒有設定 Upstash／Blob 時，`next dev` 會自動用記憶體佇列，音檔存到 `web/.dev-uploads/`。`worker/.env` 已經設好 `SITE_URL=http://localhost:3000` 和同一組 `WORKER_SECRET`（在 `web/.env.local`），另外開一個終端機：

```bash
cd worker
npm start
```

只想試作曲或渲染：
```bash
npm run compose -- "壘球隊應援歌，隊名閃電" --duration 90              # Claude 作曲 + 渲染，存到 worker/out/
npm run compose -- --plan-only "生日快樂歌"                            # 只看 Claude 寫的歌詞與設定
npm run compose -- --plan examples/softball-acestep.json --engine acestep   # 不經過 Claude，直接用範例渲染
```

---

## 設定參考

**Vercel（web）**：`WORKER_SECRET`（必填）、`KV_REST_API_URL` / `KV_REST_API_TOKEN`、`BLOB_READ_WRITE_TOKEN`、`ACCESS_CODE`、`RATE_LIMIT_PER_HOUR`（預設每個 IP 每小時 6 首）、`MAX_QUEUE`（預設 20）。

**電腦（worker/.env）**：`SITE_URL`、`WORKER_SECRET`、`CLAUDE_CODE_OAUTH_TOKEN`、`CLAUDE_MODEL`（sonnet／opus，空白用預設）、`ENGINE`（auto／acestep／synth）、`ACESTEP_BATCH`（每次幾個版本，預設 2）、`ACESTEP_STEPS`（預設 8）、`POLL_INTERVAL_MS`（預設 10000）。

## 免費額度估算

- **Upstash 免費 50 萬指令／月**：worker 閒置時每 10 秒問一次（加上心跳）≈ 32 萬／月，加上網頁查進度還在額度內。想更省就把 `POLL_INTERVAL_MS` 調大。
- **Vercel Blob（Hobby）1 GB**：一首 2 分鐘的歌約 3–5 MB，兩個版本約 8 MB，大約可放 100 次生成。滿了到 Vercel → Storage → Blob 刪舊檔。
- 工作紀錄在 Redis 保留 30 天；每位使用者的「我的作品」清單存在他自己的瀏覽器。

## 安全性與使用規範

- 網站訪客輸入的文字會交給 Claude，所以 worker 呼叫 Claude 時**關閉所有工具、MCP、外掛**（`--tools "" --strict-mcp-config --safe-mode`），Claude 只能回傳歌曲資料，不能讀寫你電腦上的檔案或執行指令。
- Blob 的寫入金鑰只在 Vercel 上；worker 每次上傳時才跟網站拿一個 10 分鐘有效、只能寫入那一個檔案的 token。
- **Claude 訂閱的使用規範**：用 Claude Code 在自己電腦上跑自動化是官方支援的用法（會用到訂閱裡的 Agent SDK 額度），但 Anthropic 規定不能用個人 Pro／Max 訂閱「替別人提供服務」。建議設 `ACCESS_CODE`，只給自己的隊伍或朋友用；如果要開放給大眾，請改用 API key：在 `worker/.env` 加上 `ANTHROPIC_API_KEY=...`，程式不用改。

## 疑難排解

| 狀況 | 解法 |
|---|---|
| 網站顯示「後端尚未設定」 | Vercel 還沒連 Upstash，或連完沒有 Redeploy |
| 一直「生成服務離線」 | worker 沒開、`SITE_URL` 打錯、`WORKER_SECRET` 兩邊不一樣（worker 視窗會顯示 HTTP 401） |
| 「Claude 目前未登入」 | worker 視窗有詳細原因；重新執行 `claude setup-token` 並更新 `worker/.env` |
| 只有純音樂、沒有人聲 | ACE-Step 沒開，worker 改用內建合成器。先開 `start-acestep.bat` |
| ACE-Step 顯示記憶體不足 | 把 `ACESTEP_BATCH` 改成 1，或縮短歌曲長度 |
| 上傳失敗 403 / 400 | Blob store 要選 Public；確認 `BLOB_READ_WRITE_TOKEN` 有在 Vercel 上 |
