// ルート名と対応する関数のマッピング

const TRANSPORT_ROUTE_MAP = {
  All: ['FastestRoutes'],
  bus: ['YNUBusOnlyV2'],
  cycle: ['YNUByCycle'],
  train:['TrainRoutes'],
  busAndTrain:['MitsukamiBus'],
  busAndCycle:['YNUByCycle', 'YNUBusOnly'],
  trainAndCycle:['MitsukamiByCycle', 'WadamachiByCycle'],
  walk: ['YNUOnFoot'],
};