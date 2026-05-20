// 上星川まで歩いて、そこから相鉄を利用するルート算出処理
import * as Utils from "../../utils/utils.js";
import * as Sotetsu2Yokohama from "../adapters/sotetsu2Yokohama.js";
import { TRAIN_FARES_SOTETSU } from "../../config/fare/fareTrain/fareSotetsu.js";

// ============================================================================
// 定数定義
// ============================================================================
const TRAIN_FARES = TRAIN_FARES_SOTETSU;

// ============================================================================
// 型定義 (JSDoc)
// ============================================================================

/**
 * リクエストパラメータ (paramJSON) の構造定義
 * @typedef {Object} RouteParams
 * @property {string} currentTime - 現在時刻 (必須) フォーマット: "HH:MM" (例: "12:14")
 * @property {number} ToKamihoshi - 上星川駅までの徒歩所要時間 (必須) 単位: 分 (例: 14)
 * @property {Date} currentDate - 今日の日付(必須)
 * @property {string} [location] - 現在地名称 (任意) ログ出力やデバッグ用 (例: "Library")
 * @property {string} [walkspeed] - 歩行速度設定 (任意) 将来的な計算用 (例: "fast", "normal")
 */

/**
 * ルート検索結果の1件分のデータ構造 (返り値の配列の中身)
 * @typedef {Object} RouteOption
 * @property {number} index - リスト内での通し番号 (1始まり)
 * @property {string} departuretime - 【出発時刻】家(現在地)を出るべき時間 ("HH:MM")
 * @property {string} arrivetime - 【到着時刻】目的地(横浜)に到着する時間 ("HH:MM")
 * @property {string} station_name - 乗車駅名 ("上星川")
 * @property {number} fare - 運賃 (円)
 * @property {number} station_walktime - 乗車駅までの徒歩時間 (分)
 * @property {string} station_departuretime - 【乗車時刻】電車が駅を発車する時間 ("HH:MM")
 * @property {string} station_dropoff_name - 降車駅名 ("横浜駅")
 * @property {string} station_dropoff_arrivetime - 降車駅への到着時間 ("HH:MM")
 * @property {Object} traindata - (内部用) 元の時刻表データと計算用ステータスを含む詳細オブジェクト
 */

// ============================================================================
// メイン処理
// ============================================================================

/**
 * 上星川駅から横浜駅までのルートを算出するメイン関数
 * 指定された現在時刻と徒歩時間を元に、間に合う電車の候補をリストアップして返します。
 * * @param {RouteParams} paramJSON - ルート計算に必要なパラメータオブジェクト
 * @returns {Promise<RouteOption[]>} 計算済みの経路データ配列 (近い順にソート済み)
 */
export async function Kamihoshi2Yokohama(paramJSON){

  // 1. 外部ソースから時刻表データを非同期で取得
  // paramJSON.isholiday を基に、平日/休日ダイヤを切り替えて取得
  const results = await Promise.allSettled([
    Sotetsu2Yokohama.extractSotetsuTimetable(undefined, paramJSON.currentDate)
  ]);

  const SotetsuDataJSON = results[0].status === 'fulfilled' ? results[0].value : [];

  // 2. データを到着時刻順にソート（横浜駅への到着が早い順）
  const SortedSotetsuDataJSON = SotetsuDataJSON.toSorted((a,b) => {
      const timeA = a?.arrivalTime ?? null;
      const timeB = b?.arrivalTime ?? null; 
      
      // データ欠損時のnullチェック
      if (!timeA) return 1; 
      if (!timeB) return -1;
      
      return Utils.timeToMinutesExtended(timeA) - Utils.timeToMinutesExtended(timeB);
   });
  
  // paramJSON.currentTime ("HH:MM") を分単位の数値に変換
  const nowmin = Utils.timeToMinutesExtended(paramJSON.currentTime);

  const modifiedSotetsuDataArray =[];
  let index = 0;

  // paramJSON.ToKamihoshi (徒歩分数) を加算して、駅到着予定時刻を計算
  const arrivalTimeAtStation = nowmin + paramJSON.ToKamihoshi;

  // 3. 取得した電車データを走査し、利用可能なルートを抽出
  for(const traindata of SortedSotetsuDataJSON){  
    const Yokohamatime = traindata?.arrivalTime ?? null;
    const Yokohamamin = Utils.timeToMinutesExtended(Yokohamatime);
    
    // フィルタリング: 到着時刻不明、または既に横浜に着いている電車は除外
    if(!Yokohamatime) continue;
    if(Yokohamamin < nowmin) continue;
    
    // 上星川駅の発車時刻を取得 (データなしの場合は通過等としてスキップ)
    const trainTimeMin = Utils.timeToMinutesExtended(traindata.departureTime?.["上星川"]);
    
    // 4. 間に合う電車かどうかの判定
    // (電車の発車時刻 >= ユーザーが駅に着く時刻)
    if(trainTimeMin >= arrivalTimeAtStation){
      
      let arrivalStatus = {
        isReachable: true,
        reachTime: Utils.minutesToTime(arrivalTimeAtStation), // 駅到着時刻
        waitTime: trainTimeMin - arrivalTimeAtStation,        // 駅での待ち時間
        isShortestWalk: null
      }
      
      const modifiedTrainData = {
        ...traindata,
        ArrivalStatus : arrivalStatus
      }
      
      // 家を出る時間を逆算: (電車の発車時刻 - 徒歩時間)
      // 注意: 必ずUtils.timeToMinutesExtendedで数値化してから計算すること
      const departureMin = Utils.timeToMinutesExtended(traindata.departureTime["上星川"]) - paramJSON.ToKamihoshi;
      
      // 定義した RouteOption 型に従ってデータをpush
      modifiedSotetsuDataArray.push({
        "index": ++index,
        "departuretime":Utils.minutesToTime(departureMin), // 家を出るリミット時刻
        "arrivetime": traindata.arrivalTime,               // 目的地到着時刻
        "duration": Utils.timeToMinutesExtended(traindata.arrivalTime) - departureMin,
        "fare":TRAIN_FARES.KAMIHOSHI2YOKOHAMA,
     
        "station_name":"上星川",
        "station_walktime":paramJSON.ToKamihoshi,          // 徒歩時間 (paramJSONより)
        "station_departuretime":traindata.departureTime["上星川"],
        "station_dropoff_name":"横浜駅",
        "station_dropoff_arrivetime":traindata.arrivalTime,
        "traindata":modifiedTrainData
      });
    }
  }

  return modifiedSotetsuDataArray
}

// 開発用ダミーデータ 参考用においておきます
/** @type {RouteParams} */
const paramJSON_temp = {
  "currentTime": "12:14", // 必須: 現在時刻 (HH:MM形式)
  "location": "Library",  // 任意: 出発地のラベル
  "walkspeed": "fast",    // 任意: 歩行速度設定
  "currentDate": new Date,    // 必須: 日付データ
  "ToKamihoshi": 14,      // 必須: 駅までの徒歩分数 (数値)
};
