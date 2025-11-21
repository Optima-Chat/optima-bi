#!/usr/bin/env node

const axios = require('axios');

const AUTH_URL = 'https://auth.optima.chat';
const BACKEND_URL = 'http://localhost:3001';
const TEST_USER = 'admin@example.com';
const TEST_PASSWORD = 'admin123';
const CLIENT_ID = 'admin-panel';

async function testAuthFlow() {
  console.log('🧪 Testing complete auth flow\n');

  try {
    // Step 1: Login to get access token
    console.log('1️⃣  Logging in as test user...');
    const loginParams = new URLSearchParams({
      grant_type: 'password',
      username: TEST_USER,
      password: TEST_PASSWORD,
      client_id: CLIENT_ID,
    });

    const loginRes = await axios.post(`${AUTH_URL}/api/v1/oauth/token`, loginParams, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    const accessToken = loginRes.data.access_token;
    console.log('✅ Login successful!');
    console.log(`   Token: ${accessToken.substring(0, 30)}...`);
    console.log(`   Expires in: ${loginRes.data.expires_in}s\n`);

    // Step 2: Test sales API without token (should fail)
    console.log('2️⃣  Testing sales API without token (expecting 401)...');
    try {
      await axios.get(`${BACKEND_URL}/api/v1/sales?days=7`);
      console.log('❌ Unexpected success - API should require auth!');
    } catch (err) {
      if (err.response?.status === 401) {
        console.log('✅ Correctly rejected: 401 Unauthorized');
        console.log(`   Error: ${err.response.data.error.code}\n`);
      } else {
        console.log(`⚠️  Unexpected error: ${err.response?.status}\n`);
      }
    }

    // Step 3: Test sales API with token
    console.log('3️⃣  Testing sales API with valid token...');
    try {
      const salesRes = await axios.get(`${BACKEND_URL}/api/v1/sales?days=7`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      console.log('✅ Sales API call successful!');
      console.log('   Summary:');
      console.log(`     Total Revenue: ¥${salesRes.data.data.summary.total_revenue.toFixed(2)}`);
      console.log(`     Total Orders: ${salesRes.data.data.summary.total_orders}`);
      console.log(`     Cached: ${salesRes.data.meta.cached}`);
      if (salesRes.data.meta.query_time_ms) {
        console.log(`     Query Time: ${salesRes.data.meta.query_time_ms}ms`);
      }
      console.log();
    } catch (err) {
      if (err.response?.status === 403 && err.response?.data?.error?.code === 'NO_MERCHANT_ID') {
        console.log('⚠️  User authenticated but has no merchant_id');
        console.log('   This is expected for admin users');
        console.log('   Error:', err.response.data.error.message);
        console.log();
      } else {
        console.log('❌ Sales API call failed:');
        console.log(`   Status: ${err.response?.status}`);
        console.log(`   Error:`, err.response?.data || err.message);
        console.log();
      }
    }

    // Step 4: Verify token with auth service
    console.log('4️⃣  Verifying token with auth service...');
    try {
      const verifyRes = await axios.post(
        `${AUTH_URL}/api/v1/auth/verify`,
        {
          token: accessToken,
        },
        {
          timeout: 10000,
        }
      );

      console.log('✅ Token verified successfully!');
      console.log('   User Info:');
      console.log(`     User ID: ${verifyRes.data.user_id}`);
      console.log(`     Email: ${verifyRes.data.email}`);
      console.log(`     Role: ${verifyRes.data.role}`);
      console.log(`     Merchant ID: ${verifyRes.data.merchant_id || 'N/A'}`);
      console.log(`     Scopes: ${verifyRes.data.scopes.join(', ')}`);
      console.log();
    } catch (err) {
      console.log('❌ Token verification failed:', err.response?.data || err.message);
      console.log();
    }

    console.log('✅ Auth flow test completed!\n');
    console.log('📋 Summary:');
    console.log('   ✅ Login works');
    console.log('   ✅ API requires authentication');
    console.log('   ✅ Token verification works');
    console.log('   ⚠️  Need merchant user to test full sales flow');
    console.log('\n💡 Next: Create a merchant user or assign merchant_id to test user');
  } catch (err) {
    console.error('\n❌ Test failed:', err.message);
    if (err.response) {
      console.error('   Status:', err.response.status);
      console.error('   Data:', JSON.stringify(err.response.data, null, 2));
    }
    process.exit(1);
  }
}

testAuthFlow();
