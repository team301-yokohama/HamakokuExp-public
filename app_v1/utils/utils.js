/**
 * @file General-purpose helper functions for date manipulation, 
 * number formatting, and URL construction.
 * @abstract A collection of utility functions used across the project.
 * @module utils
 * @author pero1031
 * @version 1.05
 * @since 2025-10-06
 */

import { MINUTES_PER_DAY } from "../config/constants/timeConstants.js";

//----------- Time Related Utilities -----------------------------------------
/**
 * @abstract Converts the current time to "hh:mm" format.
 * @detail Uses the standard Date object to retrieve local hours and minutes.
 * While Date objects are UTC-based internally, getter methods return local time.
 * @return {string} Current time in "hh:mm" format (e.g., "14:33").
 */
export function getCurrentTime() {
  const now = new Date();         
  const hh = String(now.getHours()).padStart(2, "0");     
  const mm = String(now.getMinutes()).padStart(2, "0");   
  return `${hh}:${mm}`;  
}

/**
 * @abstract Converts the current time into total minutes (0–1439).
 * @detail Calculates elapsed minutes from the start of the day (hours * 60 + minutes).
 * Used primarily for sorting schedules or calculating time differences 
 * relative to the current time.
 * @return {number} Total minutes since midnight (e.g., 14:33 -> 873).
 */
export function getCurrentMinutes() {
  const now = new Date();                 
  return now.getHours() * 60 + now.getMinutes();
}

/** 
* @abstract Converts "HH:mm" string to total minutes (0–1439).
* @detail Splits the input string and maps it to numerical values. 
* Uses modulo 1440 to ensure the result stays within a single day.
* @param {string} hhmm - Time string in "HH:mm" format.
* @return {number|null} Total minutes or null if input is invalid.
*/
export function timeToMinutes(hhmm) {
  const [h, m] = String(hhmm).split(":").map(Number);  
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return (h * 60 + m) % (24 * 60);  // mod 1440 
}

/**
 * @abstract Extended conversion for railway schedules, supporting late-night hours.
 * @detail Handles "over-24-hour" notation common in Japanese transit schedules.
 * - Accepts hours from 0 to 27.
 * - Treats 0:00–3:59 as "late night" of the previous day by adding 24 hours (24:00–27:59).
 * This ensures the time value increases monotonically for late-night operations.
 *
 * @param {string|number|null} hhmm - Time string (e.g., "25:12", "03:45").
 * @returns {number|null} Total minutes (e.g., "25:12" -> 1512, "01:00" -> 1500).
 * @throws {RangeError} If time format or range is invalid.
 */
export function timeToMinutesExtended(hhmm) {
  let [h, m] = String(hhmm).split(":").map(Number);

  if (
    Number.isNaN(h) ||
    Number.isNaN(m) ||
    m < 0 || m >= 60 ||
    h < 0 || h >= 28
  ) {
    if(hhmm == null) {
      // console.error(`[timeToMinutesExtended : calculation notion0] Invalid format: null`);
      return null;
    }
    throw new RangeError(`Invalid railway time: ${hhmm}`);
  }

  // Normalize early morning (0-3:59) to late night (24-27:59)
  if(h >= 0 && h < 4){
    h += 24;
  }
  return h * 60 + m;
}

/**
* @abstract Converts total minutes (0–1439) back to "HH:mm" format.
* @param {number} mins - Total minutes since midnight.
* @returns {string} Formatted time string "HH:mm".
*/
export function minutesToTime(mins) {
  const h = Math.floor(mins / 60) % 24;  
  const m = mins % 60;
  return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
}

/**
 * @abstract Normalizes Date, string, or number inputs into a Date object.
 * @param {Date|string|number} input - YYYYMMDD number, date string, or Date object.
 * @returns {Date|null} Valid Date object or null if parsing fails.
 */
