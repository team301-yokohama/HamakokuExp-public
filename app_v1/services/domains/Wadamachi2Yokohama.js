// 和田町まで歩いて、そこから電車を利用するルート算出処理モジュール
import * as Utils from "../../utils/utils.js";
import * as Sotetsu2Yokohama from "../adapters/sotetsu2Yokohama.js";
import { TRAIN_FARES_SOTETSU } from "../../config/fare/fareTrain/fareSotetsu.js";

// ============================================================================
// 型定義 (JSDoc)
// ============================================================================

/**
 * リクエストパラメータ (paramJSON) の構造定義
 * @typedef {Object} RouteParams
 * @property {string} currentTime - 現在時刻 (必須) フォーマット: "HH:MM" (例: "12:14")
 * @property {number} ToWadamachi - 和田町駅までの徒歩所要時間 (必須) 単位: 分 (例: 14)
 * @property {Date} curretnDate - 今日の日付(必須)
 * @property {string} [location] - 現在地名称 (任意) ログ出力やデバッグ用
 * @property {string} [walkspeed] - 歩行速度設定 (任意)
 */

/**
 * ルート検索結果の1件分のデータ構造
 * @typedef {Object} RouteOption
 * @property {number} index - リスト内での通し番号
 * @property {string} departuretime - 【出発時刻】家を出るべき時間
 * @property {string} arrivetime - 【到着時刻】目的地(横浜)到着時間
 * @property {string} station_name - 乗車駅名
 * @property {number} fare - 運賃
 * @property {number} station_walktime - 徒歩時間
 * @property {string} station_departuretime - 電車発車時刻
 * @property {string} station_dropoff_name - 降車駅名
 * @property {string} station_dropoff_arrivetime - 降車駅到着時間
 * @property {Object} traindata - 内部計算用詳細データ
 */

// ============================================================================
// メイン処理
// ============================================================================

/**
 * 和田町駅から横浜駅までのルートを算出するメイン関数
 * @param {RouteParams} paramJSON 
 * @returns {Promise<RouteOption[]>}
 */
export async function Wadamachi2Yokohama(paramJSON) {
  // 1. 外部ソースから時刻表データを非同期で取得
  const results = await Promise.allSettled([
    Sotetsu2Yokohama.extractSotetsuTimetable("odpt.Station:Sotetsu.Main.Yokohama", paramJSON.currentDate)
  ]);
  const SotetsuDataJSON = results[0].status === 'fulfilled' ? results[0].value : [];

  // 2. データを到着時刻順にソート（横浜駅への到着が早い順）
  const SortedSotetsuDataJSON = SotetsuDataJSON.toSorted((a, b) => {
    const timeA = a?.arrivalTime ?? null;
    const timeB = b?.arrivalTime ?? null;

    // データ欠損時のnullチェック
    if (!timeA) return 1;
    if (!timeB) return -1;

    return Utils.timeToMinutesExtended(timeA) - Utils.timeToMinutesExtended(timeB);
  });

  // paramJSON.currentTime ("HH:MM") を分単位の数値に変換
  const nowmin = Utils.timeToMinutesExtended(paramJSON.currentTime);
  const modifiedSotetsuDataArray = [];
  let index = 0;

  // 駅到着予定時刻の計算
  const arrivalTimeAtStation = nowmin + paramJSON.ToWadamachi;

  // 3. 取得した電車データを走査し、利用可能なルートを抽出
  for (const traindata of SortedSotetsuDataJSON) {
    const Yokohamatime = traindata?.arrivalTime ?? null;
    const Yokohamamin = Utils.timeToMinutesExtended(Yokohamatime);

    // フィルタリング: 到着時刻不明、または既に横浜に着いている電車は除外
    if (!Yokohamatime) continue;
    if (Yokohamamin < nowmin) continue;

    // 和田町駅の発車時刻データが存在するかチェック（通過列車対策）
    const departureStr = traindata.departureTime?.["和田町"];
    if (!departureStr) continue;

    const trainTimeMin = Utils.timeToMinutesExtended(traindata.departureTime?.["和田町"]);

    // 4. 間に合う電車かどうかの判定
    if (trainTimeMin >= arrivalTimeAtStation) {

      let arrivalStatus = {
        isReachable: true,
        reachTime: Utils.minutesToTime(arrivalTimeAtStation), // 駅到着時刻
        waitTime: trainTimeMin - arrivalTimeAtStation,        // 駅での待ち時間
        isShortestWalk: null
      }

      const modifiedTrainData = {
        ...traindata,
        ArrivalStatus: arrivalStatus
      }

      // 家を出る時間を逆算: (電車の発車時刻 - 徒歩時間)
      const departureMin = Utils.timeToMinutesExtended(traindata.departureTime["和田町"]) - paramJSON.ToWadamachi;

      // 定義した RouteOption 型に従ってデータをpush
      modifiedSotetsuDataArray.push({
        "index": ++index,
        "departuretime": Utils.minutesToTime(departureMin), // 家を出るリミット時刻
        "arrivetime": traindata.arrivalTime,                // 目的地到着時刻
        "duration": Utils.timeToMinutesExtended(traindata.arrivalTime) - departureMin,
        "fare": TRAIN_FARES_SOTETSU.WADAMACHI2YOKOHAMA,

        "station_name": "和田町",
        "station_walktime": paramJSON.ToWadamachi,          // 徒歩時間
        "station_departuretime": traindata.departureTime["和田町"],
        "station_dropoff_name": "横浜駅",
        "station_dropoff_arrivetime": traindata.arrivalTime,
        "traindata": modifiedTrainData
      });
    }
  }
  return modifiedSotetsuDataArray;
}

// ============================================================================
// サーバー/ルーティング設定
// ============================================================================

// 開発用ダミーデータ　参考においておきます　消してもOK
/** @type {RouteParams} */
const paramJSON_temp = {
  "currentTime": "12:14", // 必須: 現在時刻 (HH:MM形式)
  "location": "Library",  // 任意: 出発地のラベル
  "walkspeed": "fast",    // 任意: 歩行速度設定
  "currentDate":new Date, // 必須: 今日の日付(Date型)
  "ToWadamachi": 14,      // 必須: 駅までの徒歩分数 (数値)
};
