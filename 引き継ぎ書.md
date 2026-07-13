# 和みの大人夏合宿 LP — Cursor 引き継ぎ書

最終更新: 2026-07-13  
対象リポジトリ: `Kei-Kamiseto/natsulp2`  
公開URL: https://kei-kamiseto.github.io/natsulp2/  
ローカル: `/Users/kamisetokei/Desktop/natsulp2`  
ブランチ: `main`（GitHub Pages は `main` ルート配信）  
直近コミット: `0338835` Force a shared-storage fresh start so deposits reset to zero.

前チャットの詳細ログ:  
`/Users/kamisetokei/.cursor/projects/Users-kamisetokei-Desktop-natsulp2/agent-transcripts/a27199e6-e5ac-4594-ad7e-6bccd81ddb21/a27199e6-e5ac-4594-ad7e-6bccd81ddb21.jsonl`

---

## 1. このプロジェクトは何か

「和みの大人夏合宿 2026 in 淡路じゃのひれ」の静的LP。  
スマホで見ながら、参加表明・買い出しリスト・共同財布（入金／支出／残金）を編集できる想定。

元デザインは兵庫万博系LPのHTML/CSSシェルを流用し、中身を和み合宿用に差し替えている。

---

## 2. 重要ファイル

| パス | 役割 |
|---|---|
| `index.html` | 全セクションHTML。CSS/JSは `?v=...` でキャッシュバス |
| `asset/css/nagomi.css` | 和み用オーバーライド（ここを主に触る） |
| `asset/css/style.css` / `layout.css` / `setting.css` | 元Hyogoシェル（極力いじらない） |
| `asset/js/nagomi-budget.js` | 予算コア（参加者・わりかん・初期支出・計算） |
| `asset/js/app.js` | UI・storage・参加ボタン・リスト・予算画面 |
| `asset/js/vender.js` | ベンダー＋一部パッチ（アクセス文面の強制上書きなど） |
| `和み夏合宿LP_実装仕様書.md` | 初期仕様（**一部古い**。共有ストレージ前提が現状と違う） |
| `serve.py` | ローカル確認用 |

未追跡（コミットしない想定）:  
`asset/img/s.png`、`asset/img/ChatGPT Image ...png`、巨大な FireShot キャプチャ

---

## 3. いま動いていること（実装済み）

### LP全体
- FV / 食事・生活・ストーリー（動画ループ）/ スケジュールHTML / アクセス
- 旧Hyogoバナー「#兵庫の日常へ旅しよう。」と予算セクション写真3枚は削除済み
- iOSのピンチ拡大対策（viewport + gesture防止 + overflow clip）

### イベント参加
- ボタン文言: 未参加 `参加はクリック！` → 参加後 `参加中`
- **最初は参加者アイコンなし**（クリックした人だけ表示）
- アイコンはボタンの**下**に縦積み（横並びだとSPではみ出す）

### 予算（`#campaign` / `#budget`）
- 管理者: **けいくん** のみ入金額編集・支出削除など
- 入金は固定2万円チェックではなく **数値入力**
- 「支出を追加」の下に共同財布の残金（入金合計 − 支出合計）
- **支出一覧（追加分）**: `isInitialExpense === false` のみ表示  
  （コテージ・車代などの初期費用は一覧に出さない）
- 人ごとのカード: 入金 / コテージ・食材・レンタル・車代 / 残金

### 買い出し
- コーナン初期に **木炭** あり（旧「炭追加3kg」は木炭へ寄せる）
- ロピア食材リストあり

### アクセス文面（確定）
```
西宮から、海をわたって。
集合・出発地：7/26(日) 9:30 ／ 西宮「家庭料理 和み」
目的地：〒656-0543 兵庫県南あわじ市阿万塩屋町2660
（淡路じゃのひれ）
```

### フレッシュスタート
- `DATA_VERSION = 5`
- `FRESH_START_V = 5`（`localStorage.nagomi_fresh_start_v` + store key `freshStart`）
- 入金0・イベント参加者空・追加支出削除・買い出し金額クリア  
- **初期支出（コテージ・ペット・車代）は計算用に残る**（人カードのコテージ費/車代は0にならない）

キャッシュ確認用URL例:  
https://kei-kamiseto.github.io/natsulp2/?v=start2

---

## 4. 最重要の未解決課題（次のCursorへの本命）

### 参加者みんなではデータ共有できていない

