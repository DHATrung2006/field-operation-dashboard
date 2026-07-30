const fs = require('fs');
const path = require('path');
// require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const { loginToUff } = require('../api/uff/uffAuth');

async function test() {
  console.log('--- STARTING LOGIN ---');
  try {
    const { baseUrl, cookieHeader, requestVerificationToken } = await loginToUff();
    console.log('Login Success!');
    console.log('Cookie:', cookieHeader);
    
    // Now try fetching CICO data
    const dataParams = new URLSearchParams({
      'draw': '1',
      'start': '0',
      'length': '5',
      'search[value]': '',
      'search[regex]': 'false',
      'order[0][column]': '4',
      'order[0][dir]': 'desc',
      'startDate': '25/07/2026',
      'endDate': '25/07/2026',
      'region': '0',
      'city': '0',
      'role': '-1',
      'masterShift': '-1'
    });
    
    const dataRes = await fetch(`${baseUrl}/CICO/GetDataAsync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': cookieHeader,
        'X-Requested-With': 'XMLHttpRequest',
        ...(requestVerificationToken ? { 'RequestVerificationToken': requestVerificationToken } : {})
      },
      body: dataParams.toString()
    });

    if (!dataRes.ok) {
        console.error('Fetch Data failed HTTP', dataRes.status);
        const errHtml = await dataRes.text();
        console.error(errHtml.substring(0, 500));
        return;
    }

    const data = await dataRes.json();
    console.log('--- FETCH DATA SUCCESS ---');
    console.log('Total records:', data.aaData ? data.aaData.length : 'undefined');
    console.log(data);

  } catch (err) {
    console.error('--- ERROR ---');
    console.error(err.message);
  }
}

test();
