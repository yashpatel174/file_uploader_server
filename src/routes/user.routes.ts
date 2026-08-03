import { Router } from "express";
import { dropboxAuth, dropboxExchangeToken } from "../config/auth/dropbox";
import { connectGoogle } from "../config/auth/google";
import {
  authConnection,
  createAdmin,
  createUser,
  deleteUser,
  getAllUsers,
  loginUser,
  refreshAccessToken,
  updateUserAccess,
  userLogout,
} from "../controller/user.controller";
import { authenticate, authorize } from "../middleware/authMiddleware";
const router = Router();

router.get("/admin/create", createAdmin);
router.post("/admin/login", loginUser);
router.post("/admin/logout", authenticate, authorize("admin"), userLogout);
router.post("/auth/refresh", refreshAccessToken);
router.post("/api/dropbox/auth-url", dropboxAuth);
router.post("/api/dropbox/exchange-token", dropboxExchangeToken);
router.post("/api/google/callback", connectGoogle);
router.post("/user/create", authenticate, authorize("admin"), createUser);
router.get("/users", authenticate, authorize("admin"), getAllUsers);
router.patch("/users/:_id", authenticate, authorize("admin"), updateUserAccess);
router.delete("/:_id", authenticate, authorize("admin"), deleteUser);
router.get(
  "/auth/:platform/connection/:_id",
  authenticate,
  authorize("admin"),
  authConnection,
);

export default router;
