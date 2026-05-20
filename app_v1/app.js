/**
* @abstract アプリの制御ロジック
*/

import express from 'express';

// Helmet:HTTPヘッダーのセキュリティ強化
import helmet from 'helmet';

// エスケープ処理用ライブラリ
import { body, validationResult } from 'express-validator';
import apiRouter from './routes/next.js';
import 'dotenv/config';
import { convert2kanji, calcTotalMinutes } from './utils/utils.js';

// デバック用
// import fs from 'fs';
// import { route } from 'express/lib/application.js';

const app = express();
const port = 3000;
const BASE_URL = '/hamakokuex';

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        "upgrade-insecure-requests": null, // これでHTTPS強制を無効化
        "script-src": ["'self'", "https://www.googletagmanager.com", "'unsafe-inline'"],
        "connect-src": ["'self'", "https://www.google-analytics.com"]
      },
    },
  })
);
app.set('view engine', 'ejs');            // ejs:JavascriptをHTML内で使用可能にするテンプレートエンジン
app.use(express.static('public'));
app.use(BASE_URL, express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// APIルーター
app.use('/api', apiRouter);

app.get(BASE_URL + '/', (req, res) => {
  res.render('index', { results: null, errors: null, baseUrl: BASE_URL });
});
// 免責事項ページの表示
app.get(BASE_URL + '/disclaimer', (req, res) => {
  res.render('disclaimer', { baseUrl: BASE_URL });
});
// バリデーションチェック
app.post(BASE_URL + '/search', [
  // 出発地は必須で、かつエスケープ処理（タグを無効化）を行う
  body('departure').trim().notEmpty().escape().withMessage('出発地を入力してください'),
  body('arrival').trim().notEmpty().escape().withMessage('到着地を入力してください'),
], async (req, res) => {
  
  // バリデーションエラーがあるか確認
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    // エラーがあれば元の画面に戻すなどの処理
    return res.render('index', { results: null, errors: errors.array(), baseUrl: BASE_URL });
  }
  // フォームから送られたデータを取り出す（すでにエスケープ済み）
  const departure = req.body.departure;     // name="departure" の中身
  const arrival = req.body.arrival;         // name="arrival" の中身
  const date = req.body.departure_date;     // name="departure_date" の中身
  const time = req.body.departure_time;     // name="departure_time" の中身
  const priority = req.body.priority;       // name="priority" の中身
  const walkspeed = req.body.walkspeed;     // name="walkspeed" の中身
  const rawRoutepattern = req.body.routepattern|| []; // name="routepattern" の中身
  const routepattern = Array.isArray(rawRoutepattern)
  ? rawRoutepattern
  : [rawRoutepattern];

  const routepatternValue = (routepattern.includes("bus") ? 1 : 0) + (routepattern.includes("train") ? 2 : 0) + (routepattern.includes("cycle") ? 4 : 0);
  let routepatternForAPI;
  switch(routepatternValue) {
    case 0: routepatternForAPI = 0; break; // 徒歩のみ
    case 1: routepatternForAPI = 2; break; // バスのみ
    case 2: routepatternForAPI = 3; break; // 電車のみ
    case 3: routepatternForAPI = 5; break; // バスと電車
    case 4: routepatternForAPI = 4; break; // チャリのみ
    case 5: routepatternForAPI = 6; break; // バスとチャリ
    case 6: routepatternForAPI = 7; break; // 電車とチャリ
    case 7: routepatternForAPI = 1; break; // バスと電車とチャリ
    default: routepatternForAPI = 1; break; // デフォルトは全て許可
  }

  console.log(`検索リクエスト: ${departure}→${arrival} 日時:${date} ${time} 優先:${priority} 歩行速度:${walkspeed} 交通手段:${routepattern} (API用:${routepatternForAPI})`);

  // APIを呼び出してルートデータを取得
  try {
    // 内部APIを呼び出す
    const apiUrl = `http://localhost:${port}/api/?now=${time}&location=${departure}&speed=${walkspeed}&priority=${priority}&date=${date}&routepattern=${routepatternForAPI}`;
    const response = await fetch(apiUrl);
    const apiData = await response.json();
    
    // FastestRoutesの結果を取得
    const routeData = apiData.results;

  // ルートデータを整形して表示
  const searchResult = {
    dep: departure,
    ja_dep: convert2kanji(departure),
    arr: arrival,
    date: date,
    time: time,
    time_mode: req.body.time_mode,
    priority: priority,
    walkspeed: walkspeed,
    duration: "",
    routepattern: routepattern,
    way: shapeRouteData(routeData, departure, arrival, routepattern),
  };
  
  res.render('index', { results: searchResult, errors: null, baseUrl: BASE_URL });
  
  } catch (error) {
    console.error('API呼び出しエラー:', error);
    // エラー時はエラーメッセージを表示
    res.render('index', { results: null, errors: [{ msg: 'ルート検索中にエラーが発生しました' }], baseUrl: BASE_URL });
  }
});

