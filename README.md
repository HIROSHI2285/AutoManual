# AutoManual Studio

**動画をアップロードするだけで、AIが自動的にステップバイステップの手順書を生成する次世代マニュアル作成ツールです。**

Google Gemini 2.5 Flash のマルチモーダル機能を活用し、画面操作の動画から操作手順とスクリーンショットを自動抽出し、編集可能なマニュアルとして出力します。

---

## ✨ 主な機能

- **動画からAI自動生成**: 動画内の操作をAIが解析し、正確な手順テキストとスクリーンショットを数秒で生成。
- **リアルタイム進捗表示**: AI分析中〜画像切り出し完了まで、見やすいプログレスバーでリアルタイムに進捗を表示。
- **マルチフォーマット・エクスポート**:
    - **Word (.docx)**: 標準 / 2列レイアウト対応。左右の高さ同期・改ページ安全・プロ品質レイアウト。
    - **PowerPoint (.pptx)**: SVGナンバリング・Meiryo UIフォント完全適用。
    - **PDF**: 印刷や共有に最適（標準 / 2列レイアウト対応）。
    - **Markdown / HTML**: ドキュメント管理やWiki・Web公開に。
- **ドラッグ＆ドロップ並び替え**: 編集モードで手順の順番を自由に変更。ステップ番号は自動で振り直し。
- **高機能画像エディター (Inline Canvas)**:
    - スクリーンショット上に矢印、枠線、テキスト、スタンプ（項番）、ぼかし、ハイライトを直接追加。
    - PowerPointライクな直感的な操作感（Fabric.js 採用）。

---

## 🚀 最新アップデート (v4.7 - 2026/03/01)

### 複数動画・動画個別レイアウト対応 🎥🎛️

複数の動画を同時にアップロードして一つのマニュアルにする際、動画ごとのコントロールが劇的に向上しました。

| 新機能 | 詳細 |
|--------|------|
| **ステップ番号の自動リセット** | 2つ目以降の動画に切り替わったタイミングで、ステップ番号（丸数字）が必ず「1」からリセットされるようになりました。 |
| **動画ごとの個別レイアウト管理** | 各動画セクションのヘッダーから、「1列（標準）」または「2列（左右並び）」のレイアウトを独立して選択・保存可能になりました。 |
| **スマートエクスポート** | Word、PDF、PowerPoint の出力時、動画の区切りで自動的にページ（またはスライド）を分割し、かつそれぞれの動画に設定されたレイアウト（1列/2列の混在）を一つのファイル内で完璧に出力します。 |

### 過去のアップデート

<details>
<summary>v4.6 (2026/02/25) — パフォーマンス大幅改善</summary>

多枚数（20枚以上）の画像に対する編集作業が大きく快適になりました。

| 改善内容 | 効果 |
|----------|------|
| **Lazy Canvas 初期化** (IntersectionObserver) | 編集モード開始時のフリーズを解消。画面外のステップは Fabric.js Canvas が**後で初期化**される |
| **テキスト編集の blur-flush パターン** | タイトル・説明のキー入力が軽快に。`onChange` ではなく `onBlur` 時のみ親 state を更新し再レンダリングを最小化 |
| **Functional setState** | `useCallback` の deps から `manual` を除去し、コールバックが常に安定参照 |
| **Passive event listeners** | カスタム Window イベント (`am:undo`, `am:redo` 等) に `{ passive: true }` を追加 |
| **`content-visibility: auto`** | 長いマニュアルで画面外ステップのレイアウト/描画をスキップ |

</details>

多枚数（20枚以上）の画像に対する編集作業が大きく快適になりました。

| 改善内容 | 効果 |
|----------|------|
| **Lazy Canvas 初期化** (IntersectionObserver) | 編集モード開始時のフリーズを解消。画面外のステップは Fabric.js Canvas が**後で初期化**される |
| **テキスト編集の blur-flush パターン** | タイトル・説明のキー入力が軽快に。`onChange` ではなく `onBlur` 時のみ親 state を更新し再レンダリングを最小化 |
| **Functional setState** | `useCallback` の deps から `manual` を除去し、コールバックが常に安定参照 |
| **Passive event listeners** | カスタム Window イベント (`am:undo`, `am:redo` 等) に `{ passive: true }` を追加 |
| **`content-visibility: auto`** | 長いマニュアルで画面外ステップのレイアウト/描画をスキップ |

