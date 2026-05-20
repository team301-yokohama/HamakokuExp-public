import { BASE, KEY } from "../../config/defaults.js";
import * as Utils from '../../utils/utils.js';
import isholiday from '../../utils/date/isholidays.js';
import { createDebugLogger, createDebugErrorLogger } from "../../utils/debug/debug.js";

import { promises as fsPromises } from 'fs';
import path from 'path';

const debugLog = createDebugLogger('Mitsukami2Yokohama');  // デバッグログ表示用関数
const debugError = createDebugErrorLogger('Mitsukami2Yokohama');

const SAVE_DIR = path.join(process.cwd(), 'apidata', 'Mitsukami2Yokohama');  // 保存先ディレクトリのパス

// オンメモリキャッシュの箱
const memoryCache = { location: { timeString: null, data: [] } };

// API制限回避のためのスリープ関数
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ディレクトリの存在を確認する関数
async function ensureDirectory(dir) {
    try {
        await fsPromises.mkdir(dir, { recursive: true });
    } catch (err) {
        if (err.code !== 'EEXIST') throw err;
    }
}

/**
* @abstract ファイルからデータを読み込み、存在しない場合はfetchFnでデータを取得して保存する関数
* @param {string} filePath - データを保存するファイルのパス
* @param {function} fetchFn - データを取得するための非同期関数
*/
async function getOrFetch(filePath, fetchFn) {
    try {
        const data = await fsPromises.readFile(filePath, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        const freshData = await fetchFn();
        if (freshData) {
            await fsPromises.writeFile(filePath, JSON.stringify(freshData, null, 2), 'utf-8');
        }
        return freshData || [];
    }
}

// APIから列車の時刻表を取得する関数
async function fetchTrainDia(targetDate) {
    const url = Utils.buildUrl(BASE, 'odpt:TrainTimetable', {
        'odpt:operator': 'odpt.Operator:YokohamaMunicipal',
        'acl:consumerKey': KEY,
        'odpt:railDirection': 'odpt.RailDirection:Outbound',
        'odpt:railway': 'odpt.Railway:YokohamaMunicipal.Blue',
        'odpt:calendar': `odpt.Calendar:${isholiday(targetDate) ? 'SaturdayHoliday' : 'Weekday'}`
    });
    return await Utils.fetchJson(url);
}

// APIから列車の位置情報を取得する関数
async function fetchLocation() {
    const url = Utils.buildUrl(BASE, 'odpt:Train', {
        'odpt:operator': 'odpt.Operator:YokohamaMunicipal',
        'acl:consumerKey': KEY,
        'odpt:railDirection': 'odpt.RailDirection:Outbound',
        'odpt:railway': 'odpt.Railway:YokohamaMunicipal.Blue'
    });
    return await Utils.fetchJson(url);
}

async function fetchStationDia(targetDate) {
    const url = Utils.buildUrl(BASE, 'odpt:StationTimetable', {
        'odpt:operator': 'odpt.Operator:YokohamaMunicipal',
        'acl:consumerKey': KEY,
        'odpt:railDirection': 'odpt.RailDirection:Outbound',
        'odpt:station': 'odpt.Station:YokohamaMunicipal.Blue.MitsuzawaKamicho',
        'odpt:calendar': `odpt.Calendar:${isholiday(targetDate) ? 'SaturdayHoliday' : 'Weekday'}`
    });
    return await Utils.fetchJson(url);
}

export async function buildJson(targetDate) {
    if (!KEY || KEY === 'YOUR_ACCESS_TOKEN_HERE') throw new Error('[Error] Valid API key is not set');
    await ensureDirectory(SAVE_DIR);

    const nowDate = new Date().toISOString().split('T')[0];
    const isToday = (targetDate === nowDate);
    const nowHM = Utils.getCurrentTime();

    // 時間をファイル名に含めず、1日1ファイルにする
    const trainDiaPath = path.join(SAVE_DIR, `trainDia_${targetDate}.json`);
    const stationDiaPath = path.join(SAVE_DIR, `stationDia_${targetDate}.json`);
    const locationPath = path.join(SAVE_DIR, `location_${targetDate}.json`);

    // 1. 時刻表データの取得 (直列にして、間にスリープを挟む)
    const trainDia = await getOrFetch(trainDiaPath, () => fetchTrainDia(targetDate));
    await sleep(500); // 429回避
    const stationDia = await getOrFetch(stationDiaPath, () => fetchStationDia(targetDate));

    // 2. 列車位置情報の取得 (1分経過していれば上書き)
    let locations = null;
    if (isToday) {
        if (memoryCache.location.timeString === nowHM) {
            locations = memoryCache.location.data;
        } else {
            try {
                // ファイルの更新日時を確認し、60秒以内ならファイルから読む
                const stats = await fsPromises.stat(locationPath);
                if (Date.now() - stats.mtimeMs < 60000) {
                    const data = await fsPromises.readFile(locationPath, 'utf8');
                    locations = JSON.parse(data);
                } else {
                    throw new Error('Cache Expired'); // 60秒以上経過していたらAPIを叩く
                }
            } catch (e) {
                await sleep(500);
                locations = await fetchLocation();
                if (locations) {
                    await fsPromises.writeFile(locationPath, JSON.stringify(locations, null, 2), 'utf-8');
                }
            }
            memoryCache.location.timeString = nowHM;
            memoryCache.location.data = locations || [];
        }
    }

    // 3. データ統合
    const results = [{
        date: targetDate,
        currentTime: nowHM
    }];

    if (!Array.isArray(stationDia)) {
        debugError('Invalid stationDia format:', stationDia);
        return results;
    }

    stationDia.forEach(item => {
        const scheduleObjects = item["odpt:stationTimetableObject"] || [];
        
        scheduleObjects.forEach(train => {
            const trainNumber = train["odpt:trainNumber"];
            const loca = locations?.find(loc => loc["odpt:trainNumber"] === trainNumber);
            const diaRecord = trainDia?.find(dia => dia["odpt:trainNumber"] === trainNumber);
            
            const arrivalStation = diaRecord?.["odpt:trainTimetableObject"]?.find(
                dia => dia["odpt:arrivalStation"] === "odpt.Station:YokohamaMunicipal.Blue.Yokohama"
            );

            results.push({
                trainNumber,
                departureTime: train["odpt:departureTime"],
                arrivalTime: arrivalStation?.["odpt:arrivalTime"] || null,
                delay: loca?.["odpt:delay"] ?? null,
                trainType: loca?.["odpt:trainType"] || null,
                fromStation: loca?.["odpt:fromStation"] || null,
                toStation: loca?.["odpt:toStation"] || null,
                originStation: loca?.["odpt:originStation"] || null,
                destinationStation: train["odpt:destinationStation"] || null,
            });
        });
    });

    return results;
}