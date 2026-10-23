import { test, before, afterEach } from "node:test";
import assert from "node:assert/strict";

let controller: any;
let pool: any;
let supabaseAdmin: any;
let originalConnect: any;
let originalFrom: any;
let originalConsoleError: any;

let scenario: "audit-failure" | "rollback-failure" | "commit-failure";
let queries: string[];
let cleanupCalls: string[][];
let releaseCalls: number;

before(async () => {
  process.env.JWT_SECRET = "trustvault-upload-test-secret-only";
  process.env.DATABASE_URL =
    "postgresql://test:test@127.0.0.1:5432/trustvault_test";
  process.env.SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY =
    "trustvault-upload-test-service-role-key-only";

  controller = await import("../src/documents/document.controller");
  const database = await import("../src/config/database");
  const supabase = await import("../src/config/supabase");

  pool = database.pool;
  supabaseAdmin = supabase.supabaseAdmin;

  originalConnect = pool.connect.bind(pool);
  originalFrom = supabaseAdmin.storage.from.bind(
    supabaseAdmin.storage
  );
  originalConsoleError = console.error;
});

afterEach(() => {
  pool.connect = originalConnect;
  supabaseAdmin.storage.from = originalFrom;
  console.error = originalConsoleError;
});

function configureScenario(
  selected: "audit-failure" | "rollback-failure" | "commit-failure"
) {
  scenario = selected;
  queries = [];
  cleanupCalls = [];
  releaseCalls = 0;

  console.error = () => {};

  pool.connect = async () => ({
    query: async (sql: string) => {
      const normalized = sql.trim().toUpperCase();
      queries.push(normalized);

      if (normalized === "BEGIN") return { rows: [] };

      if (normalized.startsWith("INSERT INTO DOCUMENTS")) {
        return {
          rows: [{
            id: "document-test-id",
            owner_id: "user-test-id",
            name: "Test document",
          }],
        };
      }

      if (normalized.includes("INSERT INTO AUDIT_LOGS")) {
        if (
          scenario === "audit-failure" ||
          scenario === "rollback-failure"
        ) {
          throw new Error("simulated audit insert failure");
        }
        return { rows: [] };
      }

      if (normalized === "COMMIT" && scenario === "commit-failure") {
        throw new Error("simulated ambiguous commit");
      }

      if (
        normalized === "ROLLBACK" &&
        scenario === "rollback-failure"
      ) {
        throw new Error("simulated rollback failure");
      }

      return { rows: [] };
    },
    release: () => {
      releaseCalls += 1;
    },
  });

  supabaseAdmin.storage.from = (_bucket: string) => ({
    upload: async (_path: string, _buffer: Buffer, _options: any) => ({
      error: null,
    }),
    remove: async (paths: string[]) => {
      cleanupCalls.push(paths);
      return { error: null };
    },
  });
}

async function invokeUpload() {
  const req: any = {
    user: { sub: "user-test-id", email: "test@example.com", role: "owner" },
    body: { name: "Test document" },
    file: {
      originalname: "test.txt",
      mimetype: "text/plain",
      buffer: Buffer.from("test"),
      size: 4,
    },
  };

  const result: any = {
    statusCode: 200,
    body: undefined,
  };

  const res: any = {
    status(code: number) {
      result.statusCode = code;
      return this;
    },
    json(body: any) {
      result.body = body;
      return this;
    },
  };

  await controller.uploadDocument(req, res);
  return result;
}

test("cleans up storage after audit failure when rollback succeeds", async () => {
  configureScenario("audit-failure");

  const result = await invokeUpload();

  assert.equal(result.statusCode, 500);
  assert.ok(queries.includes("ROLLBACK"));
  assert.equal(cleanupCalls.length, 1);
  assert.equal(releaseCalls, 1);
});

test("does not clean up storage when rollback outcome is uncertain", async () => {
  configureScenario("rollback-failure");

  const result = await invokeUpload();

  assert.equal(result.statusCode, 500);
  assert.ok(queries.includes("ROLLBACK"));
  assert.equal(cleanupCalls.length, 0);
  assert.equal(releaseCalls, 1);
});

test("does not clean up storage after an ambiguous commit failure", async () => {
  configureScenario("commit-failure");

  const result = await invokeUpload();

  assert.equal(result.statusCode, 500);
  assert.ok(queries.includes("COMMIT"));
  assert.ok(queries.includes("ROLLBACK"));
  assert.equal(cleanupCalls.length, 0);
  assert.equal(releaseCalls, 1);
});