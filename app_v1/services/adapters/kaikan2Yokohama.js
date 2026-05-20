/**
 * Sotetsu Bus Timetable Module (ODPT API Integration)
 * 
 * OVERVIEW:
 * This module fetches and processes weekday bus timetable data for Sotetsu buses
 * from the Open Data Challenge for Public Transportation in Tokyo (ODPT) API.
 * It specifically handles routes traveling to Yokohama Station, extracting departure
 * times from multiple bus stops and arrival times at the destination.
 * 
 * KEY FEATURES:
 * - Fetches real-time weekday timetable data from ODPT API
 * - Parses complex timetable objects with multiple bus stops
 * - Maps bus stop pole IDs to human-readable names
 * - Extracts departure times for all configured bus stops on a route
 * - Identifies arrival times at Yokohama Station (or other specified destinations)
 * - Sorts buses by earliest departure time for easy scheduling
 * 
 * DATA STRUCTURE:
 * The module uses ID-based matching instead of array-index-based matching to ensure
 * robustness against variations in API response order. Each bus stop pole has a unique
 * ID that is mapped to a human-readable name (e.g., "YNU Main Gate", "Kokudai Chuo").
 * 
 * MAIN FUNCTIONS:
 * 1. getWeekdaySotetsuBusTimeTable() - Fetches raw timetable data from ODPT API
 * 2. extractSotetsuBusTimetable() - Processes and structures the timetable data
 * 
 * USAGE EXAMPLE:
 * const buses = await extractSotetsuBusTimetable(P.YOKOHAMA_NISHIGUCHI.id);
 * // Returns sorted array of bus objects with departure/arrival times
 * 
 * NOTE:
 * This module focuses on weekday service only. The timetable data may include
 * multiple route directions (e.g., buses departing from YNU toward Yokohama,
 * and buses departing from Yokohama toward YNU). The extraction logic filters
 * for the desired direction based on the presence of valid departure times.
 */

import { BASE, KEY } from "../../config/defaults.js";
import * as Utils from "../../utils/utils.js";
import { SOTETSU_BUSSTOPPOLES as P } from "../../config/geo/busstopPoles/index.js";
import { SOTETSU_BUSROUTES as R } from "../../config/geo/busRoutes/index.js";
import { ODPT_FIELDS } from "../../config/OdptAPIfield/odptApiField.js";
import { SOTETSU_BUS } from "../../config/providers/sotetsuBus.js";
import { createDebugLogger, createDebugErrorLogger } from "../../utils/debug/debug.js";

// Create debug loggers for this module
const debugLog = createDebugLogger('SotetsuBus');
const debugError = createDebugErrorLogger('SotetsuBus');

const ODPT = ODPT_FIELDS;
const DEFAULT_SOTETSU_OPTS = SOTETSU_BUS;

// Create a map from bus stop pole ID to human-readable bus stop name
// This allows ID-based matching without relying on array indices
const ID_TO_NAME_MAP = Object.values(P).reduce((acc, station) => {
  acc[station.id] = station.name;
  return acc;
}, {});
//debugLog('[DEBUG] ID_TO_NAME_MAP initialized:', ID_TO_NAME_MAP);

// Collect all unique bus stop names defined in the configuration
// Used to initialize departure-time containers consistently
const ALL_STATION_NAMES = [...new Set(Object.values(P).map(s => s.name))];
//debugLog('[DEBUG] ALL_STATION_NAMES:', ALL_STATION_NAMES);

/**
 * @abstract Fetch weekday Sotetsu bus timetables from the ODPT API
 * @returns {Promise<Array>} Raw timetable data returned by the API
 * @note Weekday service is sufficient.
 *       The returned array may contain multiple route directions
 *       (e.g., departures from YNU and from Yokohama).
 */
