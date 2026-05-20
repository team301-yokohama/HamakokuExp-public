import { MUNICIPAL_FARE_CONFIG } from "./fareMunicipal.js";
import { KANACHU_FARE_CONFIG } from "./fareKanachu.js";
import { SOTETSU_FARE_CONFIG } from "./fareSotetsuBus.js";

// アプリケーション全体で使う「運賃定数」としてまとめる
export const BUS_FARES = {
    // 各設定ファイルの baseFare をマッピングする
    SOTETSU: SOTETSU_FARE_CONFIG.baseFare,
    MUNICIPAL: MUNICIPAL_FARE_CONFIG.baseFare,
    KANACHU: KANACHU_FARE_CONFIG.baseFare
};