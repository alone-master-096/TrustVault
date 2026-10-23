import "dotenv/config";
import { supabaseAdmin, STORAGE_BUCKET } from "./config/supabase";

async function testStorage() {
  console.log("Testing Supabase Storage...");
  console.log("Bucket:", STORAGE_BUCKET);

  const { data, error } = await supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .list("", {
      limit: 10,
    });

  if (error) {
    console.error("Storage connection failed:");
    console.error(error.message);
    process.exit(1);
  }

  console.log("Supabase Storage connected!");
  console.log("Items:", data?.length ?? 0);
}

testStorage().catch((error) => {
  console.error("Unexpected error:");
  console.error(error.message);
  process.exit(1);
});
