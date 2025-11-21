#!/usr/bin/env node

const axios = require('axios');

const AUTH_URL = 'https://auth.optima.chat';
const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_PASSWORD = 'admin123';
const ADMIN_CLIENT_ID = 'admin-panel';

async function createBIBackendClient() {
  console.log('🔐 Step 1: Logging in as admin...\n');

  try {
    // Step 1: Login with password grant
    const loginParams = new URLSearchParams({
      grant_type: 'password',
      username: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      client_id: ADMIN_CLIENT_ID,
    });

    const loginRes = await axios.post(
      `${AUTH_URL}/api/v1/oauth/token`,
      loginParams,
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const accessToken = loginRes.data.access_token;
    console.log('✅ Admin login successful!');
    console.log(`   Token: ${accessToken.substring(0, 20)}...`);
    console.log(`   Expires in: ${loginRes.data.expires_in}s\n`);

    // Step 2: Create OAuth client for bi-backend
    console.log('🔧 Step 2: Creating OAuth client for bi-backend...\n');

    const clientData = {
      client_name: 'Optima BI Backend',
      client_type: 'confidential',
      description: 'Backend service for Optima BI analytics platform',
      allowed_scopes: ['read', 'profile', 'admin', 'api:internal'],
    };

    const createRes = await axios.post(
      `${AUTH_URL}/api/v1/oauth/clients`,
      clientData,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    console.log('✅ OAuth client created successfully!\n');
    console.log('📋 Client Details:');
    console.log('─'.repeat(60));
    console.log(`   Client Name: ${createRes.data.client_name}`);
    console.log(`   Client ID: ${createRes.data.client_id}`);
    console.log(`   Client Secret: ${createRes.data.client_secret}`);
    console.log(`   Client Type: ${createRes.data.client_type}`);
    console.log(`   Allowed Scopes: ${createRes.data.allowed_scopes.join(', ')}`);
    console.log(`   Active: ${createRes.data.is_active}`);
    console.log('─'.repeat(60));

    // Step 3: Generate .env configuration
    console.log('\n📝 Step 3: Generating .env configuration...\n');

    const envConfig = `
# OAuth Client for bi-backend
OAUTH_CLIENT_ID=${createRes.data.client_id}
OAUTH_CLIENT_SECRET=${createRes.data.client_secret}

# Add these to packages/bi-backend/.env
`;

    console.log('📄 Add to packages/bi-backend/.env:');
    console.log('─'.repeat(60));
    console.log(envConfig.trim());
    console.log('─'.repeat(60));

    console.log('\n✅ All done! OAuth client created successfully.');
    console.log('\n💡 Next steps:');
    console.log('   1. Copy the client credentials to .env file');
    console.log('   2. Update bi-backend to use these credentials');
    console.log('   3. Implement JWT verification middleware\n');

    return createRes.data;
  } catch (err) {
    console.error('\n❌ Error:', err.message);
    if (err.response) {
      console.error('   Status:', err.response.status);
      console.error('   Data:', JSON.stringify(err.response.data, null, 2));
    }
    process.exit(1);
  }
}

createBIBackendClient();
