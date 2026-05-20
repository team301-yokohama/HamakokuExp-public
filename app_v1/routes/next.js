/**
 * @file ルーティング
 * @summary 横浜国立大学周辺の交通機関情報を統合して返すAPI
 */

import { Router } from "express";
import 'dotenv/config';
import * as Utils from "../utils/utils.js";

// 各サービス
import { extractSotetsuBusTimetable } from "../services/adapters/kaikan2Yokohama.js";
import { extractSotetsuTimetable } from "../services/adapters/sotetsu2Yokohama.js";
import { extractKanachuBusTimetable } from "../services/adapters/kanachu2Yokohama.js";
import { buildJson as buildJsonMunicipalBus } from "../services/adapters/YokohamaMunicipalBus2Yokohama.js";
import { buildJson as buildJsonMitsukamiDia } from "../services/adapters/Mitsukami2Yokohama_dia.js";
import { Kamihoshi2Yokohama } from "../services/domains/Kamihoshi2Yokohama.js";
import { pickTop10Arrivals } from "../services/mainLogic/pickFastestRoutesToYokohama.js";

import { YNUYokohamaByBusOnly } from "../services/domains/YNU2YokohamaByBusOnly.js";
import { Wadamachi2Yokohama } from "../services/domains/Wadamachi2Yokohama.js";
import { YNU2YokohamaByCycle } from "../services/domains/YNU2YokohamaByCycleOnly.js";
import { Mitsukami2YokohamaViaBus } from "../services/domains/Mitsukami2YokohamaViaBus.js";
import { Mitsukami2Yokohama } from "../services/domains/Mitsukami2Yokohama.js";
import { Mitsukami2YokohamaViaCycle } from "../services/domains/Mitsukami2YokohamaViaCycle.js";
import { Wadamachi2YokohamaViaCycle } from "../services/domains/Wadamachi2YokohamaViaCycle.js";
import { YNU2YokohamaOnFoot } from "../services/domains/YNU2YokohamaOnFoot.js";

const router = Router();

// walkspeed設定の読み込み
import walkspeed_fast from '../db/transit/walking/walkspeed_fast.json' with { type: "json" };
import walkspeed_littlefast from '../db/transit/walking/walkspeed_littlefast.json' with { type: "json" };
import walkspeed_normal from '../db/transit/walking/walkspeed_normal.json' with { type: "json" };
import walkspeed_slow from '../db/transit/walking/walkspeed_slow.json' with { type: "json" };

// ========================================
// デバッグ設定
// ========================================

/**
 * 環境変数でルートを制御
 * 
 * 使用例:
 * - 本番: ENABLED_ROUTES=FastestRoutes
 * - デバッグ(全部): ENABLED_ROUTES=*
 * - デバッグ(選択): ENABLED_ROUTES=Kaikan,Wadamachi,FastestRoutes
 * - デバッグモード: DEBUG_MODE=true ENABLED_ROUTES=Kaikan
 */
const DEBUG_MODE = process.env.DEBUG_MODE === 'true';
const ENABLED_ROUTES_ENV = process.env.ENABLED_ROUTES || 'FastestRoutes';

// 全ルートを有効化する場合
const ENABLE_ALL = ENABLED_ROUTES_ENV === '*';

// 有効化するルートのリスト
const ENABLED_ROUTES = ENABLE_ALL
  ? null  // nullの場合は全ルート有効
  : ENABLED_ROUTES_ENV.split(',').map(r => r.trim());

// ========================================
// ルートプロバイダー定義
// ========================================

/**
 * 利用可能な全ルートの定義
 * 各ルートは関数として定義し、paramを受け取る
 */
