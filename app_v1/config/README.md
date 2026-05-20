# Config Module

This directory contains **application-wide configuration files** including constants, fare settings, geographic data, API field definitions, and provider configurations.

All configuration values are centralized here to ensure consistency, maintainability, and easy updates across the entire application.

---

## Directory Structure

```
config/
├── constants/
│   ├── timeConstants.js          # Time-related constants
│   └── transferConfig.js         # Transfer calculation settings
├── fare/
│   ├── fareBus/
│   │   ├── fareKanachu.js        # Kanagawa Chuo Bus fares
│   │   ├── fareMunicipal.js      # Yokohama Municipal Bus fares
│   │   ├── fareSotetsuBus.js     # Sotetsu Bus fares
│   │   └── indexFareBus.js       # Bus fare aggregator
│   └── fareTrain/
│       ├── fareBlueLine.js       # Yokohama Blue Line fares
│       ├── fareHellocycle.js     # HELLO CYCLING pricing
│       └── fareSotetsu.js        # Sotetsu Railway fares
├── geo/
│   ├── busRoutes/
│   │   ├── index.js              # Bus route exports
│   │   ├── kanachu.js            # Kanachu bus routes
│   │   └── sotetsuBus.js         # Sotetsu bus routes
│   ├── busstopPoles/
│   │   ├── index.js              # Bus stop pole exports
│   │   ├── kanachu.js            # Kanachu bus stop poles
│   │   └── sotetsuBus.js         # Sotetsu bus stop poles
│   └── stations/
│       ├── busStopMapping.js     # Bus stop display name mapping
│       └── stations.js           # Railway station definitions
├── OdptAPIfield/
│   └── odptApiField.js           # ODPT API field name constants
├── providers/
│   ├── hellocycle.js             # HELLO CYCLING API config
│   ├── kanachu.js                # Kanachu provider config
│   ├── sotetsu.js                # Sotetsu Railway config
│   └── sotetsuBus.js             # Sotetsu Bus config
├── configIdx.js                  # Configuration index
├── defaults.js                   # API keys and base URLs
└── index.js                      # Main configuration export
```

---

## Module Overview

### Constants

#### `timeConstants.js`

Fundamental time-related constants used throughout the application.

```js
import {
  MINUTES_PER_DAY,
  SECONDS_PER_HOUR,
  DAYS_PER_WEEK,
} from "./constants/timeConstants.js";

console.log(MINUTES_PER_DAY); // 1440
console.log(SECONDS_PER_HOUR); // 3600
console.log(DAYS_PER_WEEK); // 7
```

**Constants:**

- `MINUTES_PER_DAY`: 1440 (24 hours × 60 minutes)
- `SECONDS_PER_HOUR`: 3600 (60 minutes × 60 seconds)
- `DAYS_PER_WEEK`: 7

---

#### `transferConfig.js`

Configuration for transfer calculations between different transportation modes.

```js
import { TRANSFER_CONFIG } from "./constants/transferConfig.js";

const walkTime = TRANSFER_CONFIG.MITSUKAMI_BUS_TO_STATION_TIME;
const maxConnections = TRANSFER_CONFIG.MAX_TRAIN_CONNECTIONS;
```

**Configuration:**

- `MITSUKAMI_BUS_TO_STATION_TIME`: 4 minutes (walking time from Mitsuzawa-kamicho bus stop to station platform)
- `MAX_TRAIN_CONNECTIONS`: 3 (maximum number of connecting trains shown per bus)

**Note:** Currently uses fixed values; ideally should be integrated with dynamic `walktime` parameters in the future.

---

### Fare Configuration

#### Bus Fares

##### `indexFareBus.js`

Aggregates all bus fare configurations into a single constant for easy access.

```js
import { BUS_FARES } from "./fare/fareBus/indexFareBus.js";

console.log(BUS_FARES.SOTETSU); // 240
console.log(BUS_FARES.MUNICIPAL); // 220
console.log(BUS_FARES.KANACHU); // 220
```

