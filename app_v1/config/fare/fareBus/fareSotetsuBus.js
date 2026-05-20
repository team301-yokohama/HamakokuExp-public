// 相鉄バスの運賃設定

export const SOTETSU_FARE_CONFIG = {
    baseFare: 240,       // 基本運賃
    currency: "JPY",
    paymentType: "flat", // 将来的に "distance" などが入る想定
    // 将来的にここに関数（calculateFareなど）を追加できる
};