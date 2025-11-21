#!/usr/bin/env node

const axios = require('axios');

async function testSales() {
  try {
    console.log('🧪 Testing sales API...\n');

    const response = await axios.get('http://localhost:3001/api/v1/sales', {
      params: { days: 7 },
      headers: {
        Authorization: 'Bearer test-token-no-validation',
      },
    });

    const { summary, daily } = response.data.data;

    console.log('📊 Sales Summary\n');
    console.log(`  Total Revenue:     ¥${summary.total_revenue.toFixed(2)}`);
    console.log(`  Total Orders:      ${summary.total_orders}`);
    console.log(`  Avg Order Value:   ¥${summary.avg_order_value.toFixed(2)}`);
    console.log(`  Unique Customers:  ${summary.unique_customers}`);

    console.log('\n📅 Daily Breakdown (showing first 3 days)\n');
    daily.slice(0, 3).forEach((day) => {
      console.log(`  ${day.date}: ¥${day.total_revenue.toFixed(2)} (${day.order_count} orders)`);
    });

    console.log(`\n✓ Cached: ${response.data.meta.cached}`);
    if (response.data.meta.query_time_ms) {
      console.log(`✓ Query Time: ${response.data.meta.query_time_ms}ms`);
    }

    console.log('\n✅ Sales command logic works correctly!');
  } catch (err) {
    console.error('❌ Error:', err.message);
    if (err.response) {
      console.error('Response status:', err.response.status);
      console.error('Response data:', err.response.data);
    }
    process.exit(1);
  }
}

testSales();
