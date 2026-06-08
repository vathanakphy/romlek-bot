/**
 * Supabase Cleanup Script
 * Run with: node src/cleanup.js
 */
require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_KEY;

console.log("🧹 Cleaning up Supabase...");
console.log("URL:", url);
console.log("KEY:", key ? key.substring(0, 20) + "..." : "MISSING");

const supabase = createClient(url, key);

async function cleanup() {
  try {
    // Test connection
    const { data, error } = await supabase.from("users").select("id").limit(1);
    if (error) {
      console.error("❌ Supabase error:", JSON.stringify(error, null, 2));
      return;
    }
    console.log("✅ Connected! Found", data.length, "user(s)\n");

    // Delete all tasks first (foreign key)
    const r1 = await supabase.from("tasks").delete().neq("id", 0).select();
    if (r1.error) console.error("❌ Tasks:", r1.error.message);
    else console.log(`✅ Deleted ${r1.data.length} task(s)`);

    // Delete all users
    const r2 = await supabase.from("users").delete().neq("id", 0).select();
    if (r2.error) console.error("❌ Users:", r2.error.message);
    else console.log(`✅ Deleted ${r2.data.length} user(s)`);

    console.log("\n🎉 Done!");
  } catch (err) {
    console.error("❌ Full error:\n", err);
  }
}

cleanup();
