import express from 'express';
const app = express();
import * as Utils from "../../utils/utils.js";
import * as kaikan2Yokohama from "../adapters/kaikan2Yokohama.js";
import * as kanachu2Yokohama from "../adapters/kanachu2Yokohama.js";
import * as MunicipalBus2Yokohama from "../adapters/YokohamaMunicipalBus2Yokohama.js"
import isholiday from "../../utils/date/isHolidaySotetsu.js"
import { BUS_STOP_MAP } from '../../config/geo/busstopPoles/stopNameMap.js';
import { BUS_FARES } from '../../config/fare/fareBus/indexFareBus.js';
import { createDebugLogger, createDebugErrorLogger } from "../../utils/debug/debug.js";

const debugLog = createDebugLogger('BusRouter');
const debugError = createDebugErrorLogger('BusRouter');

// ============================================================================
// 設定・定数定義
// ============================================================================

// 事業者名から運賃を取得するヘルパー関数
function getBusFare(operatorName) {
  switch(operatorName) {
    case "YokohamaMunicipal":
      return BUS_FARES.MUNICIPAL;
    case "Kanachu":
      return BUS_FARES.KANACHU;
    case "SotetsuBus":
      return BUS_FARES.SOTETSU;
    default:
      return -1;
  }
}

// ============================================================================
// 最適化プロファイル定義
// ============================================================================
/**
 * フロントエンドから "optimizationProfile" キーで指定するプリセット。
 * 各値の意味:
 *   arrival : 横浜への到着を早くしたい度合い（大きいほど早着優先）
 *   depart  : 現在地を遅く出たい度合い（大きいほど滞在時間優先）
 *   walk    : 歩く距離を短くしたい度合い（大きいほど近停優先）
 *
 * スコア = -arrival*(到着Δ) + depart*(出発Δ) - walk*(徒歩時間)
 * ※ Δはいずれも「現在時刻からの差分(分)」で統一し、スケール差を吸収する
 */
export const OPTIMIZATION_PROFILES = {
  balance: {
    label: "バランス",
    arrival: 0.5,
    depart:  0.4,
    walk:    0.1,
  },
  arrive_early: {
    label: "早く着きたい",
    arrival: 0.8,
    depart:  0.1,
    walk:    0.1,
  },
  stay_longer: {
    label: "今の場所に長くいたい",
    arrival: 0.2,
    depart:  0.7,
    walk:    0.1,
  },
  avoid_walk: {
    label: "なるべく歩きたくない",
    arrival: 0.3,
    depart:  0.3,
    walk:    0.4,
  },
};

const DEFAULT_PROFILE = "avoid_walk"; 

// ============================================================================
// スコア計算関数
// ============================================================================

/**
 * バス停ごとのスコアを計算する
 * スケール統一のため、絶対時刻ではなく「現在時刻からの差分(分)」を使う
 *
 * @param {number} arriveMin      - 横浜到着時刻（分換算）
 * @param {number} userDepartMin  - 現在地を出る時刻（分換算）
 * @param {number} walkTime       - 徒歩時間（分）
 * @param {number} nowMin         - 現在時刻（分換算）
 * @param {Object} weights        - {arrival, depart, walk}
 * @returns {number} スコア（大きいほど優秀）
 */
function calcScore(arriveMin, userDepartureMin, walkTime, nowMin, weights) {
  const arrivalDelta = arriveMin - nowMin; // 小さいほど良い → マイナス寄与
  const departDelta  = userDepartureMin - nowMin; // 大きいほど良い → プラス寄与
  return (
    - weights.arrival * arrivalDelta
    + weights.depart  * departDelta
    - weights.walk    * walkTime
  );
}

// ============================================================================
// 共通ヘルパー関数
// ============================================================================

/**
 * 到達判定ロジック
 * 指定されたバス停の時刻表を確認し、現在時刻＋徒歩時間で間に合うかを判定する
 * * @param {string|string[]} departureTimes - バスの出発時刻（単一文字列または配列）
 * @param {number} requiredWalkMinutes - そのバス停までの徒歩時間（分）
 * @param {number} nowMinutes - 現在時刻（分換算）
 * @returns {Object} 到達可能性ステータスオブジェクト
 */
