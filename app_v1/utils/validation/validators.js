// utils/validation/validators.js
/**
 * @module utils/validation/validators.js
 *
 * リクエストパラメータのバリデーション関数群
 */

import { BadRequest } from "./errors.js";

export function validateQuery(q) {
  const lat = Number(q.lat);
  const lng = Number(q.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new BadRequest("lat/lng must be numbers");
  }

  const speedId = q.speedId ? String(q.speedId) : undefined;
  let limit;
  if (q.limit != null) {
    limit = Number(q.limit);
    if (!Number.isInteger(limit) || limit <= 0) {
      throw new BadRequest("limit must be a positive integer");
    }
  }
  return { lat, lng, speedId, limit };
}