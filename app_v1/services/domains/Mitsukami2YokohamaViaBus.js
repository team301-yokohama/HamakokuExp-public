import * as Utils from "../../utils/utils.js";
import * as kaikan2Yokohama from "../adapters/kaikan2Yokohama.js";
import * as kanachu2Yokohama from "../adapters/kanachu2Yokohama.js";
import * as MunicipalBus2Yokohama from "../adapters/YokohamaMunicipalBus2Yokohama.js"
import * as MitsukamiTrainData from "./Mitsukami2Yokohama.js"
import isholiday from "../../utils/date/isHolidaySotetsu.js"
import { BUS_STOP_MAP } from "../../config/geo/busstopPoles/stopNameMap.js"; 
import { TRANSFER_CONFIG } from "../../config/constants/mitsukami2YokohamaViaBusConfig.js";
import { BUS_FARES } from "../../config/fare/fareBus/indexFareBus.js";

/**
 * 事業者名から運賃を取得するヘルパー関数
 * @param {string} operatorName - バス事業者名（データソース由来）
 * @returns {number} 運賃（定義にない場合は -1）
 */
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
// 共通ヘルパー関数
// ============================================================================

/**
 * 到達判定ロジック。Mitsumami2Yokohamaと同じ
 * 指定されたバス停の時刻表を確認し、現在時刻から歩いて間に合う便があるかを判定する。
 * * @param {string|string[]} departureTimes - バスの出発時刻（単一文字列 "12:00" または配列 ["12:00", "12:05"]）
 * @param {number} requiredWalkMinutes - 現在地からそのバス停までの徒歩時間（分）
 * @param {number} nowMinutes - 現在時刻（0:00からの経過分数）
 * @returns {Object} 到達可能性ステータスオブジェクト
 * - isReachable: 間に合うバスがあるか
 * - waitTime: バス停での待ち時間
 */
function checkReachability(departureTimes, requiredWalkMinutes, nowMinutes) {
    const status = {
        isReachable: false,
        reachTime: null,
        isShortestWalk: null, // 全体のバス停比較後に設定されるため初期値はnull
        waitTime: null
    };

    if (!departureTimes) return status;

    // データ形式の統一: 単一の時刻文字列も配列として扱う
    const timeList = Array.isArray(departureTimes) ? departureTimes : [departureTimes];

    // 時刻昇順ソート: 早い時間のバスから順にチェックするため
    // toSorted は元の配列を変更せず新しい配列を返す（ES2023）
   const sortedTimes = timeList
    .filter(time => time !== null) // nullを除外
    .toSorted((a, b) => {
        return Utils.timeToMinutesExtended(a) - Utils.timeToMinutesExtended(b);
    });

    // 間に合う中で最も早いバスを探す（Greedy探索）
    for (const timeStr of sortedTimes) {
        const busTimeMin = Utils.timeToMinutesExtended(timeStr);       // バスの出発時刻(分)
        const arrivalTimeAtBusStop = nowMinutes + requiredWalkMinutes; // ユーザーがバス停に着く時刻(分)

        // バス出発時刻 >= ユーザー到着時刻 なら乗車可能
        if (busTimeMin >= arrivalTimeAtBusStop) {
            status.isReachable = true;
            status.reachTime = Utils.minutesToTime(arrivalTimeAtBusStop);
            status.waitTime = busTimeMin - arrivalTimeAtBusStop; // 待ち時間 = バスの時間 - 自分の到着時間
            break; // 最速の便が見つかった時点でループ終了
        }
    }
    return status;
}

/**
 * オブジェクト内の数値プロパティを昇順ソートする（徒歩時間の比較用）。
 * これにより「どのバス停が一番近いか」をリスト化する。
 * Mitsukami2Yokohamaと同じ
 * * @param {Object} dataObject - paramJSONなどのデータオブジェクト
 * @param {string[]} excludeKeys - ソート対象外にするキー（メタデータ等）
 * @returns {Array<[string, number]>} [キー名, 値] の配列（値が小さい順）
 */
function sortNumericProperties(dataObject, excludeKeys) {
    // 1. オブジェクトを配列化
    const allEntries = Object.entries(dataObject);

    // 2. 除外キーを取り除き、かつ値が数値であるものだけを残す
    const filteredEntries = allEntries.filter(([key, value]) => 
        !excludeKeys.includes(key) && typeof value === 'number' && !isNaN(value)
    );

    // 3. 値の昇順（小さい順）にソート
    filteredEntries.sort((a, b) => {
        return a[1] - b[1];
    });

    return filteredEntries;
}

