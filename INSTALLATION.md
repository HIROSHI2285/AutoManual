# AutoManual セットアップガイド

> **所要時間: 約5〜10分** | Windows / Mac 対応

---

## 用意するもの

| # | 必要なもの | 入手先 |
|---|---|---|
| 1 | **Node.js** (v18.17 以上) | [nodejs.org](https://nodejs.org/) → **LTS版** をダウンロード |
| 2 | **Git** | [git-scm.com](https://git-scm.com/) |
| 3 | **Google Gemini API キー** (無料) | [Google AI Studio](https://aistudio.google.com/app/apikey) で発行 |

### インストール確認方法

コマンドプロンプト (Windows) または ターミナル (Mac) を開き、以下を実行：

```bash
node -v    # → v18.17.0 以上が表示されればOK
git -v     # → git version x.x.x が表示されればOK
```

---

## セットアップ手順

### Step 1 — ソースコードの取得

```bash
git clone https://github.com/HIROSHI2285/AutoManual.git
cd AutoManual
```

> Git を使わない場合: GitHub ページから「Code → Download ZIP」でダウンロードし、解凍したフォルダ内でコマンドプロンプトを開いてください。

### Step 2 — ライブラリのインストール

```bash
npm install
```

> 初回は **2〜5分** かかります。途中でエラーが出なければ成功です。

### Step 3 — API キーの設定

プロジェクトフォルダ直下に `.env.local` ファイルを作成し、API キーを記入します。

#### Windows の場合（コマンドプロンプト）

```cmd
echo GEMINI_API_KEY=ここにAPIキーを貼り付け > .env.local
```

#### Mac の場合（ターミナル）

```bash
echo "GEMINI_API_KEY=ここにAPIキーを貼り付け" > .env.local
```

#### 手動で作成する場合

1. プロジェクトフォルダ直下に `.env.local` という名前のファイルを作成
2. テキストエディタで開き、以下を記入して保存：

```env
GEMINI_API_KEY=ここにAPIキーを貼り付け
```

> **注意 (Windows)**: エクスプローラーの設定で「ファイル名拡張子」を表示にしてから作成してください。
> そうしないと `.env.local.txt` というファイルになり、正しく動作しません。

### Step 4 — アプリを起動

```bash
npm run dev
```

以下のメッセージが出れば起動完了です：

```
▲ Next.js 14.2.3
- Local: http://localhost:3000
```

ブラウザ (Chrome 推奨) で [http://localhost:3000](http://localhost:3000) を開いてください。

---

## 便利な起動方法 (Windows)

プロジェクトフォルダ内の **`start_app.bat`** をダブルクリックすると、サーバー起動とブラウザ起動を一度に行えます。

> **注意**: デスクトップから起動したい場合は、`start_app.bat` を直接コピーせず、**右クリック → 送る → デスクトップ (ショートカットを作成)** してください。直接コピーすると動作しません。

---

## トラブルシューティング

### `npm install` でエラーが出る

| 原因 | 対処 |
|---|---|
| Node.js が古い | `node -v` で確認 → v18 未満なら [最新版](https://nodejs.org/) をインストール |
| ネットワーク制限 | 社内プロキシ等で npm がブロックされている可能性。ネットワーク管理者に確認 |
| 権限エラー (Mac) | `sudo npm install` で再試行 |

### 画面が真っ白 / エラーになる

- `.env.local` ファイルが正しく存在するか確認
- API キーが正しくコピーされているか確認（前後に余分な空白がないか）
- コマンドプロンプトにエラーメッセージが出ていないか確認

### 「ポート3000が使用中」と表示される

別のアプリがポート3000を使っています。以下のどちらかで対処：

```bash
# 方法1: 別のポートで起動
npm run dev -- -p 3001
# → ブラウザで http://localhost:3001 を開く

# 方法2: ポート3000を解放 (Windows)
netstat -ano | findstr :3000
taskkill /PID <表示されたPID> /F
```

### 動画アップロード後に長時間待たされる

- 動画ファイルが大きすぎる可能性があります。**5分以内、1080p以下** の動画を推奨します。
- コマンドプロンプトのログに進捗が表示されます。`Stage 1:`, `Stage 2:` 等のログが流れていれば正常に処理中です。
