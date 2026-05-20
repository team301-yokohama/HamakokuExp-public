/**
 * @file HTTP通信およびWeb API向けのエラークラス定義
 * @abstract
 * HTTPステータスコードを伴うエラーを表現するための
 * 基底エラークラスと代表的な派生クラスを定義する
 *
 * ルーティング層 サービス層 ユーティリティ層のいずれからも利用可能で
 * Express 等の Web フレームワークにおける
 * エラーハンドリングの共通基盤として使用される
 *
 * @module utils/validation/errors.js
 */

/**
 * @class HttpError
 * @extends Error
 * @abstract
 * HTTPステータスコードを保持するエラーの基底クラス
 *
 * JavaScript標準の Error クラスを拡張し
 * ステータスコードとエラー種別名を明示的に保持する
 *
 * 上位層で instanceof 判定や status に基づく
 * レスポンス分岐を簡潔に行うための設計
 */
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = this.constructor.name;  // クラス名をエラー名として設定
    this.status = status;                // HTTPステータスコード
  }
}

/**
 * @class BadRequest
 * @extends HttpError
 * @abstract
 * HTTP 400 Bad Request を表すエラークラス
 *
 * 主な使用例
 * リクエストパラメータの形式不正
 * 必須パラメータの欠如
 * 値の範囲や型の検証エラー
 */
export class BadRequest extends HttpError {
  constructor(message = "Bad Request") {
    super(400, message);
  }
}

/**
 * @class NotFound
 * @extends HttpError
 * @abstract
 * HTTP 404 Not Found を表すエラークラス
 *
 * 主な使用例
 * 指定されたリソースが存在しない
 * 駅ID 路線ID 事業者IDが見つからない
 * データ取得結果が空である
 */
export class NotFound extends HttpError {
  constructor(message = "Not Found") {
    super(404, message);
  }
}

/**
 * @class InternalServerError
 * @extends HttpError
 * @abstract
 * HTTP 500 Internal Server Error を表すエラークラス
 *
 * アプリケーション内部で想定外の例外が発生した場合や
 * クライアントに詳細を公開すべきでないエラーを
 * 包装して扱うために使用される
 */
export class InternalServerError extends HttpError {
  constructor(message = "Internal Server Error") {
    super(500, message);
  }
}