// 三ッ沢上町の駅までチャリで行って、そこから地下鉄
import * as Utils from "../../utils/utils.js";
import * as MitsukamiTrainData from "./Mitsukami2Yokohama.js";
import * as Reserchcycle from '../adapters/ReserchCycle.js';  // サイクルポートを探す系関数をまとめたmoduleを読み込み
// JSONファイルのインポート
import stationList from '../../db/transit/cycleport/cycleportlist.json' with { type: 'json' };
// 一つのデータに何個の電車を結びつけるかの設定
import { TRANSFER_CONFIG } from "../../config/constants/mitsukami2YokohamaViaBusConfig.js";

export async function Mitsukami2YokohamaViaCycle(paramJSON){
    // 初期化
  let result = [{
        "departuretime":null,
        "arrivetime": null,
        "isrentable": false,
        "fare":-1,
        "duration":-1,
        "bike_duration":-1,

        "rentportid":null,
        "rentport_name":null,
        "rentport_walktime": -1,
        "rentport_departuretime":null,
        "num_bikes_available": -1,
              
        "returnportid": null ,
        "returnport_name":null,
        "returnport_arrivetime":null,
        "returnport_walktime": -1,
        "num_docks_available": -1,

        "station_name":null,
        "station_departuretime":null,
        "station_dropoff_name":null,
        "station_dropoff_arrivetime":null,
        "traindata": []
  }];

    // 1. 【重要】非同期でポートデータを取得 (awaitを使用)
    // 並列でリクエストを投げると少し速くなります (Promise.all)
    const [rentalPortRaw, returnPortRaw , AllTraindata] = await Promise.all([
      Reserchcycle.getPortData(stationList.YNU),            // 貸出候補(YNU周辺)
      Reserchcycle.getPortData(stationList.Mitsukami), // 返却候補(横浜駅周辺)
      MitsukamiTrainData.Mitsukami2Yokohama({
        "currentTime" : paramJSON.currentTime,
        "currentDate": paramJSON.currentDate,
        "ToMitsukami" : 0,
        "isholiday" : paramJSON.isholiday,
        "location":paramJSON.location,
        "walkspeed":paramJSON.walkspeed
      })
    ]);
    // 一時デバッグ用ログ
    // console.log("[DEBUG] : Mitsukami2YokohamaViaCycleの取得データ\n", { rentalPortRaw, returnPortRaw});
    
    // 2. 取得した生データから、最適なポートを選定
    const RentalPlaceData = Reserchcycle.makeRentalPlaceData(rentalPortRaw);
    const ReturnPlaceData = Reserchcycle.makeReturnPlaceData(returnPortRaw);

    // 3. 料金計算
    const cyclecost = Reserchcycle.makeRentalCost(paramJSON.FromFamiYNUToMitsukami);

    // 4. 利用可否判定
    // is_renting / is_returning が true かつ、料金計算が成功しているか(-1じゃないか)
    if (RentalPlaceData.is_renting && ReturnPlaceData.is_returning && cyclecost !== -1) {
      
      // 移動時間の合計 (徒歩 + 自転車 + 乗り換え徒歩)
      // ※ paramJSONのキー名は呼び出し元と厳密に合わせる必要があります
      const bikeTotalMoveTime = paramJSON.ToFamiYNU + 
                                paramJSON.FromFamiYNUToMitsukami + 
                                paramJSON.MitsukamiBusStopToStation;

      // 現在時刻(文字列)を分(数値)に変換して加算
      const currentMinutes = Utils.timeToMinutesExtended(paramJSON.currentTime);
      const MitsukamiArrivalMinutes = currentMinutes + bikeTotalMoveTime;

      const tempTrainDataArray = AllTraindata
            // 1. 条件（乗り換えに間に合うか）で絞り込む
            .filter(train => {
              const trainDepMin = Utils.timeToMinutesExtended(train.station_departuretime);
              return trainDepMin >= MitsukamiArrivalMinutes;
            })
            // 2. 最大件数で切る
            .slice(0, TRANSFER_CONFIG.MAX_TRAIN_CONNECTIONS)
            // 3. 必要な形式に変換する
            .map((train, idx) => ({
              trainindex: idx + 1,
              station_name: "三ッ沢上町",
              station_departuretime: train.station_departuretime,
              station_dropoff_name: "横浜駅",
              station_dropoff_arrivetime: train.station_dropoff_arrivetime,
              train_fare: train.fare,
              traindata_details: train.traindata
        }));
          if(tempTrainDataArray.length === 0) return result;
          if(cyclecost ===  -1 || tempTrainDataArray[0].train_fare == null) return result;

      // 結果オブジェクトの更新
      result = [{
        "departuretime":paramJSON.currentTime,
        "arrivetime": tempTrainDataArray[0].station_dropoff_arrivetime,
        "isrentable": true,
        "duration": Utils.timeToMinutesExtended(tempTrainDataArray[0].station_dropoff_arrivetime) - Utils.timeToMinutesExtended(paramJSON.currentTime),
        "bike_duration": paramJSON.FromFamiYNUToMitsukami,
        "fare":cyclecost + tempTrainDataArray[0].train_fare,

        "rentportid": RentalPlaceData.rentportid,
        "rentport_name":RentalPlaceData.port_name,
        "rentport_walktime":paramJSON.ToFamiYNU,
        "rentport_departuretime":Utils.minutesToTime(currentMinutes + paramJSON.ToFamiYNU),
        "num_bikes_available": RentalPlaceData.num_bikes_available,
              
        "returnportid": ReturnPlaceData.returnportid,
        "returnport_name":ReturnPlaceData.port_name,
        "returnport_arrivetime":Utils.minutesToTime(currentMinutes +paramJSON.ToFamiYNU + paramJSON.FromFamiYNUToMitsukami),
        "returnport_walktime":paramJSON.MitsukamiBusStopToStation,
        "num_docks_available": ReturnPlaceData.num_docks_available,

        "station_name":tempTrainDataArray[0].station_name,
        "station_departuretime":tempTrainDataArray[0].station_departuretime,
        "station_dropoff_name":tempTrainDataArray[0].station_dropoff_name,
        "station_dropoff_arrivetime":tempTrainDataArray[0].station_dropoff_arrivetime,
        "traindata": tempTrainDataArray
              
      }];
    }

  return result;
} 


// 開発用ダミーデータ（実際の運用ではリクエストから受け取る想定）
const paramJSON_temp = {
  "currentTime":"12:14",
  "location":"Library",
  "walkspeed":"fast",
  "ToFamiYNU": 5, 
  "FromFamiYNUToMitsukami": 15,
  "MitsukamiBusStopToStation": 3,
  };