**Structure:**

- `SOTETSU`: 240 JPY
- `MUNICIPAL`: 220 JPY
- `KANACHU`: 220 JPY

---

##### `fareKanachu.js`

Kanagawa Chuo Bus (神奈川中央バス) fare configuration.

```js
import { KANACHU_FARE_CONFIG } from "./fare/fareBus/fareKanachu.js";
```

**Configuration:**

- `baseFare`: 220 JPY
- `currency`: "JPY"
- `paymentType`: "flat" (flat rate system)

---

##### `fareMunicipal.js`

Yokohama Municipal Bus (横浜市営バス) fare configuration.

```js
import { MUNICIPAL_FARE_CONFIG } from "./fare/fareBus/fareMunicipal.js";
```

**Configuration:**

- `baseFare`: 220 JPY (Mitsuzawa-kamicho to Yokohama Station)
- `currency`: "JPY"
- `paymentType`: "flat"

---

##### `fareSotetsuBus.js`

Sotetsu Bus (相鉄バス) fare configuration.

```js
import { SOTETSU_FARE_CONFIG } from "./fare/fareBus/fareSotetsuBus.js";
```

**Configuration:**

- `baseFare`: 240 JPY
- `currency`: "JPY"
- `paymentType`: "flat"

**Future extensions:** Can be expanded to include distance-based pricing or a `calculateFare()` function.

---

#### Train Fares

##### `fareBlueLine.js`

Yokohama Municipal Subway Blue Line (横浜市営地下鉄ブルーライン) fare definitions.

```js
import { TRAIN_FARES_BLUE_LINE } from "./fare/fareTrain/fareBlueLine.js";

const fare = TRAIN_FARES_BLUE_LINE.MITSUKAMI2YOKOHAMA; // 210
```

**Fares:**

- `MITSUKAMI2YOKOHAMA`: 210 JPY (Mitsuzawa-kamicho → Yokohama)

---

##### `fareSotetsu.js`

Sotetsu Railway (相鉄線) fare definitions.

```js
import { TRAIN_FARES_SOTETSU } from "./fare/fareTrain/fareSotetsu.js";

const fare1 = TRAIN_FARES_SOTETSU.KAMIHOSHI2YOKOHAMA; // 188
const fare2 = TRAIN_FARES_SOTETSU.WADAMACHI2YOKOHAMA; // 188
```

**Fares:**

- `KAMIHOSHI2YOKOHAMA`: 188 JPY (Kamihoshikawa → Yokohama)
- `WADAMACHI2YOKOHAMA`: 188 JPY (Wadamachi → Yokohama)

---

##### `fareHellocycle.js`

HELLO CYCLING (ハローサイクリング) bike-sharing pricing structure.

```js
import { FARE_HELLO_CYCLE } from "./fare/fareTrain/fareHellocycle.js";
```

**Pricing structure:**

- `initialfare`: 160 JPY
- `initialtime`: 30 minutes
- `additionalfare`: 160 JPY
- `additionaltime`: 15 minutes
- `maxfare`: 2500 JPY
- `maxtime`: 720 minutes (12 hours)

---

### Geographic Data

#### Bus Routes

##### `busRoutes/sotetsuBus.js`

Defines Sotetsu Bus routes with ordered bus stop pole IDs.

```js
import { SOTETSU_BUSROUTES } from "./geo/busRoutes/sotetsuBus.js";

const route = SOTETSU_BUSROUTES.HAMA10_YNU_TO_YOKOHAMA;
// Array of bus stop pole IDs in route order
```

**Routes:**

- `HAMA10_YNU_TO_YOKOHAMA`: Route from Yokohama National University to Yokohama Station (浜10系統)

---

##### `busRoutes/kanachu.js`

Defines Kanagawa Chuo Bus routes with ordered bus stop pole IDs.

