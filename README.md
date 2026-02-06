# AutoManual Studio

動画をアップロードするだけで、AIが自動的にステップバイステップの手順書を生成する次世代マニュアル作成ツールです。

![AutoManual Studio](./public/screenshot_preview.png)

## 主な機能

- **動画からAI抽出**: Gemini 2.0 Flash を使用して、動画内の操作を自動的に分析し、手順を書き出します。
- **ビジュアル・アノテーション**: 操作箇所を自動で検出し、スクリーンショット上に**赤枠**を描画します。
- **編集可能なテキスト**: 生成されたテキストは画像の外側に配置されるため、Wordやドキュメントに貼り付けても編集可能です。
- **マルチエクスポート**: 手順書を Markdown、HTML、PDF 形式で保存できます。
- **モダンなUI**: ClearLayer Studio スタイルの洗練されたインターフェース。

## セットアップ

### 1. 依存関係のインストール

```bash
npm install
```

### 2. 環境変数の設定

プロジェクトのルートディレクトリに `.env.local` ファイルを作成し、Google Gemini API キーを設定してください。

```env
GEMINI_API_KEY=your_api_key_here
```

### 3. 開発サーバーの起動

```bash
npm run dev
```

ブラウザで [http://localhost:3000](http://localhost:3000) を開くとアプリが利用可能です。

## 技術スタック

- **Frontend**: Next.js (App Router), TypeScript
- **Styling**: Vanilla CSS (Custom tokens)
- **AI**: Google Gemini 2.0 Flash
- **Image Processing**: Canvas API, metadata extraction

## 使い方

1. 手順化したい操作画面の動画（MP4, MOV等）をアップロードします。
2. 「マニュアルを生成」ボタンをクリックします。
3. 数秒でAIが画像付きの手順書を出力します。
4. コピーボタンでテキストをクリップボードに保存したり、エクスポート機能でファイルとして保存したりできます。