app.listen(port, () => {
  console.log(`App listening at port ${port}`);
});


function normalizeRoutepattern(routepattern) {
  const arr = Array.isArray(routepattern) ? routepattern : [routepattern];

  const hasBus = arr.includes('bus');
  const hasTrain = arr.includes('train');
  const hasCycle = arr.includes('cycle');

  const value =
    (hasBus ? 1 : 0) +
    (hasTrain ? 2 : 0) +
    (hasCycle ? 4 : 0);

  switch (value) {
    case 0: return 'All';
    case 1: return 'bus';
    case 2: return 'train';
    case 3: return 'busAndTrain';
    case 4: return 'cycle';
    case 5: return 'busAndCycle';
    case 6: return 'trainAndCycle';
    case 7: return 'All';
    default: return 'All';
  }
}

function shapeRouteData(rawData, departure, arrival, routepattern) {
  const shapedData = [];

  const keyMap = {
    All: ['FastestRoutes'],
    bus: ['YNUBusOnly'],
    cycle: ['YNUByCycle'],
    train: ['TrainRoutes'],
    busAndTrain: ['MitsukamiBus'],
    busAndCycle: ['YNUByCycleAndBus'],
    trainAndCycle: ['MitsukamiByCycle', 'WadamachiByCycle'],
    walk: ['YNUOnFoot'],
  };

  const normalizedRoutepattern = normalizeRoutepattern(routepattern);
  const resultKeys = keyMap[normalizedRoutepattern] || ['FastestRoutes'];

  // ★修正1: 正しい階層 (FastestRoutes.items) にアクセスする
  // データが存在しない場合に備えてオプショナルチェーン (?.) を使うと安全です
  const items = resultKeys.flatMap((key) => rawData[key]?.items || []);

  items.forEach((element, index) => {
    // fs.appendFileSync('debug_log.txt', JSON.stringify(element) + '\n');

    // ★修正2: データ構造の揺らぎを吸収する処理
    // operatorがない場合(地下鉄)は trainType から判定するなどの工夫が必要
    // ここでは簡易的に存在チェックを行います
    
    // traindataが配列の場合と単一オブジェクトの場合の両方に対応
    const trainDataArray = Array.isArray(element.traindata) ? element.traindata : [element.traindata];
    const firstTrainData = trainDataArray[0];
    const destination = firstTrainData?.traindata_details?.destinationStation?.[0] || "不明";

    const step = [
       {  
          type: "walk", 
          from: convert2kanji(departure), 
          
          // 行き先優先順位: 
          // 1. チャリポート → 2. バス停/駅 → 3. どれもなければ最終目的地(横浜駅)
          to: element.isrentable ? element.rentport_name : (element.busstop_name || element.station_name || arrival), 
          
          departuretime: element.departuretime, 
          
          // 到着時刻優先順位:
          // 1. チャリ出発時刻 → 2. バス/駅出発時刻 → 3. なければ全体の到着時刻
          arrivaltime: element.isrentable ? element.rentport_departuretime 
             : (element.busstop_departuretime || element.station_departuretime || element.arrivetime), 
          
          // 時間優先順位:
          // 1. チャリポート徒歩 → 2. 駅徒歩 → 3. なければ全体の所要時間(徒歩直行)
          time: element.isrentable ? element.rentport_walktime 
             : ( element.busstop_walktime || element.station_walktime || element.duration)
       }
    ];
    if(element.isrentable || element.cycledata){
      step.push(
        { 
          type: "sharecycle",
          from: element.rentport_name,   // 貸出ポート名
          to: element.returnport_name,   // 返却ポート名
          time: element.bike_duration, 
          departuretime: element.rentport_departuretime,
          arrivaltime: element.returnport_arrivetime,
          rentalcapacity: element.num_bikes_available,
          returncapacity: element.num_docks_available,
          fare: element.fare
        }
      );
          // 2. 最後の徒歩ステップ（返却ポート → 横浜駅）
      // ★追加点: ポートから駅まで歩く時間を表示
      if (element.returnport_walktime > 0) {
        const walkDestination = element.traindata ? element.station_name : arrival;
        step.push({
          
          type: "walk",
          from: element.returnport_name, // ポートから
          to: walkDestination,                     // ★駅 or 横浜駅
          departuretime: element.returnport_arrivetime,
          // 電車がある場合は、電車の出発時刻を到着時刻とする（乗り換え待ち含む）
          arrivaltime: element.traindata ? element.station_departuretime : (element.arrivetime || ""),
          time: calcTotalMinutes(element.returnport_arrivetime, element.traindata ? element.station_departuretime : element.arrivetime) ?? element.returnport_walktime
        });

      }
    }
    else{
      console.log("no cycle data");
    }
    if(element.busdata){
      step.push(
          { 
          type: "bus",
          operator: convert2kanji(element.busdata.operator),
          busroute: convert2kanji(element.busdata.busroute) || "不明",
          from: convert2kanji(element.busstop_name),
          to: convert2kanji(element.busstop_dropoff_name),
          departuretime: element.busstop_departuretime,
          departuretimes: element.busdata.departureTime,
          arrivaltime: element.busstop_dropoff_arrivetime,
          destination: convert2kanji(element.busdata.destinationStopPole),
          fare: element.busdata.operator && element.busdata.operator.includes("Sotetsu") ? 240 : 220,
          delay: element.busdata.delay,
          fromStop: element.busdata.fromBusStopPole,
          toStop: element.busdata.toBusStopPole,
          occupancy: convert2kanji(element.busdata.occupancyStatus)
        }
     );
    }
    if (element.traindata){
      step.push(
      {
        type: "train", 
        from: convert2kanji(element.station_name), 
        to: convert2kanji(element.station_dropoff_name), 
        fare: element.station_name.includes("三")? "210":"188", 
        operator: element.station_name.includes("三")? "横浜市営地下鉄":"相鉄", 
        // operator の値に含まれる文字列で判定するように変更
        line: element.station_name.includes("三")? "ブルーライン":"本線",
        destination: convert2kanji(element.traindata.destinationStation), 
        departuretime: element.station_departuretime, 
        arrivaltime: element.station_dropoff_arrivetime, 
        delay: element.traindata.delay, 
        fromStation: convert2kanji(element.traindata.fromStation), 
        toStation: convert2kanji(element.traindata.toStation) 
      }
     );
    }
    let totalWalkTime = (element.station_walktime || 0) + (element.busstop_walktime || 0) + (element.rentport_walktime || 0) + (element.returnport_walktime || 0);
    const depTime = step[0].departuretime;
    const arrTime = step[step.length - 1].arrivaltime;
    const totalMinutes = calcTotalMinutes(depTime, arrTime) ?? element.duration;
    shapedData.push(
      {
        index: index + 1,
        fare: element.fare,
        walktime: totalWalkTime==0 ? element.duration : totalWalkTime,
        totaltime: totalMinutes,
          step: step
      }
    );
  });
  return shapedData;
}
