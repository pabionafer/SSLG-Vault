import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readEnv() {
  const env = {};
  for (const line of readFileSync(path.join(root, ".env.local"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

const ADMIN = {
  email: "admin@sslg.edu.ph",
  password: "Vault#Admin2026!",
  username: "admin",
  full_name: "Vault Admin",
};

const env = readEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
const authHeaders = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" };

// 1. find or create the auth user
const listRes = await fetch(`${url}/auth/v1/admin/users?page=1&per_page=100`, { headers: authHeaders });
if (!listRes.ok) throw new Error(`list users failed: ${listRes.status} ${await listRes.text()}`);
const { users = [] } = await listRes.json();
let user = users.find((u) => u.email?.toLowerCase() === ADMIN.email);

if (!user) {
  const createRes = await fetch(`${url}/auth/v1/admin/users`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      email: ADMIN.email,
      password: ADMIN.password,
      email_confirm: true,
      user_metadata: { username: ADMIN.username, full_name: ADMIN.full_name },
    }),
  });
  if (!createRes.ok) throw new Error(`create user failed: ${createRes.status} ${await createRes.text()}`);
  user = await createRes.json();
  console.log(`Created auth user ${ADMIN.email} (${user.id})`);
} else {
  console.log(`Auth user ${ADMIN.email} already exists (${user.id})`);
}

// 2. upsert the profiles row with role admin
const profileRes = await fetch(`${url}/rest/v1/profiles`, {
  method: "POST",
  headers: {
    ...authHeaders,
    Prefer: "resolution=merge-duplicates,return=representation",
  },
  body: JSON.stringify({
    id: user.id,
    username: ADMIN.username,
    full_name: ADMIN.full_name,
    role: "admin",
    is_active: true,
  }),
});
if (!profileRes.ok) throw new Error(`upsert profile failed: ${profileRes.status} ${await profileRes.text()}`);
const profile = (await profileRes.json())[0];
console.log(`Profile: username=${profile.username} role=${profile.role} is_active=${profile.is_active}`);
