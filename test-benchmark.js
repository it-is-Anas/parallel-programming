// test-benchmark.js
// Requirement 10: Benchmarking & Bottleneck Analysis

const http = require('http');

const CONCURRENCY = 200;
const PRODUCT_ID = '1';
const BASE_URL = 'http://127.0.0.1:3000';

function makeRequest(url) {
  return new Promise((resolve) => {
    const start = Date.now();
    http.get(url, (res) => {
      res.resume(); // Consume data to free up memory
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          duration: Date.now() - start
        });
      });
    }).on('error', (err) => {
      resolve({
        statusCode: 500,
        duration: Date.now() - start,
        error: err.message
      });
    });
  });
}

async function runBenchmark(testName, url) {
  console.log(`\n================================================================================`);
  console.log(`🚀 RUNNING BENCHMARK: ${testName}`);
  console.log(`   URL: ${url}`);
  console.log(`   Concurrency: ${CONCURRENCY} simultaneous requests`);
  console.log(`================================================================================`);

  const startTime = Date.now();
  const promises = [];

  for (let i = 0; i < CONCURRENCY; i++) {
    promises.push(makeRequest(url));
  }

  const results = await Promise.all(promises);
  const totalTime = Date.now() - startTime;

  let totalDuration = 0;
  let minDuration = Infinity;
  let maxDuration = 0;
  let successCount = 0;
  let errorCount = 0;

  results.forEach(res => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      successCount++;
    } else {
      errorCount++;
    }
    totalDuration += res.duration;
    if (res.duration < minDuration) minDuration = res.duration;
    if (res.duration > maxDuration) maxDuration = res.duration;
  });

  const avgDuration = (totalDuration / CONCURRENCY).toFixed(2);
  const rps = ((successCount / totalTime) * 1000).toFixed(2);

  console.log(`📊 RESULTS:`);
  console.log(`   - Total Requests:    ${CONCURRENCY}`);
  console.log(`   - Successes (200s):  ${successCount}`);
  console.log(`   - Errors/Failures:   ${errorCount}`);
  console.log(`   - Total Time Taken:  ${totalTime} ms`);
  console.log(`   - Requests/Second:   ${rps} req/sec`);
  console.log(`\n⏱️  LATENCY:`);
  console.log(`   - Average Latency:   ${avgDuration} ms`);
  console.log(`   - Min Latency:       ${minDuration} ms`);
  console.log(`   - Max Latency:       ${maxDuration} ms`);
  console.log(`================================================================================\n`);
  
  return {
    rps,
    avgDuration,
    totalTime
  };
}

async function main() {
  console.log('Preparing to Benchmark...');
  // Warm up or reset things if needed. We'll just run them directly.

  console.log('\n[1] BENCHMARKING BEFORE IMPROVEMENT (BOTTLENECK)');
  console.log('    Simulating Heavy Database I/O without Cache (Direct DB query)');
  const beforeStats = await runBenchmark('BEFORE (No Cache)', `${BASE_URL}/products/${PRODUCT_ID}`);

  console.log('\n[2] BENCHMARKING AFTER IMPROVEMENT (OPTIMIZED)');
  console.log('    Using Redis Cache-Aside Pattern to eliminate DB Latency');
  // Send 1 primer request to ensure the cache is populated before benchmarking
  await makeRequest(`${BASE_URL}/products/${PRODUCT_ID}/cached`); 
  const afterStats = await runBenchmark('AFTER (Redis Cache)', `${BASE_URL}/products/${PRODUCT_ID}/cached`);

  console.log('\n================================================================================');
  console.log('🏆 FINAL COMPARISON (BOTTLENECK vs. OPTIMIZED)');
  console.log('================================================================================');
  console.log(`                       | Before (No Cache) | After (Redis Cache) |`);
  console.log(`------------------------------------------------------------------`);
  console.log(` Requests Per Second   | ${beforeStats.rps.padEnd(17)} | ${afterStats.rps.padEnd(19)} |`);
  console.log(` Average Latency       | ${(beforeStats.avgDuration + ' ms').padEnd(17)} | ${(afterStats.avgDuration + ' ms').padEnd(19)} |`);
  console.log(` Total Execution Time  | ${(beforeStats.totalTime + ' ms').padEnd(17)} | ${(afterStats.totalTime + ' ms').padEnd(19)} |`);
  
  const rpsImprovement = (parseFloat(afterStats.rps) / parseFloat(beforeStats.rps)).toFixed(2);
  console.log(`\n🚀 PERFORMANCE GAIN: The optimized endpoint is ${rpsImprovement}x faster!`);
  console.log('================================================================================\n');
}

main().catch(console.error);