const ROUTE_PROVIDERS = {
  // 相鉄バス (会館前 -> 横浜)
  Kaikan: (param) => {
    const routeFns = [extractSotetsuBusTimetable];
    return pickTop10Arrivals(param, routeFns)
      .then(data => ({ type: 'Kaikan', data }));
  },

  // 相鉄線 (和田町 -> 横浜)
  Wadamachi: (param) => {
    const routeFns = [Wadamachi2Yokohama];
    return pickTop10Arrivals(param, routeFns)
      .then(data => ({ type: 'Wadamachi', data }));
  },

  // 神奈中バス
  Kanachu: (param) => {
  extractKanachuBusTimetable().then(raw => {
    //console.log('[DEBUG Kanachu] raw timetable count:', raw?.length);
    //console.log('[DEBUG Kanachu] raw[0]:', JSON.stringify(raw?.[0], null, 2));
  });

  const routeFns = [extractKanachuBusTimetable];
  return pickTop10Arrivals(param, routeFns)
    .then(data => ({ type: 'Kanachu', data }));
},
  
  // 横浜市営地下鉄ブルーライン
  BlueLine: (param) => {
    const routeFns = [
      (p) => buildJsonMitsukamiDia(p.currentDate)
    ];
    return pickTop10Arrivals(param, routeFns)
      .then(data => ({ type: 'BlueLine', data }));
  },

  // 横浜市営バス
  YokohamaMunicipalBus: (param) => {
    const routeFns = [
      (p) => buildJsonMunicipalBus(p.currentDate)
    ];
    return pickTop10Arrivals(param, routeFns)
      .then(data => ({ type: 'YokohamaMunicipalBus', data }));
  },

  // 上星川経由
  Kamihoshi: (param) => {
    const routeFns = [Kamihoshi2Yokohama];
    return pickTop10Arrivals(param, routeFns)
      .then(data => ({ type: 'Kamihoshi', data }));
  },

  // 三ツ沢経由（バス）
  MitsukamiBus: (param) => {
    const routeFns = [Mitsukami2YokohamaViaBus];
    return pickTop10Arrivals(param, routeFns)
      .then(data => ({ type: 'MitsukamiBus', data }));
  },

  // 三ツ沢経由（全ルート）
  Mitsukami: (param) => {
    const routeFns = [Mitsukami2Yokohama];
    return pickTop10Arrivals(param, routeFns)
      .then(data => ({ type: 'Mitsukami', data }));
  },

  // 三ツ沢経由（自転車）
  MitsukamiByCycle: (param) => {
    const routeFns = [Mitsukami2YokohamaViaCycle];
    return pickTop10Arrivals(param, routeFns)
      .then(data => ({ type: 'MitsukamiByCycle', data }));
  },

  // 和田町経由（自転車）
  WadamachiByCycle: (param) => {
    const routeFns = [Wadamachi2YokohamaViaCycle];
    return pickTop10Arrivals(param, routeFns)
      .then(data => ({ type: 'WadamachiByCycle', data }));
  },

  // YNUからバスのみ
  YNUBusOnly: (param) => {
    const routeFns = [YNUYokohamaByBusOnly];
    return pickTop10Arrivals(param, routeFns)
      .then(data => ({ type: 'YNUBusOnly', data }));
  },

  // YNUから自転車
  YNUByCycle: (param) => {
    const routeFns = [YNU2YokohamaByCycle];
    return pickTop10Arrivals(param, routeFns)
      .then(data => ({ type: 'YNUByCycle', data }));
  },

  // YNUから徒歩
  YNUOnFoot: (param) =>
    YNU2YokohamaOnFoot(param)
      .then(data => ({ type: 'YNUOnFoot', data })),

  // YNUから電車
  TrainRoutes: (param) => {
    const routeFns = [
      Wadamachi2Yokohama,
      Kamihoshi2Yokohama,
      (p) => buildJsonMitsukamiDia(p.currentDate)
    ];
    return pickTop10Arrivals(param, routeFns)
      .then(data => ({ type: 'TrainRoutes', data }));
  },

  // YNUからチャリとバスを組み合わせたルート
  YNUByCycleAndBus: (param) => {
    const routeFns = [
      YNU2YokohamaByCycle,
      YNUYokohamaByBusOnly
    ];
    return pickTop10Arrivals(param, routeFns)
      .then(data => ({ type: 'YNUByCycleAndBus', data }));
  },

  // 最速ルート統合（本番用メイン）
  FastestRoutes: (param) => {
    const routeFns = [
      Kamihoshi2Yokohama,
      Mitsukami2Yokohama,
      Mitsukami2YokohamaViaBus,
      Mitsukami2YokohamaViaCycle,
      Wadamachi2Yokohama,
      Wadamachi2YokohamaViaCycle,
      YNUYokohamaByBusOnly,
      YNU2YokohamaByCycle,
      YNU2YokohamaOnFoot
    ];
    return pickTop10Arrivals(param, routeFns)
      .then(data => ({ type: 'FastestRoutes', data }));
  }
};

// ルート一覧です、将来的にはconfigにします
/*const TRANSPORT_ROUTE_MAP = {
  All: ['FastestRoutes'],
  Bus: ['YNUBusOnly'],
  Cycle: ['YNUByCycle'],
  Train: ['TrainRoutes'],
  BusAndTrain: ['MitsukamiBus'],
  BusAndCycle: ['YNUByCycle', 'YNUBusOnly'],
  TrainAndCycle: ['MitsukamiByCycle', 'WadamachiByCycle'],
  Walk: ['YNUOnFoot'],
};*/

const TRANSPORT_ROUTE_MAP = {
  1: ['FastestRoutes'],
  2: ['YNUBusOnly'],
  3: ['TrainRoutes'],
  4: ['YNUByCycle'],
  5: ['MitsukamiBus'],
  6: ['YNUByCycleAndBus'],
  7: ['MitsukamiByCycle', 'WadamachiByCycle'],
};

/**
 * クエリパラメータからAPIパラメータを構築
 */
