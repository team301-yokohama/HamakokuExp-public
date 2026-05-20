# Validation Module

This directory contains **error classes** and **validation functions** for handling HTTP requests and API errors in web applications.

The module provides a consistent foundation for error handling and input validation across **routing**, **service**, and **utility layers**, compatible with web frameworks like Express.

---

## Directory Structure

```
utils/validation/
├── errors.js        # HTTP-aware error classes
└── validators.js    # Request parameter validation functions
```

---

## Overview

The validation module provides:

- HTTP-aware error classes with status codes
- Request parameter validation utilities
- Type-safe error handling with `instanceof` checks
- Consistent error structure for API responses

---

## Design Philosophy

- **HTTP-Aware**  
  All errors carry HTTP status codes, making them directly usable in web responses.

- **Fail-Fast Validation**  
  Validators throw errors immediately when invalid input is detected.

- **Framework Agnostic**  
  Works with any web framework (Express, Fastify, etc.) or standalone.

- **Clear Semantics**  
  Each error class represents a specific HTTP status with clear use cases.

---

## Error Classes (`errors.js`)

### `HttpError` (Base Class)

The base class for all HTTP-aware errors. Extends JavaScript's native `Error` class with HTTP status code support.

```js
import { HttpError } from './utils/validation/errors.js';

throw new HttpError(403, "Access forbidden");
```

**Constructor:**
```js
new HttpError(status, message)
```

**Parameters:**
- `status` (number): HTTP status code (e.g., 400, 404, 500)
- `message` (string): Error message describing what went wrong

**Properties:**
- `name` (string): Class name (automatically set to constructor name)
- `status` (number): HTTP status code
- `message` (string): Error message

**Usage in error handlers:**
```js
app.use((err, req, res, next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
  } else {
    res.status(500).json({ error: "Internal Server Error" });
  }
});
```

---

### `BadRequest`

HTTP 400 Bad Request error class.

```js
import { BadRequest } from './utils/validation/errors.js';

throw new BadRequest("Invalid email format");
```

**Constructor:**
```js
new BadRequest(message = "Bad Request")
```

**Parameters:**
- `message` (string, optional): Custom error message (default: `"Bad Request"`)

**Common use cases:**
- Invalid request parameter format
- Missing required parameters
- Value range or type validation errors
- Malformed JSON payloads

**Examples:**
```js
// Missing required field
if (!userId) {
  throw new BadRequest("userId is required");
}

// Invalid format
if (!email.includes("@")) {
  throw new BadRequest("Invalid email format");
}

// Out of range
if (age < 0 || age > 120) {
  throw new BadRequest("Age must be between 0 and 120");
}
```

---

### `NotFound`

HTTP 404 Not Found error class.

```js
import { NotFound } from './utils/validation/errors.js';

throw new NotFound("Station not found");
```

**Constructor:**
```js
new NotFound(message = "Not Found")
```

**Parameters:**
- `message` (string, optional): Custom error message (default: `"Not Found"`)

**Common use cases:**
- Requested resource does not exist
- Station ID, route ID, or operator ID not found
- Empty query results
- Invalid endpoint paths

**Examples:**
```js
// Resource not found
const station = await findStation(stationId);
if (!station) {
  throw new NotFound(`Station ${stationId} not found`);
}

// No results
const results = await searchTrains(query);
if (results.length === 0) {
  throw new NotFound("No trains found for the given criteria");
}

// Invalid ID
if (!VALID_OPERATORS.includes(operatorId)) {
  throw new NotFound(`Operator ${operatorId} does not exist`);
}
```

---

### `InternalServerError`

HTTP 500 Internal Server Error error class.

```js
import { InternalServerError } from './utils/validation/errors.js';

throw new InternalServerError("Database connection failed");
```

**Constructor:**
```js
new InternalServerError(message = "Internal Server Error")
```

**Parameters:**
- `message` (string, optional): Custom error message (default: `"Internal Server Error"`)

**Common use cases:**
- Unexpected exceptions in application logic
- External API failures
- Database connection errors
- Wrapping errors that shouldn't expose details to clients

