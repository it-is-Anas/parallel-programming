async function testReq4Fail() {
  console.log('--- Triggering BAD Batch Processing (No Chunks) ---');
  
  const res = await fetch('http://127.0.0.1:3000/batch/trigger-daily-sales-bad', { method: 'POST' });
  const data = await res.json();
  
  console.log('\nResponse:', data);
  console.log('\n🔴 Now look at your Server Terminal! Watch how it struggles and freezes trying to execute 100,000 Promises in the Event Loop at the exact same time.');
  
  console.log('\n--- CONCLUSION TO SHOW MR ---');
  console.log('PROBLEM: Processing Big Data without chunking causes massive Memory/CPU spikes and blocks the Event Loop.');
  console.log('SOLUTION (Req 4): We implemented Batch Processing in the GOOD route. It slices the 100k records into chunks of 5000, processes them quickly, and yields memory back to the server, making it 100% stable!');
}

testReq4Fail();
