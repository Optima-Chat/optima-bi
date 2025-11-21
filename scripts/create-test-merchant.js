#!/usr/bin/env node

const axios = require('axios');

const AUTH_URL = 'https://auth.optima.chat';
const COMMERCE_URL = 'https://api.optima.chat';
const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_PASSWORD = 'admin123';
const ADMIN_CLIENT_ID = 'admin-panel';

// Default test merchant data
const DEFAULT_MERCHANT = {
  email: 'merchant@test.com',
  password: 'merchant123',
  role: 'customer', // Will be upgraded to merchant after profile setup
};

async function loginAsAdmin() {
  console.log('🔐 Logging in as admin...\n');

  const loginParams = new URLSearchParams({
    grant_type: 'password',
    username: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    client_id: ADMIN_CLIENT_ID,
  });

  const loginRes = await axios.post(`${AUTH_URL}/api/v1/oauth/token`, loginParams, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  console.log('✅ Admin login successful!\n');
  return loginRes.data.access_token;
}

async function getUserByEmail(accessToken, email) {
  try {
    const response = await axios.get(`${AUTH_URL}/api/v1/admin/users`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: { search: email, limit: 1 },
    });

    if (response.data.users && response.data.users.length > 0) {
      return response.data.users[0];
    }
    return null;
  } catch (err) {
    return null;
  }
}

