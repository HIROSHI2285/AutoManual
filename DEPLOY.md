# 差分展開手順（スマホQRアップロード機能）

## 方法A：Gitを使う（推奨）

```bash
# このPCで
git add .
git commit -m "feat: add QR code mobile upload"
git push

# 他のPCで
git pull
npm install
```

---

## 方法B：ファイルを手動コピーする

### 1. 新規追加（フォルダごとコピー）

```
app/api/mobile-session/
  ├── route.ts
  └── [sessionId]/
       ├── route.ts
       └── file/
            └── route.ts

app/mobile-upload/
  └── [sessionId]/
       └── page.tsx

utils/mobileSessionStore.ts
```

### 2. 上書き

```
components/VideoUploader.tsx
package.json
package-lock.json
```

### 3. パッケージのインストール

```bash
npm install
```

### 4. Windowsファイアウォール設定（各PCで1回）

PowerShellを**管理者として**実行：

```powershell
netsh advfirewall firewall add rule name="AutoManual Dev" dir=in action=allow protocol=TCP localport=3000
```

---

## 注意事項

- スマホとPCは**同じWiFi（プライベートネットワーク）**に接続すること
- 公共WiFi（カフェ・駅等）は不可（APアイソレーションのため）
- スマホのテザリングを使う方法でも動作する
