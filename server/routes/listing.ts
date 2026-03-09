import { Router } from "express";
import { ATAPI } from "../../src/api/index.js";

export const listingRoutes = Router();

// GET /api/listing/:id/competing
listingRoutes.get("/:id/competing", async (req, res) => {
  try {
    const api = new ATAPI();
    const result = await api.listing.getCompetingListings(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ RequestStatus: "Failed", ResponseMessage: String(err) });
  }
});

// POST /api/listing/:id/price
listingRoutes.post("/:id/price", async (req, res) => {
  try {
    const api = new ATAPI();
    const execute = process.env.DRY_RUN === "false" && req.body.execute === true;
    const result = await api.listing.setPrice(
      { listingID: req.params.id, priceAmountInSmallestUnit: req.body.priceAmountInSmallestUnit },
      execute
    );
    res.json({ ...result, executedLive: execute });
  } catch (err) {
    res.status(500).json({ RequestStatus: "Failed", ResponseMessage: String(err) });
  }
});

// POST /api/listing/:id/visibility
listingRoutes.post("/:id/visibility", async (req, res) => {
  try {
    const api = new ATAPI();
    const execute = process.env.DRY_RUN === "false" && req.body.execute === true;
    const result = await api.listing.setMarketVisibility(
      req.params.id,
      req.body.visible,
      execute
    );
    res.json({ ...result, executedLive: execute });
  } catch (err) {
    res.status(500).json({ RequestStatus: "Failed", ResponseMessage: String(err) });
  }
});

// POST /api/listing/:id/fill-bid
listingRoutes.post("/:id/fill-bid", async (req, res) => {
  try {
    const api = new ATAPI();
    const execute = process.env.DRY_RUN === "false" && req.body.execute === true;
    const result = await api.listing.fillBid(req.params.id, req.body.bidID, execute);
    res.json({ ...result, executedLive: execute });
  } catch (err) {
    res.status(500).json({ RequestStatus: "Failed", ResponseMessage: String(err) });
  }
});

// POST /api/listing/:id/archive
listingRoutes.post("/:id/archive", async (req, res) => {
  try {
    const api = new ATAPI();
    const execute = process.env.DRY_RUN === "false" && req.body.execute === true;
    const result = await api.listing.archive(req.params.id, execute);
    res.json({ ...result, executedLive: execute });
  } catch (err) {
    res.status(500).json({ RequestStatus: "Failed", ResponseMessage: String(err) });
  }
});
