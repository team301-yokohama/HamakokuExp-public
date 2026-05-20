
---

# 三ッ沢上町駅経由 横浜駅行きルート算出モジュール

このモジュールは、指定された出発地（自宅など）から徒歩で**三ッ沢上町駅**（横浜市営地下鉄ブルーライン）へ向かい、そこから**横浜駅**へ移動する場合の「家を出る時刻」と「電車の候補」を算出します。

現在時刻と徒歩所要時間を基に、**「どの電車に乗れるか」「その電車に乗るためには何時に家を出るべきか」**を逆算してリストアップします。

## 主な機能

1. **ルート検索**: 徒歩移動 + 地下鉄乗車の乗り継ぎシミュレーション。
2. **リミット時刻算出**: 電車の発車時刻から徒歩時間を引き算し、家を出るべき「デッドライン時刻 (`departuretime`)」を算出。
3. **スマートフィルタリング**:
* 駅の改札到着予定時刻に間に合わない電車を自動で除外。
* 既に発車してしまった電車を除外。


4. **ソート機能**: 横浜駅への到着が早い順にデータを整列して返却。

## 依存ファイル

このモジュールは以下のファイル/ライブラリに依存しています。

* `../utils/utils.js`: 時刻変換ユーティリティ (`timeToMinutes`, `minutesToTime` 等)
* `./Mitsukami2Yokohama_dia.js`: 地下鉄ダイヤデータ取得モジュール

## 利用方法

ES Modules として `Mituskami2Yokohama` 関数をエクスポートしています。

```javascript
import { Mituskami2Yokohama } from './path/to/this/file.js';

// パラメータの設定
const params = {
  currentTime: "12:14", // 計算基準となる現在時刻 (必須)
  ToMitsukami: 14,      // 駅までの徒歩分数 (必須)
  isholiday: true,      // 休日ダイヤフラグ
  location: "Home",     // 出発地メモ (任意)
  walkspeed: "normal"   // 歩行速度 (任意)
};

// ルート算出の実行
try {
  const routes = await Mituskami2Yokohama(params);
  console.log("計算結果:", routes);
} catch (error) {
  console.error("ルート算出中にエラーが発生しました", error);
}

```

## パラメータ仕様 (`paramJSON`)

関数に渡す引数オブジェクトの定義です。

| プロパティ名 | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `currentTime` | String | ✅ | **現在時刻** (`HH:MM`形式)。計算の基準となります。 |
| `ToMitsukami` | Number | ✅ | **徒歩所要時間** (分)。出発地から三ッ沢上町駅までの移動時間。 |
| `isholiday` | Boolean | (✅) | **休日フラグ**。`true`=休日, `false`=平日。ダイヤデータ取得時に使用します。 |
| `location` | String | - | 出発地のラベル（例: "Home", "Library"）。 |
| `walkspeed` | String | - | 歩行速度の設定（例: "fast", "normal"）。 |

## 戻り値データ構造

計算結果はオブジェクトの配列として返却されます。
**`departuretime` (家を出る時刻)** と **`station_departuretime` (電車の発車時刻)** の違いに注意してください。

```javascript
[
  {
    "index": 1,
    "departuretime": "12:20",           // 【重要】家を出るリミット時刻 (電車発車 - 徒歩時間)
    "arrivetime": "12:40",              // 目的地(横浜)到着時刻
    "station_name": "三ッ沢上町",
    "fare": 210,                        // 運賃
    "station_walktime": 14,             // 駅までの徒歩時間
    "station_departuretime": "12:34",   // 電車の発車時刻
    "station_dropoff_name": "横浜駅",
    "station_dropoff_arrivetime": "12:40",
    "traindata": {                      // 元のダイヤデータ + 詳細ステータス
       // ...(ダイヤ情報)...
       "ArrivalStatus": {
          "isReachable": true,
          "reachTime": "12:28",         // 駅改札への到着予定時刻 (現在時刻 + 徒歩)
          "waitTime": 6,                // 駅での待ち時間（分）
          "isShortestWalk": null
       }
    }
  },
  // ... 以降、後続の電車データ
]

```

## ロジック詳細

1. **データ取得**: `YokohamaMunicipalTrain.buildJson()` から地下鉄時刻表を取得。
2. **基準計算**:
* `改札到着時刻` = `currentTime` + `ToMitsukami`


3. **判定ループ**:
* 取得した電車データの中から、「電車の発車時刻」が「改札到着時刻」より後のものを抽出。
* 「現在時刻」より前に横浜駅に着いてしまう（過去の）電車は除外。


4. **結果生成**:
* `家を出る時刻` = `電車の発車時刻` - `ToMitsukami`



## 定数 (運賃)

コード内で以下の運賃が定義されています。

* **三ッ沢上町 -> 横浜**: 210円 (`MITSUKAMI2YOKOHAMA`)

---

## 開発者向けメモ

* **エラーハンドリング**: 内部で `Promise.allSettled` を使用しており、ダイヤデータの取得に失敗した場合でもプロセス全体がクラッシュせず、空の配列を返す設計になっています。
* **ソート**: 返却される配列は、横浜駅への到着時刻が早い順にソートされています。