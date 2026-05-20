/*
 * @file app/services/adapters/sotetsu2Yokohama.js
 * @summary Sotetsu Line Timetable Adapter
 * 
 * This module fetches train timetable data from the ODPT (Open Data Platform for Public Transportation) API
 * for the Sotetsu railway line and transforms it into a normalized format. It handles multiple departure stations,
 * calculates arrival times at Yokohama Station (or other specified destinations), and accounts for day boundaries
 * (trains departing after midnight). The module supports both weekday and holiday calendars.
 * 
 * Key features:
 * - Fetches real-time timetable data from ODPT API
 * - Supports multiple departure stations along the Sotetsu Line
 * - Handles midnight rollover for late-night/early-morning trains
 * - Distinguishes between weekday and holiday schedules
 * - Returns normalized timetable data sorted by arrival time
 * 
 * @see https://developer.odpt.org/ for ODPT API documentation
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { CHL_BASE, CHL_KEY } from "../../config/defaults.js";  // API key and base URL
import * as Utils from "../../utils/utils.js";                   
import isHolidaySotetsu from "../../utils/date/isHolidaySotetsu.js";  // Holiday checker for Sotetsu
import { SOTETSU } from "../../config/index.js";
import { STATIONS, YOKOHAMA } from "../../config/geo/stations/sotetsuStations.js";
import * as calendarUtils from "../../utils/date/calendar.js";
import { MINUTES_PER_DAY } from "../../config/constants/timeConstants.js";
import { ODPT_FIELDS } from "../../config/OdptAPIfield/odptApiField.js";
import { createDebugLogger, createDebugErrorLogger } from "../../utils/debug/debug.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create debug loggers for this module
const debugLog = createDebugLogger('Sotetsu');
const debugError = createDebugErrorLogger('Sotetsu');

// Default configuration for Sotetsu train timetable
const DEFAULT_SOTETSU_OPTS = SOTETSU;
const ODPT = ODPT_FIELDS;

// Default departure stations generated from the station config
const DEFAULT_DEPART_STATIONS = Object.values(STATIONS).map(s => ({
  id: s.id,       // odpt Station ID
  label: s.name,  // Human-readable station name
}));

/**
 * @abstract Fetch Sotetsu train timetable data
 * @param {string} calendar - Calendar type ("Weekday" or "Holiday")
 * @param {object} opts - Options for fetching the timetable
 * @returns {Promise<Array>} Timetable data returned from the ODPT API
 */
/*async function getSotetsuTrainTimeTable(calendar, opts = DEFAULT_SOTETSU_OPTS) {
  const url = Utils.buildUrl(CHL_BASE, ODPT.TRAIN_TIMETABLE, {  // build URL for ODPT API
    [ODPT.OPERATOR]: opts.operator,
    [ODPT.RAILWAY]: opts.railway,
    [ODPT.CALENDAR]: `${opts.calendar}${calendar}`,
    [ODPT.RAIL_DIRECTION]: opts.railDirection,
    [ODPT.CONSUMER_KEY]: CHL_KEY
  });
  
  try {
    return await Utils.fetchJson(url, { timeout: opts.timeoutMs });
  } catch (error) {
    console.error(`Failed to fetch timetable: ${error.message}`);
    throw new Error("時刻表の取得に失敗しました", { cause: error });
  }
}*/

/**
 * @abstract Load Sotetsu train timetable data from local JSON files
 * @param {string} calendar - Calendar type ("Weekday" or "Holiday")
 * @returns {Promise<Array>} Timetable data loaded from local JSON
 */
async function getSotetsuTrainTimeTable(calendar) {
  const filename = calendar === "Holiday" 
  ? "SaturdayHolidayData_202260313.json"
  : "WeekdayData_202260313.json";

  const filePath = path.resolve(
    __dirname,
    "../../apidata/sotetsu2Yokohama",
    filename
  );

  try {
    const text = await readFile(filePath, "utf-8");
    const json = JSON.parse(text);

    if (!Array.isArray(json)) {
      throw new Error("JSONの形式が不正です。配列ではありません。");
    }

    debugLog(`Loaded timetable JSON: ${filename}, count=${json.length}`);
    return json;
  } catch (error) {
    debugError(`Failed to load timetable JSON: ${error.message}`);
    throw new Error("時刻表JSONの読み込みに失敗しました", { cause: error });
  }
}

/**
 * @abstract Format and return Sotetsu train timetables for specified stations
 * @param {string} arriveId - Station ID to be used as the arrival destination (default: Yokohama Station)
 * @param {Date} serviceDay - Date for which the timetable should be fetched
 * @param {Array} departStations - Array of departure station objects with id and label
 * @param {object} opts - Options for timetable extraction and filtering
 * @returns {Promise<Array>} Formatted Sotetsu train timetable data
 */
