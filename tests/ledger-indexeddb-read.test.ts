import assert from "node:assert/strict";
import { test } from "node:test";
import { awaitIndexedDbRead } from "../src/lib/ledger";

interface FakeRequest<T> {
  result: T;
  error: DOMException | null;
  onsuccess: (() => void) | null;
  onerror: (() => void) | null;
}

interface FakeTransaction {
  error: DOMException | null;
  oncomplete: (() => void) | null;
  onerror: (() => void) | null;
  onabort: (() => void) | null;
  abortCalls: number;
  abort: () => void;
}

function createRequest<T>(result: T): FakeRequest<T> {
  return {
    result,
    error: null,
    onsuccess: null,
    onerror: null,
  };
}

function createTransaction(): FakeTransaction {
  return {
    error: null,
    oncomplete: null,
    onerror: null,
    onabort: null,
    abortCalls: 0,
    abort() {
      this.abortCalls += 1;
    },
  };
}

function asRequest<T>(request: FakeRequest<T>): IDBRequest<T> {
  return request as unknown as IDBRequest<T>;
}

function asTransaction(transaction: FakeTransaction): IDBTransaction {
  return transaction as unknown as IDBTransaction;
}

test("IndexedDB read resolves after request success and transaction completion", async () => {
  const request = createRequest([{ id: "a" }]);
  const transaction = createTransaction();
  const readPromise = awaitIndexedDbRead(
    asRequest(request),
    asTransaction(transaction),
    100,
  );

  request.onsuccess?.();
  transaction.oncomplete?.();

  assert.deepEqual(await readPromise, [{ id: "a" }]);
  assert.equal(transaction.abortCalls, 0);
});

test("IndexedDB request errors reject the read promise", async () => {
  const request = createRequest<string[]>([]);
  const transaction = createTransaction();
  const readPromise = awaitIndexedDbRead(
    asRequest(request),
    asTransaction(transaction),
    100,
  );
  const rejection = assert.rejects(readPromise, /request failed/);

  request.error = new Error("request failed") as unknown as DOMException;
  request.onerror?.();

  await rejection;
});

test("IndexedDB transaction errors and aborts reject the read promise", async () => {
  const errorRequest = createRequest<string[]>([]);
  const errorTransaction = createTransaction();
  const errorPromise = awaitIndexedDbRead(
    asRequest(errorRequest),
    asTransaction(errorTransaction),
    100,
  );
  const errorRejection = assert.rejects(errorPromise, /transaction failed/);

  errorTransaction.error = new Error(
    "transaction failed",
  ) as unknown as DOMException;
  errorTransaction.onerror?.();
  await errorRejection;

  const abortRequest = createRequest<string[]>([]);
  const abortTransaction = createTransaction();
  const abortPromise = awaitIndexedDbRead(
    asRequest(abortRequest),
    asTransaction(abortTransaction),
    100,
  );
  const abortRejection = assert.rejects(abortPromise, /事务已取消/);

  abortTransaction.onabort?.();
  await abortRejection;
});

test("IndexedDB read timeout aborts the transaction and rejects", async () => {
  const request = createRequest<string[]>([]);
  const transaction = createTransaction();
  const readPromise = awaitIndexedDbRead(
    asRequest(request),
    asTransaction(transaction),
    20,
  );

  await assert.rejects(readPromise, /读取本地账本超时/);
  assert.equal(transaction.abortCalls, 1);

  // A late abort event must not cause a second settlement or unhandled error.
  transaction.onabort?.();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(transaction.abortCalls, 1);
});