**Examples:**
```js
// Wrap unexpected errors
try {
  await processData(data);
} catch (error) {
  console.error("Unexpected error:", error);
  throw new InternalServerError("Failed to process data");
}

// External service failure
try {
  const response = await fetch(apiUrl);
  if (!response.ok) {
    throw new InternalServerError("External API request failed");
  }
} catch (error) {
  throw new InternalServerError("Service temporarily unavailable");
}
```

---

## Validation Functions (`validators.js`)

### `validateQuery(q)`

Validates query parameters for location-based requests.

```js
import { validateQuery } from './utils/validation/validators.js';

// Express route example
app.get('/api/nearby', (req, res) => {
  const { lat, lng, speedId, limit } = validateQuery(req.query);
  // ... use validated parameters
});
```

**Parameters:**
- `q` (Object): Query object containing request parameters

**Expected query parameters:**
- `lat` (string|number): Latitude coordinate (required)
- `lng` (string|number): Longitude coordinate (required)
- `speedId` (string, optional): Speed profile identifier
- `limit` (string|number, optional): Maximum number of results (must be positive integer)

**Returns:** `Object`
```js
{
  lat: number,      // Validated latitude
  lng: number,      // Validated longitude
  speedId: string,  // Speed ID (undefined if not provided)
  limit: number     // Validated limit (undefined if not provided)
}
```

**Throws:**
- `BadRequest`: If `lat` or `lng` are not finite numbers
- `BadRequest`: If `limit` is not a positive integer

**Validation rules:**

1. **Latitude and Longitude** (required):
   - Must be convertible to numbers
   - Must be finite (not `NaN`, `Infinity`, or `-Infinity`)

2. **Speed ID** (optional):
   - Converted to string if provided
   - No additional validation performed

3. **Limit** (optional):
   - Must be a positive integer
   - Cannot be zero or negative
   - Must be a whole number (no decimals)

**Usage examples:**

**Valid requests:**
```js
// Basic location query
validateQuery({ lat: "35.6762", lng: "139.6503" });
// Returns: { lat: 35.6762, lng: 139.6503, speedId: undefined, limit: undefined }

// With speed ID
validateQuery({ lat: 35.6762, lng: 139.6503, speedId: "fast" });
// Returns: { lat: 35.6762, lng: 139.6503, speedId: "fast", limit: undefined }

// With limit
validateQuery({ lat: 35.6762, lng: 139.6503, limit: "10" });
// Returns: { lat: 35.6762, lng: 139.6503, speedId: undefined, limit: 10 }

// All parameters
validateQuery({ lat: 35.6762, lng: 139.6503, speedId: "normal", limit: 5 });
// Returns: { lat: 35.6762, lng: 139.6503, speedId: "normal", limit: 5 }
```

**Invalid requests (throws `BadRequest`):**
```js
// Missing coordinates
validateQuery({});
// Throws: BadRequest("lat/lng must be numbers")

// Invalid latitude
validateQuery({ lat: "invalid", lng: 139.6503 });
// Throws: BadRequest("lat/lng must be numbers")

// NaN coordinates
validateQuery({ lat: NaN, lng: 139.6503 });
// Throws: BadRequest("lat/lng must be numbers")

// Invalid limit (not integer)
validateQuery({ lat: 35.6762, lng: 139.6503, limit: "10.5" });
// Throws: BadRequest("limit must be a positive integer")

// Invalid limit (negative)
validateQuery({ lat: 35.6762, lng: 139.6503, limit: "-5" });
// Throws: BadRequest("limit must be a positive integer")

// Invalid limit (zero)
validateQuery({ lat: 35.6762, lng: 139.6503, limit: "0" });
// Throws: BadRequest("limit must be a positive integer")
```

---

## Usage Patterns

### Basic Error Handling in Express

```js
import express from 'express';
import { HttpError, BadRequest, NotFound } from './utils/validation/errors.js';
import { validateQuery } from './utils/validation/validators.js';

const app = express();

// Route with validation
app.get('/api/search', async (req, res, next) => {
  try {
    // Validate input
    const { lat, lng, limit } = validateQuery(req.query);
    
    // Business logic
    const results = await searchNearby(lat, lng, limit);
    
    if (results.length === 0) {
      throw new NotFound("No results found");
    }
    
    res.json(results);
  } catch (error) {
    next(error);
  }
});

// Error handler middleware
app.use((err, req, res, next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({
      error: err.name,
      message: err.message
    });
  } else {
    console.error(err);
    res.status(500).json({
      error: "InternalServerError",
      message: "An unexpected error occurred"
    });
  }
});
```

