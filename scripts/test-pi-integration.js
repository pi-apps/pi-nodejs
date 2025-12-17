import PiIntegration from '../src/utils/piIntegration.js';

async function testPiIntegration() {
  console.log('🧪 Testing Pi Network Integration...\n');
  
  try {
    // 1. Test health check
    console.log('1️⃣ Testing Pi API Health...');
    const health = await PiIntegration.healthCheck();
    console.log(`   Status: ${health.status}`);
    console.log(`   Pi API: ${health.piApi}`);
    
    // 2. Test auth URL generation
    console.log('\n2️⃣ Testing Auth URL Generation...');
    const authUrl = PiIntegration.generateAuthUrl(
      'FODUBU',
      'https://trade.fodubu.com/auth/pi/callback'
    );
    console.log(`   Auth URL: ${authUrl.substring(0, 80)}...`);
    
    // 3. Test Stellar SDK availability
    console.log('\n3️⃣ Testing Stellar SDK...');
    try {
      const StellarSdk = await import('@stellar/backend');
      console.log('   ✅ Stellar SDK loaded successfully');
      console.log(`   Version: ${StellarSdk.version}`);
    } catch (error) {
      console.log('   ❌ Stellar SDK error:', error.message);
    }
    
    // 4. List installed Pi-related packages
    console.log('\n4️⃣ Installed Pi & Stellar Packages:');
    const packages = [
      '@stellar/stellar-backend',
      '@fod-team/pi-nodejs'
    ];
    
    for (const pkg of packages) {
      try {
        await import(pkg);
        console.log(`   ✅ ${pkg} - Available`);
      } catch {
        console.log(`   ❌ ${pkg} - Not available`);
      }
    }

// Run test
testPiIntegration();