function checkReachability(departureTimes, requiredWalkMinutes, nowMinutes) {
    const status = {
        isReachable: false,
        reachTime: null,
        isShortestWalk: null, // 全体の判定後に設定されるためここではnull
        waitTime: null
    };

    if (!departureTimes) return status;

    // 配列でない場合は配列化して統一的に扱う
    const timeList = Array.isArray(departureTimes) ? departureTimes : [departureTimes];

    // 時刻を分換算してソート (昇順: 早い時間が先)
    // toSorted は非破壊的なので元の配列には影響しない
    const sortedTimes = timeList.toSorted((a, b) => {
        return Utils.timeToMinutesExtended(a) - Utils.timeToMinutesExtended(b);
    });

    // 乗車可能な最も早いバスを探す
    for (const timeStr of sortedTimes) {
        const busTimeMin = Utils.timeToMinutesExtended(timeStr);
        const arrivalTimeAtBusStop = nowMinutes + requiredWalkMinutes;

        // バス出発時刻 >= バス停到着時刻 なら乗車可能
        if (busTimeMin >= arrivalTimeAtBusStop) {
            status.isReachable = true;
            status.reachTime = Utils.minutesToTime(arrivalTimeAtBusStop);
            status.waitTime = busTimeMin - arrivalTimeAtBusStop; // 待ち時間
            break; // 一番早い乗れるバスが見つかったらループ終了
        }
    }

    if (!status.isReachable && departureTimes?.length > 0) {
      // 時刻データはあるが乗れない場合のみログ（空配列は除外）
      //debugLog(`[REACH] ❌ unreachable: times=${JSON.stringify(departureTimes)}, walkMin=${requiredWalkMinutes}, now=${nowMinutes}`);
    }

    return status;
}

/**
 * オブジェクト内の特定のプロパティを除外し、残りのプロパティを数値の昇順にソートする。
 * 主に徒歩時間の比較に使用（どのバス停が一番近いかを探すため）。
 * * @param {Object} dataObject - ソート対象のデータオブジェクト
 * @param {string[]} excludeKeys - 除外したいキー名の配列
 * @returns {Array<[string, number]>} ソートされた [キー, 値] の配列
 */
function sortNumericProperties(dataObject, excludeKeys) {
    // 1. オブジェクトの全エントリを [キー, 値] の配列に変換
    const allEntries = Object.entries(dataObject);

    // 2. 不要なキーを持つエントリをフィルタリング
    const filteredEntries = allEntries.filter(([key, value]) => 
        !excludeKeys.includes(key) && typeof value === 'number' && !isNaN(value)
    );

    // 3. 値 (数値) が小さい順 (昇順) にソート
    filteredEntries.sort((a, b) => {
        return a[1] - b[1];
    });

    return filteredEntries;
}

// ============================================================================
// メインデータ処理ロジック
// ============================================================================

/**
 * 全バスデータの取得・結合・フィルタリング・到達判定を行うコア関数
 */
