import { Router } from "express";
import { dropboxAuth, dropboxExchangeToken } from "../config/auth/dropbox";
import { connectGoogle } from "../config/auth/google";
import {
  authConnection,
  createAdmin,
  createUser,
  deleteUser,
  getAllAudio,
  getAllUsers,
  getAudioAccess,
  loginUser,
  refreshAccessToken,
  updateUserAccess,
  uploadFileController,
  userLogout,
} from "../controller/fileUploader";
import { upload } from "../middleware/multer";
import { authenticate, authorize } from "../middleware/authMiddleware";
const router = Router();

router.post("/admin/create", createAdmin);
router.post("/admin/login", loginUser);
router.post("/admin/logout", authenticate, authorize("admin"), userLogout);
router.post("/auth/refresh", refreshAccessToken);
router.post(
  "/api/dropbox/auth-url",
  authenticate,
  authorize("admin"),
  dropboxAuth,
);
router.post("/api/dropbox/exchange-token", dropboxExchangeToken);
router.post("/api/google/callback", connectGoogle);
router.post("/user/create", authenticate, authorize("admin"), createUser);
router.get("/users", authenticate, authorize("admin"), getAllUsers);
router.patch("/users/:_id", authenticate, authorize("admin"), updateUserAccess);
router.post(
  "/upload",
  authenticate,
  authorize("admin"),
  upload.single("file"),
  uploadFileController,
);
router.get("/audio/:_id", authenticate, authorize("admin"), getAllAudio);
router.get(
  "/api/files/:fileId/stream",
  authenticate,
  authorize("admin"),
  getAudioAccess,
);
router.delete("/:_id", authenticate, authorize("admin"), deleteUser);
router.get(
  "/auth/:platform/connection/:_id",
  authenticate,
  authorize("admin"),
  authConnection,
);

export default router;
