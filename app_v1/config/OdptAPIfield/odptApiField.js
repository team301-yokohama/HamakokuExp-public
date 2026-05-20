// ODPT API field definitions (ordered by semantic groups)

export const ODPT_FIELDS = {
  // --- API / Query control ---
  CONSUMER_KEY: "acl:consumerKey",
  CALENDAR: "odpt:calendar",
  DC_TITLE: "dc:title",
  NOTE: "odpt:note",
  INDEX: "odpt:index",

  // --- Operator / Line / Direction ---
  OPERATOR: "odpt:operator",
  RAILWAY: "odpt:railway",
  RAIL_DIRECTION: "odpt:railDirection",

  // --- Station fields ---
  DEPARTURE_STATION: "odpt:departureStation",
  ARRIVAL_STATION: "odpt:arrivalStation",

  // --- Time fields ---
  DEPARTURE_TIME: "odpt:departureTime",
  ARRIVAL_TIME: "odpt:arrivalTime",

  // --- Train identity ---
  TRAIN: "odpt:train",
  TRAIN_NUMBER: "odpt:trainNumber",
  TRAIN_TYPE: "odpt:trainType",

  // --- Timetable structure ---
  TRAIN_TIMETABLE_OBJECT: "odpt:trainTimetableObject",
  TRAIN_TIMETABLE: "odpt:TrainTimetable",

  // --- Bus timetable structure ---
  BUS_TIMETABLE_OBJECT: "odpt:busTimetableObject",
  BUS_TIMETABLE: "odpt:BusTimetable",

  // --- Bus stop pole ---
  BUSSTOP_POLE: "odpt:busstopPole",

  // --- Bus route ---
  BUS_ROUTE_PATTERN: "odpt:busroutePattern",

};
