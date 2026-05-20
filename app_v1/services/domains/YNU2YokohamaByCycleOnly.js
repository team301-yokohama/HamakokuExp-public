// JSONファイルのインポート
import stationList from '../../db/transit/cycleport/cycleportlist.json' with { type: 'json' };
// 外部モジュールの読み込み
import * as Utils from '../../utils/utils.js';  // Utility関数をまとめたmoduleを読み込み
import * as Reserchcycle from '../adapters/ReserchCycle.js';  // サイクルポートを探す系関数をまとめたmoduleを読み込み

/**
 * 横浜国立大学 (YNU) の特定の施設から横浜駅までの、HelloCycleを使用した
 * 自転車ルートの移動時間とコストを計算します。
 *
 * 【処理の流れ】
 * 1. paramJSONのwalkspeedに基づき、歩行時間データと自転車の平均速度データを決定。
 * 2. 貸出・返却ポート（YNU最寄り/横浜駅最寄り）の現在の利用可否を取得。
 * 3. 貸出・返却ポートが利用可能で、かつ歩行データが正常な場合にのみ時間を計算。
 * 4. 移動時間 = (施設から貸出ポートへの徒歩時間) + (自転車移動時間) + (返却ポートから横浜駅への徒歩時間)
 * 5. 現在時刻と計算した移動時間を基に到着時刻を算出します。
 *
 * @param {JSON} paramJSON 環境設定を含むJSONオブジェクト。
 * 必須プロパティ: {string} walkspeed, {string} location
 * @param {Array<object>} portdatalist HelloCycleの持つすべてのポートデータ配列。
 * @returns {object} ルート情報を含むJSONデータ。
 * - arrivetime: 到着時刻 ('HH:MM'形式) または失敗時は -1
 * - is_using: ルートが利用可能か (true/false)
 * - rentportid: 貸出ポートID、失敗時は -1
 * - num_bikes_available: 貸出可能台数、失敗時は -1
 * - fare: 2025年時点での横浜市内の料金 、失敗時は -1
 * @see {@link makeRentalPlaceData}
 * @see {@link getPortData}
 */
export async function YNU2YokohamaByCycle(paramJSON) {
  // 初期化
  let result = [{
        "departuretime":null,
        "arrivetime": null,
        "isrentable": false,
        "duration":-1,
        "bike_duration":-1,

        "rentportid": -1,
        "rentport_name": null,
        "rentport_walktime":-1,
        "rentport_departuretime":null,
        "num_bikes_available": -1,
        
        "returnportid": -1,
        "returnport_name":null,
        "returnport_arrivetime":null,
        "returnport_walktime":-1,
        "num_docks_available": -1,
        
        "fare": -1
    }];

  try {

    // 1. 【重要】非同期でポートデータを取得 (awaitを使用)
    // 並列でリクエストを投げると少し速くなります (Promise.all)
    const [rentalPortRaw, returnPortRaw] = await Promise.all([
      Reserchcycle.getPortData(stationList.YNU),            // 貸出候補(YNU周辺)
      Reserchcycle.getPortData(stationList.YokohamaStation) // 返却候補(横浜駅周辺)
    ]);

    // デバッグ用ログ出力
    //console.log("rentalPortRaw:", rentalPortRaw);
    //console.log("returnPortRaw:", returnPortRaw);

    // 2. 取得した生データから、最適なポートを選定
    const RentalPlaceData = Reserchcycle.makeRentalPlaceData(rentalPortRaw);
    const ReturnPlaceData = Reserchcycle.makeReturnPlaceData(returnPortRaw);

    // 3. 料金計算
    const cyclecost = Reserchcycle.makeRentalCost(paramJSON.FromFamiYNUToYokohama);

    // デバッグ用ログ出力
    //console.log("Step 4: Checking conditions...");
    //console.log("is_renting:", RentalPlaceData.is_renting);
    //console.log("is_returning:", ReturnPlaceData.is_returning);
    //console.log("cyclecost !== -1:", cyclecost !== -1);

    // 4. 利用可否判定
    // is_renting / is_returning が true かつ、料金計算が成功しているか(-1じゃないか)
    if (RentalPlaceData.is_renting && ReturnPlaceData.is_returning && cyclecost !== -1) {
      
      // 移動時間の合計 (徒歩 + 自転車 + 徒歩)
      // ※ paramJSONのキー名は呼び出し元と厳密に合わせる必要があります
      const totalMoveTime = paramJSON.ToFamiYNU + 
                            paramJSON.FromFamiYNUToYokohama + 
                            paramJSON.FromHamagin_yokohamaToYokohama;

      // 現在時刻(文字列)を分(数値)に変換して加算
      const currentMinutes = Utils.timeToMinutesExtended(paramJSON.currentTime);
      const arrivalMinutes = currentMinutes + totalMoveTime;

      // 結果オブジェクトの更新
      result = [{
        "departuretime":paramJSON.currentTime,
        "arrivetime": Utils.minutesToTime(arrivalMinutes),
        "isrentable": true,
        "duration":totalMoveTime,
        "bike_duration":paramJSON.FromFamiYNUToYokohama,

        "rentportid": RentalPlaceData.rentportid,
        "rentport_name":RentalPlaceData.port_name,
        "rentport_walktime":paramJSON.ToFamiYNU,
        "rentport_departuretime":Utils.minutesToTime(currentMinutes + paramJSON.ToFamiYNU),
        "num_bikes_available": RentalPlaceData.num_bikes_available,
        
        "returnportid": ReturnPlaceData.returnportid,
        "returnport_name":ReturnPlaceData.port_name,
        "returnport_arrivetime":Utils.minutesToTime(currentMinutes + paramJSON.FromFamiYNUToYokohama),
        "returnport_walktime":paramJSON.FromHamagin_yokohamaToYokohama,
        "num_docks_available": ReturnPlaceData.num_docks_available,
        
        "fare": cyclecost
      }];
    } else {
      // 失敗理由を構造化して返す
      const reasons = [];
  
      if (!RentalPlaceData.is_renting) {
        reasons.push({
          type: "NO_BIKES_AVAILABLE",
          message: "貸出ポートに自転車がありません",
          portName: RentalPlaceData.port_name || "不明",
          availableBikes: RentalPlaceData.num_bikes_available
        });
      }
  
      if (!ReturnPlaceData.is_returning) {
        reasons.push({
          type: "NO_DOCKS_AVAILABLE",
          message: "返却ポートに空きがありません",
          portName: ReturnPlaceData.port_name || "不明",
          availableDocks: ReturnPlaceData.num_docks_available
        });
      }
  
      if (cyclecost === -1) {
        reasons.push({
          type: "COST_CALCULATION_FAILED",
          message: "料金計算に失敗しました"
        });
      }
  
      result.reason = reasons.length > 0 ? reasons : [{
        type: "UNKNOWN_ERROR",
        message: "不明なエラーが発生しました"
      }];
    }

    // サーバーログにも出力（開発・運用用）
    if (!result[0].isrentable) {
      console.warn("[Cycle Route] Not available:", result[0].reason);
    }

  } catch (error) {
    console.error("Route calculation error:", error);
    // エラー時は初期値(失敗ステータス)がそのまま返ります
  }

  return result;
}


// 仮の引数
// デバッグ用なので製品化時は削除可能
const paramJSON_temp ={
  "currentTime":Utils.getCurrentTime(),
  "location":"Library",
  "walkspeed":"fast",
  "ToFamiYNU":5,
  "FromFamiYNUToYokohama":23,
  "FromHamagin_yokohamaToYokohama":5
  };