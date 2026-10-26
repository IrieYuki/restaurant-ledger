import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateAmount, roundCurrency } from "../src/lib/ledger";

function expectAmountError(expression: string, message: RegExp) {
  const result = calculateAmount(expression);

  if (result.ok) {
    assert.fail(`Expected expression to fail: ${expression}`);
  }

  assert.match(result.error, message);
}

test("amount parser respects operator precedence and parentheses", () => {
  assert.deepEqual(calculateAmount("100+20*2"), { ok: true, amount: 140 });
  assert.deepEqual(calculateAmount("(80+20)*2"), { ok: true, amount: 200 });
});

test("amount parser rounds currency to two decimal places", () => {
  assert.deepEqual(calculateAmount("100/3"), { ok: true, amount: 33.33 });
  assert.deepEqual(calculateAmount("0.005"), { ok: true, amount: 0.01 });
  assert.equal(roundCurrency(0.1 + 0.2), 0.3);
});

test("amount parser rejects empty, zero, and negative values", () => {
  expectAmountError("", /请输入金额/);
  expectAmountError("   ", /请输入金额/);
  expectAmountError("0", /大于 0/);
  expectAmountError("-5", /大于 0/);
});

test("amount parser rejects division by zero", () => {
  expectAmountError("1/0", /不能除以 0/);
  expectAmountError("10/(5-5)", /不能除以 0/);
});

test("amount parser rejects invalid characters and malformed expressions", () => {
  expectAmountError("abc", /只能包含数字/);
  expectAmountError("1e3", /只能包含数字/);
  expectAmountError("1+", /缺少数字/);
  expectAmountError("(1+2", /括号没有正确闭合/);
  expectAmountError("1..2", /数字格式不正确/);
});

test("amount parser enforces the single-record maximum", () => {
  assert.deepEqual(calculateAmount("1000000"), {
    ok: true,
    amount: 1_000_000,
  });
  expectAmountError("1000000.01", /不能超过/);
  expectAmountError("999999+1.01", /不能超过/);
});
