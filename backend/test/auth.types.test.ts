import test from "node:test";
import assert from "node:assert/strict";
import { registerSchema, loginSchema } from "../src/auth/auth.types";

test("registration accepts valid input", () => {
  const result = registerSchema.safeParse({
    name: "Suneetha",
    email: "user@example.com",
    password: "securePass123",
  });

  assert.equal(result.success, true);
});

test("registration trims the name and email", () => {
  const result = registerSchema.safeParse({
    name: "  Suneetha  ",
    email: "  user@example.com  ",
    password: "securePass123",
  });

  assert.equal(result.success, true);

  if (result.success) {
    assert.equal(result.data.name, "Suneetha");
    assert.equal(result.data.email, "user@example.com");
  }
});

test("registration rejects a short name", () => {
  assert.equal(
    registerSchema.safeParse({
      name: "A",
      email: "user@example.com",
      password: "securePass123",
    }).success,
    false,
  );
});

test("registration rejects an invalid email", () => {
  assert.equal(
    registerSchema.safeParse({
      name: "Example User",
      email: "not-an-email",
      password: "securePass123",
    }).success,
    false,
  );
});

test("registration rejects passwords shorter than eight characters", () => {
  assert.equal(
    registerSchema.safeParse({
      name: "Example User",
      email: "user@example.com",
      password: "short",
    }).success,
    false,
  );
});

test("registration does not accept a caller-supplied role as input data", () => {
  const result = registerSchema.safeParse({
    name: "Example User",
    email: "user@example.com",
    password: "securePass123",
    role: "admin",
  });

  assert.equal(result.success, true);

  if (result.success) {
    assert.equal("role" in result.data, false);
  }
});

test("login accepts valid credentials", () => {
  assert.equal(
    loginSchema.safeParse({
      email: "user@example.com",
      password: "x",
    }).success,
    true,
  );
});

test("login rejects an empty password", () => {
  assert.equal(
    loginSchema.safeParse({
      email: "user@example.com",
      password: "",
    }).success,
    false,
  );
});

test("login rejects an invalid email", () => {
  assert.equal(
    loginSchema.safeParse({
      email: "invalid",
      password: "some-password",
    }).success,
    false,
  );
});