```js
import { KANACHU_BUSROUTES } from "./geo/busRoutes/kanachu.js";

const route = KANACHU_BUSROUTES.UMENOKI01_YNU_TO_YOKOHAMA;
```

**Routes:**

- `UMENOKI01_YNU_TO_YOKOHAMA`: Route from YNU to Yokohama Station (01系統)

---

#### Bus Stop Poles

##### `busstopPoles/sotetsuBus.js`

Sotetsu Bus stop pole definitions with ODPT API IDs and display names.

```js
import { SOTETSU_BUSSTOPPOLES } from "./geo/busstopPoles/sotetsuBus.js";

const stop = SOTETSU_BUSSTOPPOLES.YNU_MAIN_GATE;
console.log(stop.id); // "odpt.BusstopPole:SotetsuBus.Yokohamakokuritsudaigakuseimommae.5114.5"
console.log(stop.name); // "横浜国立大学正門前"
```

**Structure:**
Each bus stop pole contains:

- `id`: ODPT API identifier (e.g., `"odpt.BusstopPole:SotetsuBus.Yokohamashindou.5052.1"`)
- `name`: Display name in Japanese (e.g., `"横浜新道"`)

**Available stops:**
`YNU_MAIN_GATE`, `KOKUDAI_CHUO_1`, `KOKUDAI_KITA_1`, `KOKUDAI_NISHI`, `KOKUDAI_KITA_2`, `KOKUDAI_CHUO_2`, `DAIGAKU_KAIKAN_MAE`, `KOKUDAI_SOUTH_GATE`, `TOKIWADAI_JYUTAKU`, `YOKOHAMA_SHINDO`, `OKAZAWA_CHO`, `MITSUZAWA_KAMIMACHI`, `YOKOHAMA_NISHIGUCHI`

---

##### `busstopPoles/kanachu.js`

Kanagawa Chuo Bus stop pole definitions.

```js
import { KANACHU_BUSSTOPPOLES } from "./geo/busstopPoles/kanachu.js";

const stop = KANACHU_BUSSTOPPOLES.MITSUZAWA_KAMICHO;
console.log(stop.id); // "odpt.BusstopPole:Kanachu.Mitsuzawakamichouekimae.23517.2"
console.log(stop.name); // "三ツ沢上町"
```

**Available stops:**
`YOKOHAMA_SHINDO`, `OKAZAWA_CHO`, `MITSUZAWA_KAMICHO`, `YOKOHAMA_NISHIGUCHI`

---

##### `busstopPoles/index.js`

Aggregates all bus stop pole definitions from different operators.

```js
import {
  SOTETSU_BUSSTOPPOLES,
  KANACHU_BUSSTOPPOLES,
  ALL_BUSSTOPPOLES,
} from "./geo/busstopPoles/index.js";

// Access individual operator stops
const sotetsuStop = SOTETSU_BUSSTOPPOLES.YNU_MAIN_GATE;
const kanachuStop = KANACHU_BUSSTOPPOLES.MITSUZAWA_KAMICHO;

// Access all stops with prefixed keys (collision-safe)
const allStops = ALL_BUSSTOPPOLES;
// Keys: "STB_YNU_MAIN_GATE", "KNC_MITSUZAWA_KAMICHO", etc.
```

**Exports:**

- `SOTETSU_BUSSTOPPOLES`: All Sotetsu bus stops
- `KANACHU_BUSSTOPPOLES`: All Kanachu bus stops
- `ALL_BUSSTOPPOLES`: Combined dictionary with operator-prefixed keys (`STB_*`, `KNC_*`)

---

#### Railway Stations

##### `stations/stations.js`

Railway station definitions with ODPT IDs and fare information.

```js
import { STATIONS, YOKOHAMA } from "./geo/stations/stations.js";

const station = STATIONS.WADAMACHI;
console.log(station.id); // "odpt.Station:Sotetsu.Main.Wadamachi"
console.log(station.name); // "和田町"
console.log(station.fareToYokohama); // 188
```

