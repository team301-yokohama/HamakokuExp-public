// mitsukami2YokohamaViaBusConfig.jsの設定ファイル

/**
 * 乗り換え計算に関する設定
 */
export const TRANSFER_CONFIG = {
  // 三ツ沢上町バス停〜駅ホーム間の移動時間（分）
  // 乗り換え用定数: 三ツ沢上町バス停で降りてから、駅のホームに着くまでの標準的な移動時間（分）
  // ※できれば動的なwalktimeパラメータに含めるのが理想だが、現状は固定値で運用
  MITSUKAMI_BUS_TO_STATION_TIME: 4,
  
  // 1つのバス便に対して提示する接続電車の最大数
  MAX_TRAIN_CONNECTIONS: 3
};