export async function getWeekdaySotetsuBusTimeTable(opts = DEFAULT_SOTETSU_OPTS){
  const url = Utils.buildUrl(BASE, ODPT.BUS_TIMETABLE, {
    [ODPT.DC_TITLE]: [opts.dc_title1, opts.dc_title2, opts.dc_title3, opts.dc_title4],
    [ODPT.OPERATOR]: opts.operator,
    [ODPT.CALENDAR]: opts.calendar,
    [ODPT.CONSUMER_KEY]: KEY
  });

  //debugLog('[DEBUG] Fetching bus timetable from URL:', url.toString());

  try {
    return await Utils.fetchJson(url, { timeout: SOTETSU_BUS.timeoutMs });
  } catch (error) {
    console.error("Error fetching bus timetable:", error);
    throw new Error("バス時刻表の取得に失敗しました", { cause: error });
  }
}

/**
 * @abstract Extract buses heading to Yokohama and sort them by departure time
 * @param {string} yokohamaPoleId - Bus stop pole ID for Yokohama arrival
 * @param {Object} [options={}] - Optional settings for target stops
 * @returns {Promise<Array>} Sorted list of upcoming bus data
 */
export async function extractSotetsuBusTimetable(
  yokohamaPoleId = P.YOKOHAMA_NISHIGUCHI.id,
  options = {}
) {
  //debugLog('[DEBUG] Starting extraction with yokohamaPoleId:', yokohamaPoleId);
  //debugLog('[DEBUG] Options:', options);

  const { targetStops = R.HAMA10_YNU_TO_YOKOHAMA, } = options;

  // Convert "HH:mm" formatted time to minutes
  const toMin = (hhmm) => Utils.timeToMinutes(hhmm);

  // Fetch raw timetable data
  const timetables = await getWeekdaySotetsuBusTimeTable(DEFAULT_SOTETSU_OPTS);
  // debugLog('Total timetables received:', timetables?.length ?? 0);

  // APIが返した全ルートパターンを確認（HAMA11が含まれているか）
  //debugLog('[FETCH] all route patterns:', timetables.map(tb => tb[ODPT.BUS_ROUTE_PATTERN]));

  /**
   * @abstract Parse a single timetable object and extract
   *           departure times and Yokohama arrival time
   * @param {Object} tb - A single bus timetable entry
   * @returns {Object} Structured bus data with departure and arrival times
   */
  function parseOneTable(tb) {
    const objs = tb[ODPT.BUS_TIMETABLE_OBJECT] || [];
    //debugLog('Parsing timetable. Objects count:', objs.length);

    // このtimetableに含まれる全pole IDをログ
    //  設定済みIDと突き合わせて「APIには存在するが設定に無い」IDを検出
    const allIds = objs.map(o => o[ODPT.BUSSTOP_POLE]);
    const mappedIds   = allIds.filter(id =>  ID_TO_NAME_MAP[id]);
    const unmappedIds = allIds.filter(id => !ID_TO_NAME_MAP[id]);

    //debugLog(`[PARSE] route: ${tb[ODPT.BUS_ROUTE_PATTERN]}`);
    //debugLog(`[PARSE]   mapped IDs:`, mappedIds.map(id => `${id} → ${ID_TO_NAME_MAP[id]}`));
    //debugLog(`[PARSE]   ⚠️ unmapped IDs (in API but not in P):`, unmappedIds);

    //const allPoleIds = [...new Set(objs.map(o => o[ODPT.BUSSTOP_POLE]))];
    //debugLog('[PARSE] all busstop pole IDs in this timetable:', allPoleIds);

    // Extract Yokohama arrival time by searching for the last matching stop
    // (Some routes originate from Yokohama, so order-based indexing is unsafe)
    let ykhObj = null;
    if (typeof objs.findLast === 'function') {
        ykhObj = objs.findLast(o => o[ODPT.BUSSTOP_POLE] === yokohamaPoleId);
    } else {
        // Fallback for environments without Array.prototype.findLast
        const matches = objs.filter(o => o[ODPT.BUSSTOP_POLE] === yokohamaPoleId);
        ykhObj = matches[matches.length - 1];
    }

    //debugLog('[PARSE] ykhObj raw:', JSON.stringify(ykhObj));
    
    const yokohamaArrival = ykhObj?.[ODPT.ARRIVAL_TIME] ?? null;
    //debugLog('Yokohama arrival time found:', yokohamaArrival);

    // Initialize departure-time object with all known bus stop names
    // Example:
    // { "YNU Main Gate": [], "Kokudai Chuo": [], ... }
    const departureTime = {};
    ALL_STATION_NAMES.forEach(name => {
      departureTime[name] = [];
    });

    // Populate departure times by matching bus stop pole IDs
    // ID-based matching avoids dependency on array order
    objs.forEach(o => {
      const id = o[ODPT.BUSSTOP_POLE];
      const time = o[ODPT.DEPARTURE_TIME];

      // Check if the ID exists in the configuration and has a departure time
      if (ID_TO_NAME_MAP[id] && time) {
        const name = ID_TO_NAME_MAP[id];
        
        // Push into the corresponding station-name array
        // Different IDs with the same name are merged naturally
        departureTime[name].push(time);
      }
    });

    // Arrival-time container
    // Use empty arrays instead of null to keep data structure consistent
    const arrivalTime = {
      [P.MITSUZAWA_KAMIMACHI.name]: [],  
      [P.YOKOHAMA_NISHIGUCHI.name]: yokohamaArrival
    };

    /*debugLog('parseOneTable:result', {
      busroute: tb[ODPT.BUS_ROUTE_PATTERN] ?? null,
      operator: tb[ODPT.OPERATOR] ?? null,
      yokohamaArrival,
      nonEmptyStops: Object.entries(departureTime)
        .filter(([_, times]) => Array.isArray(times) && times.length > 0)
        .map(([stop, times]) => ({ stop, times }))
    });*/

    /*const hasAnyDeparture = Object.values(departureTime).some(
      times => Array.isArray(times) && times.length > 0
    );
    debugLog(`[PARSE]   hasAnyDeparture: ${hasAnyDeparture}`, 
      Object.fromEntries(
        Object.entries(departureTime).filter(([, v]) => v.length > 0)
      )
    );*/

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

  // Extract only timetables that contain at least one valid departure time
  const candidates = [];
  for (const tb of timetables) {   
    const busData = parseOneTable(tb);  
    if (Object.values(busData.departureTime).some(times => 
      Array.isArray(times) && times.length > 0
    )) {
        candidates.push(busData);
      }
  }
  //debugLog('Valid candidates found:', candidates.length);

  //debugLog('[RESULT] candidates count:', candidates.length);
  //debugLog('[RESULT] routes:', candidates.map(b => b.busroute));

  function getEarliestDepartureMin(busData) {
    const allTimes = Object.values(busData.departureTime).flat();
    const valid = allTimes.filter(t => typeof t === "string" && t.includes(":"));
    if (valid.length === 0) return Number.POSITIVE_INFINITY;
    return Math.min(...valid.map(toMin));
  }

  // Sort candidates by earliest departure time across all target stops
  const sorted = candidates.sort((a, b) =>
    getEarliestDepartureMin(a) - getEarliestDepartureMin(b)
  );

  /*debugLog('Sorted buses count:', sorted.length);
  debugLog('First 3 buses earliest departure times:', 
    sorted.slice(0, 3).map(b => getEarliestDepartureMin(b))
  );*/

  /*debugLog('[OUTPUT] sorted buses sample (first 3):',
    JSON.stringify(
      sorted.slice(0, 3).map(b => ({
        busroute: b.busroute,
        departureTime: Object.fromEntries(
          Object.entries(b.departureTime).filter(([, v]) => Array.isArray(v) && v.length > 0)
        )
      })),
      null, 2  
    )
  );*/
  
  return sorted;
}