async function modifyAllBusData ( paramJSON ){
  
  // 1. 外部APIからの並列データ取得
  // Promise.allSettled を使用し、一部のAPIが失敗しても他のデータで処理を続行できるようにする
  let results;
    results = await Promise.allSettled([
      MunicipalBus2Yokohama.buildJson(paramJSON.currentDate), // 市営バス
      kanachu2Yokohama.extractKanachuBusTimetable(
        undefined, // n
        undefined, // yokohamaPoleId
        paramJSON.currentDate, // serviceDay 
        undefined, // sortBy
        undefined  // options
      ),
      kaikan2Yokohama.extractSotetsuBusTimetable(
        undefined, // n
        undefined, // yokohamaPoleId
        paramJSON.currentDate, // serviceDay 
        undefined, // sortBy
        undefined  // options
      )
    ]);
    
    
   
  
    // 成功した結果のみを取得、失敗時は空配列を代入
    const SotetsuBusDataJSON = results[2]?.status === 'fulfilled' ? results[2].value :  [];
    const KanachuBusDataJSON = results[1].status === 'fulfilled' ? results[1].value : [];
    const MunicipalBusDataJSON = results[0].status === 'fulfilled' ? results[0].value : [];
  
  // 徒歩時間比較のために除外するキーリスト
  const excludedList = [
    "currentTime",
    "location",
    "walkspeed",
    "ToYokohama",
    "ToMitsukami",
    "ToWadamachi",
    "ToKamihoshi",
    "ToYokohama",
    "FromHamagin_yokohamaToYokohama",
    "FromShinkoParkPortToYokohama",
    "FromHamagin_WadamachiToWadamachi",
    "MitsukamiBusStopToStation",
    "FromFamiYNUToYokohama",
    "FromFamiYNUToMitsuami",
    "FromFamiYNUToWadamachi"
  ];

  // バス停への徒歩時間を短い順にソートしたリストを作成
  const SortedWalktimeData = sortNumericProperties(paramJSON, excludedList);

  // 全バスデータを結合
  const CombinedBusDataJSON = [
  ...SotetsuBusDataJSON,
  ...KanachuBusDataJSON,
  ...MunicipalBusDataJSON
  ];

   // 2. 横浜駅西口への到着時刻が早い順にソート
   const SortedBusDataJSON = CombinedBusDataJSON.toSorted((a,b) => {
    const timeA = a.arrivalTime?.["横浜駅西口"] ?? null;
    const timeB = b.arrivalTime?.["横浜駅西口"] ?? null; 
    // データ欠損時のnullチェック（欠損データは後ろへ）
    if (!timeA) return 1; 
    if (!timeB) return -1;
    return Utils.timeToMinutesExtended(timeA) - Utils.timeToMinutesExtended(timeB);
 });

 const nowmin = Utils.timeToMinutesExtended(paramJSON.currentTime);
 let modifiedBusDataJSON={
   "dataList":[
      // ここに処理済みの有効なバスデータが追加される
   ]
 };

 // 3. 各バスデータに対して詳細な判定処理を実行
 for(const Busdata of SortedBusDataJSON){
   const Yokohamatime = Busdata.arrivalTime?.["横浜駅西口"] ?? null;
   const Yokohamamin = Utils.timeToMinutesExtended(Yokohamatime);

   // 到着時刻が無い、または現在時刻より前に到着済み（過去のバス）の場合はスキップ
   if(!Yokohamatime) continue;
   if(Yokohamamin < nowmin) continue;

   // --- 各バス停ごとの到達可能性チェック ---
   const arrivalStatus = {};
   BUS_STOP_MAP.forEach(mapItem => {
     // 対象のバスデータの出発時刻を探す
     let departureTime = null;
     for (const name of mapItem.stopNames) {
       if (Busdata.departureTime?.[name]?.length > 0) {
         departureTime = Busdata.departureTime[name];
         break;
       }
     }

    // デバッグ
    /*if (mapItem.key === 'ToKaikan') {
      console.log(`[DEBUG ToKaikan] stopNames=${JSON.stringify(mapItem.stopNames)}`);
      console.log(`[DEBUG ToKaikan] departureTime keys=`, Object.keys(Busdata.departureTime ?? {}));
      console.log(`[DEBUG ToKaikan] found=`, departureTime);
    }*/

    // 修正後: 相鉄バスのHama10/11ルートなのに時刻が無い場合だけログ
    const isSotetsu = Busdata.busroute?.includes('SotetsuBus');
    if (!departureTime && isSotetsu) {
      //debugLog(`[STOPMAP] ⚠️ SotetsuBus missing stop: key="${mapItem.key}", route=${Busdata.busroute}`);
    }

    // 共通関数で判定結果を取得
    const requiredWalkTime = paramJSON[mapItem.key];
    arrivalStatus[mapItem.key] = checkReachability(departureTime, requiredWalkTime, nowmin); 
   });

   const ModifiedBusData = {
    ...Busdata,
    ArrivalStatus: arrivalStatus
   };
   // --- 最短徒歩ルートの決定ロジック ---
   let isReachableFlag = false;

   // 徒歩時間が短いバス停順（SortedWalktimeData）にチェック
   for (const walkTimeEntry of SortedWalktimeData) {
    const key = walkTimeEntry[0]; // 例: "ToKokudaiNishi"
    const walkMin = walkTimeEntry[1];

    // デバッグ
    //console.log(`[WALK] checking key="${key}", walkMin=${walkMin}, exists=${!!ModifiedBusData.ArrivalStatus[key]}, isReachable=${ModifiedBusData.ArrivalStatus[key]?.isReachable}`);


    // ★そもそもそのバス停のデータ（ArrivalStatus）が存在するかチェック
    if (!ModifiedBusData.ArrivalStatus[key]) {
      //console.log(`[WALK] ⚠️ SKIPPED (not in ArrivalStatus)`);
      continue; // 知らないバス停キーなら無視して次へ  
    }
     
  // まだ最短ルートが決まっておらず、かつ、このバス停に間に合う場合
    if (!isReachableFlag && ModifiedBusData.ArrivalStatus[key]?.isReachable) {
      //console.log(`[WALK] ✅ isShortestWalk → key="${key}", walkMin=${walkMin}`);
      ModifiedBusData.ArrivalStatus[key].isShortestWalk = true; // これを推奨ルートとする
      isReachableFlag = true;
    } else {
      ModifiedBusData.ArrivalStatus[key].isShortestWalk = false;
    }
  }

  if (!isReachableFlag) {
    /*debugLog(`[FILTER] ❌ bus excluded (no reachable stop): route=${Busdata.busroute}, yokohama=${Yokohamatime}, reachabilityByStop=`,
      Object.fromEntries(
        Object.entries(arrivalStatus).map(([k, v]) => [k, v.isReachable])
      )
    );*/
  }

   // いずれかのバス停から乗車可能な場合のみ、結果リストに追加
  if (isReachableFlag) {
    modifiedBusDataJSON.dataList.push(ModifiedBusData);
  }
}
 //console.log("[Debug] Final modifiedBusDataJSON with ArrivalStatus and isShortestWalk", modifiedBusDataJSON); // 最終的な処理結果をログ出力
return modifiedBusDataJSON;
}


