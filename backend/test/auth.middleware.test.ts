import { test, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";

const TEST_SECRET = "trustvault-middleware-test-secret-only";

let authenticate: any;
let pool: any;
let jwt: any;
let originalQuery: any;

before(async () => {
  // These values are test-only; no live database connection is required.
  process.env.JWT_SECRET = TEST_SECRET;
  process.env.DATABASE_URL =
    "postgresql://test:test@127.0.0.1:5432/trustvault_test";

  const middleware = await import("../src/middleware/auth.middleware");
  const database = await import("../src/config/database");
  const jsonwebtoken = await import("jsonwebtoken");

  authenticate = middleware.authenticate;
  pool = database.pool;
  jwt = jsonwebtoken.default;
  originalQuery = pool.query;
});

afterEach(() => {
  pool.query = originalQuery;
});

after(async () => {
  await pool.end();
});

function makeResponse() {
  const result: { statusCode: number; body: any; res: any } = {
    statusCode: 200,
    body: undefined,
    res: undefined,
  };

  result.res = {
    status(code: number) {
      result.statusCode = code;
      return this;
    },
    json(body: any) {
      result.body = body;
      return this;
    },
  };

  return result;
}

function makeToken(
  role = "viewer",
  algorithm: "HS256" | "HS384" = "HS256"
) {
  return jwt.sign(
    {
      sub: "user-1",
      email: "test@example.com",
      role,
    },
    TEST_SECRET,
    { algorithm }
  );
}

async function invoke(authorization?: string) {
  const req: any = { headers: {} };

  if (authorization !== undefined) {
    req.headers.authorization = authorization;
  }

  const response = makeResponse();
  let nextCalled = false;

  await authenticate(req, response.res, () => {
    nextCalled = true;
  });

  return {
    req,
    nextCalled,
    statusCode: response.statusCode,
    body: response.body,
  };
}

test("rejects a missing bearer token", async () => {
  let queryCalled = false;
  pool.query = async () => {
    queryCalled = true;
    return { rows: [] };
  };

  const result = await invoke();

  assert.equal(result.statusCode, 401);
  assert.equal(result.body.error, "UNAUTHORIZED");
  assert.equal(result.nextCalled, false);
  assert.equal(queryCalled, false);
});

test("rejects a token with an unsupported role", async () => {
  let queryCalled = false;
  pool.query = async () => {
    queryCalled = true;
    return { rows: [] };
  };

  const result = await invoke(`Bearer ${makeToken("superadmin")}`);

  assert.equal(result.statusCode, 401);
  assert.equal(result.body.error, "INVALID_TOKEN");
  assert.equal(queryCalled, false);
});

test("rejects a token signed with HS384", async () => {
  let queryCalled = false;
  pool.query = async () => {
    queryCalled = true;
    return { rows: [] };
  };

  const result = await invoke(`Bearer ${makeToken("viewer", "HS384")}`);

  assert.equal(result.statusCode, 401);
  assert.equal(result.body.error, "INVALID_TOKEN");
  assert.equal(queryCalled, false);
});

test("uses the current database role instead of the token role", async () => {
  pool.query = async () => ({
    rows: [{
      id: "user-1",
      email: "current@example.com",
      role: "owner",
      is_active: true,
    }],
  });

  const result = await invoke(`Bearer ${makeToken("viewer")}`);

  assert.equal(result.nextCalled, true);
  assert.equal(result.req.user.role, "owner");
  assert.equal(result.req.user.email, "current@example.com");
  assert.equal(result.req.user.sub, "user-1");
});

test("rejects a disabled account", async () => {
  pool.query = async () => ({
    rows: [{
      id: "user-1",
      email: "test@example.com",
      role: "viewer",
      is_active: false,
    }],
  });

  const result = await invoke(`Bearer ${makeToken()}`);

  assert.equal(result.statusCode, 403);
  assert.equal(result.body.error, "ACCOUNT_DISABLED");
  assert.equal(result.nextCalled, false);
});

test("rejects a token whose user no longer exists", async () => {
  pool.query = async () => ({ rows: [] });

  const result = await invoke(`Bearer ${makeToken()}`);

  assert.equal(result.statusCode, 401);
  assert.equal(result.body.error, "INVALID_TOKEN");
  assert.equal(result.nextCalled, false);
});

test("returns 503 when the database check fails", async () => {
  pool.query = async () => {
    throw new Error("simulated test database failure");
  };

  const result = await invoke(`Bearer ${makeToken()}`);

  assert.equal(result.statusCode, 503);
  assert.equal(
    result.body.error,
    "AUTHENTICATION_SERVICE_UNAVAILABLE"
  );
  assert.equal(result.nextCalled, false);
});