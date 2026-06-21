#!/usr/bin/env node
/**
 * Cria usuário Rose (Auth + user_profiles).
 * Uso: SUPABASE_SERVICE_ROLE_KEY=... node scripts/create-rose-user.mjs <email> <password> [nome]
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || 'https://ubdvtjbitozhkuvvqkxj.supabase.co';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.argv[2];
const password = process.argv[3];
const nome = process.argv[4] || 'Rose';

if (!serviceKey || !email || !password) {
  console.error('Usage: SUPABASE_SERVICE_ROLE_KEY=... node scripts/create-rose-user.mjs <email> <password> [nome]');
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: existingUsers, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (listErr) {
  console.error('listUsers:', listErr.message);
  process.exit(1);
}

const existing = existingUsers.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
let userId = existing?.id;

if (!userId) {
  const { data: userData, error: userErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (userErr) {
    console.error('createUser:', userErr.message);
    process.exit(1);
  }
  userId = userData.user.id;
  console.log('Created auth user:', userId);
} else {
  console.log('Auth user already exists:', userId);
  const { error: updateErr } = await admin.auth.admin.updateUserById(userId, {
    password,
    email_confirm: true,
  });
  if (updateErr) {
    console.error('updateUserById:', updateErr.message);
    process.exit(1);
  }
  console.log('Updated password for existing user');
}

const { error: profileErr } = await admin.from('user_profiles').upsert(
  {
    id: userId,
    nome,
    role: 'rh',
    avatar_url: null,
  },
  { onConflict: 'id' },
);

if (profileErr) {
  console.error('user_profiles:', profileErr.message);
  process.exit(1);
}

console.log('OK Rose ready:', userId, email, 'role=rh nome=' + nome);
