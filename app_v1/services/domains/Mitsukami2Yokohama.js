// ============================================================================
// モジュール: 三ッ沢上町駅（横浜市営地下鉄ブルーライン）経由のルート算出
// ============================================================================
// 自宅から三ッ沢上町駅まで徒歩で移動し、そこから地下鉄を利用して横浜駅へ向かう
// ルートと時間を計算します。

import * as Utils from "../../utils/utils.js";
import * as YokohamaMunicipalTrain from "../adapters/Mitsukami2Yokohama_dia.js";
import { TRAIN_FARES_BLUE_LINE } from "../../config/fare/fareTrain/fareBlueLine.js";

// ============================================================================
// 定数定義
// ============================================================================
const TRAIN_FARES = TRAIN_FARES_BLUE_LINE

/**
 * 三ッ沢上町経由のルート算出処理
 * * 指定された現在時刻と徒歩所要時間を基に、間に合う電車の候補をリストアップします。
 * * @param {Object} paramJSON - ルート算出に必要なパラメータオブジェクト
 * @param {string} paramJSON.currentTime - 必須: 現在時刻 (形式 "HH:MM")。計算の基準となる時刻。
 * @param {number} paramJSON.ToMitsukami - 必須: 自宅から三ッ沢上町駅までの徒歩所要時間（分）。
 * @param {boolean} [paramJSON.isholiday] - 任意: 休日ダイヤフラグ (true=休日, false=平日)。※ダイヤ取得側で使用想定
 * @param {string} [paramJSON.location] - 任意: 出発地のラベル（例: "Library", "Home"）。
 * @param {string} [paramJSON.walkspeed] - 任意: 歩行速度設定（例: "fast", "normal"）。
 * * @returns {Promise<Array>} 計算されたルート情報の配列（modifiedChikatetsuDataArray）
 */
export async function Mitsukami2Yokohama (paramJSON){

  //console.log("[DBG paramJSON keys]", Object.keys(paramJSON ?? {}));
  //console.log("[DBG currentDate/currentTime]", { currentDate: paramJSON?.currentDate, currentTime: paramJSON?.currentTime });

    // 1. 地下鉄の時刻表データを非同期で取得
    const results = await Promise.allSettled([
        YokohamaMunicipalTrain.buildJson(paramJSON.currentDate)
    ]);
    // 取得成功時は値を使用、失敗時は空配列を設定
    const ChikatetsuDataJSON = results[0].status === 'fulfilled' ? results[0].value : [];
    
    // 2. データを到着時刻順にソート（横浜駅への到着が早い順）
    // ユーザーにとって「早く着く」選択肢を上位にするための並べ替え
    const SortedChikatetsuDataJSON = ChikatetsuDataJSON.toSorted((a,b) => {
      const timeA = a?.arrivalTime ?? null;
      const timeB = b?.arrivalTime ?? null; 
          
      // データ欠損時のnullチェック（無効なデータは後ろへ）
      if (!timeA) return 1; 
      if (!timeB) return -1;
      
      // 時刻文字列を分単位（数値）に変換して比較
      return Utils.timeToMinutesExtended(timeA) - Utils.timeToMinutesExtended(timeB);
    });

  // paramJSON.currentTime ("HH:MM") を分単位の数値に変換（例: "10:00" -> 600）
  const nowmin = Utils.timeToMinutesExtended(paramJSON.currentTime);
  const modifiedChikatetsuDataArray = [];
  let index = 0;

  // 駅到着予定時刻の計算
  // 現在時刻 + 徒歩時間 = 「駅の改札に到着できる最短時刻」
  const arrivalTimeAtStation = nowmin + paramJSON.ToMitsukami;

  // 3. 取得した電車データを走査し、利用可能なルートを抽出
  for (const traindata of SortedChikatetsuDataJSON) {
    const Yokohamatime = traindata?.arrivalTime ?? null;
    const Yokohamamin = Utils.timeToMinutesExtended(Yokohamatime);

    // --- フィルタリング処理 ---
    // 到着時刻不明、または既に横浜に着いている（過去の）電車は除外
    if (!Yokohamatime) continue;
    if (Yokohamamin < nowmin) continue;

    const departureStr = traindata?.departureTime ?? null;
    if (!departureStr) continue;

    // 電車の発車時刻を分単位に変換
    const trainTimeMin = Utils.timeToMinutesExtended(departureStr);

    // 4. 間に合う電車かどうかの判定
    // 電車の発車時刻 >= 駅到着予定時刻 なら乗車可能
    if (trainTimeMin >= arrivalTimeAtStation) {

      // 駅到着時のステータス情報を作成
      let arrivalStatus = {
        isReachable: true, // 到達可能フラグ
        reachTime: Utils.minutesToTime(arrivalTimeAtStation), // 駅到着時刻
        waitTime: trainTimeMin - arrivalTimeAtStation,        // 駅での待ち時間（発車までの余裕）
        isShortestWalk: null
      }

      // 元の電車データにステータスを結合
      const modifiedTrainData = {
        ...traindata,
        ArrivalStatus: arrivalStatus
      }

      // 家を出る時間を逆算: (電車の発車時刻 - 徒歩時間)
      // これが「この電車に乗るためのデッドライン時刻」
      const departureMin = Utils.timeToMinutesExtended(departureStr) - paramJSON.ToMitsukami;

      // 定義した RouteOption 型に従って結果配列にデータをpush
      modifiedChikatetsuDataArray.push({
        "index": ++index,
        "departuretime": Utils.minutesToTime(departureMin), // 家を出るリミット時刻
        "arrivetime": traindata.arrivalTime,                // 目的地(横浜)到着時刻
        "duration": Utils.timeToMinutesExtended(traindata.arrivalTime) - departureMin,
        "fare": TRAIN_FARES.MITSUKAMI2YOKOHAMA,

        "station_name": "三ッ沢上町",
        "station_walktime": paramJSON.ToMitsukami,          // 駅までの徒歩時間
        "station_departuretime": departureStr,              // 電車の発車時刻
        "station_dropoff_name": "横浜駅",
        "station_dropoff_arrivetime": traindata.arrivalTime,
        "traindata": modifiedTrainData                      // 詳細データ
      });
    }
  }
  // console.log(`[DEBUG] Mitsukami2Yokohama: Found ${modifiedChikatetsuDataArray.length} valid train options based on currentTime=${paramJSON.currentTime} and ToMitsukami=${paramJSON.ToMitsukami}`);
  return modifiedChikatetsuDataArray;
}

// ============================================================================
// サーバー/ルーティング設定
// ============================================================================

// 開発用ダミーデータ 参考用においておきます
/** * ルート算出用パラメータの構造定義
 * @typedef {Object} RouteParams
 * @property {string} currentTime - 現在時刻 (HH:MM形式)。計算の基準。
 * @property {string} [location] - 出発地のラベル (任意)
 * @property {string} [walkspeed] - 歩行速度設定 (任意)
 * @property {boolean} isholiday - 休日ダイヤフラグ (true/false)
 * @property {number} ToMitsukami - 駅までの徒歩分数 (数値)
 */

/** @type {RouteParams} */
const paramJSON_temp = {
  "currentTime": "12:14", // 必須: 現在時刻 (HH:MM形式)
  "location": "Library",  // 任意: 出発地のラベル
  "walkspeed": "fast",    // 任意: 歩行速度設定
  "isholiday": true,      // 必須: 休日ダイヤフラグ (true/false)
  "ToMitsukami": 14,      // 必須: 駅までの徒歩分数 (数値)
};
