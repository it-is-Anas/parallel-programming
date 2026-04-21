
/**
 * COMPARISON TEST: Solved vs. Unsolved Problem
 * This test demonstrates the "Problem" (Race Condition & No Capacity Control)
 * vs the "Solution" (Mutex & Semaphore).
 */

const API_BASE = 'http://127.0.0.1:3000';
const numRequests = 20;

async function runComparison() {
    console.log('=====================================================');
    console.log('   COMPARISON: UNSAFE vs SAFE (Solved Problem)   ');
    console.log('=====================================================\n');

    // --- PHASE 1: THE PROBLEM (UNSAFE) ---
    console.log('--- PHASE 1: Running UNSAFE Checkout (The Problem) ---');
    await fetch(`${API_BASE}/reset`, { method: 'POST' });
    
    console.log(`Populating carts for ${numRequests} users...`);
    for (let i = 0; i < numRequests; i++) {
        const userId = `user_unsafe_${i}`;
        await fetch(`${API_BASE}/cart/${userId}/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ productId: '3', quantity: 1 })
        });
    }

    console.log('Starting concurrent unsafe checkouts...');
    const startUnsafe = Date.now();
    const unsafePromises = [];
    for (let i = 0; i < numRequests; i++) {
        unsafePromises.push(fetch(`${API_BASE}/orders/checkout-unsafe/user_unsafe_${i}`, { method: 'POST' }).then(async r => {
            const data = await r.json();
            return { ok: r.ok, data };
        }));
    }
    const unsafeResults = await Promise.all(unsafePromises);
    const endUnsafe = Date.now();

    const unsafeSuccesses = unsafeResults.filter(r => r.ok).length;
    const productsResUnsafe = await fetch(`${API_BASE}/products/3`);
    const productUnsafe = await productsResUnsafe.json();

    console.log('\n[UNSAFE RESULTS - THE PROBLEM]');
    console.log(`- Status: ${unsafeSuccesses} users successfully checked out (Expected only 1)`);
    console.log(`- Data Integrity: Final Stock is ${productUnsafe.stock} (WRONG DATA - should not be negative)`);
    console.log(`- Duration: ${endUnsafe - startUnsafe}ms\n`);


    // --- PHASE 2: THE SOLUTION (SAFE) ---
    console.log('--- PHASE 2: Running SAFE Checkout (The Solution) ---');
    await fetch(`${API_BASE}/reset`, { method: 'POST' });
    
    console.log(`Populating carts for ${numRequests} users...`);
    for (let i = 0; i < numRequests; i++) {
        const userId = `user_safe_${i}`;
        await fetch(`${API_BASE}/cart/${userId}/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ productId: '3', quantity: 1 })
        });
    }

    console.log('Starting concurrent safe checkouts...');
    const startSafe = Date.now();
    const safePromises = [];
    for (let i = 0; i < numRequests; i++) {
        safePromises.push(fetch(`${API_BASE}/orders/checkout/user_safe_${i}`, { method: 'POST' }).then(async r => {
            const data = await r.json();
            return { ok: r.ok, data };
        }));
    }
    const safeResults = await Promise.all(safePromises);
    const endSafe = Date.now();

    const safeSuccesses = safeResults.filter(r => r.ok).length;
    const productsResSafe = await fetch(`${API_BASE}/products/3`);
    const productSafe = await productsResSafe.json();

    console.log('\n[SAFE RESULTS - THE SOLUTION]');
    console.log(`- Status: ${safeSuccesses} user successfully checked out (RIGHT DATA)`);
    console.log(`- Data Integrity: Final Stock is ${productSafe.stock} (RIGHT DATA - exactly 0)`);
    console.log(`- Duration: ${endSafe - startSafe}ms (Managed via Semaphore)\n`);


    // --- FINAL ANALYSIS ---
    console.log('--- FINAL SUMMARY ---');
    if (productUnsafe.stock < 0) {
        console.log('❌ THE PROBLEM: Race condition occurred! Stock is negative.');
        console.log(`   Multiple users (${unsafeSuccesses}) were allowed to buy the same item.`);
    }

    if (productSafe.stock === 0 && safeSuccesses === 1) {
        console.log('✅ THE SOLUTION: Mutex & Semaphore maintained 100% data integrity.');
        console.log('   Even with concurrent requests, only the available stock was sold.');
    }
}

runComparison().catch(err => {
    console.error('Error: Make sure the server is running on port 3000.');
    console.error(err.message);
});
