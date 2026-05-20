/**
 * @abstract Adapter for fetching and processing Kanachu bus timetable data from APIdata JSON files
 * 
 * Overview:
 * This module fetches and processes weekday bus timetable data for Kanachu buses
 * from APIdata JSON files.
 * It specifically handles routes traveling to Yokohama Station, extracting departure
 * times from multiple bus stops and arrival times at the destination.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { CHL_BASE, CHL_KEY } from "../../config/defaults.js";
import * as Utils from "../../utils/utils.js";
import * as calendarUtils from "../../utils/date/calendar.js";
import { KANACHU_BUSSTOPPOLES as P } from "../../config/geo/busstopPoles/index.js";
import { KANACHU_BUSROUTES as R } from "../../config/geo/busRoutes/index.js";
import { ODPT_FIELDS } from "../../config/OdptAPIfield/odptApiField.js";
import { KANACHU } from "../../config/providers/kanachu.js";
import { createDebugLogger, createDebugErrorLogger } from "../../utils/debug/debug.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create debug loggers for this module
const debugLog = createDebugLogger('KanachuBus');
const debugError = createDebugErrorLogger('KanachuBus');

const ODPT = ODPT_FIELDS;
const DEFAULT_KANACHU_OPTS = KANACHU;

/**
 * @abstract Fetch Kanachu bus timetable data from the ODPT API
 * @param {string} calendar - Calendar type ("Weekday" | "Saturday" | "Holiday")
 * @param {object} opts - Options for fetching the timetable
 * @returns {Promise<Array>} Timetable data returned from the ODPT API
 */
/*async function getKanachuBusTimeTable(calendar, opts = DEFAULT_KANACHU_OPTS) {
  const url = Utils.buildUrl(CHL_BASE, ODPT.BUS_TIMETABLE, {
    [ODPT.DC_TITLE]: opts.dc_title,
    [ODPT.OPERATOR]: opts.operator,
    [ODPT.CALENDAR]: `${opts.calendar}${calendar}`,
    [ODPT.CONSUMER_KEY]: CHL_KEY
  });

  //debugLog('Fetching Kanachu bus timetable from URL:', url.toString());
  //debugLog('Calendar type:', calendar);

  try {
    //return await Utils.fetchJson(url, { timeout: opts.timeoutMs });
    return {};
  } catch (error) {
    console.error(`Failed to fetch bus timetable: ${error.message}`);
    throw new Error("バス時刻表の取得に失敗しました", { cause: error });
  }
}*/

async function getKanachuBusTimeTable(calendar, opts = DEFAULT_KANACHU_OPTS) {
  const filePath = path.resolve(
    __dirname,
    "../../apidata/kanachu2Yokohama",
    "kanachuLocalTimetable.json"
  );

  try {
    const text = await readFile(filePath, "utf-8");
    const json = JSON.parse(text);

    const rows = json?.[calendar] ?? [];
    if (!Array.isArray(rows)) {
      throw new Error(`JSON format is invalid for calendar=${calendar}`);
    }

    return rows.map((row, index) => {
      const departureTime = {
        [P.YOKOHAMA_SHINDO.name]: [],
        [P.OKAZAWA_CHO.name]: []
      };

      if (row.YokohamaShindo) {
        departureTime[P.YOKOHAMA_SHINDO.name].push(row.YokohamaShindo);
      }
      if (row.Okazawacho) {
        departureTime[P.OKAZAWA_CHO.name].push(row.Okazawacho);
      }

      return {
        busroute: `odpt.BusroutePattern:Kanachu.01.26202.1`,
        operator: opts.operator ?? null,
        departureTime,
        arrivalTime: {
          [P.MITSUZAWA_KAMICHO.name]: null,
          [P.YOKOHAMA_NISHIGUCHI.name]: row.YokohamaNishiguchi ?? null
        },
        delay: null,
        trainType: null,
        fromBusstopPole: null,
        toBusstopPole: null,
        destinationBusstopPole: P.YOKOHAMA_NISHIGUCHI.id,
        occupancyStatus: null
      };
    });
  } catch (error) {
    debugError(`Failed to load local Kanachu timetable: ${error.message}`);
    throw new Error("時刻表JSONの読み込みに失敗しました", { cause: error });
  }
}

/**
 * @abstract Extract and sort Kanachu bus timetables bound for Yokohama
 * @param {string} yokohamaPoleId - Bus stop pole ID for Yokohama (destination)
 * @param {Date} serviceDay - Date for which the timetable should be fetched
 * @param {object} [options={}] - Optional settings to override target bus stops
 * @returns {Promise<Array>} Formatted Kanachu bus timetable data
 */
