// 横浜市営バスの時刻表データを取得するモジュール
import { BASE, KEY } from "../../config/defaults.js";
import * as Utils from '../../utils/utils.js';
import { ServiceIds } from '../../utils/serviceID_YokohamaMunicipalBus.js';
import { createDebugLogger, createDebugErrorLogger } from "../../utils/debug/debug.js";

import { promises as fs } from 'fs';
import path from 'path';

const debugLog = createDebugLogger('HelloCycle');
const debugError = createDebugErrorLogger('HelloCycle');

const API_BASE_URL = BASE;
const SAVE_DIR = path.join(process.cwd(), 'apidata', 'YokohamaMunicipalBus2Yokohama');

// オンメモリキャッシュ
const memoryCache = { location: { timeString: null, data: [] } };

// API制限回避のためのスリープ関数
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function ensureDir(dir) {
    try {
        await fs.mkdir(dir, { recursive: true });
    } catch (err) {
        if (err.code !== 'EEXIST') throw err;
    }
}

function getTodayYYYYMMDD() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
}

const busroutePatterns = [
    "odpt.BusroutePattern:YokohamaMunicipal.20202.03_1", "odpt.BusroutePattern:YokohamaMunicipal.20202.03_2",
    "odpt.BusroutePattern:YokohamaMunicipal.20202.03_3", "odpt.BusroutePattern:YokohamaMunicipal.20204.03_1",
    "odpt.BusroutePattern:YokohamaMunicipal.20204.03_2", "odpt.BusroutePattern:YokohamaMunicipal.20204.03_3",
    "odpt.BusroutePattern:YokohamaMunicipal.20206.03_1", "odpt.BusroutePattern:YokohamaMunicipal.20206.03_2",
    "odpt.BusroutePattern:YokohamaMunicipal.20206.03_3", "odpt.BusroutePattern:YokohamaMunicipal.20800.03_1",
    "odpt.BusroutePattern:YokohamaMunicipal.32902.03_1", "odpt.BusroutePattern:YokohamaMunicipal.32904.03_1",
    "odpt.BusroutePattern:YokohamaMunicipal.20102.03_2", "odpt.BusroutePattern:YokohamaMunicipal.20102.03_3",
    "odpt.BusroutePattern:YokohamaMunicipal.20900.03_1", "odpt.BusroutePattern:YokohamaMunicipal.20110.03_1"
];

const busrouteNumbers = [201, 202, 208, 209, 329];

const Depbusstops = {
    国大西: ["odpt.BusstopPole:YokohamaMunicipal.KokudaiNishi.1878.1"],
    国大北: ["odpt.BusstopPole:YokohamaMunicipal.KokudaiKita.1877.1", "odpt.BusstopPole:YokohamaMunicipal.KokudaiKita.1877.2"],
    国大中央: ["odpt.BusstopPole:YokohamaMunicipal.KokudaiChuo.1876.1", "odpt.BusstopPole:YokohamaMunicipal.KokudaiChuo.1876.2"],
    大学会館前: ["odpt.BusstopPole:YokohamaMunicipal.DaigakuKaikanMae.3051.1"],
    国大南門: ["odpt.BusstopPole:YokohamaMunicipal.KokudaiMinamimon.1879.1"],
    横浜新道: ["odpt.BusstopPole:YokohamaMunicipal.YokohamaShindo.7814.1", "odpt.BusstopPole:YokohamaMunicipal.YokohamaShindo.7814.2", "odpt.BusstopPole:YokohamaMunicipal.YokohamaShindo.7814.3"],
    岡沢町: ["odpt.BusstopPole:YokohamaMunicipal.OkazawaCho.825.1", "odpt.BusstopPole:YokohamaMunicipal.OkazawaCho.825.2"],
};

