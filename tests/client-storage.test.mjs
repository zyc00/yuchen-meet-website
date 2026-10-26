import test from "node:test";
import assert from "node:assert/strict";
import { safeStorage } from "../lib/client/storage.mjs";
test("browser storage restrictions never interrupt a booking or confirmation", () => {
  const denied = () => {
    throw new Error("SecurityError");
  };
  assert.equal(safeStorage(denied, "setItem", "key", "value"), null);
  assert.equal(safeStorage(denied, "removeItem", "key"), null);
  assert.equal(safeStorage(denied, "getItem", "key"), null);
  const quota = () => ({
    setItem() {
      throw new Error("QuotaExceededError");
    },
  });
  assert.equal(safeStorage(quota, "setItem", "key", "value"), null);
  let saved;
  safeStorage(
    () => ({
      setItem: (key, value) => {
        saved = [key, value];
      },
    }),
    "setItem",
    "key",
    "value",
  );
  assert.deepEqual(saved, ["key", "value"]);
});