/**
 * レスポンス整形関数
 * 計算済みのバスデータから、クライアントに返す最終的なJSON形式を生成する
 * @param {Object} paramJSON - 検索条件と各バス停への徒歩時間を格納したオブジェクト
 * @param {string} paramJSON.currentTime - 現在時刻 (形式: "HH:mm", 例: "12:14")
 * * // --- 以下、現在地から各バス停までの徒歩時間(分) ---
 * // 値が存在しない(undefined/null)ルートは計算から除外されるため、
 * // 必要なルートのキーは必ず含めること。
 * @param {number} [paramJSON.ToKokudaiNishi] - バス停「国大西」までの徒歩時間
 * @param {number} [paramJSON.ToKokudaiChuo] - バス停「国大中央」までの徒歩時間
 * @param {number} [paramJSON.ToKokudaiKita] - バス停「国大北」までの徒歩時間
 * @param {number} [paramJSON.ToKaikan] - バス停「大学会館前」までの徒歩時間
 * @param {number} [paramJSON.ToMinamiG] - バス停「国大南門」までの徒歩時間
 * @param {number} [paramJSON.ToShindo] - バス停「横浜新道」までの徒歩時間
 * @param {number} [paramJSON.ToOkazawacho] - バス停「岡沢町」までの徒歩時間
 * // --- ログ・デバッグ用 (ロジックには影響なし) ---
 * @param {string} [paramJSON.location] - 現在地名 (例: "Library")
 * @param {string} [paramJSON.walkspeed] - 徒歩速度 (例: "fast")
 * @returns {Promise<Array<Object>>} クライアントへ返却する整形済みルート情報リスト
 */
