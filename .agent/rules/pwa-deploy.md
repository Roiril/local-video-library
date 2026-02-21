---
description: PWAデプロイ手順とアイコン更新ルール
alwaysApply: true
---

# PWA デプロイ & 更新ルール

このプロジェクト（Local Video Library）は Vercel にホストされた PWA です。
デプロイ時は必ず以下の手順を守ること。

---

## 1. コードを変更してデプロイするとき（必須）

**`sw.js` の `CACHE_VERSION` をインクリメントする。**

```js
// sw.js 1行目
const CACHE_VERSION = 'v2'; // ← v1 → v2 のようにバージョンを上げる
```

これを変更するだけで：
- 古いキャッシュが自動削除される
- `skipWaiting()` + `clients.claim()` で即座に新 SW が有効化
- `app.js` の `controllerchange` リスナーが発火し自動リロード
- ユーザーは次回アクセス時に自動で最新版を受信する

---

## 2. アイコンを変更するとき（必須）

PWAのホーム画面アイコンは OS が強力にキャッシュする。
同名ファイルを上書きしても **絶対にアイコンは更新されない**。

必ず以下の手順を取ること：

1. **ファイル名をリネーム**する
   - 例: `icons/icon.svg` → `icons/icon-v2.svg`
   - `icons/maskable-icon.svg` → `icons/maskable-icon-v2.svg`
   - `icons/apple-touch-icon.svg` → `icons/apple-touch-icon-v2.svg`

2. **参照先を書き換える**
   - `manifest.json` の `icons[].src` を新しいパスに変更
   - `index.html` の `<link rel="apple-touch-icon" href="...">` を新しいパスに変更

3. **`sw.js` の `CACHE_VERSION` もインクリメント**する（上記ルール1と同様）

---

## 3. デプロイフロー（要約）

```
コード変更
  ↓
sw.js の CACHE_VERSION をインクリメント
  ↓
（アイコン変更の場合）ファイル名変更 + 参照先修正
  ↓
git add . && git commit -m "feat/fix: <変更内容>" && git push origin master
  ↓
Vercel が自動デプロイ
```

---

## 4. コミットメッセージ規約

```
feat:   新機能
fix:    バグ修正
style:  CSS・デザイン変更
refactor: コードリファクタリング
chore:  設定ファイル・依存関係変更
```
