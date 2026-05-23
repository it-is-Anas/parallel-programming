const userId = 'user_demo_bad_1';

async function testReq3Fail() {
  console.log('--- Checking out the BAD way (Synchronous) ---');
  const startTime = Date.now();
  
  console.log('Request sent... waiting for response...');
  
  // Notice we are calling checkout-bad which forces us to wait for the email and PDF
  const res = await fetch(`http://127.0.0.1:3000/orders/checkout-bad/${userId}`, { method: 'POST' });
  const data = await res.json();
  
  const endTime = Date.now();
  console.log('\nResponse received from server:', data);
  console.log(`\n🔴 TOTAL WAIT TIME FOR USER: ${(endTime - startTime) / 1000} seconds!`);
  
  console.log('\n--- CONCLUSION TO SHOW MR ---');
  console.log('PROBLEM: The user had to stare at a loading spinner for over 3.5 seconds just to checkout.');
  console.log('SOLUTION (Req 3): We implemented Async Queues (Events) in the main checkout route. If you run the normal checkout, the user gets a response in milliseconds, and the email/PDF happens in the background!');
}

testReq3Fail();
