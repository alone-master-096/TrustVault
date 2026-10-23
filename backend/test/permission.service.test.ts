import { test, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";

let grantPermission: any;
let revokePermission: any;
let pool: any;
let originalConnect: any;

const grantInput = {
  documentId: "doc-1",
  userId: "user-2",
  permission: "read" as const,
  grantedBy: "owner-1",
};

const revokeInput = {
  documentId: "doc-1",
  userId: "user-2",
  revokedBy: "owner-1",
};

before(async () => {
  process.env.DATABASE_URL =
    "postgresql://test:test@127.0.0.1:5432/trustvault_test";

  const service = await import("../src/permissions/permission.service");
  const database = await import("../src/config/database");

  grantPermission = service.grantPermission;
  revokePermission = service.revokePermission;
  pool = database.pool;
  originalConnect = pool.connect;
});

afterEach(() => {
  pool.connect = originalConnect;
});

after(async () => {
  await pool.end();
});

function setupMock(
  options: {
    failAudit?: boolean;
    failRollback?: boolean;
    failCommit?: boolean;
    existingPermission?: boolean;
  } = {}
) {
  const calls: string[] = [];
  let released = false;

  const client = {
    async query(sql: string, _values?: unknown[]) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      calls.push(normalized);

      if (normalized === "BEGIN") {
        return { rows: [], rowCount: 0 };
      }

      if (normalized === "COMMIT") {
        if (options.failCommit) {
          throw new Error("simulated commit acknowledgement failure");
        }
        return { rows: [], rowCount: 0 };
      }

      if (normalized === "ROLLBACK") {
        if (options.failRollback) {
          throw new Error("simulated rollback failure");
        }
        return { rows: [], rowCount: 0 };
      }

      if (normalized.includes("FROM documents")) {
        return {
          rows: [{ id: "doc-1", owner_id: "owner-1" }],
          rowCount: 1,
        };
      }

      if (normalized.includes("FROM users")) {
        return {
          rows: [{ id: "user-2", is_active: true }],
          rowCount: 1,
        };
      }

      if (normalized.includes("FROM document_permissions")) {
        return options.existingPermission
          ? { rows: [{ id: "perm-1" }], rowCount: 1 }
          : { rows: [], rowCount: 0 };
      }

      if (normalized.includes("INSERT INTO document_permissions")) {
        return {
          rows: [{ id: "perm-1", permission: "read" }],
          rowCount: 1,
        };
      }

      if (normalized.startsWith("UPDATE document_permissions")) {
        return {
          rows: [{ id: "perm-1", is_active: false }],
          rowCount: 1,
        };
      }

      if (normalized.includes("INSERT INTO audit_logs")) {
        if (options.failAudit) {
          throw new Error("simulated audit insert failure");
        }
        return { rows: [], rowCount: 1 };
      }

      throw new Error(`Unexpected SQL in test: ${normalized}`);
    },

    release() {
      released = true;
    },
  };

  pool.connect = async () => client;

  return {
    calls,
    wasReleased: () => released,
  };
}

test("grant commits permission and audit in one transaction", async () => {
  const mock = setupMock();

  const result = await grantPermission(grantInput);

  assert.equal(result.id, "perm-1");
  assert.ok(mock.calls.includes("BEGIN"));
  assert.ok(mock.calls.includes("COMMIT"));
  assert.equal(
    mock.calls.filter((sql) => sql.includes("INSERT INTO audit_logs")).length,
    1
  );
  assert.equal(mock.calls.includes("ROLLBACK"), false);
  assert.equal(mock.wasReleased(), true);
});

test("grant rolls back when audit insertion fails", async () => {
  const mock = setupMock({ failAudit: true });

  await assert.rejects(
    grantPermission(grantInput),
    /simulated audit insert failure/
  );

  assert.ok(mock.calls.includes("ROLLBACK"));
  assert.equal(mock.calls.includes("COMMIT"), false);
  assert.equal(mock.wasReleased(), true);
});

test("grant releases the client if rollback fails", async () => {
  const mock = setupMock({
    failAudit: true,
    failRollback: true,
  });

  const originalConsoleError = console.error;
  console.error = () => {};

  try {
    await assert.rejects(
      grantPermission(grantInput),
      /simulated audit insert failure/
    );
  } finally {
    console.error = originalConsoleError;
  }

  assert.ok(mock.calls.includes("ROLLBACK"));
  assert.equal(mock.wasReleased(), true);
});

test("grant does not retry rollback after an ambiguous commit failure", async () => {
  const mock = setupMock({ failCommit: true });

  await assert.rejects(
    grantPermission(grantInput),
    /simulated commit acknowledgement failure/
  );

  assert.ok(mock.calls.includes("COMMIT"));
  assert.equal(mock.calls.includes("ROLLBACK"), false);
  assert.equal(mock.wasReleased(), true);
});

test("revoke commits the permission change and audit together", async () => {
  const mock = setupMock();

  const result = await revokePermission(revokeInput);

  assert.equal(result.id, "perm-1");
  assert.ok(mock.calls.includes("BEGIN"));
  assert.ok(mock.calls.includes("COMMIT"));
  assert.equal(
    mock.calls.filter((sql) => sql.includes("INSERT INTO audit_logs")).length,
    1
  );
  assert.equal(mock.wasReleased(), true);
});

test("revoke rolls back when audit insertion fails", async () => {
  const mock = setupMock({ failAudit: true });

  await assert.rejects(
    revokePermission(revokeInput),
    /simulated audit insert failure/
  );

  assert.ok(mock.calls.includes("ROLLBACK"));
  assert.equal(mock.calls.includes("COMMIT"), false);
  assert.equal(mock.wasReleased(), true);
});

test("revoke does not retry rollback after an ambiguous commit failure", async () => {
  const mock = setupMock({ failCommit: true });

  await assert.rejects(
    revokePermission(revokeInput),
    /simulated commit acknowledgement failure/
  );

  assert.ok(mock.calls.includes("COMMIT"));
  assert.equal(mock.calls.includes("ROLLBACK"), false);
  assert.equal(mock.wasReleased(), true);
});