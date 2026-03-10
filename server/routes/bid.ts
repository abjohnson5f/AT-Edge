import { Router } from "express";
import { ATAPI } from "../../src/api/index.js";

export const bidRoutes = Router();

// GET /api/bid/list
bidRoutes.get("/list", async (req, res) => {
  try {
    const api = new ATAPI();
    const result = await api.bid.getList({
      locationAlias: req.query.locationAlias as string,
      pageSize: Number(req.query.pageSize ?? 25),
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ RequestStatus: "Failed", ResponseMessage: String(err) });
  }
});
