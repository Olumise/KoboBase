import { Router } from "express";
import {
	getMyUsage,
	getMyUsageSessions,
	getMyUsageBreakdown,
	getAllUsersUsage,
	getSystemUsageStats,
} from "../controllers/usage.controller";

const router = Router();

router.get("/me", getMyUsage);
router.get("/me/sessions", getMyUsageSessions);
router.get("/me/breakdown", getMyUsageBreakdown);
router.get("/admin/users", getAllUsersUsage);
router.get("/admin/stats", getSystemUsageStats);

export default router;