export function parseToDate(input = new Date()) {
  if (input instanceof Date) {
    return isNaN(input.getTime()) ? null : input;
  }

  // number: YYYYMMDD
  if (typeof input === "number") {
    const s = String(input);
    if (s.length === 8) {
      const y = Number(s.slice(0, 4));
      const m = Number(s.slice(4, 6)) - 1;
      const d = Number(s.slice(6, 8));
      const date = new Date(y, m, d);
      return isNaN(date.getTime()) ? null : date;
    }
  }

  if (typeof input === "string") {
    const date = new Date(input);
    return isNaN(date.getTime()) ? null : date;
  }

  return null;
}

/**
* @abstract Adjusts time to ensure it is always in the future relative to a reference.
* @detail Treats times numerically smaller than the reference as occurring on the next day.
* @param {number} t - Target time in minutes (0–1439).
* @param {number} ref - Reference time in minutes.
* @returns {number} Adjusted absolute time in minutes.
*/
export function futureAbs(t, ref){
  const r = ((ref % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;     // Normalize reference time
  return t + (t < r ? MINUTES_PER_DAY : 0);
}

// ---- Fetch Utilities (URL Building & Requests) -----------------

/**
 * @abstract Constructs a URL with query parameters.
 * @detail Ensures proper slash handling between base and path. 
 * Automatically encodes query parameters and handles special prefixes like "./".
 * @param {string} base - The base URL.
 * @param {string} path - The endpoint path.
 * @param {Object} params - Key-value pairs for query parameters.
 * @returns {string} The complete URL string.
 */
export function buildUrl(base, path, params = {}) {
  const b = base.endsWith("/") ? base : base + "/";  
  const url = new URL("./" + path.replace(/^\.\//, ""), b);  
  const pairs = [];

  for (const [k, v] of Object.entries(params)) {
    if (v == null) continue;
    pairs.push(`${k}=${encodeURIComponent(String(v))}`);
  }
  
  if (pairs.length) {
    url.search = "?" + pairs.join("&");
  }
  return url;
}

/**
 * @abstract Fetches JSON data from the specified URL.
 * @param {string} url - The target URL for the request.
 * @param {Object} options - Configuration object including headers and timeout.
 * @returns {Promise<Object|Array>} The parsed JSON data from the response.
 */
/* Example Structure:
* [ // <--- Returned as an Array
* { // <--- First element of the array (Object)
* "@id": "urn:ucode:_00001C00000000000001000003A689D3",
* "@type": "odpt:TrainTimetable",
* "dc:date": "2025-07-01T15:00:00+09:00",
* // ... other top-level keys and values ...
* "odpt:trainTimetableObject": [ // <--- Timetable details included as a nested array
* {
* "odpt:departureTime": "06:05",
* "odpt:departureStation": "odpt.Station:Sotetsu.Main.Ebina"
* },
* // ... other station objects ...
* ]
* }
* // If the JSON contains multiple timetable objects, 
* // they will follow as subsequent elements in the array.
* ]
*/
export async function fetchJson(url, { headers = {}, timeout = 15000 } = {}) {
  const controller = new AbortController();  
  const timer = setTimeout(() => controller.abort(), timeout);  // Abort on timeout

  try {
    const res = await fetch(url, {  // Send GET request
      method: "GET",
      headers: { Accept: "application/json", ...headers },  // Expect JSON response
      signal: controller.signal  
    });

    // res.ok is false if the HTTP status code is outside the 200-299 range
    if (!res.ok) {  
      // Capture error body if it exists to provide more context
      let bodyText = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} ${res.statusText}${bodyText ? ` - ${bodyText}` : ""}`);
    }
    return await res.json();
  } finally {  // Always clear the timer regardless of success or failure
    clearTimeout(timer);
  }
}
/**
 * 2つの時刻（HH:MM形式）の間の総分数を計算します。
 * 日をまたぐ場合（終了時刻が開始時刻より前の場合）は、翌日の時刻として計算します。
 * 
 * @param {string} startTime - 開始時刻 (例: "09:30")
 * @param {string} endTime - 終了時刻 (例: "18:15" または翌日 "02:00")
 * @returns {number|null} 総分数（無効な入力の場合は null）
 */
export function calcTotalMinutes(startTime, endTime) {
  if (!startTime || !endTime || typeof startTime !== 'string' || typeof endTime !== 'string') return null;
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  const startTotal = sh * 60 + sm;
  const endTotal = eh * 60 + em;

  let diff = endTotal - startTotal;
  if (diff < 0) {
    diff += 1440;
  }

  //return (eh * 60 + em) - (sh * 60 + sm);
  return diff;
}


/**
 * 駅ID、バス停ID、施設コードなどの各種識別子（キーワード）を、
 * 対応する日本語の名称（表示用文字列）に変換します。
 * マッピングに存在しないワードが渡された場合は、入力された文字列をそのまま返します。
 * 
 * @param {string} word - 変換対象のキーワードやID (例: "RikoA", "odpt.Station:...")
 * @returns {string} 変換後の日本語文字列、または元の文字列
 */
export function convert2kanji(word) {
  const mapping = {
    // --- 大学内施設・エリア ---
    "Yaon": "野音(野外音楽堂)",
    "RikoA": "理工棟A",
    "Library": "図書館前",
    "Shokudo1": "第1食堂（シェルシュ）",
    "Shokudo2": "第2食堂（理工学部食堂）・ruhe(ルーエ)",

    // --- 例外的な駅名表記の修正 ---
    "三ッ沢上町": "三ツ沢上町",

    // --- 横浜市営地下鉄 ブルーライン（駅名変換） ---
    "odpt.Station:YokohamaMunicipal.Blue.Shonandai": "湘南台",
    "odpt.Station:YokohamaMunicipal.Blue.Shimoiizumi": "下飯田",
    "odpt.Station:YokohamaMunicipal.Blue.Tateba": "立場",
    "odpt.Station:YokohamaMunicipal.Blue.Nakada": "中田",
    "odpt.Station:YokohamaMunicipal.Blue.Odoriba": "踊場",
    "odpt.Station:YokohamaMunicipal.Blue.Totsuka": "戸塚",
    "odpt.Station:YokohamaMunicipal.Blue.Maioka": "舞岡",
    "odpt.Station:YokohamaMunicipal.Blue.Shimonagaya": "下永谷",
    "odpt.Station:YokohamaMunicipal.Blue.Kaminagaya": "上永谷",
    "odpt.Station:YokohamaMunicipal.Blue.KonanChuo": "港南中央",
    "odpt.Station:YokohamaMunicipal.Blue.Kamiooka": "上大岡",
    "odpt.Station:YokohamaMunicipal.Blue.Gumyoji": "弘明寺",
    "odpt.Station:YokohamaMunicipal.Blue.Maita": "蒔田",
    "odpt.Station:YokohamaMunicipal.Blue.Yoshinocho": "吉野町",
    "odpt.Station:YokohamaMunicipal.Blue.Bandobashi": "阪東橋",
    "odpt.Station:YokohamaMunicipal.Blue.IsezakiChojamachi": "伊勢佐木長者町",
    "odpt.Station:YokohamaMunicipal.Blue.Kannai": "関内",
    "odpt.Station:YokohamaMunicipal.Blue.Sakuragicho": "桜木町",
    "odpt.Station:YokohamaMunicipal.Blue.Takashimacho": "高島町",
    "odpt.Station:YokohamaMunicipal.Blue.Yokohama": "横浜",
    "odpt.Station:YokohamaMunicipal.Blue.MitsuzawaShimocho": "三ツ沢下町",
    "odpt.Station:YokohamaMunicipal.Blue.MitsuzawaKamicho": "三ツ沢上町",
    "odpt.Station:YokohamaMunicipal.Blue.Katakuracho": "片倉町",
    "odpt.Station:YokohamaMunicipal.Blue.KishineKoen": "岸根公園",
    "odpt.Station:YokohamaMunicipal.Blue.ShinYokohama": "新横浜",
    "odpt.Station:YokohamaMunicipal.Blue.KitaShinYokohama": "北新横浜",
    "odpt.Station:YokohamaMunicipal.Blue.Nippa": "新羽",
    "odpt.Station:YokohamaMunicipal.Blue.Nakamachidai": "仲町台",
    "odpt.Station:YokohamaMunicipal.Blue.CenterMinami": "センター南",
    "odpt.Station:YokohamaMunicipal.Blue.CenterKita": "センター北",
    "odpt.Station:YokohamaMunicipal.Blue.Nakagawa": "中川",
    "odpt.Station:YokohamaMunicipal.Blue.Azamino": "あざみ野",

    // --- 相鉄本線（駅名変換） ---
    "odpt.Station:Sotetsu.Main.Futamatagawa": "二俣川",
    "odpt.Station:Sotetsu.Main.Tsurugamine": "鶴ヶ峰",
    "odpt.Station:Sotetsu.Main.Nishiya": "西谷",
    "odpt.Station:Sotetsu.Main.KamiHoshikawa": "上星川",
    "odpt.Station:Sotetsu.Main.Wadamachi": "和田町",
    "odpt.Station:Sotetsu.Main.Hoshikawa": "星川",
    "odpt.Station:Sotetsu.Main.Tennocho": "天王町",
    "odpt.Station:Sotetsu.Main.NishiYokohama": "西横浜",
    "odpt.Station:Sotetsu.Main.Hiranumabashi": "平沼橋",
    "odpt.Station:Sotetsu.Main.Yokohama": "横浜",

    // --- 横浜市営バス（系統番号） ---
    "YokohamaMunicipal.329": "横浜市営バス 329",
    "YokohamaMunicipal.208": "横浜市営バス 208",
    "YokohamaMunicipal.202": "横浜市営バス 202",
    "YokohamaMunicipal.201": "横浜市営バス 201",
    "YokohamaMunicipal.209": "横浜市営バス 209",

    // --- 神奈中バス・相鉄バス（系統パターン・系統名） ---
    "odpt.BusroutePattern:Kanachu.01.26202.1": "01",
    "odpt.BusroutePattern:SotetsuBus.Hama10.503002.1": "浜10",
    "odpt.BusroutePattern:SotetsuBus.Hama10.503004.1": "浜10",
    "odpt.BusroutePattern:SotetsuBus.Hama11.502002.2": "浜11",
    "odpt.BusroutePattern:SotetsuBus.Hama11.502001.2": "浜11",

    // --- バス停名 ---
    "odpt.BusstopPole:SotetsuBus.Kokudaichuuou.5115.5": "国大中央",
    "odpt.BusstopPole:SotetsuBus.Hijirigaoka.5069.1": "ひじりが丘",

    // --- 車内・運行混雑状況 ---
    "odpt.OccupancyStatus:FewSeatsAvailable": "空席わずか",
    "odpt.OccupancyStatus:ManySeatsAvailable": "空いています",
    "odpt.OccupancyStatus:StandingRoomOnly": "立ち乗りのみ",
    "odpt.OccupancyStatus:Empty": "ほぼ空席",
    "odpt.OccupancyStatus:CrushedStandingRoomOnly": "非常に混んでいます",
    "odpt.OccupancyStatus:FullRoomOnly": "満員",
    "odpt.OccupancyStatus:NotAcceptingPassengers": "乗車不可",
    
    // --- 交通事業者名 ---
    "odpt.Operator:YokohamaMunicipal": "横浜市営",
    "odpt.Operator:Sotetsu": "相鉄",
    "odpt.Operator:SotetsuBus": "相鉄バス",
    "odpt.Operator:Kanachu": "神奈中バス",

    // --- その他サービス ---
    "sharecycle": "シェアサイクル"
  };

  // マッピングにあれば変換後の文字列を返し、なければ引数の文字列をそのまま返す（フォールバック処理）
  return mapping[word] || word;
}