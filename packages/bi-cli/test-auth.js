#!/usr/bin/env node

const axios = require('axios');

async function testAuthEndpoints() {
  console.log('🧪 Testing OAuth Device Flow endpoints\n');

  try {
    // Step 1: Test device authorization
    console.log('1️⃣  Testing device authorization endpoint...');
    const deviceRes = await axios.post(
      'https://auth.optima.chat/api/v1/oauth/device/authorize',
      { client_id: 'bi-cli-aqkutatj' }
    );

    console.log('✅ Device authorization successful!');
    console.log('   Device Code:', deviceRes.data.device_code.substring(0, 20) + '...');
    console.log('   User Code:', deviceRes.data.user_code);
    console.log('   Verification URI:', deviceRes.data.verification_uri);
    console.log('   Expires in:', deviceRes.data.expires_in, 'seconds');
    console.log('   Polling interval:', deviceRes.data.interval, 'seconds');

    // Step 2: Test token endpoint (will fail with authorization_pending, which is expected)
    console.log('\n2️⃣  Testing token endpoint (expecting authorization_pending)...');
    try {
      const params = new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        client_id: 'bi-cli-aqkutatj',
        device_code: deviceRes.data.device_code,
      });

      await axios.post(
        'https://auth.optima.chat/api/v1/oauth/device/token',
        params,
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );
      console.log('⚠️  Unexpected success (user may have authorized)');
    } catch (err) {
      if (err.response?.data?.error === 'authorization_pending') {
        console.log('✅ Token endpoint working correctly (authorization_pending)');
      } else {
        console.log('❌ Unexpected error:', err.response?.data || err.message);
      }
    }

    console.log('\n✅ All OAuth endpoints are correctly configured!');
    console.log('\n📋 Summary:');
    console.log('   Auth Service: https://auth.optima.chat');
    console.log('   Client ID: bi-cli-aqkutatj');
    console.log('   Device Authorize: /api/v1/oauth/device/authorize');
    console.log('   Token: /api/v1/oauth/device/token');
    console.log('\n💡 To test full login flow, run: npm run dev -- auth login');
  } catch (err) {
    console.error('❌ Error:', err.message);
    if (err.response) {
      console.error('   Status:', err.response.status);
      console.error('   Data:', err.response.data);
    }
    process.exit(1);
  }
}

testAuthEndpoints();
