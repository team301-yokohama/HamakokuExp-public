
-----

# Kamihoshi2Yokohama Route Calculator

上星川駅まで徒歩で移動し、そこから相鉄線を利用して横浜駅へ向かう場合の「最適な出発時間」と「乗車すべき電車」を算出するモジュールです。
文責:青柳/Gemini

## 概要

指定された「現在時刻」と「駅までの徒歩所要時間」をもとに、以下の処理を行います。

1.  外部ソースから相鉄線の時刻表データを取得（平日/休日対応）
2.  横浜駅への到着時刻順にソート
3.  徒歩時間を考慮し、間に合う電車のみをフィルタリング
4.  **「家（現在地）を出るべき時間」** を逆算して返却

## 依存ファイル

  * `../utils/utils.js`: 時間計算（分換算など）のユーティリティ
  * `./sotetsu2Yokohama.js`: 相鉄線の時刻表データ取得モジュール


-----

## 関数仕様: `Kamihoshi2Yokohama(paramJSON)` 

### 引数: `paramJSON` (Object)

ルート計算に必要な条件を指定します。

| パラメータ名 | 型 | 必須 | 説明 | 例 |
| :--- | :---: | :---: | :--- | :--- |
| `currentTime` | `string` | **Yes** | 計算基準となる現在時刻 (`HH:MM`形式) | `"12:14"` |
| `ToKamihoshi` | `number` | **Yes** | 現在地から上星川駅までの徒歩所要時間（分） | `14` |
| `isholiday` | `boolean` | **Yes** | 休日ダイヤを使用するか (`true`:休日, `false`:平日) | `true` |
| `location` | `string` | No | 現在地の名称（ログ/UI表示用） | `"Library"` |
| `walkspeed` | `string` | No | 歩行速度設定（将来的な計算係数用） | `"fast"` |

#### リクエスト例

```javascript
const paramJSON = {
  "currentTime": "12:14",
  "ToKamihoshi": 14,
  "isholiday": true,
  "location": "Library"
};
```

-----

### 戻り値: `RouteOption[]` (Array of Objects)

条件に合致する（間に合う）ルートの配列を返します。配列は**横浜駅到着が早い順**にソートされています。

| キー名 | 型 | 説明 | 備考 |
| :--- | :---: | :--- | :--- |
| `index` | `number` | リスト内の連番 (1始まり) | UI表示用 |
| `departuretime` | `string` | **【重要】現在地を出発する時間** | 電車発車時刻 - 徒歩時間 |
| `arrivetime` | `string` | 目的地（横浜駅）到着時間 | |
| `station_name` | `string` | 乗車駅名 | 固定値: `"上星川"` |
| `fare` | `number` | 運賃（円） | 固定値: `188` (IC) |
| `station_walktime` | `number` | 駅までの徒歩時間（分） | 入力の `ToKamihoshi` をパススルー |
| `station_departuretime` | `string` | 電車が上星川駅を発車する時間 | |
| `station_dropoff_name` | `string` | 降車駅名 | 固定値: `"横浜駅"` |
| `station_dropoff_arrivetime`| `string` | 降車駅への到着時間 | `arrivetime` と同値 |
| `traindata` | `Object` | 内部計算用の詳細データ | デバッグ用/詳細表示用 |

#### レスポンスデータ例 (JSON)

```json
[
  {
    "index": 1,
    "departuretime": "12:16",
    "arrivetime": "12:42",
    "station_name": "上星川",
    "fare": 188,
    "station_walktime": 14,
    "station_departuretime": "12:30",
    "station_dropoff_name": "横浜駅",
    "station_dropoff_arrivetime": "12:42",
    "traindata": {
      "trainNumber": "...",
      "departureTime": { "上星川": "12:30" },
      "arrivalTime": "12:42",
      "ArrivalStatus": {
        "isReachable": true,
        "reachTime": "12:28",
        "waitTime": 2
      }
    }
  }
  // ... 以降、次の電車データが続く
]
```

-----

## 処理ロジック詳細

1.  **データ取得**: `Sotetsu2Yokohama.extractSotetsuTimetable` を呼び出し、並列でデータを取得します。
2.  **欠損処理**: 到着時刻 (`arrivalTime`) が不明なデータや、既に現在時刻 (`currentTime`) を過ぎて横浜に到着しているデータは除外されます。
3.  **判定ロジック**:
      * `ユーザーが駅に着く時刻` = `currentTime` + `ToKamihoshi`
      * `電車の発車時刻` \>= `ユーザーが駅に着く時刻` の場合のみ、有効なルートとして採用します。
4.  **出発時刻計算**:
      * UIに表示する「家を出る時間 (`departuretime`)」は、ギリギリに駅に着く時間ではなく、\*\*「電車の発車時刻から徒歩分数を引いた時間」\*\*として算出しています。（駅での待ち時間を含んだ余裕のある時間になります）

## 注意事項

  * **運賃定義**: 現在 `TRAIN_FARES` 定数内で固定されています。改定時はコード修正が必要です。