// ============================================================================
// メインデータ処理ロジック
// ============================================================================

/**
 * 全バスデータの取得・統合・フィルタリングを行うコア関数
 * 複数のバス会社データを並列取得し、条件に合うものだけを抽出する。
 * Mitsukami2Yokohamaの当該を横浜駅から三ッ沢上町出発に変更したもの
 */
async function modifyAllBusData ( paramJSON ){
  
  // 1. 外部APIからの並列データ取得
  // Promise.allSettled を使用し、一部のAPIが失敗しても他のデータで処理を続行できるようにする
  let results = [];
  let SotetsuBusDataJSON = [];
  let KanachuBusDataJSON = [];
  let MunicipalBusDataJSON = [];

  if(isholiday(paramJSON.currentDate)){
    results = await Promise.allSettled([
      MunicipalBus2Yokohama.buildJson(paramJSON.currentDate),
      kanachu2Yokohama.extractKanachuBusTimetable(),
  ]);

  MunicipalBusDataJSON = results[0].status === "fulfilled" ? results[0].value : [];
  KanachuBusDataJSON   = results[1].status === "fulfilled" ? results[1].value : [];
  SotetsuBusDataJSON   = []; // 祝日は相鉄を呼ばない設計なら空でOK

  }else{
    results = await Promise.allSettled([
    MunicipalBus2Yokohama.buildJson(paramJSON.currentDate),
    kanachu2Yokohama.extractKanachuBusTimetable(),
    kaikan2Yokohama.extractSotetsuBusTimetable()
  ]);

  MunicipalBusDataJSON = results[0].status === "fulfilled" ? results[0].value : [];
  KanachuBusDataJSON   = results[1].status === "fulfilled" ? results[1].value : [];
  SotetsuBusDataJSON   = results[2].status === "fulfilled" ? results[2].value : [];
}

  // ソート処理の準備: 徒歩時間比較のために除外するキーを指定
  const excludedList = [
    "currentTime",
    "location",
    "walkspeed",
    "ToYokohama",
    "ToMitsukami",
    "ToWadamachi",
    "ToKamihoshi",
    "FromHamagin_yokohamaToYokohama",
    "FromShinkoParkPortToYokohama",
    "FromHamagin_WadamachiToWadamachi",
    "MitsukamiBusStopToStation",
    "FromFamiYNUToYokohama",
    "FromFamiYNUToMitsuami",
    "FromFamiYNUToWadamachi"
  ];

  // 現在地から各バス停への徒歩時間を「近い順」にソートしたリストを作成
  // 例: [["ToKokudaiChuo", 5], ["ToKaikan", 6], ...]
  // const SortedWalktimeData = sortNumericProperties(paramJSON, excludedList);

  const SortedWalktimeData = BUS_STOP_MAP
  .map(({ key }) => [key, paramJSON[key]])
  .filter(([, v]) => Number.isFinite(v))
  .sort((a, b) => a[1] - b[1]);

  // 全事業者のデータを1つの配列にフラット結合
  const CombinedBusDataJSON = [
  ...SotetsuBusDataJSON,
  ...KanachuBusDataJSON,
  ...MunicipalBusDataJSON
  ];

  /*debug用ログ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  console.log("[DBG] BusData counts", {
    sotetsu: Array.isArray(SotetsuBusDataJSON) ? SotetsuBusDataJSON.length : SotetsuBusDataJSON,
    kanachu: Array.isArray(KanachuBusDataJSON) ? KanachuBusDataJSON.length : KanachuBusDataJSON,
    municipal: Array.isArray(MunicipalBusDataJSON) ? MunicipalBusDataJSON.length : MunicipalBusDataJSON,
    combined: CombinedBusDataJSON.length
  });
  console.log("[DBG] First combined bus item", CombinedBusDataJSON[24] && {
    operator: CombinedBusDataJSON[24].operator,
    arrivalKeys: Object.keys(CombinedBusDataJSON[24].arrivalTime ?? {}),
    departureKeys: Object.keys(CombinedBusDataJSON[24].departureTime ?? {}),
  });
  //^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^*/

   // 2. 三ツ沢上町への到着時刻が早い順にソート
   // ユーザーは「早く着く」ことを優先したいため、到着時刻で並べ替える
   const SortedBusDataJSON = CombinedBusDataJSON.toSorted((a,b) => {
    // データソースによりキー名が異なるため、複数の候補から値を探す（Nullish Coalescing）
    const timeA = a.arrivalTime?.["三ツ沢上町"] ?? a.arrivalTime?.["三ツ沢上町駅前"] ?? a.arrivalTime?.["三ッ沢上町"] ?? a.arrivalTime?.["三ッ沢上町駅前"] ?? null;
    const timeB = b.arrivalTime?.["三ツ沢上町"] ?? b.arrivalTime?.["三ツ沢上町駅前"] ?? b.arrivalTime?.["三ッ沢上町"] ?? b.arrivalTime?.["三ッ沢上町駅前"] ?? null; 
    
    // データ欠損時のハンドリング（欠損データはリストの後ろへ回す）
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
   const Mitsukamitime = Busdata.arrivalTime?.["三ツ沢上町"] ?? Busdata.arrivalTime?.["三ツ沢上町駅前"] ?? Busdata.arrivalTime?.["三ッ沢上町"] ?? Busdata.arrivalTime?.["三ッ沢上町駅前"] ?? null;
   
   /* デバッグ用ログ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    console.log("[DBG bus item]", {
      operator: Busdata.operator,
      arrive: Busdata.arrivalTime,
      departKeys: Object.keys(Busdata.departureTime ?? {}),
      depart: Busdata.departureTime,
      });
    //^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^*/

   const Mitsukamimin = Utils.timeToMinutesExtended(Mitsukamitime);

   // 到着時刻データが無い、または到着時刻が現在時刻より前（＝既に過ぎ去ったバス）の場合はスキップ
   if(!Mitsukamitime) continue;
   if(Mitsukamimin < nowmin) continue;

   // --- 各バス停ごとの到達可能性チェック ---
   // このバス便に対して、定義されている全てのバス停から乗車可能かを判定する
   const arrivalStatus = {};
   BUS_STOP_MAP.forEach(mapItem => {
     // 対象のバスデータの出発時刻を探す
     let departureTime = null;
     for (const name of mapItem.stopNames) {
       if (Busdata.departureTime?.[name]) {
         departureTime = Busdata.departureTime[name];
         break;
       }
     }
     // 共通関数 checkReachability で「間に合うか」を判定
     const requiredWalkTime = paramJSON[mapItem.key];
     arrivalStatus[mapItem.key] = checkReachability(departureTime, requiredWalkTime, nowmin); 
   });

   const ModifiedBusData = {
     ...Busdata,
     ArrivalStatus: arrivalStatus
   };

   const reachableKeys = Object.entries(arrivalStatus)
  .filter(([, st]) => st?.isReachable)
  .map(([k]) => k);

  // デバッグ
  /*if (reachableKeys.length === 0) {
    console.log("[DEBUG] no reachable stops for this bus", {
      departureTimeKeys: Object.keys(Busdata.departureTime ?? {}),
      sampleDeparture: Busdata.departureTime,
    });
  }*/

   // --- 最短徒歩ルートの決定ロジック ---
   // 間に合うバス停の中で、「一番歩かなくて済む（徒歩時間が短い）」バス停にフラグを立てる
   let isReachableFlag = false;
   
   // SortedWalktimeData は徒歩時間が短い順に並んでいるため、上から順にチェック
   for (const walkTimeEntry of SortedWalktimeData) {
     const key = walkTimeEntry[0]; // 例: "ToKokudaiNishi"
     
     // まだ最短ルートが決まっておらず、かつ、このバス停に間に合う場合
     if (!isReachableFlag && ModifiedBusData.ArrivalStatus[key]?.isReachable) {        
       ModifiedBusData.ArrivalStatus[key].isShortestWalk = true; // これを推奨ルート（最短徒歩）とする
       isReachableFlag = true;
     } else {
       // それ以外のバス停は最短ではない
       ModifiedBusData.ArrivalStatus[key].isShortestWalk = false;
     }
   }
   
   // いずれかのバス停から乗車可能な場合のみ、有効なデータとしてリストに追加
   if (isReachableFlag) {
     modifiedBusDataJSON.dataList.push(ModifiedBusData);
   }
 }
 return modifiedBusDataJSON;
}


/**
 * メインコントローラー関数
 * 計算済みのバスデータと電車データを組み合わせ、最終的なレスポンスJSONを生成する
 * * @param {Object} paramJSON - 検索条件（現在時刻、各バス停への徒歩時間等）
 */
export async function Mitsukami2YokohamaViaBus (paramJSON){
  let returnArray = [];
  let index = 1;

  // 1. 全バスデータの取得・到達判定処理（重い処理はここで完了）
  const AllBusdata = await modifyAllBusData(paramJSON);
  // console.log("[DBG] AllBusdata.dataList len =", AllBusdata.dataList.length);
  
  // 2. 三ツ沢上町駅を出発する電車情報の取得
  const AllTraindata = await MitsukamiTrainData.Mitsukami2Yokohama({
    currentTime: paramJSON.currentTime,
    currentDate: paramJSON.currentDate,
    ToMitsukami: 0, // 乗り換え地点なので0
    isholiday: paramJSON.isholiday,
    location: paramJSON.location,
    walkspeed: paramJSON.walkspeed
  });

  // console.log("[DBG] train len", AllTraindata?.length ?? null);

  // 3. 有効なバスデータごとにループし、最適な乗車バス停と接続電車を決定
  for(const busdata of AllBusdata.dataList){
    
    // ----------------------------------------------------------------
    // ベストな乗車バス停の選定プロセス
    // 1つのバス便に対して複数のバス停から乗れる可能性があるため、
    // 「最もギリギリまで現在地にいられる（出発時間が遅い）」バス停をベストとする。
    // ----------------------------------------------------------------
    
    // 選定中に保持する一時変数
    let bestBusStopKey = null;       // 採用するバス停のキー
    let maxDepartureMin = null;      // 現在地を出発できる時刻の最大値（より遅く出られる方が良い）
    let finalBestBusStopName = null; // 実際のバス停名

    // 定義されている全バス停を走査
    BUS_STOP_MAP.forEach(mapItem => {
      const key = mapItem.key;      
      // A. 到達不可能なバス停は除外
      if (!busdata.ArrivalStatus[key] || !busdata.ArrivalStatus[key].isReachable) {
        return;
      }

      // B. データに含まれる具体的なバス停名を特定
      const currentStopName_JPN = mapItem.stopNames.find(name => 
        busdata.departureTime[name] !== undefined && busdata.departureTime[name] !== null
      );

      // C. バスの発車時刻を数値変換
      // 万が一複数の時刻がある場合は一番遅い時間を採用（ダイヤの選択肢として）
      const targetTimeRaw = busdata.departureTime[currentStopName_JPN];
      const busDepartureMin = Array.isArray(targetTimeRaw)
        ? Math.max(...targetTimeRaw.map(t => Utils.timeToMinutesExtended(t)))
        : Utils.timeToMinutesExtended(targetTimeRaw);

      // D. 「現在地を出る時間」を計算 (バス発車時刻 - 徒歩所要時間)
      const walkTime = paramJSON[key];
      const userDepartureMin = busDepartureMin - walkTime;

      // --- 比較・更新ロジック ---
      
      // 条件1: まだ候補がない、または「もっと遅く現在地を出ても間に合う」バス停が見つかった場合
      // → 「現在地に長く居られる」ことを最優先価値として更新する
      if (maxDepartureMin === null || userDepartureMin > maxDepartureMin) {
        maxDepartureMin = userDepartureMin;
        bestBusStopKey = key;
        finalBestBusStopName = currentStopName_JPN;
      } 
      // 条件2: 現在地を出る時間が「同じ」場合
      // → 徒歩時間が短い（楽な）ルートを優先して採用する
      else if (userDepartureMin === maxDepartureMin) {
        if (busdata.ArrivalStatus[key].isShortestWalk === true) {
          bestBusStopKey = key;
          finalBestBusStopName = currentStopName_JPN;
        }
      }
    });

    // 有効なバス停が1つも見つからなかった場合は、このバスデータ自体をスキップ
    if (maxDepartureMin === null) {
        continue; 
    }

    // ----------------------------------------------------------------
    // レスポンスデータの構築と電車との結合
    // ----------------------------------------------------------------

    const departureStop_JPN = finalBestBusStopName; // 確定したバス停名
    // バス到着時刻の取得
    const arriveTime = busdata.arrivalTime?.["三ツ沢上町"] ?? busdata.arrivalTime?.["三ツ沢上町駅前"] ?? busdata.arrivalTime?.["三ッ沢上町"] ?? busdata.arrivalTime?.["三ッ沢上町駅前"] ?? null;
    if(!arriveTime) continue;

    const arriveMin = Utils.timeToMinutesExtended(arriveTime);

    // 表示用にバスの発車時刻を文字列に戻す
    const targetdepartureTime = busdata.departureTime[departureStop_JPN];
    const finalDepartureTimeStr = Array.isArray(targetdepartureTime)
      ? Utils.minutesToTime(Math.max(...targetdepartureTime.map(t => Utils.timeToMinutesExtended(t))))
      : targetdepartureTime;
    
    // 事業者名の抽出（デフォルトは市営バス扱い）
    const busoperatorName = busdata.operator?.split(':').pop() ?? "YokohamaMunicipal";
    
    // 電車データのフィルタリングと整形
    const tempTrainDataArray = AllTraindata
      // 1. 条件で絞り込む: バス到着時刻 + 乗り換え時間(4分) より後に出る電車のみ
      .filter(train => {
        const trainDepMin = Utils.timeToMinutesExtended(train.station_departuretime);
        return trainDepMin > arriveMin + TRANSFER_CONFIG.MITSUKAMI_BUS_TO_STATION_TIME;
      })
      // 2. 最大件数で切る（最大3件）
      .slice(0, TRANSFER_CONFIG.MAX_TRAIN_CONNECTIONS)
      // 3. クライアントが必要とする形式に変換
      .map((train, idx) => ({
        trainindex: idx + 1,
        station_name: "三ッ沢上町",
        station_departuretime: train.station_departuretime,
        station_dropoff_name: "横浜駅",
        station_dropoff_arrivetime: train.station_dropoff_arrivetime,
        train_fare: train.fare,
        traindata_details: train.traindata
      }));

      /*debug用ログ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    if (tempTrainDataArray.length === 0) {
      console.log("[DROP] no trains", {
        arriveTime,
        arriveMin,
        threshold: arriveMin + TRANSFER_CONFIG.MITSUKAMI_BUS_TO_STATION_TIME,
        allTrainLen: AllTraindata?.length ?? null,
      });
      continue;
    }*/

    // 接続する電車がない、または運賃情報が取得できない場合はスキップ
    if(tempTrainDataArray.length === 0) continue;
    if(getBusFare(busoperatorName) === -1 || tempTrainDataArray[0].train_fare === -1 || tempTrainDataArray[0].train_fare == null) continue;

    // 最終的なルートオブジェクトを配列に追加
    returnArray.push({
      "index": index,
      "departuretime": Utils.minutesToTime(maxDepartureMin), // ユーザーが現在地を出るべき時間
      "arrivetime": Utils.minutesToTime(arriveMin),          // 目的地（三ツ沢上町）到着時間
      "fare": getBusFare(busoperatorName) + tempTrainDataArray[0].train_fare, // 合計運賃
      "duration": arriveMin - maxDepartureMin,
      
      "busstop_name": departureStop_JPN,                     // 乗車バス停名
      "busstop_walktime": paramJSON[bestBusStopKey],         // バス停までの徒歩時間
      "busstop_departuretime": finalDepartureTimeStr,        // バスの発車時刻
      "busstop_dropoff_name": "三ツ沢上町",
      "busstop_dropoff_arrivetime": arriveTime,

      // 接続電車情報（1つ目）
      "station_name":tempTrainDataArray[0].station_name,
      "station_departuretime":tempTrainDataArray[0].station_departuretime,
      "station_dropoff_name":tempTrainDataArray[0].station_dropoff_name,
      "station_dropoff_arrivetime":tempTrainDataArray[0].station_dropoff_arrivetime,
      
      "busdata": busdata, // デバッグ用: バスの生データ
      "traindata" : tempTrainDataArray // デバッグ用: 接続電車のリスト
    });
    ++index;
  }
  return returnArray;
}

// ============================================================================
// サーバー/ルーティング設定
// ============================================================================

// 開発用ダミーデータ（実際の運用ではリクエストクエリ等から生成する想定）
const paramJSON_temp = {
  "currentTime":"12:14",
  "currentDate":new Date(),
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
