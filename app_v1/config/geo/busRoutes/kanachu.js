// kanachu.js
// 神奈川中央バスの路線情報

import { KANACHU_BUSSTOPPOLES as P } from "../busstopPoles/kanachu.js";

export const KANACHU_BUSROUTES = {
  UMENOKI01_YNU_TO_YOKOHAMA: [
    P.YOKOHAMA_SHINDO.id,
    P.OKAZAWA_CHO.id,
    P.YOKOHAMA_NISHIGUCHI.id,
  ],
};