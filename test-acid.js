const userId = 'user_acid_test';

async function testAcid() {
  // ==============================================================================
  // 1. اختبار المعاملات الذرية الكافية (ACID Transaction with Rollback)
  // ==============================================================================
  console.log('--- Resetting Server State ---');
  await fetch('http://127.0.0.1:3000/reset', { method: 'POST' });

  // جلب المخزون قبل البدء (سيكون 10)
  let prodRes = await fetch('http://127.0.0.1:3000/products/1');
  let product = await prodRes.json();
  console.log(`Initial stock for Product 1 (Laptop): ${product.stock}`);

  // إضافة منتج للسلة
  console.log('Adding 1 Laptop to cart for User...');
  await fetch(`http://127.0.0.1:3000/cart/${userId}/add`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ productId: '1', quantity: 1 })
  });

  console.log('\n--- 1. Testing ACID Checkout (Simulating Payment Failure) ---');
  let res = await fetch(`http://127.0.0.1:3000/orders/checkout/${userId}?simulatePaymentFailure=true`, { method: 'POST' });
  let data = await res.json();
  console.log(`HTTP Status ${res.status}:`, data.message || data.error);

  // التحقق من المخزون بعد العملية (يجب أن يبقى 10 بسبب الـ Rollback)
  prodRes = await fetch('http://127.0.0.1:3000/products/1');
  product = await prodRes.json();
  console.log(`Stock for Product 1 after ACID failure: ${product.stock} (Expected: 10 due to Rollback)`);
  if (product.stock === 10) {
    console.log('✅ SUCCESS: Transaction rolled back correctly. Data is consistent!');
  } else {
    console.log('❌ FAILURE: Transaction did not roll back stock!');
  }

  // ==============================================================================
  // 2. اختبار العملية دون سلامة المعاملة (Non-ACID Checkout without Rollback)
  // ==============================================================================
  console.log('\n--- Resetting Server State ---');
  await fetch('http://127.0.0.1:3000/reset', { method: 'POST' });

  // إضافة منتج للسلة
  console.log('Adding 1 Laptop to cart for User...');
  await fetch(`http://127.0.0.1:3000/cart/${userId}/add`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ productId: '1', quantity: 1 })
  });

  console.log('\n--- 2. Testing NON-ACID Checkout (Simulating Payment Failure) ---');
  res = await fetch(`http://127.0.0.1:3000/orders/checkout-no-acid/${userId}?simulatePaymentFailure=true`, { method: 'POST' });
  data = await res.json();
  console.log(`HTTP Status ${res.status}:`, data.message || data.error);

  // التحقق من المخزون بعد العملية (سيكون 9 وهو خطأ جسيم لأن الدفع فشل!)
  prodRes = await fetch('http://127.0.0.1:3000/products/1');
  product = await prodRes.json();
  console.log(`Stock for Product 1 after NON-ACID failure: ${product.stock} (Notice: It is 9 even though payment failed!)`);
  if (product.stock === 9) {
    console.log('⚠️ WARNING: Data is INCONSISTENT! Stock was deducted but order was not completed.');
  } else {
    console.log('Check failed.');
  }
}

testAcid();