### 過去のアップデート

<details>
<summary>v4.5 (2026/02/25) — Word出力の大幅レイアウト改善</summary>

- **行分割構造による左右同期**: 2カラム時は「表題行」「詳細行」「画像行」の3段構成テーブルで管理。テキスト量の差があっても、ナンバリングと画像が必ず同じ高さから開始。
- **ページ跨ぎ防止**: `keepNext` + `cantSplit` を全テーブル行に適用。
- **ナンバリングの上端固定**: 丸数字が常に表題の1行目に固定。
- **表紙の左寄せデザイン**: PDFデザインと統一感のある左寄せレイアウトとマージン整合。
- **2カラム専用フォントスケーリング**: 表題14pt / 詳細11ptに自動調整。

</details>

<details>
<summary>v4.4 (2026/02/18)</summary>

- **プログレスバー追加**: 生成処理中にAI分析→画像切り出しの進捗をリアルタイム表示。
- **ドラッグ＆ドロップ並び替え**: 編集モードでステップをドラッグして自由に並び替え可能。
- **コードのモジュール化**: エクスポート機能を独立したモジュールに分離。

</details>

<details>
<summary>v4.3 (2026/02/15)</summary>

- 全動画形式の高速アップロード（iPhone MOV / 4K MP4 → WebM自動変換）。
- Gemini 2.5 Flash Preview 採用によるAIエンジン強化。

</details>

---

## 🎥 対応動画仕様

### 対応フォーマット

以下の動画形式に対応しており、解析前に自動的に最適な形式へ変換・圧縮されます。

| フォーマット | 拡張子 |
|---|---|
| MP4 | .mp4, .m4v |
| QuickTime | .mov |
| WebM | .webm |
| AVI | .avi |
| 3GP | .3gp, .3g2 |
| MPEG | .mpg, .mpeg |

> [!TIP]
> 文字がつぶれていない鮮明な全画面録画の使用を推奨します。4K・60fps 動画も対応可能です。

### 環境別の制限

| 環境 | 最大長さ | ファイルサイズ | 備考 |
|---|---|---|---|
| **ローカル** (`npm run dev`) | 20分以上 | 2GB未満 | 推奨。制限なし |
| **VPS / Railway / Render** | 20分以上 | サーバー依存 | タイムアウト設定を延長すれば長時間も可 |
| **Vercel / Netlify (Free)** | 数十秒 | 4.5MB以下 | ⚠️ 非推奨 |

> [!NOTE]
> 本ツールの現状アーキテクチャはローカル実行または VPS 運用に最適化されています。

---

## 🛠️ プロジェクト構成

| カテゴリ | 技術 |
| --- | --- |
| Frontend | Next.js 14, TypeScript, Tailwind CSS |
| AI Engine | Google Gemini 2.5 Flash |
| Canvas Engine | Fabric.js v6 |
| PDF Generation | html2pdf.js / html2canvas / jsPDF |
| Word Generation | docx |
| PowerPoint Generation | pptxgenjs |
| Drag & Drop | @hello-pangea/dnd |

---

## ⚡ セットアップ & 実行

```bash
# 1. リポジトリをクローン
git clone https://github.com/HIROSHI2285/AutoManual.git
cd AutoManual

# 2. 依存関係のインストール
npm install

# 3. 環境変数の設定 (.env.local)
echo "GEMINI_API_KEY=your_api_key_here" > .env.local

# 4. 開発サーバーの起動
npm run dev
```

ブラウザで [http://localhost:3000](http://localhost:3000) を開いてください。

詳細なセットアップ手順（他のPCへのインストール方法など）については、[INSTALLATION.md](./INSTALLATION.md) を参照してください。

---

## ☁️ クラウドデプロイについて

### 推奨: Docker / VPS

```bash
npm run build
npm run start
```

- **対応プラットフォーム**: Railway, Render, AWS EC2, DigitalOcean 等
- 環境変数 `GEMINI_API_KEY` を設定するだけで動作します。

### ⚠️ 非推奨: サーバーレス (Vercel Functions 等)

- 10〜60秒で強制終了されるため、動画解析が完了しません。
- 4.5MB以上のファイルアップロードがブロックされます。

---

Produced by **Antigravity AI**
