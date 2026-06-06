# Requirement 6: Distributed Caching Strategy (Redis Caching Layer)

This document explains the design, architecture, and validation of the Distributed Caching strategy implemented in this project to resolve **Requirement 6**.

---

## 1. Design & Architectural Strategy

In high-concurrency systems, querying database engines directly for every request creates performance bottlenecks and high system load. To optimize read performance, we integrated a caching layer simulating **Redis** using the **Cache-Aside Pattern**.

### A. Cache-Aside Pattern (Lazy Loading)
1. **Query Cache:** When a user requests product details (`GET /products/:id/cached`), the system queries the caching layer first.
2. **Cache Hit:** If the product is found in the cache, it is returned immediately (response time ~2ms).
3. **Cache Miss:** If the product is not in the cache, the system queries the database (which includes a simulated `500ms` query delay). It then stores the retrieved product in the cache with a **Time-To-Live (TTL) of 60 seconds** and returns it to the user.

### B. Cache Invalidation (Preventing Stale Data)
A common issue in caching is **stale data** (e.g., a customer buys a product, reducing stock, but other users still see the old stock from the cache).
To solve this:
- Whenever a product's stock is updated (via **Optimistic Locking** or **Pessimistic Locking**), the system automatically **invalidates (deletes)** the cache entry (`redis.del(productId)`).
- The next product fetch will trigger a **Cache Miss**, fetch the fresh stock from the database, and re-cache the updated data.

### C. Technology Stack Selection: `ioredis` & `ioredis-mock`
- **Production Readiness:** The codebase uses `ioredis`, the standard Redis client for Node.js.
- **Developer Convenience:** For testing and evaluation, we integrate `ioredis-mock`. This runs a full-featured mock Redis server in-memory, eliminating the need to have a running Redis instance or Docker container on the host machine. You can swap this to a real Redis server by uncommenting a single line in [redis.service.ts](file:///c:/Users/Zaid/parallel-programming/src/db/redis.service.ts).

---

## 2. Code Modifications & Structure

The caching module is composed of the following updates:

1. **Redis Service:** [redis.service.ts](file:///c:/Users/Zaid/parallel-programming/src/db/redis.service.ts)
   Initializes the mock/real Redis client and provides clean `get`, `set` (with TTL), and `del` wrappers.
2. **Database Latency Simulation:** [db.service.ts](file:///c:/Users/Zaid/parallel-programming/src/db/db.service.ts)
   Adds `findProductWithDelay(id)` simulating `500ms` database read latency.
3. **Caching & Invalidation Logic:** [products.service.ts](file:///c:/Users/Zaid/parallel-programming/src/products/products.service.ts)
   - Integrates the Cache-Aside pattern.
   - Deletes the cached product when updates succeed.
4. **Endpoint Exposure:** [products.controller.ts](file:///c:/Users/Zaid/parallel-programming/src/products/products.controller.ts)
   - Exposes `GET /products/:id/cached`.

---

## 3. How to Run Before & After Verification Tests

To verify that the caching layer works and invalidates correctly, follow these steps:

### Step 1: Start the NestJS Application
Open your terminal and start the server:
```bash
npm run start
```
*Note: Make sure to run `npm install` first to install the new `ioredis` and `ioredis-mock` dependencies.*

### Step 2: Run the Caching Test Script
In a separate terminal window, run the automated test:
```bash
node test-caching
```

### Expected Output & Explanation

```text
================================================================
   STARTING DISTRIBUTED CACHING VERIFICATION TESTS (REQ 6)      
================================================================

--- TEST 2: Cache-Aside Lifecycle (findOneCached) ---
Request 1: Fetching Laptop (ID: 1) for the first time...
Result: Source = "Database", Stock = 10, Version = 1
Response Time: 512ms (Expected: ~500ms due to Database delay)

Request 2: Fetching Laptop (ID: 1) again (should hit Cache)...
Result: Source = "Cache (Redis)", Stock = 10, Version = 1
Response Time: 3ms (Expected: <15ms - Fast Cache Hit)

Request 3: Fetching Laptop (ID: 1) third time (should hit Cache)...
Result: Source = "Cache (Redis)", Stock = 10, Version = 1
Response Time: 1ms (Expected: <15ms - Fast Cache Hit)

--- TEST 3: Cache Invalidation Scenario (Stock Update) ---
We will purchase 2 units of Laptop (ID: 1) using Optimistic Locking.
This should modify the stock in the database and INVALIDATE the cache.
Update Result: Stock updated successfully using Optimistic Locking
New Database Stock: 8, New Version: 2

Request 4: Fetching Laptop (ID: 1) immediately after update...
The cache was invalidated, so it must query the Database again.
Result: Source = "Database", Stock = 8, Version = 2
Response Time: 504ms (Expected: ~500ms - Database Query for fresh data)

Request 5: Fetching Laptop (ID: 1) again...
Result: Source = "Cache (Redis)", Stock = 8, Version = 2
Response Time: 2ms (Expected: <15ms - Cache Hit with updated stock)
```

- **Before Caching (Request 1):** The application queries the database directly, taking **~500ms**.
- **After Caching (Requests 2 & 3):** Subsequent reads hit the Redis cache, serving requests instantly in **~1-3ms**.
- **Data Freshness / Invalidation (Request 4 & 5):** When the stock changes, the old cache is invalidated. The next query forces a database fetch (**~500ms**) to load the fresh stock level (from `10` down to `8`), ensuring complete consistency.