---

### Service Layer Error Handling

```js
import { NotFound, InternalServerError } from './utils/validation/errors.js';

class StationService {
  async getStation(stationId) {
    try {
      const station = await database.findStation(stationId);
      
      if (!station) {
        throw new NotFound(`Station ${stationId} not found`);
      }
      
      return station;
    } catch (error) {
      if (error instanceof NotFound) {
        throw error; // Re-throw known errors
      }
      console.error("Database error:", error);
      throw new InternalServerError("Failed to retrieve station");
    }
  }
}
```

---

### Custom Validation with Error Classes

```js
import { BadRequest } from './utils/validation/errors.js';

function validateStationId(stationId) {
  if (!stationId) {
    throw new BadRequest("stationId is required");
  }
  
  if (typeof stationId !== 'string') {
    throw new BadRequest("stationId must be a string");
  }
  
  if (!stationId.startsWith("odpt.Station:")) {
    throw new BadRequest("Invalid stationId format");
  }
  
  return stationId;
}

function validateDateRange(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw new BadRequest("Invalid date format");
  }
  
  if (start > end) {
    throw new BadRequest("startDate must be before endDate");
  }
  
  const daysDiff = (end - start) / (1000 * 60 * 60 * 24);
  if (daysDiff > 31) {
    throw new BadRequest("Date range cannot exceed 31 days");
  }
  
  return { start, end };
}
```

---

### Type Checking Errors

```js
import { HttpError, BadRequest, NotFound } from './utils/validation/errors.js';

function handleError(error) {
  // Check specific error types
  if (error instanceof BadRequest) {
    console.log("Client sent invalid data");
  } else if (error instanceof NotFound) {
    console.log("Resource not found");
  } else if (error instanceof HttpError) {
    console.log(`HTTP error with status ${error.status}`);
  } else {
    console.log("Unknown error");
  }
}

// Using status codes
app.use((err, req, res, next) => {
  if (err instanceof HttpError) {
    // Log different severity based on status
    if (err.status >= 500) {
      console.error("Server error:", err);
    } else if (err.status >= 400) {
      console.warn("Client error:", err.message);
    }
    
    res.status(err.status).json({ error: err.message });
  } else {
    next(err);
  }
});
```

---

## Error Response Format

When using these error classes in an API, a typical error response looks like:

```json
{
  "error": "BadRequest",
  "message": "lat/lng must be numbers"
}
```

Or with more detail:

```json
{
  "error": "NotFound",
  "message": "Station odpt.Station:Sotetsu.Main.Yokohama not found",
  "status": 404
}
```

---

## Best Practices

1. **Use Specific Error Classes**  
   Use `BadRequest` for validation errors, `NotFound` for missing resources, etc.

2. **Provide Helpful Messages**  
   Include details about what went wrong and how to fix it.
   ```js
   // Good
   throw new BadRequest("lat must be a number between -90 and 90");
   
   // Bad
   throw new BadRequest("Invalid input");
   ```

3. **Don't Expose Internal Details**  
   Use `InternalServerError` to wrap errors that contain sensitive information.
   ```js
   try {
     await database.query(sql);
   } catch (error) {
     console.error(error); // Log internally
     throw new InternalServerError("Database operation failed");
   }
   ```

4. **Validate Early**  
   Run validation at the entry point (route handlers) before business logic.

5. **Let Errors Bubble Up**  
   Don't catch and swallow errors; let them reach the error handler middleware.

---

## Adding New Validators

When adding new validation functions:

1. **Follow the pattern:**
   ```js
   export function validateNewInput(input) {
     // Validate and convert types
     const value = Number(input.value);
     if (!Number.isFinite(value)) {
       throw new BadRequest("value must be a number");
     }
     
     // Return validated data
     return { value };
   }
   ```

2. **Throw appropriate errors:**
   - `BadRequest` for all validation failures
   - Include clear, actionable error messages

3. **Return clean objects:**
   - Only include validated, type-converted values
   - Use `undefined` for optional missing values

---

## Version Information

- **Module**: utils/validation
- **Purpose**: HTTP error handling and request validation
- **Compatible with**: Express, Fastify, and other Node.js web frameworks