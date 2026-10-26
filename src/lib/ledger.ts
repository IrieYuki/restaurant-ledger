export const LEDGER_CATEGORIES = [
  "普通进账",
  "会员充值",
  "备菜成本",
  "其他成本",
] as const;

export type LedgerCategory = (typeof LEDGER_CATEGORIES)[number];
export type LedgerDirection = "income" | "cost";

export interface LedgerRecord {
  id: string;
  category: LedgerCategory;
  amount: number;
  createdAt: number;
  note: string;
}

export interface NewLedgerRecord {
  category: LedgerCategory;
  amount: number;
  note: string;
}

export interface LedgerMergeResult {
  importedCount: number;
  skippedCount: number;
}

export type AmountResult =
  | { ok: true; amount: number }
  | { ok: false; error: string };

export const MAX_RECORD_AMOUNT = 1_000_000;
export const MAX_NOTE_LENGTH = 100;

const DB_NAME = "restaurant-ledger";
const DB_VERSION = 1;
const STORE_NAME = "records";
const READ_TIMEOUT_MS = 8_000;

export const CATEGORY_DETAILS: Record<
  LedgerCategory,
  { direction: LedgerDirection; description: string; badgeClass: string }
> = {
  普通进账: {
    direction: "income",
    description: "日常营业款",
    badgeClass: "bg-emerald-50 text-emerald-700",
  },
  会员充值: {
    direction: "income",
    description: "会员预存金额",
    badgeClass: "bg-sky-50 text-sky-700",
  },
  备菜成本: {
    direction: "cost",
    description: "食材与备菜支出",
    badgeClass: "bg-amber-50 text-amber-800",
  },
  其他成本: {
    direction: "cost",
    description: "燃气、耗材等支出",
    badgeClass: "bg-stone-100 text-stone-700",
  },
};

export function isLedgerCategory(value: unknown): value is LedgerCategory {
  return LEDGER_CATEGORIES.some((category) => category === value);
}

export function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateAmount(expression: string): AmountResult {
  const normalized = expression
    .trim()
    .replace(/\s+/g, "")
    .replace(/[×xX]/g, "*")
    .replace(/÷/g, "/")
    .replace(/[−–—]/g, "-");

  if (!normalized) {
    return { ok: false, error: "请输入金额或算术表达式。" };
  }

  if (normalized.length > 100) {
    return { ok: false, error: "表达式过长，请控制在 100 个字符以内。" };
  }

  if (!/^[\d+\-*/().]+$/.test(normalized)) {
    return { ok: false, error: "表达式只能包含数字、括号和 + - * /。" };
  }

  let index = 0;

  function readNumber(): number {
    const start = index;
    let dotCount = 0;

    while (index < normalized.length) {
      const character = normalized[index];

      if (character === ".") {
        dotCount += 1;
        if (dotCount > 1) {
          throw new Error("数字格式不正确。");
        }
        index += 1;
        continue;
      }

      if (/\d/.test(character)) {
        index += 1;
        continue;
      }

      break;
    }

    const token = normalized.slice(start, index);
    if (!token || token === ".") {
      throw new Error("表达式中缺少数字或格式不正确。");
    }

    const value = Number(token);
    if (!Number.isFinite(value)) {
      throw new Error("表达式中的数字无效。");
    }

    return value;
  }

  function parsePrimary(): number {
    if (normalized[index] === "(") {
      index += 1;
      const value = parseSum();
      if (normalized[index] !== ")") {
        throw new Error("括号没有正确闭合。");
      }
      index += 1;
      return value;
    }

    return readNumber();
  }

  function parseUnary(): number {
    if (normalized[index] === "+") {
      index += 1;
      return parseUnary();
    }

    if (normalized[index] === "-") {
      index += 1;
      return -parseUnary();
    }

    return parsePrimary();
  }

  function parseProduct(): number {
    let value = parseUnary();

    while (normalized[index] === "*" || normalized[index] === "/") {
      const operator = normalized[index];
      index += 1;
      const right = parseUnary();

      if (operator === "/" && right === 0) {
        throw new Error("不能除以 0。");
      }

      value = operator === "*" ? value * right : value / right;

      if (!Number.isFinite(value)) {
        throw new Error("计算结果超出可用范围。");
      }
    }

    return value;
  }

  function parseSum(): number {
    let value = parseProduct();

    while (normalized[index] === "+" || normalized[index] === "-") {
      const operator = normalized[index];
      index += 1;
      const right = parseProduct();
      value = operator === "+" ? value + right : value - right;

      if (!Number.isFinite(value)) {
        throw new Error("计算结果超出可用范围。");
      }
    }

    return value;
  }

  try {
    const value = parseSum();

    if (index !== normalized.length) {
      return { ok: false, error: "表达式格式不正确，请检查运算符和括号。" };
    }

    const amount = roundCurrency(value);

    if (!Number.isFinite(amount)) {
      return { ok: false, error: "金额必须是有限数值。" };
    }

    if (amount <= 0) {
      return { ok: false, error: "金额必须大于 0。" };
    }

    if (amount > MAX_RECORD_AMOUNT) {
      return {
        ok: false,
        error: `单笔金额不能超过 ¥${MAX_RECORD_AMOUNT.toLocaleString("zh-CN")}。`,
      };
    }

    return { ok: true, amount };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "金额表达式无效。",
    };
  }
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB 操作失败。"));
  });
}

