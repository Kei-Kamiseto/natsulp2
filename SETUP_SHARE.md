# 仲間だけで自動更新する共有LP（セットアップ）

LP を「誰かが更新 → みんなの画面が自動で変わる」ようにします。  
無料の [Supabase](https://supabase.com) を使います（アカウント作成だけ必要）。

公開URLはそのまま: https://kei-kamiseto.github.io/natsulp2/

---

## 1. Supabase プロジェクトを作る（約3分）

1. https://supabase.com でサインアップ / ログイン
2. **New project** を作成（名前は任意、例: `nagomi-natsulp`）
3. Database password を決めて保存（あとで使うことはほぼありません）
4. リージョンは近いもの（Northeast Asia / Tokyo など）でOK

---

## 2. SQL を実行する

1. 左メニュー **SQL Editor** → **New query**
2. リポジトリの `supabase/schema.sql` をすべてコピーして貼り付け
3. **Run** を押す（成功すればテーブル `nagomi_kv` ができます）

---

## 3. API キーをサイトに入れる

1. 左メニュー **Project Settings** → **API**
2. 次の2つをコピーする
   - **Project URL**（例: `https://xxxx.supabase.co`）
   - **anon public** キー（`eyJ...` で始まる長い文字）
3. リポジトリの `asset/js/supabase-config.js` を開いて、こう書く:

```js
window.NAGOMI_SUPABASE = {
  url: 'ここに Project URL',
  anonKey: 'ここに anon public キー'
};
```

4. コミットして `main` にプッシュすると GitHub Pages に反映されます

---

## 4. 動作確認

1. PCともう1台（スマホ）で同じLPを開く
2. 予算セクション上部に **「● みんなと同期中（自動更新）」** と出ればOK
3. 片方で参加クリック / 持ち物追加 / 支出追加すると、もう片方にトーストが出て画面が更新される

出てこない場合:

- `supabase-config.js` の URL / キーが空・コピペミス
- SQL をまだ実行していない
- ブラウザの開発者ツール Console に赤いエラー（RLS / テーブル名など）

未接続のときは **「○ この端末のみ（共有未接続）」** のまま localStorage で動きます（今まで通り端末ごと）。

---

## 注意（仲間だけの前提）

- anon キーでも **読み書きできます**（URL を知っている人向け）
- LPのURLとキーを知らない人には基本届きませんが、強いログイン制限ではありません
- 本気で部外者を入れたくない場合は、後からパスワードや招待制にできます

---

## 関連ファイル

| ファイル | 役割 |
|---|---|
| `supabase/schema.sql` | テーブル + RLS + Realtime |
| `asset/js/supabase-config.js` | URL / anon キー（ここだけ書き換える） |
| `asset/js/nagomi-store.js` | 共有読み書き・Realtime購読 |
| `asset/js/app.js` | 画面反映・初期シード |