const Arrbusstops = {
    三ツ沢上町駅前: ["odpt.BusstopPole:YokohamaMunicipal.MitsuzawaKamichoStation.6209.1"],
    横浜駅西口: [
        "odpt.BusstopPole:YokohamaMunicipal.YokohamaStationWestEntrance.7813.5", "odpt.BusstopPole:YokohamaMunicipal.YokohamaStationWestEntrance.7813.6",
        "odpt.BusstopPole:YokohamaMunicipal.YokohamaStationWestEntrance.7813.1", "odpt.BusstopPole:YokohamaMunicipal.YokohamaStationWestEntrance.7813.2",
        "odpt.BusstopPole:YokohamaMunicipal.YokohamaStationWestEntrance.7813.3", "odpt.BusstopPole:YokohamaMunicipal.YokohamaStationWestEntrance.7813.4",
        "odpt.BusstopPole:YokohamaMunicipal.YokohamaStationWestEntrance.7813.11", "odpt.BusstopPole:YokohamaMunicipal.YokohamaStationWestEntrance.7813.14",
        "odpt.BusstopPole:YokohamaMunicipal.YokohamaStationWestEntrance.7813.15", "odpt.BusstopPole:YokohamaMunicipal.YokohamaStationWestEntrance.7813.23",
        "odpt.BusstopPole:YokohamaMunicipal.YokohamaStationWestEntrance.7813.31", "odpt.BusstopPole:YokohamaMunicipal.YokohamaStationWestEntrance.7813.32",
    ],
};

function today_busroutePattern(service_ids) {
    return busroutePatterns.filter(pattern => {
        const id = pattern.split('.').pop();
        return service_ids.includes(id);
    });
}

function buildUrlLikeURLSearchParams(base, apiPath, params = {}) {
    const encoded = {};
    for (const [k, v] of Object.entries(params)) {
        if (v == null) continue;
        encoded[encodeURIComponent(k)] = v;
    }
    return Utils.buildUrl(base, apiPath, encoded);
}

// 時刻表を取得 (直列処理 + スリープ)
async function fetchBusTimetable() {
    if (!KEY || KEY === 'YOUR_ACCESS_TOKEN_HERE') throw new Error('エラー: 有効なAPIキーが設定されていません。');

    const serviceIds = await ServiceIds(getTodayYYYYMMDD());
    const patterns = today_busroutePattern(serviceIds);
    const results = [];

    for (const busroutePattern of patterns) {
        const API_URL = buildUrlLikeURLSearchParams(API_BASE_URL, "odpt:BusTimetable", {
            "odpt:operator": "odpt.Operator:YokohamaMunicipal",
            "acl:consumerKey": KEY,
            "odpt:busroutePattern": busroutePattern,
        });

        try {
            const apiresult = await Utils.fetchJson(API_URL);
            if (apiresult && Array.isArray(apiresult)) {
                for (const eachroute of apiresult) {
                    const departureTime = {};
                    const arrivalTime = {};
                    const timetables = eachroute["odpt:busTimetableObject"];
                    const poleTimeMap = {};

                    for (const t of timetables) poleTimeMap[t["odpt:busstopPole"]] = t["odpt:arrivalTime"] || t["odpt:departureTime"];

                    for (const [stopname, poles] of Object.entries(Depbusstops)) {
                        const stop = [];
                        for (const pole of poles) {
                            const foundStop = timetables.find(e => e["odpt:busstopPole"] === pole);
                            if (foundStop) stop.push(foundStop["odpt:departureTime"]);
                        }
                        const name = stopname === "横浜新道" ? (stop["odpt:busstopPole"] === "odpt.BusstopPole:YokohamaMunicipal.YokohamaShindo.7814.3" ? "横浜新道(あおば前)" : "横浜新道(新道)") : stopname;
                        departureTime[name] = stop;
                    }

                    for (const [stopname, poles] of Object.entries(Arrbusstops)) {
                        const stop = [];
                        for (const pole of poles) {
                            const foundStop = timetables.find(e => e["odpt:busstopPole"] === pole && e["odpt:index"] > 4);
                            if (foundStop) {
                                stop.push(foundStop["odpt:arrivalTime"]);
                                break;
                            }
                        }
                        arrivalTime[stopname] = stop;
                    }

                    results.push({
                        busTimetable: eachroute["owl:sameAs"],
                        busroute: busroutePattern,
                        operator: eachroute["odpt:operator"],
                        departureTime: departureTime,
                        arrivalTime: arrivalTime,
                        poleTimeMap: poleTimeMap
                    });
                }
            }
        } catch (error) {
            debugError(`Timetable API Error (${busroutePattern}):`, error);
        }
        await sleep(500); // 429エラー回避
    }
    return results;
}