function transactionToPromise(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("IndexedDB 事务失败。"));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("IndexedDB 事务已取消。"));
  });
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
  onTimeout?: () => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timeout = globalThis.setTimeout(() => {
      if (settled) return;

      settled = true;

      try {
        onTimeout?.();
      } catch {
        // The transaction may already be inactive or complete.
      }

      reject(new Error(message));
    }, timeoutMs);

    promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        globalThis.clearTimeout(timeout);
        resolve(value);
      },
      (error: unknown) => {
        if (settled) return;
        settled = true;
        globalThis.clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

export function awaitIndexedDbRead<T>(
  request: IDBRequest<T>,
  transaction: IDBTransaction,
  timeoutMs = READ_TIMEOUT_MS,
): Promise<T> {
  const requestDone = requestToPromise(request);
  const transactionDone = transactionToPromise(transaction);

  return withTimeout(
    Promise.all([requestDone, transactionDone]).then(([result]) => result),
    timeoutMs,
    "读取本地账本超时。数据未被修改，请检查浏览器存储权限后重试。",
    () => {
      transaction.abort();
    },
  );
}

function openLedgerDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !("indexedDB" in window)) {
      reject(new Error("当前浏览器不支持 IndexedDB。"));
      return;
    }

    let settled = false;
    const timeout = window.setTimeout(() => {
      settled = true;
      reject(
        new Error(
          "打开本地账本超时，请确认浏览器允许本地存储后重试。",
        ),
      );
    }, 8000);

    function finish(database: IDBDatabase) {
      window.clearTimeout(timeout);

      if (settled) {
        database.close();
        return;
      }

      settled = true;
      resolve(database);
    }

    function fail(error: Error) {
      window.clearTimeout(timeout);

      if (settled) return;
      settled = true;
      reject(error);
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt");
      }
    };

    request.onsuccess = () => finish(request.result);
    request.onerror = () =>
      fail(request.error ?? new Error("无法打开本地账本数据库。"));
    request.onblocked = () =>
      fail(new Error("本地账本数据库被其他页面占用，请关闭其他标签页后重试。"));
  });
}

function isValidStoredRecord(value: unknown): value is LedgerRecord {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Partial<LedgerRecord>;

  return (
    typeof record.id === "string" &&
    isLedgerCategory(record.category) &&
    typeof record.amount === "number" &&
    Number.isFinite(record.amount) &&
    record.amount > 0 &&
    typeof record.createdAt === "number" &&
    Number.isFinite(record.createdAt) &&
    typeof record.note === "string"
  );
}

export async function loadLedgerRecords(): Promise<LedgerRecord[]> {
  const database = await openLedgerDatabase();

  try {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).getAll();
    const records = await awaitIndexedDbRead(request, transaction);

    return records
      .filter(isValidStoredRecord)
      .sort((left, right) => right.createdAt - left.createdAt);
  } finally {
    database.close();
  }
}

export async function saveLedgerRecord(
  input: NewLedgerRecord,
): Promise<LedgerRecord> {
  const record: LedgerRecord = {
    id:
      typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    category: input.category,
    amount: roundCurrency(input.amount),
    createdAt: Date.now(),
    note: input.note.trim().slice(0, MAX_NOTE_LENGTH),
  };

  const database = await openLedgerDatabase();

  try {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).add(record);

    await transactionToPromise(transaction);

    return record;
  } finally {
    database.close();
  }
}

export async function updateLedgerRecord(
  id: string,
  input: NewLedgerRecord,
): Promise<LedgerRecord> {
  const database = await openLedgerDatabase();

  try {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const transactionDone = transactionToPromise(transaction);
    const store = transaction.objectStore(STORE_NAME);
    const existingRecord = await requestToPromise(store.get(id));

    if (!isValidStoredRecord(existingRecord)) {
      transaction.abort();
      await transactionDone.catch(() => undefined);
      throw new Error("要编辑的记录不存在或数据无效。");
    }

    const updatedRecord: LedgerRecord = {
      ...existingRecord,
      category: input.category,
      amount: roundCurrency(input.amount),
      note: input.note.trim().slice(0, MAX_NOTE_LENGTH),
    };

    store.put(updatedRecord);
    await transactionDone;

    return updatedRecord;
  } finally {
    database.close();
  }
}

export async function deleteLedgerRecord(id: string): Promise<void> {
  const database = await openLedgerDatabase();

  try {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const transactionDone = transactionToPromise(transaction);
    transaction.objectStore(STORE_NAME).delete(id);
    await transactionDone;
  } finally {
    database.close();
  }
}

export async function mergeLedgerRecords(
  records: LedgerRecord[],
): Promise<LedgerMergeResult> {
  if (!records.every(isValidStoredRecord)) {
    throw new Error("备份中存在无效记录，已取消导入。");
  }

  const database = await openLedgerDatabase();

  try {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const transactionDone = transactionToPromise(transaction);
    const store = transaction.objectStore(STORE_NAME);

    try {
      const existingRecords = await requestToPromise(store.getAll());
      const existingIds = new Set(
        existingRecords
          .filter(isValidStoredRecord)
          .map((record) => record.id),
      );
      const recordsToImport = records.filter(
        (record) => !existingIds.has(record.id),
      );

      for (const record of recordsToImport) {
        store.add(record);
      }

      await transactionDone;

      return {
        importedCount: recordsToImport.length,
        skippedCount: records.length - recordsToImport.length,
      };
    } catch (error) {
      try {
        transaction.abort();
      } catch {
        // The transaction may already have completed or aborted.
      }
      await transactionDone.catch(() => undefined);
      throw error;
    }
  } finally {
    database.close();
  }
}
