// 大学から横浜駅まで直で歩く
import * as Utils from "../../utils/utils.js";

 /**
  * 大学から横浜駅まで直接歩いた時の時間
  * @param {JSON} paramJSON 環境設定を含むJSONオブジェクト。
  * 必須プロパティ: {string} currentTime, {Number} ToYokohama
  * 推奨プロパティ: {string} walkspeed, {string} location 
  * @returns {object} ルート情報を含んだJSONデータ
  * - arrivetime : 到着時間('HH:MM'形式) 
  * - duration : 所要時間(Number形式)
  */
  export async function YNU2YokohamaOnFoot(paramJSON){
    let movetime = 0;
    movetime += paramJSON.ToYokohama ?? -1; // 大学から横浜駅までの徒歩時間 (分)
    let returnJson = [{
        "departuretime":paramJSON.currentTime,
        "arrivetime" : Utils.minutesToTime(Utils.timeToMinutesExtended(paramJSON.currentTime) + movetime) ,
        "duration": movetime,
        "fare":0
    }];
    return returnJson;
  }