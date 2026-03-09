import { Router } from "express";
import { ATAPI } from "../../src/api/index.js";

export const accountRoutes = Router();

// GET /api/account/list
accountRoutes.get("/list", async (_req, res) => {
  try {
    const api = new ATAPI();
    const result = await api.account.getList();
    res.json(result);
  } catch (err) {
    res.status(500).json({ RequestStatus: "Failed", ResponseMessage: String(err) });
  }
});

// GET /api/account/details
accountRoutes.get("/details", async (_req, res) => {
  try {
    const api = new ATAPI();
    const result = await api.account.getUserDetails();
    res.json(result);
  } catch (err) {
    res.status(500).json({ RequestStatus: "Failed", ResponseMessage: String(err) });
  }
});

// GET /api/account/transactions
accountRoutes.get("/transactions", async (req, res) => {
  try {
    const api = new ATAPI();
    const result = await api.account.getTransactionHistory(
      Number(req.query.pageSize ?? 50),
      Number(req.query.pageNumber ?? 0)
    );
    res.json(result);
  } catch (err) {
    res.status(500).json({ RequestStatus: "Failed", ResponseMessage: String(err) });
  }
});
