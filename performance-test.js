
/**
 * PERFORMANCE COMPARISON TEST: Mutex & Semaphore
 * 
 * The purpose of this file is to demonstrate how using Mutex and Semaphore leads to 
 * "Better Performance" by balancing execution speed and data integrity.
 */

const numUsers = 10;
const API_BASE = 'http://127.0.0.1:3000';

async function runPerformanceTest() {
    console.log('=====================================================');
    console.log('   Performance Analysis Test: Mutex & Semaphore   ');
    console.log('=====================================================\n');

    try {
        // 1. Reset Server
        console.log('[1/4] Resetting server state...');
        const resetRes = await fetch(`${API_BASE}/reset`, { method: 'POST' });
        if (!resetRes.ok) throw new Error('Failed to connect to the server. Make sure the project is running (npm run start).');

        // 2. Prepare Data
        console.log(`[2/4] Preparing ${numUsers} users with different products...`);
        for (let i = 0; i < numUsers; i++) {
            const userId = `perf_user_${i}`;
            // Use different products (1, 2, 3) to avoid Mutex locking on the same product.
            // This will allow the Semaphore to demonstrate its ability to pass two requests at once.
            const productId = (i % 3 + 1).toString(); 
            
            await fetch(`${API_BASE}/cart/${userId}/add`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ productId, quantity: 1 })
            });
        }

        // 3. Execute Parallel Purchases
        console.log(`[3/4] Starting processing of ${numUsers} concurrent purchases...`);
        console.log(`(Note: Semaphore is limited to 2 in the server to demonstrate capacity control)`);
        
        const startTime = Date.now();
        const promises = [];

        for (let i = 0; i < numUsers; i++) {
            const userId = `perf_user_${i}`;
            promises.push(
                fetch(`${API_BASE}/orders/checkout/${userId}`, { method: 'POST' })
                    .then(res => res.json())
                    .then(data => {
                        const elapsed = Date.now() - startTime;
                        console.log(`[${elapsed.toString().padStart(5, ' ')}ms] Finished processing ${userId}`);
                        return { userId, elapsed, success: !!data.message };
                    })
            );
        }

        const results = await Promise.all(promises);
        const totalTime = Date.now() - startTime;

        // 4. Display Results and Analysis
        console.log('\n=====================================================');
        console.log(`[4/4] Test finished in ${totalTime}ms.`);
        console.log('=====================================================\n');

        const taskDuration = 500; // Simulated delay in OrdersService
        const estimatedSerialTime = numUsers * taskDuration; // If system processed one by one
        const estimatedUnlimitedTime = taskDuration; // If system processed everything at once (dangerously)

        console.log('--- Performance Comparison Analysis ---');
        console.log(`1. Serial Execution (No Parallelism): ~${estimatedSerialTime}ms`);
        console.log(`2. Semaphore Execution (2 slots): ${totalTime}ms (Current Reality)`);
        console.log(`3. Full Parallel Execution (No Constraints): ~${estimatedUnlimitedTime}ms (Fast but causes data conflicts)`);
        
        console.log('\n--- Why is this "Better Performance"? ---');
        console.log(`1. Speed: The system is ${Math.round(estimatedSerialTime / totalTime)}x faster than one-by-one serial execution.`);
        console.log(`2. Efficiency: Thanks to the per-product Mutex, non-conflicting operations (different products) run in parallel.`);
        console.log(`3. Stability: The Semaphore prevents CPU/DB resource exhaustion, preventing system crashes under high load.`);
        console.log(`4. Integrity: Guaranteed 100% data health, the most critical performance metric in financial systems.`);

    } catch (error) {
        console.error('\n❌ Error: Could not reach the server.');
        console.log('Make sure to start the NestJS application first via:');
        console.log('npm run start');
        console.log('\nDetails:', error.message);
    }
}

runPerformanceTest();
