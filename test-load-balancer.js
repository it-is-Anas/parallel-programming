const numRequests = 15;

async function testLoadBalancer() {
  console.log('--- Resetting Load Balancer Stats ---');
  await fetch('http://127.0.0.1:3000/load-balancer/reset', { method: 'POST' });

  // ==============================================================================
  // 1. اختبار استراتيجية Round Robin (التناوب الدائري)
  // ==============================================================================
  console.log('\n--- 1. Testing ROUND ROBIN Strategy ---');
  console.log('Sending 15 requests sequentially to observe even distribution...');
  
  for (let i = 1; i <= numRequests; i++) {
    const clientIp = `192.168.1.${i}`;
    const res = await fetch(`http://127.0.0.1:3000/load-balancer/request-rr?clientIp=${clientIp}`, { method: 'POST' });
    const data = await res.json();
    console.log(`[Request #${i.toString().padStart(2, ' ')}][Client: ${clientIp}] -> Routed to: ${data.routedTo} (Active on Server: ${data.activeConnectionsOnServer})`);
  }

  // طباعة حالة السيرفرات بعد انتهاء الطلبات المتتالية
  let statusRes = await fetch('http://127.0.0.1:3000/load-balancer/status');
  let statusData = await statusRes.json();
  console.log('\n--- Server Stats after Round Robin (Sequential) ---');
  console.table(statusData);

  // ==============================================================================
  // 2. اختبار استراتيجية Least Connections (الأقل اتصالاً)
  // ==============================================================================
  console.log('\n--- Resetting Load Balancer Stats ---');
  await fetch('http://127.0.0.1:3000/load-balancer/reset', { method: 'POST' });

  console.log('\n--- 2. Testing LEAST CONNECTIONS Strategy ---');
  console.log('Sending 15 requests CONCURRENTLY to observe dynamic routing based on active connections...');

  const startTime = Date.now();
  const promises = [];

  for (let i = 1; i <= numRequests; i++) {
    const clientIp = `192.168.2.${i}`;
    promises.push(
      fetch(`http://127.0.0.1:3000/load-balancer/request-lc?clientIp=${clientIp}`, { method: 'POST' })
        .then(res => res.json())
        .then(data => {
          const elapsed = Date.now() - startTime;
          console.log(`[${elapsed.toString().padStart(4, ' ')}ms][Client: ${clientIp}] -> Routed to: ${data.routedTo} (At routing, active connections was: ${data.activeConnectionsOnServer})`);
        })
    );
  }

  await Promise.all(promises);

  // طباعة حالة السيرفرات بعد انتهاء جميع الطلبات المتزامنة
  statusRes = await fetch('http://127.0.0.1:3000/load-balancer/status');
  statusData = await statusRes.json();
  console.log('\n--- Server Stats after Least Connections (Concurrent) ---');
  console.table(statusData);
}

testLoadBalancer();