export async function extractSotetsuTimetable(
  arriveId = YOKOHAMA.id,
  serviceDay = new Date(),
  departStations = DEFAULT_DEPART_STATIONS,
  opts = DEFAULT_SOTETSU_OPTS
){
  // Convert "HH:mm" time strings to minutes
  const toMin = (hhmm) => Utils.timeToMinutes(hhmm);

  // Determine whether the given date is a holiday for Sotetsu
  const isHoliday = isHolidaySotetsu(serviceDay);
  const ref = opts.refMinutes;  // Reference time (in minutes 1700) used for day-boundary handling

  // Resolve ODPT calendar string (Weekday / Holiday) for Sotetsu
  const calendar = calendarUtils.resolveCalendar("Sotetsu", isHoliday);

  // Fetch raw timetable data from the ODPT API
  const timetables = await getSotetsuTrainTimeTable(calendar, opts);
  const stationMap = new Map(departStations.map(s => [s.id, s.label]));

  // Extract departure and arrival times from a single train entry
  const scanOne = (tb) => {  // tb represents one train timetable object
    const departureByLabel = {}; // { "和田町": "05:06", ... }
    let arriveTime = null;

    const objs = tb[ODPT.TRAIN_TIMETABLE_OBJECT] || [];  // Timetable entries for this train
    for (const o of objs) {
      const stationId = o[ODPT.DEPARTURE_STATION];

      if (stationMap.has(stationId) && o[ODPT.DEPARTURE_TIME]) {
        const label = stationMap.get(stationId); // Get station name corresponding to the ID
        if (!departureByLabel[label]) {
          departureByLabel[label] = o[ODPT.DEPARTURE_TIME];
        }
      }

      // Pick the arrival time at the specified destination station (first match)
      if (!arriveTime
        && o[ODPT.ARRIVAL_STATION] === arriveId
        && o[ODPT.ARRIVAL_TIME]
      ) {
        arriveTime = o[ODPT.ARRIVAL_TIME];
      }
    }
    return { departureByLabel, arriveTime };
  };

  const candidates = [];
  for (const tb of timetables) {
    const { departureByLabel, arriveTime } = scanOne(tb);

    // Choose the first available departure time among the departure stations as the pivot
    let pivotTime = null;
    for (const s of departStations) {
      if (departureByLabel[s.label]) {
        pivotTime = departureByLabel[s.label];
        break;
      }
    }
    if (!pivotTime) {   // Skip trains that don't depart from any configured station
      if (opts.verbose) console.warn(`Train ${tb[ODPT.TRAIN]} has no departure from configured stations`);
      continue;  
    }

    if (!arriveTime) continue;  // Skip trains that don't reach the destination station

    const dMin = toMin(pivotTime);
    if (!Number.isFinite(dMin)) continue;

    // Convert departure time into an absolute "future" time across midnight
    const dAbs = Utils.futureAbs(dMin, ref);       

    // Also compute absolute arrival time (useful for ordering and "next train" logic)
    let aAbs = Infinity;                      
    if (arriveTime) {
      const aMinRaw = toMin(arriveTime);
      if (!Number.isFinite(aMinRaw)) {
        console.warn(`Invalid arrival time: ${arriveTime}`);
        continue;
      }
      aAbs = Utils.futureAbs(aMinRaw, ref);
      if (aAbs < dAbs) aAbs += MINUTES_PER_DAY;// Ensure arrival is after departure (next day if needed)
    }

    // Store a normalized candidate object (keeps output shape consistent with other providers)
    candidates.push({  
      trainId: tb[ODPT.TRAIN] ?? null,              // Train ID
      trainNumber: tb[ODPT.TRAIN_NUMBER] ?? null,   // Train Number
      operator: tb[ODPT.OPERATOR] ?? null,          // Operator
      departureTime: departureByLabel,              // { label: "HH:mm", ... }           
      arrivalTime: arriveTime ?? null,              // Arrival time at destination ("HH:mm")
      dAbs,                                         // Internal: absolute departure minutes
      aAbs,                                         // Internal: absolute arrival minutes
      minutesUntil: dAbs - ref,                     // Minutes until departure from reference
      delay: null,                                  // Delay status (for consistency, always null)
      trainType: tb[ODPT.TRAIN_TYPE] ?? null,       // Train type (e.g., express)
      fromstation: null,                            // (Kept for a unified return format)
      toStation: null,                              // (Kept for a unified return format)
      destinationStation: tb["odpt:destinationStation"]?.[0] // Destination station ID
    })
  }

  // ODPT results are not guaranteed to be sorted, 
  // so sort by arrival (then departure) in absolute minutes
  const sorted = candidates.sort((a, b) =>   // Spread syntax to avoid mutating original
    (a.aAbs - b.aAbs) || (a.dAbs - b.dAbs)
  );

  // Remove internal fields used for calculations and return only the public payload
  return sorted.map(({ aAbs, dAbs, minutesUntil, ...rest }) => rest);
}