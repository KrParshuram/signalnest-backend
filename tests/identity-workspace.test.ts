import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";

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

const runId = randomUUID();
const firstEmail = `tester+${runId}@signalnest.test`;
const secondEmail = `other+${runId}@signalnest.test`;
const firstAgent = request.agent(app);
let organizationId = "";

after(async () => {
  if (organizationId) {
    await prisma.organization.deleteMany({ where: { id: organizationId } });
  }
  await prisma.user.deleteMany({ where: { email: { in: [firstEmail, secondEmail] } } });
  await prisma.$disconnect();
});

test("identity, workspace membership and brand isolation", async () => {
  const unauthenticated = await firstAgent.get("/api/v1/auth/me");
  assert.equal(unauthenticated.status, 401);

  const registration = await firstAgent.post("/api/v1/auth/register").send({
    name: "Signalnest Tester",
    email: firstEmail,
    password: "A-secure-test-password-2026",
  });
  assert.equal(registration.status, 201);
  assert.ok(registration.body.accessToken);
  const accessToken = registration.body.accessToken;
  const originalRefreshCookie = registration.headers["set-cookie"]?.[0]?.split(";")[0];
  assert.ok(originalRefreshCookie);

  const duplicate = await firstAgent.post("/api/v1/auth/register").send({
    name: "Duplicate Tester",
    email: firstEmail.toUpperCase(),
    password: "A-secure-test-password-2026",
  });
  assert.equal(duplicate.status, 409);

  const loginAgent = request.agent(app);
  const login = await loginAgent.post("/api/v1/auth/login").send({
    email: firstEmail,
    password: "A-secure-test-password-2026",
  });
  assert.equal(login.status, 200);
  assert.ok(login.body.accessToken);

  const me = await firstAgent.get("/api/v1/auth/me").set("Authorization", `Bearer ${accessToken}`);
  assert.equal(me.status, 200);
  assert.equal(me.body.user.email, firstEmail);

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
    email: secondEmail,
    password: "Another-secure-password-2026",
  });
  assert.equal(secondRegistration.status, 201);

  const forbiddenBrands = await secondAgent.get(`/api/v1/brands?organizationId=${organizationId}`)
    .set("Authorization", `Bearer ${secondRegistration.body.accessToken}`);
  assert.equal(forbiddenBrands.status, 404);

  const refreshed = await firstAgent.post("/api/v1/auth/refresh");
  assert.equal(refreshed.status, 200);
  assert.ok(refreshed.body.accessToken);

  const replayedOldSession = await request(app).post("/api/v1/auth/refresh")
    .set("Cookie", originalRefreshCookie);
  assert.equal(replayedOldSession.status, 401);

  const logout = await firstAgent.post("/api/v1/auth/logout");
  assert.equal(logout.status, 204);

  const afterLogout = await firstAgent.post("/api/v1/auth/refresh");
  assert.equal(afterLogout.status, 401);
});
