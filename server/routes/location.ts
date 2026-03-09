import { Router } from "express";
import { ATAPI } from "../../src/api/index.js";
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
    const result = await api.location.setListing(
      { ...req.body, locationAlias: req.params.alias },
      execute
    );

    // Record listing in database
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
          isDryRun: !execute,
        });
      } catch { /* DB persistence is optional */ }
    }

    res.json({ ...result, executedLive: execute });
  } catch (err) {
    res.status(500).json({ RequestStatus: "Failed", ResponseMessage: String(err) });
  }
});
