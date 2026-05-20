// sotetsuBus.js
// 相鉄バスの路線情報

import { SOTETSU_BUSSTOPPOLES as P } from "../busstopPoles/sotetsuBus.js";

export const SOTETSU_BUSROUTES = {
  HAMA10_YNU_TO_YOKOHAMA: [
    P.YNU_MAIN_GATE.id,
    P.KOKUDAI_CHUO_1.id,
    P.KOKUDAI_KITA_1.id,
    P.KOKUDAI_NISHI.id,
    P.KOKUDAI_KITA_2.id,
    P.KOKUDAI_CHUO_2.id,
    P.DAIGAKU_KAIKAN_MAE.id,
    P.KOKUDAI_SOUTH_GATE.id,
    P.TOKIWADAI_JYUTAKU.id,
    P.YOKOHAMA_SHINDO.id,
    P.OKAZAWA_CHO.id,
  ],
  HAMA11_YNU_TO_YOKOHAMA: [
    P.HIJIRIGAOKA.id,
    P.KAMADAI_JYUTAKU_DAI2.id,
  ],
};