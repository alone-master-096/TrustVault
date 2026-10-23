import { test, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";

let controller: typeof import("../src/documents/document.controller");
let pool: any;
let originalConnect: any;
let originalConsoleError: typeof console.error;

const documentId = "123e4567-e89b-42d3-a456-426614174000";
const ownerId = "owner-test-id";
const otherUserId = "other-test-id";

before(async () => {
  process.env.SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  process.env.DATABASE_URL =
    "postgresql://test:test@127.0.0.1:5432/trustvault_test";

  controller = await import("../src/documents/document.controller");
  const database = await import("../src/config/database");

  pool = database.pool;
  originalConnect = pool.connect;
  originalConsoleError = console.error;
  console.error = () => {};
});

afterEach(() => {
  pool.connect = originalConnect;
  console.error = originalConsoleError;
});

after(async () => {
  if (pool) await pool.end();
});

function setupMock(options: {
  ownerId?: string;
  alreadyDeleted?: boolean;
  failAudit?: boolean;
} = {}) {
  const calls: string[] = [];
  let released = false;

  pool.connect = async () => ({
    async query(sql: string, _values?: unknown[]) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      calls.push(normalized);

      if (normalized === "BEGIN" || normalized === "COMMIT" ||
          normalized === "ROLLBACK") {
        return { rows: [], rowCount: 0 };
      }

      if (normalized.includes("FROM documents") &&
          normalized.includes("FOR UPDATE")) {
        return {
          rows: [{
            id: documentId,
            owner_id: options.ownerId ?? ownerId,
            is_deleted: options.alreadyDeleted ?? false,
          }],
          rowCount: 1,
        };
      }

      if (normalized.startsWith("UPDATE documents")) {
        return { rows: [], rowCount: 1 };
      }

      if (normalized.includes("INSERT INTO audit_logs")) {
        if (options.failAudit) {
          throw new Error("simulated audit insert failure");
        }
        return { rows: [], rowCount: 1 };
      }

      throw new Error(`Unexpected SQL in deletion test: ${normalized}`);
    },
    release() {
      released = true;
    },
  });

  return { calls, wasReleased: () => released };
}

async function invokeDelete(userId: string) {
  const result: { statusCode: number; body?: any } = {
    statusCode: 200,
  };

  const req: any = {
    user: { sub: userId, role: "owner" },
    params: { id: documentId },
    ip: "127.0.0.1",
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

  await controller.deleteDocument(req, res);
  return result;
}

test("owner deletion commits soft-delete and audit together", async () => {
  const mock = setupMock({ ownerId });

  const result = await invokeDelete(ownerId);

  assert.equal(result.statusCode, 200);
  assert.ok(mock.calls.includes("BEGIN"));
  assert.ok(mock.calls.some(sql =>
    sql.startsWith("UPDATE documents") && sql.includes("is_deleted = true")
  ));
  assert.ok(mock.calls.some(sql =>
    sql.includes("INSERT INTO audit_logs") && sql.includes("'delete', true")
  ));
  assert.ok(mock.calls.includes("COMMIT"));
  assert.equal(mock.calls.includes("ROLLBACK"), false);
  assert.equal(mock.wasReleased(), true);
});

test("non-owner deletion is refused and the denied attempt is audited", async () => {
  const mock = setupMock({ ownerId });

  const result = await invokeDelete(otherUserId);

  assert.equal(result.statusCode, 404);
  assert.ok(mock.calls.some(sql =>
    sql.includes("INSERT INTO audit_logs") && sql.includes("'delete', false")
  ));
  assert.equal(mock.calls.some(sql => sql.startsWith("UPDATE documents")), false);
  assert.ok(mock.calls.includes("COMMIT"));
  assert.equal(mock.wasReleased(), true);
});

test("audit failure rolls back the owner's deletion", async () => {
  const mock = setupMock({ ownerId, failAudit: true });

  const result = await invokeDelete(ownerId);

  assert.equal(result.statusCode, 500);
  assert.ok(mock.calls.some(sql => sql.startsWith("UPDATE documents")));
  assert.ok(mock.calls.includes("ROLLBACK"));
  assert.equal(mock.calls.includes("COMMIT"), false);
  assert.equal(mock.wasReleased(), true);
});

