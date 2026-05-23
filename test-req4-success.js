async function testReq4Success() {
  console.log('--- Triggering GOOD Batch Processing (With Chunks of 5000) ---');
  
  const startTime = Date.now();
  const res = await fetch('http://127.0.0.1:3000/batch/trigger-daily-sales', { method: 'POST' });
  const data = await res.json();
  
  console.log('\nResponse:', data);
  console.log('\n--- OBSERVATION FOR MR ---');
  console.log('1. Notice the HTTP response was INSTANT.');
  console.log('2. Now look at your Server Terminal. Notice it is processing in clean "Chunks" of 5000 items.');
  console.log('3. The server stays responsive and stable throughout the whole process because it handles a small amount of memory at a time!');
}

testReq4Success();
