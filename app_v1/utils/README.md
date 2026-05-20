# Utils Module

This directory contains **general-purpose helper functions** used throughout this project.  
All utilities are designed to be **stateless**, **side-effect free**, and **reusable** across services, routes, and other modules.

---

## Overview

The `utils` module provides helper functions for common tasks such as:

- Time and date manipulation (including extended railway time formats)
- Converting between time formats and Date objects
- Building API request URLs
- Fetching JSON data with timeout and error handling

These utilities help reduce code duplication and keep business logic clean.

---

## Design Philosophy

- **Single Responsibility**  
  Each function does one clear, well-defined task.

- **No Global State**  
  All functions are pure or have minimal, controlled side effects.

- **Safe Defaults**  
  Functions are implemented defensively to avoid common runtime errors (e.g. malformed URLs, hanging network requests).

- **Educational Readability**  
  Code is commented with both technical explanations and practical context, making it easy for new contributors to understand.

---

## Functions

### Time Utilities

#### `getCurrentTime()`

Returns the current local time formatted as `"HH:mm"`.

```js
import { getCurrentTime } from "./utils";

const now = getCurrentTime(); // e.g. "14:33"
```

---

#### `getCurrentMinutes()`

Returns the current local time as the number of minutes elapsed since midnight (range: `0`–`1439`).

```js
import { getCurrentMinutes } from "./utils";

const nowMin = getCurrentMinutes(); // e.g. 873 (14:33)
```

**Use cases:**

- Sorting timetables by time
- Determining the next upcoming train relative to the current time
- Calculating time differences (e.g. minutes until departure)
- Normalizing schedules that cross midnight

---

#### `timeToMinutes(hhmm)`

Converts a "HH:mm" formatted time string into an absolute minute value ranging from 0 to 1439. Uses modulo 1440 to ensure the result stays within a single day.

```js
import { timeToMinutes } from "./utils";

const mins = timeToMinutes("06:30"); // 390
const wrapped = timeToMinutes("25:30"); // 90 (wrapped to next day)
```

**Returns:** `number | null` (returns `null` if input is invalid)

**This representation is especially useful for:**

- Time comparison and sorting
- Calculating time differences
- Handling schedules that cross midnight

---

#### `timeToMinutesExtended(hhmm)`

Extended conversion for railway schedules, supporting late-night hours up to 27:59. Handles "over-24-hour" notation common in Japanese transit schedules.

```js
import { timeToMinutesExtended } from "./utils";

const lateNight = timeToMinutesExtended("25:12"); // 1512
const earlyMorning = timeToMinutesExtended("01:00"); // 1500 (normalized to 25:00)
```

**Behavior:**

- Accepts hours from 0 to 27
- Treats 0:00–3:59 as "late night" of the previous day by adding 24 hours (becomes 24:00–27:59)
- Ensures monotonic time values for late-night operations
- Throws `RangeError` if time format or range is invalid
- Returns `null` for null input

**Returns:** `number | null`

**Example time mapping:**

- `"00:30"` → 1470 (treated as 24:30)
- `"03:45"` → 1665 (treated as 27:45)
- `"04:00"` → 240 (remains as 04:00)
- `"25:12"` → 1512 (stays as 25:12)

---

#### `minutesToTime(mins)`

Converts an absolute minute value (0–1439) back into a "HH:mm" formatted time string. Uses modulo 24 to wrap hours.

```js
import { minutesToTime } from "./utils";

const time = minutesToTime(390); // "06:30"
const wrapped = minutesToTime(1500); // "01:00" (25:00 wrapped)
```

---

#### `parseToDate(input)`

Normalizes various input types (Date object, string, or YYYYMMDD number) into a Date object.

```js
import { parseToDate } from "./utils";

const date1 = parseToDate(20250106); // Date object for 2025-01-06
const date2 = parseToDate("2025-01-06"); // Date object for 2025-01-06
const date3 = parseToDate(new Date()); // Validates existing Date object
const invalid = parseToDate("invalid"); // null
```

**Accepts:**

- `Date` object (validates and returns if valid)
- `number` in YYYYMMDD format (e.g. 20250106)
- `string` in any format parseable by `new Date()`
- No argument (defaults to current date)

**Returns:** `Date | null` (returns `null` if parsing fails or date is invalid)

---

#### `futureAbs(t, ref)`

Adjusts a time value to ensure it is always in the future relative to a reference time. Treats times numerically smaller than the reference as occurring on the next day.

```js
import { futureAbs } from "./utils";

const now = 1400; // 23:20 in minutes
const target = 60; // 01:00 in minutes

const adjusted = futureAbs(target, now); // 1500 (01:00 next day)
```

**Use case:** Calculating next departure times when schedules cross midnight.

**Parameters:**

- `t` (number): Target time in minutes (0–1439)
- `ref` (number): Reference time in minutes

**Returns:** `number` (adjusted absolute time in minutes)

---

### URL Utilities

#### `buildUrl(base, path, params)`

Builds a complete URL by safely combining a base URL, path, and query parameters.

```js
import { buildUrl } from "./utils";

const url = buildUrl("https://api.example.com/", "resource", {
  id: 123,
  lang: "ja",
});

// https://api.example.com/resource?id=123&lang=ja
```

**Features:**

- Prevents double slashes in URLs
- Supports special path formats (e.g. `odpt:Station`)
- Automatically skips `null` or `undefined` parameters
- URL-encodes query values safely

**Parameters:**

- `base` (string): The base URL
- `path` (string): The endpoint path
- `params` (Object): Key-value pairs for query parameters (optional)

**Returns:** `URL` object

---

### Network Utilities

#### `fetchJson(url, options)`

Fetches JSON data from the given URL with built-in timeout and error handling.

```js
import { fetchJson } from "./utils";

const data = await fetchJson(url, {
  headers: { Authorization: "Bearer token" },
  timeout: 15000,
});
```

**Options:**

| Name    | Type   | Default | Description                     |
| ------- | ------ | ------- | ------------------------------- |
| headers | Object | `{}`    | Additional HTTP headers         |
| timeout | number | `15000` | Request timeout in milliseconds |

**Behavior:**

- Automatically aborts the request if it exceeds the timeout
- Throws an error for non-2xx HTTP responses with detailed error messages
- Always cleans up internal timers to avoid memory leaks
- Returns parsed JSON data

**Response Structure Example:**

The function returns the parsed JSON response. For train timetable APIs, this typically looks like:

```js
[
  {
    "@id": "urn:ucode:_00001C00000000000001000003A689D3",
    "@type": "odpt:TrainTimetable",
    "dc:date": "2025-07-01T15:00:00+09:00",
    "odpt:trainTimetableObject": [
      {
        "odpt:departureTime": "06:05",
        "odpt:departureStation": "odpt.Station:Sotetsu.Main.Ebina",
      },
      // ... more station objects
    ],
  },
  // ... more timetable objects if present
];
```

**Returns:** `Promise<Object | Array>`

---

## Error Handling

### `timeToMinutesExtended()`

- Throws `RangeError` for invalid time formats or out-of-range values
- Returns `null` for null input

### `parseToDate()`

- Returns `null` for unparseable dates or invalid Date objects

### `fetchJson()`

- Throws `Error` with HTTP status and response body for failed requests
- Automatically aborts on timeout

---

## Constants

The module uses constants from `../config/constants/timeConstants.js`:

- `MINUTES_PER_DAY`: 1440 (24 hours × 60 minutes)

---

## Version Information

- **Author:** Pero1031
- **Version:** 1.00
- **Since:** 2025-10-06
