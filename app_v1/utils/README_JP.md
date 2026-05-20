# Utils Module

このディレクトリには、本プロジェクト全体で使用される  
**汎用ヘルパー関数（general-purpose helper functions）** が含まれています。

すべてのユーティリティは、  
**ステートレス**、**副作用最小**、**再利用可能** であることを前提に設計されており、  
サービス層・ルーティング・その他のモジュールから安全に利用できます。

---

## 概要

`utils` モジュールは、以下のような一般的な処理を補助する関数群を提供します。

- 時刻・日付操作（24時超表記を含む鉄道ダイヤ対応）
- 時刻フォーマットと Date オブジェクトの相互変換
- API リクエスト用 URL の構築
- タイムアウト・エラーハンドリング付き JSON Fetch

これらのユーティリティにより、  
**コードの重複を減らし、ビジネスロジックを簡潔に保つ**ことができます。

---

## 設計思想（Design Philosophy）

- **単一責任の原則（Single Responsibility）**  
  各関数は、明確で一つの役割のみを担います。

- **グローバル状態を持たない（No Global State）**  
  すべての関数は純粋関数、もしくは副作用を最小限に抑えた設計です。

- **安全なデフォルト設計（Safe Defaults）**  
  URL の破損やネットワークリクエストのハングなど、  
  よくある実行時エラーを避けるため防御的に実装されています。

- **学習しやすい可読性（Educational Readability）**  
  技術的説明と実用的背景の両方をコメントとして記載し、  
  新しい開発者でも理解しやすいコードを目指しています。

---

## 関数一覧

### Time Utilities（時間関連）

#### `getCurrentTime()`

現在のローカル時刻を `"HH:mm"` 形式で返します。

```js
import { getCurrentTime } from "./utils";

const now = getCurrentTime(); // 例: "14:33"
```

---

#### `getCurrentMinutes()`

現在のローカル時刻を、  
**深夜0時からの経過分数（0–1439）** として返します。

```js
import { getCurrentMinutes } from "./utils";

const nowMin = getCurrentMinutes(); // 例: 873（14:33）
```

**主な用途:**

- 時刻順での時刻表ソート
- 現在時刻から次の電車を判定
- 出発までの残り時間計算
- 日跨ぎを含むスケジュール正規化

---

#### `timeToMinutes(hhmm)`

`"HH:mm"` 形式の文字列を、  
**0–1439 の分単位の数値** に変換します。

1440 で剰余を取るため、必ず 1 日以内に正規化されます。

```js
import { timeToMinutes } from "./utils";

const mins = timeToMinutes("06:30"); // 390
const wrapped = timeToMinutes("25:30"); // 90（翌日扱い）
```

**戻り値:** `number | null`  
（入力が不正な場合は `null`）

**特に有効な用途:**

- 時刻の比較・ソート
- 時刻差分の計算
- 日跨ぎを含むスケジュール処理

---

#### `timeToMinutesExtended(hhmm)`

日本の鉄道ダイヤで一般的な  
**24時超表記（最大 27:59）** に対応した拡張時刻変換です。

```js
import { timeToMinutesExtended } from "./utils";

const lateNight = timeToMinutesExtended("25:12"); // 1512
const earlyMorning = timeToMinutesExtended("01:00"); // 1500（25:00 相当）
```

**挙動:**

- 時は 0〜27 を許容
- 0:00〜3:59 は「前日の深夜」として扱い、24時間加算
- 深夜帯でも単調増加する時刻表現を保証
- フォーマットや範囲が不正な場合は `RangeError`
- `null` 入力時は `null` を返却

**戻り値:** `number | null`

**変換例:**

- `"00:30"` → 1470（24:30 扱い）
- `"03:45"` → 1665（27:45 扱い）
- `"04:00"` → 240（通常の 04:00）
- `"25:12"` → 1512

---

#### `minutesToTime(mins)`

分単位の数値（0–1439）を  
`"HH:mm"` 形式の文字列に戻します。

```js
import { minutesToTime } from "./utils";

const time = minutesToTime(390); // "06:30"
const wrapped = minutesToTime(1500); // "01:00"（25:00 → 1:00）
```

---

#### `parseToDate(input)`

さまざまな入力形式を `Date` オブジェクトに正規化します。

```js
import { parseToDate } from "./utils";

const date1 = parseToDate(20250106);
const date2 = parseToDate("2025-01-06");
const date3 = parseToDate(new Date());
const invalid = parseToDate("invalid"); // null
```

**対応入力:**

- `Date` オブジェクト（有効性チェック付き）
- `YYYYMMDD` 形式の数値
- `new Date()` で解釈可能な文字列
- 引数なし（現在日時）

**戻り値:** `Date | null`

---

#### `futureAbs(t, ref)`

基準時刻 `ref` より小さい時刻 `t` を  
**翌日扱い（+1440分）** に補正します。

```js
import { futureAbs } from "./utils";

const now = 1400; // 23:20
const target = 60; // 01:00

const adjusted = futureAbs(target, now); // 1500
```

**用途:** 日跨ぎを含む次発時刻の算出。

---

### URL Utilities

#### `buildUrl(base, path, params)`

ベース URL・パス・クエリを安全に結合します。

```js
import { buildUrl } from "./utils";

const url = buildUrl("https://api.example.com/", "resource", {
  id: 123,
  lang: "ja",
});
```

**特徴:**

- スラッシュ重複を防止
- 特殊なパス形式（例: `odpt:Station`）対応
- `null / undefined` パラメータを自動除外
- クエリ値を安全に URL エンコード

**戻り値:** `URL` オブジェクト

---

### Network Utilities

#### `fetchJson(url, options)`

タイムアウトとエラーハンドリングを備えた  
JSON 取得用の `fetch` ラッパーです。

```js
import { fetchJson } from "./utils";

const data = await fetchJson(url, {
  headers: { Authorization: "Bearer token" },
  timeout: 15000,
});
```

**オプション:**

| 名前    | 型     | デフォルト | 説明               |
| ------- | ------ | ---------- | ------------------ |
| headers | Object | `{}`       | 追加 HTTP ヘッダ   |
| timeout | number | `15000`    | タイムアウト（ms） |

**挙動:**

- タイムアウト時は自動でリクエスト中断
- 非 2xx レスポンス時は詳細付き Error を throw
- 内部タイマーを必ず解放し、メモリリークを防止
- JSON をパースして返却

---

## エラーハンドリング

### `timeToMinutesExtended()`

- 不正な形式・範囲の場合 `RangeError`
- `null` 入力時は `null`

### `parseToDate()`

- 解釈不能な日付は `null`

### `fetchJson()`

- HTTP エラー時は詳細付き Error
- タイムアウト時は自動中断

---

## 定数

本モジュールは以下の定数を使用します。

- `MINUTES_PER_DAY`  
  `../config/constants/timeConstants.js` よりインポート  
  （24 × 60 = 1440）

---

## バージョン情報

- **Author:** Pero1031
- **Version:** 1.00
- **Since:** 2025-10-06
