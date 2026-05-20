# YNU 2 Yokohama By Bus OnlyのReadme

文責：青柳(とGemini) 
YNU周辺のバス停から横浜駅西口への最適ルートを算出するバックエンドAPI。
相鉄・神奈中・市営バスのデータを集約し、現在時刻と現在地出発時間を考慮した到達判定を行う。

## プロジェクト構成と依存関係

`services` ディレクトリ内の各バス会社スクレイピング/データ整形モジュールと、`utils` ディレクトリの共通関数に依存している。

```text
.
├── services/                 # [Data Source] 各バス事業者のデータ取得モジュール
│   ├── YNU2YokohamaByBusOnly.js          # このjsファイルそのもの
│   ├── kaikan2Yokohama.js                # 相鉄バス担当
│   ├── kanachu2Yokohama.js               # 神奈中バス担当
│   └── YokohamaMunicipalBus2Yokohama.js  # 横浜市営バス担当
└── utils/
    └── utils.js              # [Helper] 時間変換 (HH:mm <-> 分) などの共通処理
```

## このファイルの置く場所

servicesの直下におけば機能するはず...

## 使い方

唯一exportしてあるYNU2YokohamaByBusOnlyっていう関数を呼べばOK
返り値などは下を参考に


## モジュール詳細

### 1\. Main Controller (`YNU2YokohamaByBusOnly.js`)

アプリケーションの核となるファイル。以下の役割を持つ。

  * **Aggregation Logic**: `services/` 以下の3つのモジュールを並列実行 (`Promise.allSettled`) し、データを統合する。
  * **Business Logic**:
      * `checkReachability`: バス発車時刻と徒歩時間の照合。
      * `modifyAllBusData`: データのフィルタリングとソート。
      * `YNUYokohamaByBusOnly`: クライアント返却用のJSON整形。
  * **Static Configuration**:
      * `busStopMap`: 内部キー（例: `ToKokudaiNishi`）と実際のバス停名（例: `国大西`）のマッピング定義。
      * `BUS_FARES`: 各社の運賃定義。

### 2\. Services (`services/`)

各ファイルは特定のバス事業者のデータを取得し、共通フォーマットのJSON配列を返す責務を持つ。

  * **`kaikan2Yokohama.js`** (相鉄バス): `extractSotetsuBusTimetable()`
  * **`kanachu2Yokohama.js`** (神奈中バス): `extractKanachuBusTimetable()`
  * **`YokohamaMunicipalBus2Yokohama.js`** (市営バス): `buildJson()`

> **Note:** 各Serviceは、最終的に `YNU2YokohamaByBusOnly` で統合可能な形式（`arrivalTime`, `departureTime`, `operator` 等を含むオブジェクト）でデータを返す必要がある。基本はそれぞれの出力に合わせているので大丈夫なはず

## API仕様

### 入力パラメータ仕様 (`paramJSON`)

`YNUYokohamaByBusOnly` (および `modifyAllBusData`) 関数が受け取る `paramJSON` オブジェクトの構造です。
現在時刻と、**現在地から各バス停までの徒歩所要時間（分）** を格納して渡す必要があります。

| キー名 | 型 | 必須 | 説明 |
| :--- | :--- | :--- | :--- |
| `currentTime` | String | **Yes** | 検索基準となる現在時刻 (HH:mm形式)。<br>例: `"12:14"` |
| `ToYokohama` | Number | **Yes** | バス降車後（横浜駅西口）から最終目的地（駅改札等）までの徒歩時間（分）。 |
| `location` | String | No | 現在地名（ログ/デバッグ用）。現時点では使ってない |
| `walkspeed` | String | No | 徒歩速度（ログ/デバッグ用）。現時点では使ってない |
| **(BusStopKeys)** | Number | **Yes** | 下記の「バス停キー一覧」に対応するキー名で、**現在地からそのバス停までの徒歩時間（分）** を設定する。<br>値がない場合はそのルートは計算されない。 |