**Available stations:**

- `WADAMACHI`: Wadamachi Station (和田町)
- `KAMIHOSHIKAWA`: Kamihoshikawa Station (上星川)

**Special station:**

- `YOKOHAMA`: Yokohama Station reference (横浜)

---

##### `stations/busStopMapping.js`

Maps internal bus stop keys to their actual display names as they appear in API responses.

```js
import { BUS_STOP_MAP } from "./geo/stations/busStopMapping.js";

// Find internal key from API stop name
const mapping = BUS_STOP_MAP.find((m) =>
  m.stopNames.includes("横浜新道(新道)"),
);
console.log(mapping.key); // "ToShindo"
```

**Structure:**
Each mapping contains:

- `key`: Internal identifier (e.g., `"ToKokudaiNishi"`)
- `stopNames`: Array of possible display names (e.g., `["国大西"]`)

**Mappings:**

- `ToKokudaiNishi` → `["国大西"]`
- `ToKokudaiChuo` → `["国大中央"]`
- `ToKokudaiKita` → `["国大北"]`
- `ToKaikan` → `["大学会館前"]`
- `ToMinamiG` → `["国大南門"]`
- `ToShindo` → `["横浜新道", "横浜新道(新道)", "横浜新道(あおば前)"]`
- `ToOkazawacho` → `["岡沢町"]`

---

### ODPT API Field Definitions

#### `OdptAPIfield/odptApiField.js`

Centralized constants for ODPT API field names, organized by semantic groups.

```js
import { ODPT_FIELDS } from "./OdptAPIfield/odptApiField.js";

// Use in API queries
const query = {
  [ODPT_FIELDS.OPERATOR]: "odpt.Operator:Sotetsu",
  [ODPT_FIELDS.RAILWAY]: "odpt.Railway:Sotetsu.Main",
  [ODPT_FIELDS.RAIL_DIRECTION]: "odpt.RailDirection:Inbound",
};

// Parse API responses
const departureTime = response[ODPT_FIELDS.DEPARTURE_TIME];
const trainNumber = response[ODPT_FIELDS.TRAIN_NUMBER];
```

**Field categories:**

**API / Query control:**

- `CONSUMER_KEY`, `CALENDAR`, `DC_TITLE`, `NOTE`, `INDEX`

**Operator / Line / Direction:**

- `OPERATOR`, `RAILWAY`, `RAIL_DIRECTION`

**Station fields:**

- `DEPARTURE_STATION`, `ARRIVAL_STATION`

**Time fields:**

- `DEPARTURE_TIME`, `ARRIVAL_TIME`

**Train identity:**

- `TRAIN`, `TRAIN_NUMBER`, `TRAIN_TYPE`

**Timetable structure:**

- `TRAIN_TIMETABLE_OBJECT`, `TRAIN_TIMETABLE`
- `BUS_TIMETABLE_OBJECT`, `BUS_TIMETABLE`

**Bus-specific:**

- `BUSSTOP_POLE`, `BUS_ROUTE_PATTERN`

---

### Provider Configurations

#### `providers/sotetsu.js`

Configuration for Sotetsu Railway Main Line API queries.

```js
import { SOTETSU } from "./providers/sotetsu.js";

console.log(SOTETSU.operator); // "odpt.Operator:Sotetsu"
console.log(SOTETSU.railway); // "odpt.Railway:Sotetsu.Main"
console.log(SOTETSU.railDirection); // "odpt.RailDirection:Inbound"
```

**Configuration:**

- `operator`: `"odpt.Operator:Sotetsu"`
- `railway`: `"odpt.Railway:Sotetsu.Main"`
- `railDirection`: `"odpt.RailDirection:Inbound"`
- `calendar`: `"odpt.Calendar:"` (prefix for calendar IDs)
- `refMinutes`: `1700` (reference time in minutes)
- `timeoutMs`: `15000` (request timeout in milliseconds)

