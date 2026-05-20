/**
 * @file defaults.js
 * @summary APIキーを環境変数から読み込む処理
 */

import 'dotenv/config';

export const BASE = 'https://api.odpt.org/api/v4/';
export const CHL_BASE = 'https://api-challenge.odpt.org/api/v4/';

const API_KEY_NAME = 'ODPT_API_KEY';
const CHL_API_KEY_NAME = 'ODPT_CHL_API_KEY';

export const KEY = process.env[API_KEY_NAME]?.trim() ?? null;
export const CHL_KEY = process.env[CHL_API_KEY_NAME]?.trim() ?? null;

export function assertKeys() {
  if (!KEY)  throw new Error(`You haven't set the required API key: ${API_KEY_NAME} in .env`);
  if (!CHL_KEY) throw new Error(`You haven't set the required API key: ${CHL_API_KEY_NAME} in .env`);
}