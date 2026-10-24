import { test, before, afterEach } from "node:test";
import assert from "node:assert/strict";

let controller: any;
let pool: any;
let supabaseAdmin: any;
let originalQuery: any;
let originalFrom: any;
let originalConsoleError: any;

const documentId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";

before(async () => {
  process.env.JWT_SECRET = "trustvault-download-test-secret-only";
  process.env.DATABASE_URL =
    "postgresql://test:test@127.0.0.1:5432/trustvault_test";
  process.env.SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY =
    "trustvault-download-test-service-role-key-only";

  controller = await import("../src/documents/download.controller");
  const database = await import("../src/config/database");
  const supabase = await import("../src/config/supabase");

  pool = database.pool;
  supabaseAdmin = supabase.supabaseAdmin;
  originalQuery = pool.query.bind(pool);
  originalFrom = supabaseAdmin.storage.from.bind(supabaseAdmin.storage);
  originalConsoleError = console.error;
});

afterEach(() => {
  pool.query = originalQuery;
  supabaseAdmin.storage.from = originalFrom;
  console.error = originalConsoleError;
});

function makeResponse() {
  const result: any = { statusCode: 200, body: undefined, headers: {}, sent: undefined };
  const res: any = {
    status(code: number) {
      result.statusCode = code;
      return this;
    },
    json(body: any) {
      result.body = body;
      return this;
    },
    setHeader(name: string, value: any) {
      result.headers[name.toLowerCase()] = value;
      return this;
    },
    send(body: any) {
      result.sent = body;
      return this;
    },
  };
  return { result, res };
}

function makeRequest(id: string = documentId) {
  return {
    params: { id },
    user: { sub: userId },
    ip: "127.0.0.1",
    get: (_name: string) => "download-test-agent",
  } as any;
}

test("rejects an invalid document ID before querying permissions or storage", async () => {
  let dbCalls = 0;
  let storageCalls = 0;

  pool.query = async () => {
    dbCalls++;
    return { rows: [], rowCount: 0 };
  };
  supabaseAdmin.storage.from = () => {
    storageCalls++;
    throw new Error("Storage must not be accessed");
  };

  const { result, res } = makeResponse();
  await controller.downloadDocument(makeRequest("not-a-uuid"), res);

  assert.equal(result.statusCode, 400);
  assert.equal(result.body.error, "INVALID_DOCUMENT_ID");
  assert.equal(dbCalls, 0);
  assert.equal(storageCalls, 0);
});

test("denies a user without an active permission and audits the refusal", async () => {
  const queries: string[] = [];
  let storageCalls = 0;

  pool.query = async (sql: string) => {
    queries.push(sql);
    if (sql.includes("SELECT")) {
      return {
        rowCount: 1,
        rows: [{
          id: documentId,
          owner_id: "33333333-3333-4333-8333-333333333333",
          storage_path: "private/test.txt",
          original_filename: "test.txt",
          mime_type: "text/plain",
          file_size: 4,
          permission: null,
        }],
      };
    }
    return { rowCount: 1, rows: [] };
  };

  supabaseAdmin.storage.from = () => {
    storageCalls++;
    throw new Error("Storage must not be accessed");
  };

  const { result, res } = makeResponse();
  await controller.downloadDocument(makeRequest(), res);

  assert.equal(result.statusCode, 403);
  assert.equal(result.body.error, "ACCESS_DENIED");
  assert.equal(storageCalls, 0);
  assert.equal(queries.length, 2);
  assert.match(queries[1], /INSERT INTO\s+audit_logs/i);
  assert.match(queries[1], /access_denied/i);
});

test("denies a revoked permission using the current database state", async () => {
  let storageCalls = 0;
  let auditCalls = 0;

  pool.query = async (sql: string) => {
    if (sql.includes("SELECT")) {
      // Simulates the LEFT JOIN finding no active permission after revocation.
      return {
        rowCount: 1,
        rows: [{
          id: documentId,
          owner_id: "33333333-3333-4333-8333-333333333333",
          storage_path: "private/test.txt",
          original_filename: "test.txt",
          mime_type: "text/plain",
          file_size: 4,
          permission: null,
        }],
      };
    }
    auditCalls++;
    return { rowCount: 1, rows: [] };
  };

  supabaseAdmin.storage.from = () => {
    storageCalls++;
    throw new Error("Storage must not be accessed after revocation");
  };

  const { result, res } = makeResponse();
  await controller.downloadDocument(makeRequest(), res);

  assert.equal(result.statusCode, 403);
  assert.equal(result.body.error, "ACCESS_DENIED");
  assert.equal(storageCalls, 0);
  assert.equal(auditCalls, 1);
});

test("allows an active read permission and audits a successful download", async () => {
  const queries: string[] = [];
  let storagePath: string | undefined;

  pool.query = async (sql: string) => {
    queries.push(sql);
    return { rowCount: 1, rows: [] };
  };

  supabaseAdmin.storage.from = (bucket: string) => {
    assert.ok(bucket);
    return {
      download: async (path: string) => {
        storagePath = path;
        return {
          data: new Blob(["test"], { type: "text/plain" }),
          error: null,
        };
      },
    };
  };

  // This controller test exercises the real permission service, which uses pool.query.
  // The mocked query supplies an active read permission and its document.
  pool.query = async (sql: string) => {
    queries.push(sql);
    if (sql.includes("SELECT")) {
      return {
        rowCount: 1,
        rows: [{
          id: documentId,
          owner_id: "33333333-3333-4333-8333-333333333333",
          storage_path: "private/test.txt",
          original_filename: "test.txt",
          mime_type: "text/plain",
          file_size: 4,
          permission: "read",
        }],
      };
    }
    return { rowCount: 1, rows: [] };
  };

  const { result, res } = makeResponse();
  await controller.downloadDocument(makeRequest(), res);

  assert.equal(result.statusCode, 200);
  assert.equal(storagePath, "private/test.txt");
  assert.equal(Buffer.from(result.sent).toString(), "test");
  assert.equal(result.headers["content-type"], "text/plain");
  assert.match(result.headers["content-disposition"], /attachment/);
  assert.ok(queries.some((sql) => /INSERT INTO\s+audit_logs/i.test(sql)));
  assert.ok(queries.some((sql) => /'download'\s*,\s*true/i.test(sql)));
});
