// ----------- Debugging and Error Handling Enhancements -----------------

/**
 * 環境変数を動的に読む（固定されない）
 */
function getDebugConfig() {
  const debugMode = process.env.DEBUG_MODE === 'true';
  const modulesEnv = process.env.DEBUG_MODULES || '';
  const enableAll = modulesEnv === '*';
  const enabledModules = enableAll
    ? null
    : modulesEnv.split(',').map(m => m.trim()).filter(Boolean);

  return { debugMode, enableAll, enabledModules };
}

/**
 * モジュールのデバッグが有効か判定
 * DEBUG_MODE が false なら常に false（グローバルスイッチ優先）
 */
function isDebugEnabled(moduleName) {
  const { debugMode, enableAll, enabledModules } = getDebugConfig();

  if (!debugMode) return false; // ← グローバルスイッチを最優先
  if (enableAll) return true;
  if (!enabledModules || enabledModules.length === 0) return false;
  return enabledModules.includes(moduleName);
}

/**
 * グローバルなデバッグログ（モジュール名なし）
 */
export function debugLog(...args) {
  if (process.env.DEBUG_MODE === 'true') {
    console.log('[DEBUG]', ...args);
  }
}

export function debugError(...args) {
  if (process.env.DEBUG_MODE === 'true') {
    console.error('[DEBUG][ERROR]', ...args);
  }
}

/**
 * モジュール別ロガーファクトリ
 * 統一フォーマット: [ModuleName][LEVEL] message
 */
function createLogger(moduleName, level) {
  const methods = {
    log:  (...args) => console.log  (`[${moduleName}][LOG]`,   ...args),
    error:(...args) => console.error(`[${moduleName}][ERROR]`, ...args),
    warn: (...args) => console.warn (`[${moduleName}][WARN]`,  ...args),
  };

  const fn = methods[level];
  return function (...args) {
    if (isDebugEnabled(moduleName)) fn(...args);
  };
}

export function createDebugLogger(moduleName)      { return createLogger(moduleName, 'log');   }
export function createDebugErrorLogger(moduleName) { return createLogger(moduleName, 'error'); }
export function createDebugWarnLogger(moduleName)  { return createLogger(moduleName, 'warn');  }