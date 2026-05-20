/**
 * @abstract ハローサイクルのAPIを叩いて、ローカルのステーション情報とマージして返すAPI
 * キャッシュ機能実装
 */
import { KEY } from "../../config/defaults.js";
import * as Utils from "../../utils/utils.js";
import { FARE_HELLO_CYCLE } from "../../config/fare/fareTrain/fareHellocycle.js";
import { HELLOCYCLE } from "../../config/providers/hellocycle.js";
import { createDebugLogger, createDebugErrorLogger, createDebugWarnLogger } from "../../utils/debug/debug.js";  // デバッグ用
import fs from "fs/promises";  // ファイル操作用
import path from "path";

const faretable = FARE_HELLO_CYCLE;  // 運賃定義

// Create debug loggers for this module
const debugLog = createDebugLogger('HelloCycle');
const debugError = createDebugErrorLogger('HelloCycle');
const debugWarn = createDebugWarnLogger('HelloCycle');

// キャッシュ用の変数と設定 --------------------------------------------------
// 目的：APIを呼び出す回数を減らす
let cachedStationsData = null;   // APIレスポンス保存用変数
let lastFetchTime = 0;           // 最後にAPI取得した時刻（ミリ秒）
const CACHE_TTL_MS = 60 * 1000;  // キャッシュ有効期間: 60秒（1分）
import { fileURLToPath } from "url"; 

// ==========================================
// 履歴保存用の設定とヘルパー関数
// ==========================================

// 1. 今開いているこのファイル (ReserchCycle.js) があるフォルダのパスを取得
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// API取得中かどうかを判定する「順番待ち（ロック）」用の変数
let fetchPromise = null;

// 2. この場所(adapters)から、2つ上の階層(app_v1)に戻って、apidata/ReserchCycle に入る
const HISTORY_DIR = path.join(__dirname, "../../apidata/ReserchCycle");
// ------------------------------------------------------------------------

/**
 * @brief APIで取得したステーション情報をJSONとして保存
 * 
 * 【目的】
 * - デバッグやログ用途
 * - 時系列での変化を確認できる
 * 
 * @param {Array} data APIから取得したstations配列
 */
async function saveStationsDataToJson(data) {
  try {
    try {
      await fs.access(HISTORY_DIR); // フォルダの存在性確認
    } catch (err) {
      // フォルダ存在しない→保存せずに終了
      debugWarn(`Destination folder does not exist. Skipping history save: ${HISTORY_DIR}`);
      return;
    }

    // フォルダが存在する場合のみ保存処理を行う
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");  // 時刻をOS非依存の形式に正規表現で変換
    const filePath = path.join(HISTORY_DIR, `stations_${timestamp}.json`); 

    await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8"); // 読みやすく整形
  } catch (error) {
    debugError("Failed to save data to the JSON file:", error.message);
  }
}

/**
 * @abstract stationListとAPIのstation情報をマージして返す
 * 
 * 【処理の流れ】
 * 1. キャッシュがあればそれを使う
 * 2. 他リクエストが取得中なら待つ
 * 3. どちらもなければAPI取得
 * 4. station_idでマージ
 * 
 * @param {Array<{station_id: number, name?: string, isNonPriorityPort?: boolean}>} stationList
 * @returns {Promise<Array>} マージ済みポート情報
 */
export async function getPortData(stationList) {
 try {
    const currentTime = Date.now();
    let stations = null;

    let matchedCount = 0;
    let notFoundCount = 0;

    // --- キャッシュと順番待ちの判定 ---
    if (cachedStationsData && (currentTime - lastFetchTime < CACHE_TTL_MS)) {
      // 1. キャッシュが有効ならそれを使う
      stations = cachedStationsData;
    } else if (fetchPromise) {
      // 2. 誰かがAPIを取得中なら、終わるまで待ってそのデータをもらう
      stations = await fetchPromise;  // Promiseを共有.複数リクエストでも一回のAPI取得で済む
    } else {
      // 3. キャッシュもなく、誰も取得していないならAPIを取りに行く
      fetchPromise = (async () => {  // IIFEで非同期関数を定義してすぐ呼び出す
        const url = `${HELLOCYCLE.baseUrl}${HELLOCYCLE.stationStatusPath}?acl:consumerKey=${KEY}`;
        const response = await Utils.fetchJson(url, { timeout: HELLOCYCLE.timeoutMs });

        // Validation: APIレスポンスの形式を確認
        const fetchedStations = response?.data?.stations;  // dataがNullだとundefinedが返ってくる
        if (!Array.isArray(fetchedStations)) {
          throw new Error("Invalid API response: stations is not an array");
        }

        // ここで履歴を保存（1回しか呼ばれなくなります）
        saveStationsDataToJson(fetchedStations);

        // キャッシュを更新
        cachedStationsData = fetchedStations;
        lastFetchTime = Date.now();

        return fetchedStations;
      })();

      // 取得が終わるのを待つ
      stations = await fetchPromise;
      // 取得完了したら順番待ちを解除する
      fetchPromise = null;
    }
    // Mapで高速化
    const apiDataMap = new Map(
      stations.map((s) => [s.station_id, s])
    );

    const portDataArray = [];

    for (const station of stationList) {
      const remoteData = apiDataMap.get(station.station_id);

      if (remoteData) {
        portDataArray.push({
          ...remoteData,   // スプレッドでAPIからの全データを入れる
          name: station.name ?? null,
          isNonPriorityPort: station.isNonPriorityPort ?? null,
        });
        matchedCount++;
      } else {
        debugWarn(`Station ID ${station.station_id} not found in API.`);
      }
      notFoundCount++;
    }

    //debugLog('Port data merge completed. Matched:', matchedCount, 'Not found:', notFoundCount);
    //debugLog('Total ports in result:', portDataArray.length);

    return portDataArray;

  } catch (error) {
    debugError(`Failed to fetch station status. Details:`, error.cause || error);
    throw new Error("ポート情報の取得に失敗しました");
  }
}