仕様書は Claude アーティファクトの `window.storage`（共有）前提。  
**GitHub Pages には `window.storage` が無い。**

現状 `asset/js/app.js` の store:

1. `window.storage.get/set(..., true)` があれば使う  
2. なければ **`localStorage` の `nagomi_share_*` にフォールバック**

→ 端末ごとに別データ。URLを共有しても入金・参加・支出は同期しない。  
「自分は誰か」だけ `localStorage.nagomi_me`。

### やるべき次タスク
`store.get/set` を **Supabase（または Firebase）ラッパー**に差し替える。

- フォルダ `supabase/` はあるが中身ほぼ空（`.env` は gitignore）
- `get/set` インターフェースを維持すれば UI 側はほぼ触らなくてよい
- shared=true 相当で全員同じキーを読む
- リアルタイム同期（Realtime）があると参加ボタンが快適

仕様書 §9 にも代替案あり。

---

## 5. データモデル（要約）

### 参加者（費用負担あり・11人）
和みママ / けんさん / みきさん / キムニー / ザッキィー / アサちゃん / すみちゃん / けいちゃん / けいくん / ゆうじろうくん / ゆうじろうくん彼女

### スペシャル
はなちゃん🐕 — 表示のみ、費用負担なし

### 初期支出（`isInitialExpense: true`）
- 6人用コテージ 50,160（cottage9）
- 4人用コテージ・共同組 29,920（cottage9）
- ペット代 1,980（cottage9）
- ゆうじろうくん用4人コテージ 29,920（yujiroOnly）
- 車代 32,500（car8＝運転手3人以外）

わりかんは `allocateAmount`（端数1円を順番配分）。

### storage キー（想定）
`events` / `budget` / `shared` / `konan` / `ropia` / `pack` / `board` / `freshStart`  
＋ `localStorage`: `nagomi_me`, `nagomi_fresh_start_v`, `nagomi_events_seed_v`

---

## 6. 作業上の注意

1. **キャッシュ**  
   iOS Safari が強い。HTMLの `?v=` を上げ、確認は `?v=新しい値` の新規URLで。  
   「直したのに出てない」はほぼキャッシュか、共有されていない localStorage。

2. **デザイン**  
   既存LPの雰囲気を壊さない。Hyogoの `style.css` は巨大minify。変更は `nagomi.css` 優先。

3. **管理者**  
   入金入力・支出削除は「けいくん」選択時のみ。

4. **コミット/push**  
   ユーザーが明示したときだけ。Pages反映は `main` push。

5. **overflow**  
   `#campaign .infoArea` の `overflow:hidden` は縦コンテンツを切るので注意。横だけ隠すなら `overflow-x:hidden; overflow-y:visible`。

6. **フレッシュスタート再実行**  
   `FRESH_START_V` を上げれば次回ロードで再リセット。共有DB導入後は「リセット」UIを管理者専用にした方が安全。

---

## 7. ユーザー意向メモ（会話から）

- UIはわかりやすく。タブだらけは嫌がった → 人ごとのリストに簡略化済み
- 入金は後から足せる入力式
- 支出追加分だけ一覧に出したい（初期費用は隠す）
- 参加アイコンは最初なし、クリックで連動、ボタン下配置
- コーナンに木炭
- **最終的には参加者全員で同じデータを見たい**（現状未達）

---

## 8. 次のCursorへの推奨手順

1. この引き継ぎ書と `和み夏合宿LP_実装仕様書.md` §6/§9 を読む  
2. Supabase プロジェクト作成 → `budget` 等を1テーブル or key-value で持つ  
3. `asset/js/app.js` の `store` だけ差し替え（インターフェース維持）  
4. 匿名 or 簡易認証、けいくんだけ書き込み制限も検討  
5. 実機2台で「片方の参加がもう片方に出る」を確認  
6. キャッシュバスを上げて `main` に push  

ローカル確認: `python3 serve.py`（あれば）または任意の静的サーバ。

---

## 9. 確認用チェックリスト

- [ ] 別端末A/Bで同じURLを開き、入金が互いに見えるか（現状は見えない＝既知）
- [ ] 参加ボタン → アイコンが下に出る / 再タップで消える
- [ ] 入金入力（けいくん）→ 残金が変わる
- [ ] 支出追加 → 「支出一覧（追加分）」にだけ出る
- [ ] コテージ・車代は一覧に出ないが、人カード負担には含まれる
- [ ] コーナンに木炭がある
- [ ] アクセス文面が集合・出発地の1行版になっている