// 位置情報を取得 (直列処理 + スリープ)
async function fetchBusLocation() {
    if (!KEY || KEY === 'YOUR_ACCESS_TOKEN_HERE') throw new Error('エラー: 有効なAPIキーが設定されていません。');

    const results = [];
    for (const num of busrouteNumbers) {
        const url = buildUrlLikeURLSearchParams(API_BASE_URL, "odpt:Bus", {
            "odpt:operator": "odpt.Operator:YokohamaMunicipal",
            "acl:consumerKey": KEY,
            "odpt:busroute": `odpt.Busroute:YokohamaMunicipal.${num}`,
        });
        
        try {
            const apiresult = await Utils.fetchJson(url);
            if (apiresult && Array.isArray(apiresult)) {
                const mapped = apiresult.map(bus => ({
                    busTimetable: bus["odpt:busTimetable"],
                    busNumber: bus["odpt:busNumber"],
                    busType: null,
                    fromBusstopPole: bus["odpt:fromBusstopPole"],
                    toBusstopPole: bus["odpt:toBusstopPole"],
                    destinationBusstopPole: bus["odpt:terminalBusstopPole"],
                    occupancyStatus: bus["odpt:occupancyStatus"],
                }));
                results.push(...mapped);
            }
        } catch (error) {
            debugError(`Location API Error (${num}):`, error);
        }
        await sleep(500); // 429エラー回避
    }
    return results;
}

export async function buildJson(targetDate) {
    await ensureDir(SAVE_DIR);

    const nowDate = new Date().toISOString().split('T')[0];
    const isToday = (targetDate === nowDate);
    const nowHM = Utils.getCurrentTime();
    
    // 時間をファイル名に含めず、1日1ファイルにする
    const timetablePath = path.join(SAVE_DIR, `timetable_${targetDate}.json`);
    const locationPath = path.join(SAVE_DIR, `location_${targetDate}.json`);

    let timetableData = [];
    let locationData = [];

    // 1. 時刻表の取得
    try {
        const raw = await fs.readFile(timetablePath, 'utf-8');
        timetableData = JSON.parse(raw);
    } catch (e) {
        timetableData = await fetchBusTimetable();
        await fs.writeFile(timetablePath, JSON.stringify(timetableData, null, 2), 'utf-8');
    }

    // 2. 位置情報の取得 (1分経過していれば上書き)
    if (isToday) {
        if (memoryCache.location.timeString === nowHM) {
            locationData = memoryCache.location.data;
        } else {
            try {
                // ファイルの更新日時を確認し、60秒以内ならファイルから読む
                const stats = await fs.stat(locationPath);
                if (Date.now() - stats.mtimeMs < 60000) {
                    const raw = await fs.readFile(locationPath, 'utf-8');
                    locationData = JSON.parse(raw);
                } else {
                    throw new Error('Cache Expired'); // 60秒以上経過していたらAPIを叩く
                }
            } catch (e) {
                await sleep(500);
                locationData = await fetchBusLocation();
                await fs.writeFile(locationPath, JSON.stringify(locationData, null, 2), 'utf-8');
            }
            memoryCache.location.timeString = nowHM;
            memoryCache.location.data = locationData;
        }
    }

    // 3. データの結合と遅延計算
    return timetableData.map(timetable => {
        const loc = locationData.find(l => l.busTimetable === timetable.busTimetable);
        let delay = null;
        
        if (loc) {
            const pole = loc.toBusstopPole || loc.fromBusstopPole;
            if (pole && timetable.poleTimeMap && timetable.poleTimeMap[pole]) {
                const planTime = timetable.poleTimeMap[pole];
                delay = Math.max(0, Utils.timeToMinutes(nowHM) - Utils.timeToMinutes(planTime));
            }
        }

        return {
            busNumber: loc ? loc.busNumber : null,
            busTimetable: timetable.busTimetable,
            busroute: `YokohamaMunicipal.${timetable.busroute.split('.')[2].split('').slice(0, 3).join('')}`,
            departureTime: timetable.departureTime,
            arrivalTime: timetable.arrivalTime,
            delay: delay,
            busType: loc ? loc.busType : null,
            fromBusstopPole: loc ? loc.fromBusstopPole : null,
            toBusstopPole: loc ? loc.toBusstopPole : null,
            destinationBusstopPole: loc ? loc.destinationBusstopPole : null,
            occupancyStatus: loc ? loc.occupancyStatus : null,
        };
    });
}