import assert from "node:assert/strict";
import { after, before, test } from "node:test";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??= "postgresql://signalnest:signalnest_dev@localhost:5432/signalnest";
process.env.REDIS_URL ??= "redis://localhost:6379";
process.env.JWT_ACCESS_SECRET ??= "test-access-secret-that-is-at-least-thirty-two-characters";
process.env.JWT_REFRESH_SECRET ??= "test-refresh-secret-that-is-at-least-thirty-two-characters";
process.env.WEB_ORIGIN ??= "http://localhost:3000";

const [{ app }, { prisma }, { default: request }] = await Promise.all([
  import("../src/app.js"),
  import("../src/lib/prisma.js"),
  import("supertest"),
]);

const firstAgent = request.agent(app);
let accessToken = "";
let organizationId = "";

before(async () => {
  await prisma.refreshToken.deleteMany();
  await prisma.brand.deleteMany();
  await prisma.organizationMember.deleteMany();
  await prisma.organization.deleteMany();
  await prisma.user.deleteMany();
});

after(async () => {
  await prisma.$disconnect();
});

test("identity, workspace membership and brand isolation", async () => {
  const registration = await firstAgent.post("/api/v1/auth/register").send({
    name: "Signalnest Tester",
    email: "tester@signalnest.test",
    password: "A-secure-test-password-2026",
  });
  assert.equal(registration.status, 201);
  assert.ok(registration.body.accessToken);
  accessToken = registration.body.accessToken;

  const duplicate = await firstAgent.post("/api/v1/auth/register").send({
    name: "Duplicate Tester",
    email: "TESTER@signalnest.test",
    password: "A-secure-test-password-2026",
  });
  assert.equal(duplicate.status, 409);

  const me = await firstAgent.get("/api/v1/auth/me").set("Authorization", `Bearer ${accessToken}`);
  assert.equal(me.status, 200);
  assert.equal(me.body.user.email, "tester@signalnest.test");

  const organization = await firstAgent.post("/api/v1/organizations")
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ name: "Test Workspace" });
  assert.equal(organization.status, 201);
  organizationId = organization.body.id;

  const brand = await firstAgent.post("/api/v1/brands")
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ organizationId, name: "Test Brand", websiteUrl: "https://example.test" });
  assert.equal(brand.status, 201);

  const secondAgent = request.agent(app);
  const secondRegistration = await secondAgent.post("/api/v1/auth/register").send({
    name: "Other User",
    email: "other@signalnest.test",
    password: "Another-secure-password-2026",
  });
  assert.equal(secondRegistration.status, 201);

  const forbiddenBrands = await secondAgent.get(`/api/v1/brands?organizationId=${organizationId}`)
    .set("Authorization", `Bearer ${secondRegistration.body.accessToken}`);
  assert.equal(forbiddenBrands.status, 404);

  const refreshed = await firstAgent.post("/api/v1/auth/refresh");
  assert.equal(refreshed.status, 200);
  assert.ok(refreshed.body.accessToken);
  assert.notEqual(refreshed.body.accessToken, accessToken);
  accessToken = refreshed.body.accessToken;

  const logout = await firstAgent.post("/api/v1/auth/logout");
  assert.equal(logout.status, 204);

  const afterLogout = await firstAgent.post("/api/v1/auth/refresh");
  assert.equal(afterLogout.status, 401);
});