#### バス停キー一覧 (BusStopKeys)
プログラム内部の `busStopMap` と紐付いているため、以下のキー名を正確に使用すること。

| キー名 | 対応する実際のバス停 | 備考 |
| :--- | :--- | :--- |
| `ToKokudaiNishi` | 国大西 | |
| `ToKokudaiChuo` | 国大中央 | |
| `ToKokudaiKita` | 国大北 | |
| `ToKaikan` | 大学会館前 | |
| `ToMinamiG` | 国大南門 | |
| `ToShindo` | 横浜新道 | "横浜新道(新道)", "横浜新道(あおば前)" も含む |
| `ToOkazawacho` | 岡沢町 | |

#### 入力データ例

```json
{
  "currentTime": "12:14",
  "location": "Library",
  "walkspeed": "fast",
  "ToYokohama": 2,
  "ToKokudaiNishi": 10,
  "ToKokudaiKita": 10,
  "ToKokudaiChuo": 5,
  "ToKaikan": 6,
  "ToMinamiG": 7,
  "ToShindo": 8,
  "ToOkazawacho": 9
}
````

**注意点:**

  * ロジック内では `ToKokudaiNishi` などの数値（徒歩時間）を比較し、最も早く到着できるルートを優先判定（`isShortestWalk`）します。
  * 値に `null` や数値以外が入ると計算から除外される、またはエラーの原因となるため注意してください。

<!-- end list -->

```
### レスポンスデータ構造

ルート検索結果の配列が返却される。各要素の定義は以下の通り。

| キー名 | 型 | 説明 |
| :--- | :--- | :--- |
| `index` | `Number` | 配列内の連番 (1始まり)。 |
| `departuretime` | `String` | **出発推奨時刻** (HH:mm)。<br>バス発車時刻から徒歩時間を差し引いた時間。 |
| `arrivetime` | `String` | **目的地到着時刻** (HH:mm)。<br>横浜駅到着時刻に駅構内移動などを加算したもの。 |
| `busstop_name` | `String` | 乗車するバス停の日本語名（例: "岡沢町"）。 |
| `fare` | `Number` | 運賃（円）。事業者定数 (`BUS_FARES`) に基づく。 |
| `busstop_walktime` | `Number` | 出発地からそのバス停までの徒歩所要時間（分）。 |
| `busstop_departuretime` | `String` | **バスの発車時刻** (HH:mm)。ダイヤ上の時刻。 |
| `busstop_dropoff_name` | `String` | 降車バス停名。現状は "横浜駅西口" 固定。 |
| `busstop_dropoff_arrivetime` | `String` | バスの横浜駅到着時刻 (HH:mm)。 |
| `busdata` | `Object` | デバッグ用詳細オブジェクト。<br>Serviceから取得した生データ (`arrivalTime`, `operator`, `ArrivalStatus` 等) が含まれる。 |

### レスポンスJSON例

```json
[
  {
    "index": 1,
    "departuretime": "12:20",
    "arrivetime": "12:45",
    "busstop_name": "岡沢町",
    "fare": 220,
    "busstop_walktime": 9,
    "busstop_departuretime": "12:29",
    "busstop_dropoff_name": "横浜駅西口",
    "busstop_dropoff_arrivetime": "12:43",
    "busdata": {
        "departureTime": { "岡沢町": "12:29" },
        "arrivalTime": { "横浜駅西口": "12:43" },
        "operator": "YokohamaMunicipal",
        "ArrivalStatus": { ... }
    }
  },
  ...
]
```

## データフロー概要

1.  `YNU2YokohamaByBusOnly` が `services/*.js` の関数を並列呼び出し。
2.  各Serviceが時刻表データを取得・返却。
3.  `YNU2YokohamaByBusOnly` が `utils.js` を利用して時刻を数値化し、現在時刻と比較。
4.  徒歩時間を若干加味して「乗車可能なバス」かつ「出発時間が最も遅いルート」を判定。
5.  整形されたJSONをクライアントへレスポンス。