---

#### `providers/sotetsuBus.js`

Configuration for Sotetsu Bus API queries.

```js
import { SOTETSU_BUS } from "./providers/sotetsuBus.js";

console.log(SOTETSU_BUS.dc_title1); // "浜10 横浜駅～国大～横浜駅"
console.log(SOTETSU_BUS.operator); // "odpt.Operator:SotetsuBus"
```

**Configuration:**

- `dc_title1`: `"浜10 横浜駅～国大～横浜駅"` (Route title 1)
- `dc_title2`: `"浜10 国大西～横浜駅"` (Route title 2)
- `operator`: `"odpt.Operator:SotetsuBus"`
- `calendar`: `"odpt.Calendar:Weekday"`
- `timeoutMs`: `15000`

---

#### `providers/kanachu.js`

Configuration for Kanagawa Chuo Bus API queries.

```js
import { KANACHU } from "./providers/kanachu.js";

console.log(KANACHU.dc_title); // "01 梅の木・三ツ沢西町(中山駅発) 横浜駅西口行"
console.log(KANACHU.operator); // "odpt.Operator:Kanachu"
```

**Configuration:**

- `dc_title`: `"01 梅の木・三ツ沢西町(中山駅発) 横浜駅西口行"` (Route title)
- `operator`: `"odpt.Operator:Kanachu"`
- `calendar`: `"odpt.Calendar:"` (prefix for calendar IDs)
- `timeoutMs`: `15000`

---

#### `providers/hellocycle.js`

Configuration for HELLO CYCLING bike-sharing API.

```js
import { HELLOCYCLE } from "./providers/hellocycle.js";

console.log(HELLOCYCLE.baseUrl); // "https://api.odpt.org/api/v4"
console.log(HELLOCYCLE.stationStatusPath); // "/gbfs/hellocycling/station_status.json"
```

**Configuration:**

- `baseUrl`: `"https://api.odpt.org/api/v4"`
- `stationStatusPath`: `"/gbfs/hellocycling/station_status.json"`
- `timeoutMs`: `15000`

---

### Core Configuration

#### `defaults.js`

API keys and base URLs loaded from environment variables.

```js
import { BASE, CHL_BASE, KEY, CHL_KEY, assertKeys } from "./defaults.js";

// Assert API keys are set before making requests
assertKeys();

// Use in API calls
const url = `${BASE}odpt:TrainTimetable?${ODPT_FIELDS.CONSUMER_KEY}=${KEY}`;
```

**Exports:**

- `BASE`: `"https://api.odpt.org/api/v4/"` (Production API base URL)
- `CHL_BASE`: `"https://api-challenge.odpt.org/api/v4/"` (Challenge API base URL)
- `KEY`: Production API key from `ODPT_API_KEY` environment variable
- `CHL_KEY`: Challenge API key from `ODPT_CHL_API_KEY` environment variable
- `assertKeys()`: Throws error if required API keys are not set

**Environment variables required:**

```env
ODPT_API_KEY=your_production_key
ODPT_CHL_API_KEY=your_challenge_key
```

---

#### `index.js` & `configIdx.js`

Main configuration entry points that re-export configuration modules.

```js
import { SOTETSU } from "./config/index.js";
```

**Current exports:**

- `SOTETSU`: Sotetsu Railway configuration

**Note:** Additional providers like `KANACHU` can be uncommented as needed.

---

## Usage Examples

### Calculating Transfer Time

```js
import { TRANSFER_CONFIG } from "./config/constants/transferConfig.js";
import { getCurrentMinutes, futureAbs } from "../utils/utils.js";

const busArrival = 870; // 14:30
const walkTime = TRANSFER_CONFIG.MITSUKAMI_BUS_TO_STATION_TIME;
const earliestTrain = busArrival + walkTime; // 874 (14:34)

const now = getCurrentMinutes();
const adjustedTime = futureAbs(earliestTrain, now);
```

