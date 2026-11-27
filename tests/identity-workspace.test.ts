import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??= "postgresql://signalnest:signalnest_dev@localhost:5432/signalnest";
process.env.REDIS_URL ??= "redis://localhost:6379";
process.env.JWT_ACCESS_SECRET ??= "test-access-secret-that-is-at-least-thirty-two-characters";
process.env.JWT_REFRESH_SECRET ??= "test-refresh-secret-that-is-at-least-thirty-two-characters";
process.env.WEB_ORIGIN ??= "http://localhost:3000";

const [{ app }, { prisma }, { default: request }, { processFeedbackImport }] = await Promise.all([
  import("../src/app.js"),
  import("../src/lib/prisma.js"),
  import("supertest"),
  import("../src/services/feedback-import.service.js"),
]);

const runId = randomUUID();
const firstEmail = `tester+${runId}@signalnest.test`;
const secondEmail = `other+${runId}@signalnest.test`;
const firstAgent = request.agent(app);
let organizationId = "";
let firstUserId = "";

after(async () => {
  if (organizationId) {
    await prisma.feedback.deleteMany({ where: { organizationId } });
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
  firstUserId = registration.body.user.id;
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
    .send({ name: "Test Workspace", initialBrand: { name: "Initial Brand", industry: "SaaS" } });
  assert.equal(organization.status, 201);
  organizationId = organization.body.id;
  assert.equal(organization.body.brands.length, 1);
  assert.equal(organization.body.brands[0].name, "Initial Brand");
  const defaultTopics = await firstAgent.get("/api/v1/topics?organizationId=" + organizationId)
    .set("Authorization", `Bearer ${accessToken}`);
  assert.equal(defaultTopics.status, 200);
  assert.equal(defaultTopics.body.length, 12);
  assert.ok(defaultTopics.body.some((topic: { name: string }) => topic.name === "Product quality"));

  const customTopic = await firstAgent.post("/api/v1/topics")
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ organizationId, name: "Checkout experience" });
  assert.equal(customTopic.status, 201);

  const brand = await firstAgent.post("/api/v1/brands")
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ organizationId, name: "Test Brand", websiteUrl: "https://example.test" });
  assert.equal(brand.status, 201);
  const brandId = brand.body.id;


  const urlPreview = await firstAgent.post("/api/v1/feedback/import/url")
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ organizationId, brandId, url: "https://reviews.example.test/customer-123", originalContent: "The onboarding was clear and quick.", authorDisplayName: "URL Customer" });
  assert.equal(urlPreview.status, 201);
  assert.equal(urlPreview.body.preview[0].sourceUrl, "https://reviews.example.test/customer-123");
  assert.equal(urlPreview.body.preview[0].originalContent, "The onboarding was clear and quick.");
  const urlJobStatus = await firstAgent.get("/api/v1/feedback/import/" + urlPreview.body.id)
    .set("Authorization", `Bearer ${accessToken}`);
  assert.equal(urlJobStatus.body.status, "PREVIEWED");
  const unsafeUrl = await firstAgent.post("/api/v1/feedback/import/url")
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ organizationId, brandId, url: "ftp://reviews.example.test/file", originalContent: "Unsupported protocol" });
  assert.equal(unsafeUrl.status, 400);
  const csvPreview = await firstAgent.post("/api/v1/feedback/import/csv")
    .set("Authorization", `Bearer ${accessToken}`)
    .field("organizationId", organizationId)
    .field("brandId", brandId)
    .attach("file", Buffer.from("content,author\n\"CSV imported feedback\",\"CSV Customer\"\n,Missing content\n"), { filename: "feedback.csv", contentType: "text/csv" });
  assert.equal(csvPreview.status, 201);
  assert.equal(csvPreview.body.validRows, 1);
  assert.equal(csvPreview.body.invalidRows, 1);
  assert.equal(csvPreview.body.preview[0].originalContent, "CSV imported feedback");
  const csvJobStatus = await firstAgent.get("/api/v1/feedback/import/" + csvPreview.body.id)
    .set("Authorization", `Bearer ${accessToken}`);
  assert.equal(csvJobStatus.body.status, "PREVIEWED");
  const feedbackCreate = await firstAgent.post("/api/v1/feedback")
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ organizationId, brandId, originalContent: "The product is easy to use and the support team was helpful.", authorDisplayName: "Customer A", topicIds: [customTopic.body.id] });
  assert.equal(feedbackCreate.status, 201);
  const feedbackId = feedbackCreate.body.id;
  assert.equal(feedbackCreate.body.source.type, "MANUAL");
  assert.equal(feedbackCreate.body.sentiment, "UNKNOWN");
  const sourcesList = await firstAgent.get("/api/v1/sources?organizationId=" + organizationId)
    .set("Authorization", `Bearer ${accessToken}`);
  assert.equal(sourcesList.status, 200);
  assert.ok(sourcesList.body.some((source: { type: string }) => source.type === "MANUAL"));
  const sourceFilteredFeedback = await firstAgent.get("/api/v1/feedback?organizationId=" + organizationId + "&sourceId=" + feedbackCreate.body.source.id)
    .set("Authorization", `Bearer ${accessToken}`);
  assert.equal(sourceFilteredFeedback.body.data.length, 1);

  const feedbackList = await firstAgent.get(`/api/v1/feedback?organizationId=${organizationId}&search=easy`)
    .set("Authorization", `Bearer ${accessToken}`);
  assert.equal(feedbackList.status, 200);
  assert.equal(feedbackList.body.data.length, 1);
  assert.equal(feedbackList.body.data[0].id, feedbackId);
  const topicFiltered = await firstAgent.get("/api/v1/feedback?organizationId=" + organizationId + "&topicId=" + customTopic.body.id)
    .set("Authorization", `Bearer ${accessToken}`);
  assert.equal(topicFiltered.body.data.length, 1);

  const immutableContent = await firstAgent.patch(`/api/v1/feedback/${feedbackId}`)
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ originalContent: "Changed raw feedback" });
  assert.equal(immutableContent.status, 400);

  const feedbackNote = await firstAgent.post(`/api/v1/feedback/${feedbackId}/notes`)
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ body: "Follow up with the support lead." });
  assert.equal(feedbackNote.status, 201);

  const archiveFeedback = await firstAgent.post(`/api/v1/feedback/${feedbackId}/archive`)
    .set("Authorization", `Bearer ${accessToken}`);
  assert.equal(archiveFeedback.status, 200);
  const activeAfterArchive = await firstAgent.get(`/api/v1/feedback?organizationId=${organizationId}`)
    .set("Authorization", `Bearer ${accessToken}`);
  assert.equal(activeAfterArchive.body.data.length, 0);
  const restoreFeedback = await firstAgent.post(`/api/v1/feedback/${feedbackId}/restore`)
    .set("Authorization", `Bearer ${accessToken}`);
  assert.equal(restoreFeedback.status, 200);

  const brandDetail = await firstAgent.get(`/api/v1/brands/${brandId}`)
    .set("Authorization", `Bearer ${accessToken}`);
  assert.equal(brandDetail.status, 200);

  const brandUpdate = await firstAgent.patch(`/api/v1/brands/${brandId}`)
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ name: "Updated Test Brand" });
  assert.equal(brandUpdate.status, 200);
  assert.equal(brandUpdate.body.name, "Updated Test Brand");

  await prisma.organizationMember.update({
    where: { organizationId_userId: { organizationId, userId: firstUserId } },
    data: { role: "MEMBER" },
  });
  const memberInboxBeforeAssignment = await firstAgent.get(`/api/v1/feedback?organizationId=${organizationId}`)
    .set("Authorization", `Bearer ${accessToken}`);
  assert.equal(memberInboxBeforeAssignment.body.data.length, 0);
  const hiddenUnassignedFeedback = await firstAgent.get(`/api/v1/feedback/${feedbackId}`)
    .set("Authorization", `Bearer ${accessToken}`);
  assert.equal(hiddenUnassignedFeedback.status, 404);
  await prisma.feedback.update({ where: { id: feedbackId }, data: { assignedToUserId: firstUserId } });
  const memberInbox = await firstAgent.get(`/api/v1/feedback?organizationId=${organizationId}`)
    .set("Authorization", `Bearer ${accessToken}`);
  assert.equal(memberInbox.body.data.length, 1);
  const memberNote = await firstAgent.post(`/api/v1/feedback/${feedbackId}/notes`)
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ body: "Member note on assigned feedback." });
  assert.equal(memberNote.status, 201);
  const memberReassign = await firstAgent.patch(`/api/v1/feedback/${feedbackId}`)
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ assignedToUserId: null });
  assert.equal(memberReassign.status, 403);

  await prisma.organizationMember.update({
    where: { organizationId_userId: { organizationId, userId: firstUserId } },
    data: { role: "VIEWER" },
  });
  const viewerCreate = await firstAgent.post("/api/v1/brands")
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ organizationId, name: "Forbidden Brand" });
  assert.equal(viewerCreate.status, 403);
  await prisma.organizationMember.update({
    where: { organizationId_userId: { organizationId, userId: firstUserId } },
    data: { role: "OWNER" },
  });

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
  const forbiddenFeedback = await secondAgent.get(`/api/v1/feedback?organizationId=${organizationId}`)
    .set("Authorization", `Bearer ${secondRegistration.body.accessToken}`);
  assert.equal(forbiddenFeedback.status, 404);

  const deleteBrand = await firstAgent.delete(`/api/v1/brands/${brandId}`)
    .set("Authorization", `Bearer ${accessToken}`);
  assert.equal(deleteBrand.status, 204);
  const deletedBrand = await firstAgent.get(`/api/v1/brands/${brandId}`)
    .set("Authorization", `Bearer ${accessToken}`);
  assert.equal(deletedBrand.status, 404);

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