export async function extractKanachuBusTimetable(
  yokohamaPoleId = P.YOKOHAMA_NISHIGUCHI.id,
  serviceDay = new Date(),
  options = {}
) {

  const {         
    targetStops = R.UMENOKI01_YNU_TO_YOKOHAMA
  } = options;

  // Determine service type (weekday / weekend / holiday)
  const serviceType = calendarUtils.classifyKanachuServiceDay(serviceDay);

  // Resolve ODPT calendar string for Kanachu
  const calendar = calendarUtils.resolveCalendar("Kanachu", serviceType);
  debugLog('Resolved calendar:', calendar);

  // Fetch raw timetable data
  const timetables = await getKanachuBusTimeTable(calendar, DEFAULT_KANACHU_OPTS);
  //debugLog('Total timetables received:', timetables?.length ?? 0);
  const toMin = Utils.timeToMinutes;

  /**
   * @abstract Extract departure and arrival times from a single bus timetable entry
   * @param {object} tb - Bus timetable object
   * @returns {object} Parsed departure and arrival time information
   */
  function parseOneTable(tb) {
    const objs = tb[ODPT.BUS_TIMETABLE_OBJECT] || [];
    const MITSUZAWA_POLE_ID = P.MITSUZAWA_KAMICHO.id;

    /**
     * Mitsuzawa-Kamicho is an important transfer point,
     * so its arrival time is recorded separately.
     * (A major transfer hub for buses bound for Yokohama Station West Exit)
     * Extract arrival (or pass-through) time at Mitsuzawa-Kamicho
    */
    const mzObj = objs.find((o) =>
      o[ODPT.BUSSTOP_POLE] === MITSUZAWA_POLE_ID
    );

    // If arrival time is missing, fall back to departure time
    const mitsuzawaArrival = mzObj?.[ODPT.ARRIVAL_TIME] ?? mzObj?.[ODPT.DEPARTURE_TIME] ?? null;

    // Extract arrival time at Yokohama
    const ykhObj = objs.find((o) => 
      o[ODPT.BUSSTOP_POLE] === yokohamaPoleId
    );
    const yokohamaArrival = ykhObj?.[ODPT.ARRIVAL_TIME] ?? null;

    // Object to store departure times per bus stop
    const departureTime = {  // These two stops are always required in the response
      [P.YOKOHAMA_SHINDO.name]: [],
      [P.OKAZAWA_CHO.name]: []
    };

    // Object to store arrival times
    const arrivalTime = {
      [P.MITSUZAWA_KAMICHO.name]: mitsuzawaArrival,
      [P.YOKOHAMA_NISHIGUCHI.name]: yokohamaArrival
    };

    // Extract departure times for target bus stops
    targetStops.forEach(stopId => {
      const stop = objs.find(x => x[ODPT.BUSSTOP_POLE] === stopId);
      if (stop && stop[ODPT.DEPARTURE_TIME]) {
        const stopName = stop[ODPT.NOTE]?.split(":")[0];
        if (stopName) {  
          if (!departureTime[stopName]) {
            departureTime[stopName] = [];  
          }
          departureTime[stopName].push(stop[ODPT.DEPARTURE_TIME]);
        }else{
          if (DEFAULT_KANACHU_OPTS.verbose) {
            console.warn(`Stop ${stopId} has invalid note field`);
          }
          return;    
        }
      }
    });

    //debugLog('Bus route:', tb[ODPT.BUS_ROUTE_PATTERN]);

    return {
      busroute: tb[ODPT.BUS_ROUTE_PATTERN] ?? null,
      operator: tb[ODPT.OPERATOR] ?? null,
      departureTime,
      arrivalTime,
      delay: null,
      trainType: null,
      fromBusstopPole: null,
      toBusstopPole: null,
      destinationBusstopPole: yokohamaPoleId,
      occupancyStatus: null
    };
  }

  // Collect candidate bus timetables
  /*const candidates = [];
  for (const tb of timetables) {   
    const busData = parseOneTable(tb);  
    // Keep only entries with at least one valid departure time
    if (Object.values(busData.departureTime).some(arr => arr.length > 0)) {
        candidates.push(busData);
    }
  }*/
  
  const candidates = timetables.filter(tb =>
    Object.values(tb.departureTime).some(arr => arr.length > 0)
  );

  //debugLog('Valid candidates found:', candidates.length);

  // Sort by earliest departure time
  const firstTime = (dep) =>
  Math.min(...Object.values(dep).flat().map(toMin));

  const sorted = candidates.sort(
    (a, b) => firstTime(a.departureTime) - firstTime(b.departureTime)
  );

  /*debugLog('Sorted buses count:', sorted.length);
  debugLog('First 3 buses earliest departure times:', 
    sorted.slice(0, 3).map(b => firstTime(b.departureTime))
  );*/

  return sorted;
}