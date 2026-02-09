import { Router } from "express";
import {
	getMyUsage,
	getMyUsageSessions,
	getMyUsageBreakdown,
	getAllUsersUsage,
	getSystemUsageStats,
} from "../controllers/usage.controller";
import { authVerify } from "../middlewares/authVerify";

const router = Router();

router.get("/me", authVerify, getMyUsage);
router.get("/me/sessions", authVerify, getMyUsageSessions);
router.get("/me/breakdown", authVerify, getMyUsageBreakdown);
router.get("/admin/users", authVerify, getAllUsersUsage);
router.get("/admin/stats", authVerify, getSystemUsageStats);

export default router;
