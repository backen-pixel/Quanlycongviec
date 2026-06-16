// Auto-migration helper: creates tables if they don't exist
// Run once at server startup via Supabase JS client

const { supabase } = require('../config/supabase');

async function runMigrations() {
  console.log('🔄 Running auto-migrations...');

  // ═══ 1. workflow_flows ═══
  try {
    const { error } = await supabase.from('workflow_flows').select('id').limit(1);
    if (error && error.message.includes('could not find')) {
      console.log('⚠️ Table workflow_flows not found. Please run migration 20_workflow_flows.sql in Supabase SQL Editor.');
    } else {
      console.log('✅ workflow_flows OK');
    }
  } catch (e) {
    console.log('⚠️ workflow_flows check error:', e.message);
  }

  // ═══ 2. workflow_flow_steps ═══
  try {
    const { error } = await supabase.from('workflow_flow_steps').select('id').limit(1);
    if (error && error.message.includes('could not find')) {
      console.log('⚠️ Table workflow_flow_steps not found. Please run migration 20_workflow_flows.sql in Supabase SQL Editor.');
    } else {
      console.log('✅ workflow_flow_steps OK');
    }
  } catch (e) {
    console.log('⚠️ workflow_flow_steps check error:', e.message);
  }

  // ═══ 3. Check deadline_days on company_template_tasks ═══
  try {
    const { error } = await supabase.from('company_template_tasks').select('id,deadline_days').limit(1);
    if (error && error.message.includes('does not exist')) {
      console.log('⚠️ Column deadline_days not found on company_template_tasks. Please run migration 20_workflow_flows.sql.');
    } else {
      console.log('✅ company_template_tasks.deadline_days OK');
    }
  } catch (e) {
    console.log('⚠️ deadline check error:', e.message);
  }

  // ═══ 4. push_device_tokens (FCM khi app kill) ═══
  try {
    const { error } = await supabase.from('push_device_tokens').select('id').limit(1);
    if (error && (error.code === 'PGRST205' || error.message.includes('push_device_tokens'))) {
      console.log('⚠️ Table push_device_tokens not found. Chạy migrations/204_push_device_tokens.sql trên Supabase SQL Editor.');
    } else {
      console.log('✅ push_device_tokens OK');
    }
  } catch (e) {
    console.log('⚠️ push_device_tokens check error:', e.message);
  }

  // ═══ 5. messenger_groups.avatar (đổi avatar nhóm chat) ═══
  try {
    const { pgSessionQuery, isPgEnabled } = require('../config/db');
    if (isPgEnabled()) {
      await pgSessionQuery('ALTER TABLE messenger_groups ADD COLUMN IF NOT EXISTS avatar TEXT');
      console.log('✅ messenger_groups.avatar OK');
    } else {
      const { error } = await supabase.from('messenger_groups').select('avatar').limit(1);
      if (error && error.message.includes('avatar')) {
        console.log(
          '⚠️ messenger_groups.avatar missing. Chạy backend/migrations/279_messenger_group_avatar.sql trên Supabase SQL Editor.',
        );
      } else {
        console.log('✅ messenger_groups.avatar OK');
      }
    }
  } catch (e) {
    console.log('⚠️ messenger_groups.avatar check error:', e.message);
  }

  console.log('🔄 Migration check complete.');
}

module.exports = { runMigrations };