/**
 * @abstract 与えられた返却地ポートデータから、最も空きあるポートのデータを出力
 * 空き無しの場合-1を格納
 * @param {Array<Object>} portDataArray 返却地の返却ポートの情報リスト
 * @returns {Object} 返却用データオブジェクト
 */
export function makeReturnPlaceData(portDataArray) {
  let bestPort = null;

  for (const station of portDataArray) {
    // 返却不可ならスキップ
    if (!station.is_returning) continue;

    // まだ候補がない場合は無条件でセット
    if (!bestPort) {
      bestPort = station;
      continue;
    }

    // --- 比較ロジック ---
    const isCurrentNonPri = bestPort.isNonPriorityPort === true;
    const isNewNonPri = station.isNonPriorityPort === true;

    // 1. 「現在の候補が非優先」かつ「新しい候補が優先(通常)」なら乗り換える
    if (isCurrentNonPri && !isNewNonPri) {
      bestPort = station;
    }
    // 2. 「優先度が同じ」なら「台数が多い」方を選ぶ
    else if (isCurrentNonPri === isNewNonPri) {
      if (station.num_docks_available > bestPort.num_docks_available) {
        bestPort = station;
      }
    }
  }

  // 結果の返却
  if (bestPort) {
    //debugLog('Best return port selected:', bestPort.station_id, 'Docks available:', bestPort.num_docks_available);
    return {
      is_returning: true, // bestPortがある時点でtrue確定
      returnportid: bestPort.station_id,
      num_docks_available: bestPort.num_docks_available,
      port_name: bestPort.name,
      isNonPriorityPort: bestPort.isNonPriorityPort
    };
  } else {
    // 返却可能なポートがない場合でも候補ポートの情報を返す
    const firstPort = portDataArray?.[0];

    if (firstPort) {
      debugLog('No returning ports available. Using first port as fallback:', firstPort.station_id);
      return {
        is_returning: false,
        returnportid: firstPort.station_id,
        num_docks_available: firstPort.num_docks_available,
        port_name: firstPort.name,  // ← ポート名を含める
        isNonPriorityPort: firstPort.isNonPriorityPort
      };
    }

    //debugLog('No ports available at all');
    return {
      is_returning: false,
      returnportid: -1,
      num_docks_available: -1,
      port_name: null,
      isNonPriorityPort: null
    };
  }
}

/**
 * 与えられた貸出地ポートデータから、最も台数が多いポートのデータを出力
 * 貸出不可の場合-1を格納
 * @param {Array<Object>} portDataArray 借りる場所のポートの情報リスト
 * @returns {Object} 貸出用データオブジェクト
 */
export function makeRentalPlaceData(portDataArray) {
  let bestPort = null;

  for (const station of portDataArray) {
    // 貸出不可ならスキップ
    if (!station.is_renting) continue;

    if (!bestPort) {
      bestPort = station;
      continue;
    }

    const isCurrentNonPri = bestPort.isNonPriorityPort === true;
    const isNewNonPri = station.isNonPriorityPort === true;

    // 優先度が同じなら台数比較、現在の候補が非優先で新しいのが優先なら乗り換え
    // (条件を一行で書く場合のパターン)
    if ((isCurrentNonPri && !isNewNonPri) || 
        (isCurrentNonPri === isNewNonPri && station.num_bikes_available > bestPort.num_bikes_available)) {
      bestPort = station;
    }
  }

  if (bestPort) {
    //debugLog('Best rental port selected:', bestPort.station_id, 'Bikes available:', bestPort.num_bikes_available);
    return {
      is_renting: true,
      rentportid: bestPort.station_id,
      num_bikes_available: bestPort.num_bikes_available,
      port_name: bestPort.name,
      isNonPriorityPort: bestPort.isNonPriorityPort
    };
  } else {
    // 貸出可能なポートがない場合でも、候補ポートの情報を返す
    const firstPort = portDataArray?.[0];

    if (firstPort) {
      //debugLog('No rental ports available. Using first port as fallback:', firstPort.station_id);
      return {
        is_renting: false,
        rentportid: firstPort.station_id,
        num_bikes_available: firstPort.num_bikes_available,
        port_name: firstPort.name,  // ← ポート名を含める
        isNonPriorityPort: firstPort.isNonPriorityPort
      };
    }

    debugLog('No rental ports available at all');

    // portDataArrayが空の場合のみnullを返す
    return {
      is_renting: false,
      rentportid: -1,
      num_bikes_available: -1,
      port_name: null,
      isNonPriorityPort: null
    };
  }
}

 /**
  * ハロサイのレンタルコストを計算する関数
  * 借りる時間が12時間を超えるか無効な値だと-1を返す
  * @param {Number} rentaltime 借りる時間(12時間以内) 
  * @returns {Number} レンタルにかかる利用料金
  */
export function makeRentalCost(rentaltime){

  //　仮変数
  let temp_cost = 0;
  let temp_time = rentaltime;

  if(rentaltime <= faretable.maxtime && rentaltime > 0){ 
    temp_cost += faretable.initialfare;
    temp_time -= faretable.initialtime;

    while(temp_time > 0 && temp_cost < faretable.maxfare){
      temp_cost += faretable.additionalfare;
      temp_time -= faretable.additionaltime;
    }
  }else{
    temp_cost = -1
  }

  //　最大料金を超えたら、レンタルコストを最大料金に直す
  if(temp_cost > faretable.maxfare){
    temp_cost = faretable.maxfare;
  }

  debugLog('Final rental cost:', temp_cost);
  return temp_cost;
}