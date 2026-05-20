// 横浜市営地下鉄の祝日判定モジュールを相鉄に適応したものです。
// 2025年末までは公式情報に基づいています。2026年以降は予想日付です。
// 祝日データを更新する場合は holidays 配列を書き換えてください。

const holidays = [
    20250320,
    20250429,
    20250101,
    20250505,
    20250506,
    20250721,
    20250811,
    20250915,
    20250923,
    20251013,
    20251103,
    20251124,
    20260101,
    20260112,
    20260211,
    20260223,
    // ここより先は予想日付です
    20260320,
    20260429,
    20260503,
    20260504,
    20260505,
    20260506,
    20260720,
    20260811,
    20260921,
    20260922,
    20260923,
    20261012,
    20261103,
    20261123,
];

// ヘルパー: Date -> 'YYYY-MM-DD'
function formatDateYMD(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

/**
 * @abstract 与えられた値（文字列・数値・Dateオブジェクト）を安全に Date 型に変換する
 * @param {*} input - Dateオブジェクト、数値、文字列
 * @returns - Date型
 */
function parseToDate(input) {
    if (input instanceof Date) {
        return isNaN(input.getTime()) ? null : input;
    }
    if (typeof input !== 'string' && typeof input !== 'number') return null;
    const s = String(input);
    // 8桁の YYYYMMDD
    if (/^\d{8}$/.test(s)) {
        const y = Number(s.slice(0, 4));
        const m = Number(s.slice(4, 6)) - 1;   // 月は0始まりなので-1
        const d = Number(s.slice(6, 8));
        const dt = new Date(y, m, d);
        if (dt.getFullYear() === y && dt.getMonth() === m && dt.getDate() === d) return dt;
        return null;
    }
    // YYYY-MM-DD など Date が解釈できる形式
    const dt = new Date(s);
    return isNaN(dt.getTime()) ? null : dt;
}

// holidays 配列を正規化して Set('YYYY-MM-DD') を作る
const holidaySet = (() => {
    const set = new Set();
    for (const h of holidays || []) {
        const d = parseToDate(h);
        if (d) set.add(formatDateYMD(d));
    }
    return set;
})();


/////////////////////////////////////////////////////////////////////////////////////////
// 
//  下の関数がエクスポートしている関数
//
/////////////////////////////////////////////////////////////////////////////////////////

/**
 * @abstract 与えられた日付が休日（または土日）かどうかを判定する
 * @param {string|number|Date} [input=new Date()] - 判定したい日付（省略時は現在日時）
 * @returns {boolean} - 休日なら true, 平日なら false
 */
export function getServiceIdsForDate(dateString) {
    try {
        const date = parseToDate(dateString);
        if (!date) {
            // 無効な日付は安全のため false (平日) を返す（型をbooleanに統一）
            return false;
        }
        const day = date.getDay(); // 0=日曜, 6=土曜
        if (day === 0) return true;
        if (day === 6) return true;

        // 祝日判定
        const key = formatDateYMD(date);
        if (holidaySet.has(key)) return true;
        return false;
    } catch (err) {
        console.error('getServiceIdsForDate error:', err && err.stack ? err.stack : err);
        return false;
    }
}

// default export（従来の「今日が休日か」を返す関数にする）
export default function isHolidaySotetsu(dateInput = new Date()) {
  return getServiceIdsForDate(dateInput);
}

// ESM default export: 呼び出し時に現在日付のサービス種別を返す
//export default getServiceIdsForDate(getdate());
