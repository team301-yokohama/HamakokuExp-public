// config/geo/busstopPoles/index.js

// 事業者別をそのまま再エクスポート
export { SOTETSU_BUSSTOPPOLES } from "./sotetsuBus.js";
export { KANACHU_BUSSTOPPOLES } from "./kanachu.js";

// --- 任意：全事業者まとめ（表示名引きなどに便利） ---
// ※ 各事業者ファイル内のキー名が被るので、ALL にするときは
//   “prefix付きキー”にして衝突を避けるのがおすすめ

import { SOTETSU_BUSSTOPPOLES } from "./sotetsuBus.js";
import { KANACHU_BUSSTOPPOLES } from "./kanachu.js";

export const ALL_BUSSTOPPOLES = {
  // prefix 付きで衝突回避
  ...Object.fromEntries(
    Object.entries(SOTETSU_BUSSTOPPOLES).map(([k, v]) => [`STB_${k}`, v])
  ),
  ...Object.fromEntries(
    Object.entries(KANACHU_BUSSTOPPOLES).map(([k, v]) => [`KNC_${k}`, v])
  ),
};