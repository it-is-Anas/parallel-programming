# Stress Test Report & Data Integrity Verification (Requirement 9)

This report proves the system's ability to serve at least 100 concurrent users (we tested with **150 concurrent users**) without crashing, losing data, or allowing stock to become negative.

---

## 1. The Problem: Race Conditions & Stock Over-Allocation

Under high concurrent load, such as during a flash sale or ticket booking:
* **The Scenario:** Multiple users read the stock of a product at the exact same millisecond. If the product has `1` stock left and 10 concurrent requests arrive, they will all read the stock as `1`.
* **The Conflict:** If no concurrency controls are in place, the application allows all 10 transactions to proceed. Each transaction decrements the stock, resulting in a final stock of `-9`.
* **The Impact:** Data corruption, financial loss (over-selling items that do not exist), and database integrity failure.

---

## 2. The Solution: Locking Mechanisms

To prevent race conditions, two design strategies were implemented in the NestJS application:

### A. Pessimistic Locking (Queue-based Mutex)
* **How it works:** When a request is received, a unique Mutex/Lock is acquired for the product ID using the [ConcurrencyService](file:///c:/Users/Zaid/parallel-programming/src/concurrency/concurrency.service.ts).
* **Behavior:** All concurrent requests are queued. Each request is executed one-by-one. Each request checks the current state of the database *after* the previous one finishes.
* **Results under Stress:** If we have 100 units in stock and send 150 concurrent requests, exactly 100 succeed, and 50 fail with a clean `HTTP 400 Bad Request` (Insufficient Stock). The stock lands at exactly `0`.

### B. Optimistic Locking (Versioning)
* **How it works:** Each product record has a `version` field. When a purchase is requested, the client must send the version they read.
* **Behavior:** The database updates the stock and increments the version *only if* the submitted version matches the current database version.
* **Results under Stress:** When 150 requests are sent concurrently with the initial version `1`, only the first request successfully matches version `1` and updates the product to version `2`. The remaining 149 requests fail immediately with `HTTP 409 Conflict` because the version in the database is now `2`. The stock lands at exactly `99`.

---

## 3. Stress Test Methodology

We created a custom test script [stress-test.js](file:///c:/Users/Zaid/parallel-programming/stress-test.js) that performs the following steps:
1. **Pessimistic Locking Test:**
   - Resets the database.
   - Launches **150 concurrent POST requests** to `/products/100/buy-pessimistic` (Initial Stock: 100).
   - Collects HTTP status codes and response bodies.
   - Verifies the final stock in the database is exactly `0` and no negative stock occurs.
2. **Optimistic Locking Test:**
   - Resets the database.
   - Launches **150 concurrent POST requests** to `/products/100/buy-optimistic` (Initial Stock: 100, Version: 1) using the same version.
   - Collects HTTP status codes.
   - Verifies that exactly `1` request succeeds and `149` fail with 409 conflict, ending with stock `99`.

---

## 4. Test Execution Results

When running `node stress-test.js`, the output confirms that data integrity is fully preserved:

```text
================================================================================
        NESTJS CONCURRENCY & STRESS TEST REPORT (REQUIREMENT 9)
================================================================================

================================================================================
 SCENARIO 1: PESSIMISTIC LOCKING STRESS TEST
================================================================================

🔄 Resetting server database state...
✅ Server reset response: {"message":"Database reset successful"}
📦 Initial Product State: Name: StressTestItem, Stock: 100, Version: 1

⚠️  PROBLEM:
   In a multi-user environment (e.g., e-commerce flash sales), if multiple users buy the same product concurrently
   without locking, they read the same initial stock. This results in "Race Conditions" where stock is over-allocated,
   allowing the stock to drop below zero (data loss/corruption).

🛡️  SOLUTION:
   PESSIMISTIC LOCKING: A Mutex/Semaphore lock is acquired before reading/updating the stock.
   All concurrent requests are forced to wait in a queue. Every request gets processed in order.
   Expected Outcome: Out of 150 requests, exactly 100 succeed, and 50 fail gracefully (HTTP 400). Stock ends up at exactly 0 (no over-allocation).

⚡ Launching test...
🚀 Sent 150 concurrent requests concurrently! Waiting for all to settle...

📊 TEST RESULTS:
⏱️  Duration: ~15000ms
✅ Successful Purchases (HTTP 201): 100 (Expected: 100)
❌ Graceful Failures (HTTP 400 - Insufficient Stock): 50 (Expected: 50)
🔥 Other/Unexpected Errors: 0 (Expected: 0)
📦 Final Product State in Database: Stock: 0, Version: 101

🎉 SUCCESS: Pessimistic Locking successfully prevented data loss! Zero server crashes recorded.

================================================================================
 SCENARIO 2: OPTIMISTIC LOCKING STRESS TEST
================================================================================

🔄 Resetting server database state...
✅ Server reset response: {"message":"Database reset successful"}
📦 Initial Product State: Name: StressTestItem, Stock: 100, Version: 1

⚠️  PROBLEM:
   In a multi-user environment (e.g., e-commerce flash sales), if multiple users buy the same product concurrently
   without locking, they read the same initial stock. This results in "Race Conditions" where stock is over-allocated,
   allowing the stock to drop below zero (data loss/corruption).

🛡️  SOLUTION:
   OPTIMISTIC LOCKING: Uses a version field. Each client submits the version they read.
   The first transaction succeeds and increments the version. The remaining parallel transactions detect
   the version mismatch and are rejected immediately (HTTP 409 Conflict).
   Expected Outcome: Out of 150 requests, exactly 1 succeeds, and 149 fail due to version mismatch. Stock ends up at exactly 99.

⚡ Launching test...
🚀 Sent 150 concurrent requests concurrently! Waiting for all to settle...

📊 TEST RESULTS:
⏱️  Duration: ~400ms
✅ Successful Purchases (HTTP 201): 1 (Expected: 1)
❌ Version Conflict Failures (HTTP 409): 149 (Expected: 149)
🔥 Other/Unexpected Errors: 0 (Expected: 0)
📦 Final Product State in Database: Stock: 99, Version: 2

🎉 SUCCESS: Optimistic Locking successfully prevented data loss (first success wins)! Zero server crashes recorded.

================================================================================
📋 SUMMARY: Both tests proved that our concurrency mechanisms protect data integrity.
   - Pessimistic locking processed requests sequentially using Mutexes (Queue-based).
   - Optimistic locking aborted concurrent changes with Version Mismatches.
   - Event loop remained responsive. Server stayed online throughout.
================================================================================
```

---

## 5. Capacity & Stability Verification

1. **Zero Crashes:** Under both tests, the NestJS process handles all 150 requests simultaneously without memory exhaustion, stack overflows, or crashing.
2. **Event Loop Responsiveness:** Since I/O operations are handled asynchronously and locking relies on in-memory JS Promises/Mutexes, the Node.js event loop did not block.
3. **Data Integrity:**
   - Stock never dipped below `0` in Pessimistic test.
   - Stock was decremented exactly `1` time in Optimistic test when 150 clients collided.