async function createUser(accessToken, userData) {
  console.log(`📝 Creating user: ${userData.email}...`);

  const response = await axios.post(
    `${AUTH_URL}/api/v1/admin/users`,
    userData,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  console.log('✅ User created successfully!\n');
  return response.data;
}

async function updateUserRole(accessToken, userId, role) {
  console.log(`🔧 Updating user role to: ${role}...`);

  await axios.put(
    `${AUTH_URL}/api/v1/admin/users/${userId}/role`,
    { role },
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  console.log('✅ Role updated successfully!\n');
}

async function setupMerchantProfile(userToken, merchantData) {
  console.log('🏪 Setting up merchant profile...');

  const profileData = {
    name: merchantData.business_name || 'Test Merchant Business',
    origin_country_alpha2: 'CN',
    origin_city: '深圳',
    origin_line_1: '南山区科技园',
    origin_state: '广东',
    contact_name: merchantData.contact_name || 'Test Contact',
    contact_phone: merchantData.contact_phone || '+86 138 0000 0000',
    contact_email: merchantData.email,
  };

  const response = await axios.post(
    `${COMMERCE_URL}/api/merchants/me`,
    profileData,
    {
      headers: { Authorization: `Bearer ${userToken}` },
    }
  );

  console.log('✅ Merchant profile created!\n');
  return response.data;
}

async function createTestMerchant(customData = {}) {
  const merchantData = { ...DEFAULT_MERCHANT, ...customData };

  console.log('🧪 Creating Test Merchant User\n');
  console.log('─'.repeat(60));

  try {
    // Step 1: Login as admin
    const accessToken = await loginAsAdmin();

    // Step 2: Check if user already exists
    console.log(`🔍 Checking if user already exists: ${merchantData.email}...\n`);
    const existingUser = await getUserByEmail(accessToken, merchantData.email);

    if (existingUser) {
      console.log('⚠️  User already exists!');
      console.log('   User ID:', existingUser.id);
      console.log('   Email:', existingUser.email);
      console.log('   Role:', existingUser.role);
      console.log('   Merchant ID:', existingUser.merchant_id || 'N/A');
      console.log('\n💡 To recreate, delete the existing user first.\n');
      return existingUser;
    }

    // Step 3: Create user (as customer first)
    const newUser = await createUser(accessToken, {
      email: merchantData.email,
      password: merchantData.password,
      role: merchantData.role,
    });

    // Step 4: Login as new user to get their token
    console.log('🔐 Logging in as new user...\n');
    const userLoginParams = new URLSearchParams({
      grant_type: 'password',
      username: merchantData.email,
      password: merchantData.password,
      client_id: ADMIN_CLIENT_ID,
    });

    const userLoginRes = await axios.post(
      `${AUTH_URL}/api/v1/oauth/token`,
      userLoginParams,
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }
    );

    const userToken = userLoginRes.data.access_token;
    console.log('✅ User login successful!\n');

    // Step 5: Setup merchant profile
    const merchantProfile = await setupMerchantProfile(userToken, merchantData);

    console.log('   Merchant Profile ID:', merchantProfile.id);
    console.log('   Merchant Profile:', JSON.stringify(merchantProfile, null, 2).substring(0, 200) + '...\n');

    // Step 6: Update user role to merchant (using admin token)
    console.log('🔄 Upgrading user role to merchant...');
    await updateUserRole(accessToken, newUser.id, 'merchant');

    // Step 7: Get updated user info
    console.log('🔄 Fetching updated user info...\n');
    const updatedUser = await getUserByEmail(accessToken, merchantData.email);

    // Step 8: Display credentials
    const finalMerchantId = updatedUser.merchant_id || merchantProfile.merchant_id || merchantProfile.id;

    console.log('✅ Test merchant setup completed!\n');
    console.log('📋 Merchant Details:');
    console.log('─'.repeat(60));
    console.log(`   Email:         ${merchantData.email}`);
    console.log(`   Password:      ${merchantData.password}`);
    console.log(`   User ID:       ${updatedUser.id}`);
    console.log(`   Role:          ${updatedUser.role}`);
    console.log(`   Merchant ID:   ${finalMerchantId}`);
    console.log(`   Business Name: ${merchantProfile.name}`);
    console.log('─'.repeat(60));

    // Step 8: Test commands
    console.log('\n💡 Next steps:\n');
    console.log('   1. Test CLI login:');
    console.log(`      npm run dev -- auth login --env production`);
    console.log(`      (Use email: ${merchantData.email}, password: ${merchantData.password})\n`);
    console.log('   2. Test sales API:');
    console.log(`      npm run dev -- sales get --days 7 --pretty\n`);
    console.log('   3. Test API directly:');
    console.log(`      curl http://localhost:3001/api/v1/sales?days=7 \\`);
    console.log(`        -H "Authorization: Bearer YOUR_TOKEN"\n`);

    // Step 9: Save credentials to file
    const credentialsFile = '.test-merchant-credentials.json';
    const fs = require('fs');
    const credentials = {
      email: merchantData.email,
      password: merchantData.password,
      user_id: updatedUser.id,
      merchant_id: finalMerchantId,
      business_name: merchantProfile.name,
      created_at: new Date().toISOString(),
    };

    fs.writeFileSync(
      credentialsFile,
      JSON.stringify(credentials, null, 2)
    );

    console.log(`📄 Credentials saved to: ${credentialsFile}\n`);

    return {
      user: updatedUser,
      merchant: merchantProfile,
    };
  } catch (err) {
    console.error('\n❌ Error:', err.message);
    if (err.response) {
      console.error('   Status:', err.response.status);
      console.error('   Data:', JSON.stringify(err.response.data, null, 2));
    }
    process.exit(1);
  }
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);
  const customData = {};

  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--email' && args[i + 1]) {
      customData.email = args[i + 1];
      i++;
    } else if (args[i] === '--password' && args[i + 1]) {
      customData.password = args[i + 1];
      i++;
    } else if (args[i] === '--merchant-id' && args[i + 1]) {
      customData.merchant_id = args[i + 1];
      i++;
    } else if (args[i] === '--help') {
      console.log('Usage: node create-test-merchant.js [options]\n');
      console.log('Options:');
      console.log('  --email <email>           Merchant email (default: merchant@test.com)');
      console.log('  --password <password>     Merchant password (default: merchant123)');
      console.log('  --merchant-id <uuid>      Merchant UUID (default: 11111111-1111-1111-1111-111111111111)');
      console.log('  --help                    Show this help message\n');
      console.log('Examples:');
      console.log('  node create-test-merchant.js');
      console.log('  node create-test-merchant.js --email test@merchant.com --password test123');
      process.exit(0);
    }
  }

  createTestMerchant(customData);
}

module.exports = { createTestMerchant, loginAsAdmin };
