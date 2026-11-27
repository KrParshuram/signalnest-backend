import { createHash } from "node:crypto";
import { prisma } from "../lib/prisma.js";

type ImportPreviewRow = {
  originalContent: string;
  authorDisplayName?: string | null;
  sourceUrl?: string | null;
  publishedAt?: string | null;
  externalId?: string | null;
};

export async function processFeedbackImport(importJobId: string) {
  const importJob = await prisma.feedbackImportJob.findUnique({ where: { id: importJobId } });
  if (!importJob) throw new Error("Feedback import job not found.");
  if (importJob.status === "COMPLETED") return { skipped: true };

  await prisma.feedbackImportJob.update({
    where: { id: importJob.id },
    data: { status: "PROCESSING", failureReason: null },
  });

  try {
    const sourceType = importJob.type === "CSV" ? "CSV" : "URL";
    const sourceName = importJob.type === "CSV" ? "CSV import" : "URL capture";
    const source = await prisma.source.upsert({
      where: {
        organizationId_type_name: {
          organizationId: importJob.organizationId,
          type: sourceType,
          name: sourceName,
        },
      },
      create: { organizationId: importJob.organizationId, type: sourceType, name: sourceName },
      update: { isActive: true },
      select: { id: true },
    });

    const rows = Array.isArray(importJob.previewData)
      ? importJob.previewData as unknown as ImportPreviewRow[]
      : [];

    let processedRows = 0;
    for (const [rowIndex, row] of rows.entries()) {
      const existingRow = await prisma.feedback.findFirst({
        where: { importJobId: importJob.id, importRowNumber: rowIndex + 1 },
        select: { id: true },
      });
      if (existingRow) {
        processedRows += 1;
        continue;
      }

      const normalized = row.originalContent.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
      const contentHash = createHash("sha256").update(normalized).digest("hex");

      if (row.externalId) {
        const alreadyImported = await prisma.feedback.findFirst({
          where: {
            organizationId: importJob.organizationId,
            sourceId: source.id,
            externalId: row.externalId,
          },
          select: { id: true },
        });
        if (alreadyImported) {
          processedRows += 1;
          continue;
        }
      }

      const duplicate = await prisma.feedback.findFirst({
        where: { organizationId: importJob.organizationId, contentHash },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });

      await prisma.feedback.create({
        data: {
          organizationId: importJob.organizationId,
          brandId: importJob.brandId,
          sourceId: source.id,
          createdByUserId: importJob.createdByUserId,
          importJobId: importJob.id,
          importRowNumber: rowIndex + 1,
          externalId: row.externalId || null,
          contentHash,
          duplicateOfId: duplicate?.id ?? null,
          originalContent: row.originalContent,
          authorDisplayName: row.authorDisplayName || null,
          sourceUrl: row.sourceUrl || null,
          publishedAt: row.publishedAt ? new Date(row.publishedAt) : null,
        },
      });

      processedRows += 1;
      if (processedRows % 20 === 0) {
        await prisma.feedbackImportJob.update({
          where: { id: importJob.id },
          data: { processedRows },
        });
      }
    }

    await prisma.feedbackImportJob.update({
      where: { id: importJob.id },
      data: { status: "COMPLETED", processedRows, completedAt: new Date() },
    });
    return { processedRows };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown import processing error.";
    await prisma.feedbackImportJob.update({
      where: { id: importJob.id },
      data: { status: "FAILED", failureReason: message },
    });
    throw error;
  }
}