function buildQueryParams(req) {
  const now = req.query.now || Utils.getCurrentTime();
  const date = req.query.date;
  let walktimeList;

  // 歩行速度に応じた歩行時間リストを選択
  switch (req.query.speed) {
    case 'fast':
      walktimeList = walkspeed_fast;
      break;
    case 'littlefast':
      walktimeList = walkspeed_littlefast;
      break;
    case 'normal':
      walktimeList = walkspeed_normal;
      break;
    case 'slow':
      walktimeList = walkspeed_slow;
      break;
    default:
      walktimeList = walkspeed_normal;
  }
  
  let walktimeList_located;
  switch (req.query.location) {
    case 'Library':
      walktimeList_located = walktimeList.Library;
      break;
    case 'Shokudo1':
      walktimeList_located = walktimeList.Shokudo1;
      break;
    case 'Shokudo2':
      walktimeList_located = walktimeList.Shokudo2;
      break;
    case 'RikoA':
      walktimeList_located = walktimeList.RikoA;
      break;
    default:
      walktimeList_located = walktimeList.Library;
  }

  return {
    currentTime: now,
    currentDate: date,
    location: req.query.location || "Library",
    walkspeed: req.query.speed || "normal",
    routepattern: req.query.routepattern || "All",
    ...walktimeList_located
  };
}

/**
 * @brief フロント指定の交通手段から、実行対象ルート名を決定
 * @param {*} param
 * @returns {string[]}
 */
function getRequestedRouteNames(param) {
  const transport = param.routepattern || '1';
  return TRANSPORT_ROUTE_MAP[transport] || ['FastestRoutes'];
}

/**
 * @brief 実際に使うルート名を決定
 * 通常時はフロントの transport を使い、
 * DEBUG_MODE=true のときは環境変数 ENALBED_ROUTES を優先
 * @param {*} param
 * @returns {string[]}
 */
function resolveEnabledRouteNames(param) {
  if (DEBUG_MODE) {
    if (ENABLE_ALL) {
      return Object.keys(ROUTE_PROVIDERS);
    }

    if (ENABLED_ROUTES && ENABLED_ROUTES.length > 0) {
      return ENABLED_ROUTES.filter(routeName => ROUTE_PROVIDERS[routeName]);
    }
  }

  return getRequestedRouteNames(param)
    .filter(routeName => ROUTE_PROVIDERS[routeName]);
}

/**
 * @brief 実行するルートプロバイダーを取得
 * @param {*} param
 * @returns {Promise[]}
 */
function getActiveRoutes(param) {
  const routeNames = resolveEnabledRouteNames(param);
  return routeNames.map(routeName => ROUTE_PROVIDERS[routeName](param));
}

/**
 * 結果をフォーマット
 */
function formatResults(results, enabledRouteNames) {
  const responseData = {};

  results.forEach((result, index) => {
    const routeName = enabledRouteNames[index];

    if (result.status === 'fulfilled') {
      const { type, data } = result.value;
      responseData[type] = {
        status: 'success',
        count: data?.length || 0,
        items: data || []
      };
    } else {
      responseData[routeName] = {
        status: 'error',
        error: result.reason?.message || 'Unknown error',
        items: []
      };

      if (DEBUG_MODE) {
        console.error(`[Route Error: ${routeName}]`, result.reason);
      }
    }
  });

  return responseData;
}

// 歩行速度設定のマッピング
const WALK_SETTINGS = {
  slow: 10,
  normal: 10,
  littlefast: 10,
  fast: 10
};

// ========================================
// ルーティング
// ========================================

router.get("/", async (req, res, next) => {

  try {
    const queryParams = buildQueryParams(req);
    const enabledRouteNames = resolveEnabledRouteNames(queryParams);

    if (DEBUG_MODE) {
      console.log('[DEBUG] Query Parameters:', queryParams);
      console.log('[DEBUG] Enabled Routes:', ENABLE_ALL ? 'ALL' : ENABLED_ROUTES);
      //console.log('[DEBUG] Enabled Routes:', enabledRouteNames);
    }

    // アクティブなルートを取得して実行
    const activeRoutes = getActiveRoutes(queryParams);
    const results = await Promise.allSettled(activeRoutes);

    // 結果をフォーマット
    /*const enabledRouteNames = ENABLE_ALL
      ? Object.keys(ROUTE_PROVIDERS)
      : ENABLED_ROUTES;*/
    const responseData = formatResults(results, enabledRouteNames);

    // レスポンス構築
    const response = {
      meta: {
        requestTime: queryParams.currentTime,
        walkSpeed: queryParams.walkspeed,
        generatedAt: new Date().toISOString()
      },
      results: responseData
    };

    // デバッグ情報を追加
    if (DEBUG_MODE) {
      response.debug = {
        enabledRoutes: enabledRouteNames,
        totalRoutes: results.length,
        successCount: results.filter(r => r.status === 'fulfilled').length,
        errorCount: results.filter(r => r.status === 'rejected').length
      };
    }

    res.set("Cache-Control", "no-store");
    return res.json(response);

  } catch (err) {
    console.error("[Fatal Error]", err);
    next(err);
  }
});

export default router;