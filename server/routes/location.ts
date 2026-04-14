import { Router } from "express";
import { ATAPI } from "../../src/api/index.js";
import { ATAPIError } from "../../src/api/client.js";
import { hasDatabase, recordListing, upsertLocation } from "../db/index.js";

export const locationRoutes = Router();

// GET /api/location/search?q=carbone
locationRoutes.get("/search", async (req, res) => {
  try {
    const api = new ATAPI();
    const result = await api.location.getList(
      (req.query.q as string) ?? "",
      { pageSize: Number(req.query.pageSize ?? 10) }
    );
    res.json(result);
  } catch (err) {
    res.status(500).json({ RequestStatus: "Failed", ResponseMessage: String(err) });
  }
});

// GET /api/location/:alias/inventory-types
locationRoutes.get("/:alias/inventory-types", async (req, res) => {
  try {
    const api = new ATAPI();
    const result = await api.location.getInventoryTypes(req.params.alias);
    res.json(result);
  } catch (err) {
    res.status(500).json({ RequestStatus: "Failed", ResponseMessage: String(err) });
  }
});

// GET /api/location/:alias/metrics
locationRoutes.get("/:alias/metrics", async (req, res) => {
  try {
    const api = new ATAPI();
    const { start, end } = req.query;
    const now = new Date();
    const defaultEnd = now.toISOString().split("T")[0];
    const defaultStart = new Date(now.getTime() - 90 * 86400000).toISOString().split("T")[0];

    const result = await api.location.getMetrics(
      req.params.alias,
      (start as string) ?? defaultStart,
      (end as string) ?? defaultEnd
    );
    res.json(result);
  } catch (err) {
    res.status(500).json({ RequestStatus: "Failed", ResponseMessage: String(err) });
  }
});

// GET /api/location/:alias/comparable-trades
locationRoutes.get("/:alias/comparable-trades", async (req, res) => {
  try {
    const api = new ATAPI();
    const { dateTime, inventoryTypeID } = req.query;
    if (!dateTime) {
      return res.status(400).json({ RequestStatus: "Failed", ResponseMessage: "dateTime required" });
    }
    const result = await api.location.getComparableTrades({
      locationAlias: req.params.alias,
      dateTime: dateTime as string,
      inventoryTypeID: Number(inventoryTypeID ?? 2),
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ RequestStatus: "Failed", ResponseMessage: String(err) });
  }
});

// GET /api/location/:alias/category
locationRoutes.get("/:alias/category", async (req, res) => {
  try {
    const api = new ATAPI();
    const result = await api.location.getCategory(req.params.alias);
    res.json(result);
  } catch (err) {
    res.status(500).json({ RequestStatus: "Failed", ResponseMessage: String(err) });
  }
});

// POST /api/location/:alias/listing — Create a listing
locationRoutes.post("/:alias/listing", async (req, res) => {
  try {
    const api = new ATAPI();
    const execute = process.env.DRY_RUN === "false" && req.body.execute === true;

    // Build category field list.
    // AT API requires non-optional fields (e.g. "Confirmation Screenshot", fieldID "2").
    // If caller didn't provide them, fetch required fields and populate with the
    // confirmation number so the listing can be created. Seller updates screenshot via AT.
    let categoryFields: Array<{ fieldID: string; fieldValue: string }> =
      Array.isArray(req.body.locationCategoryFieldIDValueList) && req.body.locationCategoryFieldIDValueList.length > 0
        ? req.body.locationCategoryFieldIDValueList
        : [];

    if (categoryFields.length === 0) {
      try {
        const categoryResult = await api.location.getCategory(req.params.alias);
        const fields: any[] = categoryResult?.Payload?.KeyValueList ?? [];
        const confirmationValue = req.body.confirmationNumber
          ? `Confirmation #${req.body.confirmationNumber}`
          : "Confirmation on file — screenshot to be uploaded via AT platform";

        // Use caller-supplied screenshot URL if provided, otherwise placeholder
        const screenshotUrl = req.body.screenshotUrl?.startsWith("https://")
          ? req.body.screenshotUrl
          : "https://placehold.co/600x400.jpg";

        categoryFields = fields
          .filter((f: any) => f.fieldIsOptional === "0")
          .map((f: any) => ({
            fieldID: String(f.fieldID),
            fieldValue: f.fieldType === "image" ? screenshotUrl : confirmationValue,
          }));
      } catch {
        // If category fetch fails, proceed without
      }
    }

    const result = await api.location.setListing(
      { ...req.body, locationAlias: req.params.alias, locationCategoryFieldIDValueList: categoryFields },
      execute
    );

    // Record listing in database
    if (hasDatabase()) {
      try {
        await upsertLocation(req.params.alias, req.params.alias);
        const listingId = await recordListing({
          locationAlias: req.params.alias,
          inventoryTypeId: req.body.inventoryTypeID,
          priceCents: req.body.priceAmountInSmallestUnit,
          dateTime: req.body.dateTime,
          firstName: req.body.firstName,
          lastName: req.body.lastName,
          email: req.body.emailAddress,
          phone: req.body.phoneNumber,
          isDryRun: !execute,
        });
        if (listingId && (req.body.cancelWarnHours || req.body.cancelUrgentHours)) {
          const { query: dbQuery } = await import("../db/index.js");
          await dbQuery(
            `UPDATE listings SET cancel_warn_hours = $1, cancel_urgent_hours = $2 WHERE id = $3`,
            [req.body.cancelWarnHours ?? 72, req.body.cancelUrgentHours ?? 24, listingId]
          );
        }
      } catch { /* DB persistence is optional */ }
    }

    res.json({ ...result, executedLive: execute });
  } catch (err) {
    // AT API returns code 399 when validation passes but isWritingRequest was false.
    // In DRY_RUN mode this is expected — treat as a successful dry run.
    if (err instanceof ATAPIError && err.code === 399 && !execute) {
      if (hasDatabase()) {
        try {
          await upsertLocation(req.params.alias, req.params.alias);
          await recordListing({
            locationAlias: req.params.alias,
            inventoryTypeId: req.body.inventoryTypeID,
            priceCents: req.body.priceAmountInSmallestUnit,
            dateTime: req.body.dateTime,
            firstName: req.body.firstName,
            lastName: req.body.lastName,
            email: req.body.emailAddress,
            phone: req.body.phoneNumber,
            isDryRun: true,
          });
        } catch { /* DB persistence is optional */ }
      }
      return res.json({
        RequestStatus: "Succeeded",
        ResponseCode: 399,
        ResponseMessage: "Dry run passed — all fields valid. Set DRY_RUN=false to create live listings.",
        Payload: null,
        executedLive: false,
      });
    }

    const raw = err instanceof Error ? err.message : String(err);

    // Produce a human-readable message for known AT rejection types
    let friendly = raw;
    try {
      const jsonStart = raw.indexOf("{");
      if (jsonStart !== -1) {
        const obj = JSON.parse(raw.slice(jsonStart));
        if (obj.BadListingParameters?.locationAlias) {
          friendly = `This restaurant cannot be listed: ${obj.BadListingParameters.locationAlias}`;
        } else if (obj.FaultyFieldIDValueListItems?.ImageURL_UnsupportedFileType) {
          friendly = "Screenshot image type not accepted by AT. Please upload a JPEG or PNG.";
        } else if (obj.FaultyFieldIDValueListItems?.NonOptionalFieldsMissing) {
          friendly = "Required listing fields are missing. Please fill in all required fields.";
        }
      }
    } catch { /* keep raw message */ }

    res.status(500).json({ RequestStatus: "Failed", ResponseMessage: friendly });
  }
});
