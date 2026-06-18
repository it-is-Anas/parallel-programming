const { spawn } = require('child_process');

const ports = [8000, 8001, 8002];
const servers = ports.map((p) => `http://localhost:${p}/process`);

// Sleep function to wait for servers to boot up
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runTest() {
  console.log('Starting servers on ports: 8000, 8001, 8002...');

  const processes = [];
  for (const port of ports) {
    // Run instances using compiled production bundle
    const p = spawn('node', ['dist/main.js'], {
      env: { ...process.env, PORT: port.toString() },
      shell: true,
    });
    
    // Uncomment the next line if you want to see server output during startup
    // p.stdout.on('data', (data) => console.log(`[Port ${port}] ${data.toString().trim()}`));
    
    processes.push(p);
  }

  // Wait 15 seconds to ensure all servers have fully started
  console.log('Waiting 15 seconds for full startup...');
  await sleep(15000);

  console.log('\n--- Starting Load Balancer Test (Round Robin) ---\n');

  const numTasks = 6;
  let currentIndex = 0;

  for (let i = 1; i <= numTasks; i++) {
    // Round Robin Selection
    const serverUrl = servers[currentIndex];
    currentIndex = (currentIndex + 1) % servers.length;

    try {
      const res = await fetch(serverUrl);
      const data = await res.json();
      console.log(`Task ${i} -> ${data.message}`);
    } catch (err) {
      console.log(`Task ${i} -> Connection failed to server ${serverUrl} (Error: ${err.message})`);
    }
    
    // Wait slightly between requests
    await sleep(200);
  }

  console.log('\n--- Test finished, closing servers ---');
  for (const p of processes) {
    // Kill the spawned processes
    p.kill('SIGINT');
  }
  
  // Exit the process
  process.exit(0);
}

runTest();
