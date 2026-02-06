const http = require('http');

// First, login to get a token
const loginData = JSON.stringify({email:'commission_status_test@atlas.com', password:'TestPass123'});
const loginReq = http.request({
  hostname: 'localhost',
  port: 3001,
  path: '/api/auth/login',
  method: 'POST',
  headers: {'Content-Type': 'application/json', 'Content-Length': loginData.length}
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const {token} = JSON.parse(data);
    console.log('Got token, testing filtered exports...\n');

    // Test 1: Export with filter (search for "Commission")
    const filteredReq = http.request({
      hostname: 'localhost',
      port: 3001,
      path: '/api/clients/export?search=Commission',
      method: 'GET',
      headers: {'Authorization': 'Bearer ' + token}
    }, (res2) => {
      let exportData = '';
      res2.on('data', chunk => exportData += chunk);
      res2.on('end', () => {
        const lines = exportData.split('\n').filter(l => l.trim());
        console.log('=== TEST 1: Filtered Export (search=Commission) ===');
        console.log('Status:', res2.statusCode);
        console.log('Total lines (including header):', lines.length);
        console.log('CSV Content:');
        console.log(exportData);
        console.log('\n');

        // Test 2: Export without filter
        const unfilteredReq = http.request({
          hostname: 'localhost',
          port: 3001,
          path: '/api/clients/export',
          method: 'GET',
          headers: {'Authorization': 'Bearer ' + token}
        }, (res3) => {
          let allData = '';
          res3.on('data', chunk => allData += chunk);
          res3.on('end', () => {
            const allLines = allData.split('\n').filter(l => l.trim());
            console.log('=== TEST 2: Unfiltered Export (all clients) ===');
            console.log('Status:', res3.statusCode);
            console.log('Total lines (including header):', allLines.length);
            console.log('CSV Content (first 1500 chars):');
            console.log(allData.substring(0, 1500));

            // Summary
            console.log('\n=== SUMMARY ===');
            console.log('Filtered export (search=Commission):', lines.length - 1, 'client(s)');
            console.log('Unfiltered export (all):', allLines.length - 1, 'client(s)');
            if (lines.length <= allLines.length) {
              console.log('PASS: Filtered export has fewer or equal records than unfiltered export');
            } else {
              console.log('FAIL: Filtered export has more records than unfiltered export');
            }
          });
        });
        unfilteredReq.end();
      });
    });
    filteredReq.end();
  });
});
loginReq.write(loginData);
loginReq.end();
