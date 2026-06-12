const http = require('http');

// Helper to make POST/GET requests using node built-in http module
function request(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ statusCode: res.statusCode, body: parsed });
        } catch (e) {
          resolve({ statusCode: res.statusCode, body: data });
        }
      });
    });

    req.on('error', (e) => {
      reject(e);
    });

    if (postData) {
      req.write(JSON.stringify(postData));
    }
    req.end();
  });
}

async function runTests() {
  console.log('--- STARTING BACKEND INTEGRATION TESTS ---');

  try {
    // 1. Create a user
    console.log('\nTest 1: Creating a user profile...');
    const userRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/users',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { displayName: 'John Test User', avatarColor: '#ff0000' });

    console.log('User response:', userRes.statusCode, userRes.body);
    if (userRes.statusCode !== 201 || !userRes.body.token) {
      throw new Error('Failed to create user');
    }
    const token = userRes.body.token;

    // 2. Create a Room
    console.log('\nTest 2: Creating a Room...');
    const roomRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/rooms',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Token': token
      }
    }, { name: 'Integration Test Room', description: 'Testing database schemas' });

    console.log('Room response:', roomRes.statusCode, roomRes.body);
    if (roomRes.statusCode !== 201 || !roomRes.body.id) {
      throw new Error('Failed to create room');
    }
    const roomId = roomRes.body.id;

    // 3. List all rooms
    console.log('\nTest 3: Listing rooms...');
    const listRoomsRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/rooms',
      method: 'GET',
      headers: { 'X-User-Token': token }
    });
    console.log('List rooms response:', listRoomsRes.statusCode, `Found ${listRoomsRes.body.length} rooms`);
    if (listRoomsRes.statusCode !== 200 || !Array.isArray(listRoomsRes.body)) {
      throw new Error('Failed to list rooms');
    }

    // 4. Create a status column
    console.log('\nTest 4: Adding a status column...');
    const statusRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: `/api/rooms/${roomId}/statuses`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Token': token
      }
    }, { name: 'Testing Column', wipLimit: 5 });
    console.log('Status column response:', statusRes.statusCode, statusRes.body);
    if (statusRes.statusCode !== 201) {
      throw new Error('Failed to create status column');
    }

    // 5. Get full board details
    console.log('\nTest 5: Getting full board details...');
    const boardRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: `/api/rooms/${roomId}`,
      method: 'GET',
      headers: { 'X-User-Token': token }
    });
    console.log('Board details response:', boardRes.statusCode);
    console.log('Board Statuses:', boardRes.body.statuses.map(s => `${s.name} (wip: ${s.wipLimit})`));
    console.log('Board Members:', boardRes.body.members.map(m => `${m.displayName} (${m.role}, online: ${m.isOnline})`));
    if (boardRes.statusCode !== 200) {
      throw new Error('Failed to get board details');
    }

    console.log('\n--- ALL TESTS COMPLETED SUCCESSFULLY ---');
  } catch (err) {
    console.error('\nTests failed with error:', err.message);
    process.exit(1);
  }
}

// Wait a second for Express server to boot and hook DB before triggering test script
setTimeout(runTests, 1500);
