const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api/v1';

// Test data
const testUser = {
  name: 'Test User',
  email: 'testuser@example.com',
  password: 'TestPass123!',
  confirmPassword: 'TestPass123!'
};

async function testAuthentication() {
  console.log('🧪 Testing Authentication System...\n');

  try {
    // Test 1: Health Check
    console.log('1. Testing health check...');
    const healthResponse = await axios.get('http://localhost:3000/health');
    console.log('✅ Health check passed:', healthResponse.data.message);

    // Test 2: Register User
    console.log('\n2. Testing user registration...');
    const registerResponse = await axios.post(`${BASE_URL}/auth/register`, testUser);
    console.log('✅ User registration successful:', registerResponse.data.message);
    console.log('   User ID:', registerResponse.data.data.user.id);

    // Test 3: Login User
    console.log('\n3. Testing user login...');
    const loginResponse = await axios.post(`${BASE_URL}/auth/login`, {
      email: testUser.email,
      password: testUser.password
    });
    console.log('✅ User login successful:', loginResponse.data.message);
    
    const accessToken = loginResponse.data.data.tokens.accessToken;
    const refreshToken = loginResponse.data.data.tokens.refreshToken;
    console.log('   Access token received (length):', accessToken.length);

    // Test 4: Get Profile
    console.log('\n4. Testing get profile...');
    const profileResponse = await axios.get(`${BASE_URL}/auth/profile`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    console.log('✅ Profile retrieved:', profileResponse.data.data.name);

    // Test 5: Check Auth Status
    console.log('\n5. Testing auth status check...');
    const authCheckResponse = await axios.get(`${BASE_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    console.log('✅ Auth status check passed:', authCheckResponse.data.data.authenticated);

    // Test 6: Refresh Token
    console.log('\n6. Testing token refresh...');
    const refreshResponse = await axios.post(`${BASE_URL}/auth/refresh`, {
      refreshToken: refreshToken
    });
    console.log('✅ Token refresh successful');
    
    const newAccessToken = refreshResponse.data.data.tokens.accessToken;
    console.log('   New access token received (length):', newAccessToken.length);

    // Test 7: Update Profile
    console.log('\n7. Testing profile update...');
    const updateResponse = await axios.put(`${BASE_URL}/auth/profile`, {
      name: 'Updated Test User'
    }, {
      headers: { Authorization: `Bearer ${newAccessToken}` }
    });
    console.log('✅ Profile update successful:', updateResponse.data.data.name);

    // Test 8: Test Service Catalog (placeholder)
    console.log('\n8. Testing service catalog...');
    const servicesResponse = await axios.get(`${BASE_URL}/services`);
    console.log('✅ Service catalog retrieved:', servicesResponse.data.data.length, 'services');

    // Test 9: Test Protected Endpoints
    console.log('\n9. Testing protected endpoints...');
    const subscriptionsResponse = await axios.get(`${BASE_URL}/subscriptions`, {
      headers: { Authorization: `Bearer ${newAccessToken}` }
    });
    console.log('✅ Protected subscriptions endpoint accessible');

    // Test 10: Test Invalid Token
    console.log('\n10. Testing invalid token handling...');
    try {
      await axios.get(`${BASE_URL}/auth/profile`, {
        headers: { Authorization: 'Bearer invalid-token' }
      });
    } catch (error) {
      if (error.response && error.response.status === 401) {
        console.log('✅ Invalid token properly rejected');
      } else {
        throw error;
      }
    }

    console.log('\n🎉 All authentication tests passed successfully!');
    console.log('\n📋 Test Summary:');
    console.log('✅ Health check');
    console.log('✅ User registration');
    console.log('✅ User login');
    console.log('✅ Profile retrieval');
    console.log('✅ Auth status check');
    console.log('✅ Token refresh');
    console.log('✅ Profile update');
    console.log('✅ Service catalog access');
    console.log('✅ Protected endpoints');
    console.log('✅ Invalid token handling');

  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
    process.exit(1);
  }
}

// Run tests
testAuthentication();