export async function YNUYokohamaByBusOnly (paramJSON){
  let returnArray = [];
  let index = 1;

  // ① プロファイルの解決（フロントから渡されなければデフォルト）
  const profileKey = paramJSON.optimizationProfile ?? DEFAULT_PROFILE;
  const weights = OPTIMIZATION_PROFILES[profileKey] ?? OPTIMIZATION_PROFILES[DEFAULT_PROFILE];
  debugLog(`[PROFILE] using: ${profileKey}`, weights);

  // 全バスデータの取得・到達判定処理を実行
  const AllBusdata = await modifyAllBusData(paramJSON);
  const nowMin = Utils.timeToMinutesExtended(paramJSON.currentTime);

  for(const busdata of AllBusdata.dataList){
    
    // ----------------------------------------------------------------
    // ベストな乗車バス停の選定プロセス(score based)
    // ----------------------------------------------------------------
    
    // 選定中に保持する一時変数
    let bestBusStopKey = null;       // 採用するバス停のキー (例: "ToKokudaiNishi")
    let bestScore = null;
    //let maxDepartureMin = null;      // 現在地を出る時間の最大値（null = 未定）
    let finalBestBusStopName = null; // データ上の具体的なバス停名 (例: "横浜新道(新道)")
    let finalUserDepartureMin = null;

    const arriveMin = Utils.timeToMinutesExtended(busdata.arrivalTime["横浜駅西口"]);

    // 定義されている全バス停を走査し、このバスに乗るのに最適なバス停を探す
    BUS_STOP_MAP.forEach(mapItem => {
      const key = mapItem.key;
      
      // 1. 到達不可能なバス停、またはデータに含まれないバス停は除外
      /*if (!busdata.ArrivalStatus[key] || !busdata.ArrivalStatus[key].isReachable) {
        return;
      }*/

      if (!busdata.ArrivalStatus[key]?.isReachable) return;

      // 2. データに含まれる具体的なバス停名を特定（表記ゆれ対応）
      const currentStopName_JPN = mapItem.stopNames.find(name => 
        busdata.departureTime[name]?.length > 0
      );

      if (!currentStopName_JPN) return;

      // 3. バスの発車時刻を数値（分）に変換
      // 複数の発車時刻がある場合は、最も遅い時刻を採用（乗り遅れ防止のリスクヘッジではなく、ダイヤ上の選択肢として）
      const targetTimeRaw = busdata.departureTime[currentStopName_JPN];
      const busDepartureMin = Array.isArray(targetTimeRaw)
        ? Math.max(...targetTimeRaw.map(t => Utils.timeToMinutesExtended(t)))
        : Utils.timeToMinutesExtended(targetTimeRaw);

      // 4. 「現在地を出る時間」を計算 (バス発車時刻 - 徒歩所要時間)
      const walkTime = paramJSON[key];
      const userDepartureMin = busDepartureMin - walkTime;

      // 5. スコアを計算
      const score = calcScore(arriveMin, userDepartureMin, walkTime, nowMin, weights);

      // --- 比較・更新ロジック ---

    if (bestScore === null || score > bestScore) {
        bestScore = score;
        bestBusStopKey = key;
        finalBestBusStopName = currentStopName_JPN;
        finalUserDepartureMin = userDepartureMin;
      }
    });

    if (bestScore === null) continue;

    // ----------------------------------------------------------------
    // レスポンスデータの構築
    // ----------------------------------------------------------------

    const departureStop_JPN = finalBestBusStopName; // 確定したバス停名
    
    // 表示用にバスの発車時刻を文字列に戻す
    const targetdepartureTime = busdata.departureTime[departureStop_JPN];
    const finalDepartureTimeStr = Array.isArray(targetdepartureTime)
      ? Utils.minutesToTime(Math.max(...targetdepartureTime.map(t => Utils.timeToMinutesExtended(t))))
      : targetdepartureTime;
    
    // 事業者名の抽出（デフォルトは市営バス）
    const operatorName = busdata.operator?.split(':').pop() ?? "YokohamaMunicipal";
  
    returnArray.push({
      "index": index,
      "departuretime": Utils.minutesToTime(finalUserDepartureMin), // 計算された「現在地を出る時間」
      "arrivetime": Utils.minutesToTime(arriveMin),          // 目的地到着時間
      "duration" : arriveMin - finalUserDepartureMin,              // 所要時間
      "fare": getBusFare(operatorName),                      // 運賃

      "busstop_name": departureStop_JPN,                     // 乗車バス停名
      "busstop_walktime": paramJSON[bestBusStopKey],         // 徒歩時間
      "busstop_departuretime": finalDepartureTimeStr,        // バス発車時刻
      "busstop_dropoff_name": "横浜駅西口",
      "busstop_dropoff_arrivetime": busdata.arrivalTime["横浜駅西口"],
      "busdata": busdata // デバッグ用生データ
    });
    ++index;
  }

  //debugLog('[FINAL] result count:', returnArray.length);
  //debugLog('[FINAL] busstops used:', [...new Set(returnArray.map(r => r.busstop_name))]);

  return returnArray;
}


// 開発用ダミーデータ（実際の運用ではリクエストから受け取る想定） 参考までに置いときます
const paramJSON_temp = {
  "currentTime":"12:14",
  "currentDate" : new Date(),
  "location":"Library",
  "walkspeed":"fast",
  "ToKokudaiNishi":100,
  "ToKokudaiKita":10,
  "ToKokudaiChuo":5,
  "ToKaikan":6,
  "ToMinamiG":7,
  "ToShindo":8,
  "ToOkazawacho":9,
  };