---

### Building API Query

```js
import { SOTETSU } from "./config/providers/sotetsu.js";
import { ODPT_FIELDS } from "./config/OdptAPIfield/odptApiField.js";
import { KEY } from "./config/defaults.js";
import { buildUrl } from "../utils/utils.js";

const url = buildUrl("https://api.odpt.org/api/v4/", "odpt:TrainTimetable", {
  [ODPT_FIELDS.CONSUMER_KEY]: KEY,
  [ODPT_FIELDS.OPERATOR]: SOTETSU.operator,
  [ODPT_FIELDS.RAILWAY]: SOTETSU.railway,
  [ODPT_FIELDS.RAIL_DIRECTION]: SOTETSU.railDirection,
});
```

---

### Accessing Bus Route Data

```js
import { SOTETSU_BUSROUTES } from "./config/geo/busRoutes/sotetsuBus.js";
import { SOTETSU_BUSSTOPPOLES } from "./config/geo/busstopPoles/sotetsuBus.js";

const route = SOTETSU_BUSROUTES.HAMA10_YNU_TO_YOKOHAMA;

// Get display names for route
const stopNames = route.map((stopId) => {
  const stop = Object.values(SOTETSU_BUSSTOPPOLES).find((s) => s.id === stopId);
  return stop ? stop.name : stopId;
});

console.log(stopNames);
// ["横浜国立大学正門前", "国大中央", "国大北", ...]
```

---

### Calculating Total Fare

```js
import { BUS_FARES } from "./config/fare/fareBus/indexFareBus.js";
import { TRAIN_FARES_SOTETSU } from "./config/fare/fareTrain/fareSotetsu.js";

const busFare = BUS_FARES.SOTETSU; // 240
const trainFare = TRAIN_FARES_SOTETSU.KAMIHOSHI2YOKOHAMA; // 188
const totalFare = busFare + trainFare; // 428
```

---

## Design Patterns

### Semantic Grouping

Configurations are organized by purpose:

- **Constants**: Immutable values used across the app
- **Fare**: Pricing information by operator and mode
- **Geo**: Geographic and spatial data (routes, stops, stations)
- **OdptAPIfield**: API field name constants
- **Providers**: Service-specific configurations

### Collision-Safe Namespacing

When combining data from multiple operators:

```js
// Prefix keys to avoid collisions
const ALL_STOPS = {
  ...Object.fromEntries(
    Object.entries(SOTETSU_BUSSTOPPOLES).map(([k, v]) => [`STB_${k}`, v]),
  ),
  ...Object.fromEntries(
    Object.entries(KANACHU_BUSSTOPPOLES).map(([k, v]) => [`KNC_${k}`, v]),
  ),
};
```

### Environment-Based Configuration

Sensitive data (API keys) are loaded from environment variables:

```js
export const KEY = process.env.ODPT_API_KEY?.trim() ?? null;
```

This ensures:

- Keys are never committed to version control
- Different environments can use different keys
- Missing keys are caught early with `assertKeys()`

---

## Adding New Configurations

### Adding a New Bus Operator

1. Create fare config: `config/fare/fareBus/fareNewOperator.js`
2. Add to aggregator: `config/fare/fareBus/indexFareBus.js`
3. Create bus stop poles: `config/geo/busstopPoles/newOperator.js`
4. Create routes: `config/geo/busRoutes/newOperator.js`
5. Add provider config: `config/providers/newOperator.js`

### Adding a New Railway Line

1. Create fare config: `config/fare/fareTrain/fareNewLine.js`
2. Add stations: `config/geo/stations/stations.js`
3. Add provider config: `config/providers/newLine.js`

---

## Version Information

- **Module**: config
- **Purpose**: Centralized application configuration
- **Maintainer**: Pero1031
