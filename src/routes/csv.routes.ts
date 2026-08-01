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
  getAudioFromPlatforms,
  getFailedUploadsController,
  getUploadFilesController,
  loginUser,
  multipleFileUpload,
  refreshAccessToken,
  retryUploadController,
  updateUserAccess,
  uploadFileController,
  userLogout,
} from "../controller/fileUploader";
import { authenticate, authorize } from "../middleware/authMiddleware";
import { upload, uploadMultipleFiles } from "../middleware/multer";
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
router.post(
  "/upload",
  authenticate,
  authorize("admin"),
  upload.single("file"),
  uploadFileController,
);
router.post(
  "/upload/:_id/multiple-files",
  authenticate,
  authorize("admin"),
  uploadMultipleFiles,
  multipleFileUpload,
);
router.get("/upload/failed", getFailedUploadsController);
router.post("/upload/:jobId/retry", retryUploadController);
router.get("/upload/files", getUploadFilesController);
router.get("/audio/:_id", authenticate, authorize("admin"), getAllAudio);
router.get("/user/audio/:_id/:platform", getAudioFromPlatforms);
router.get("/api/files/:fileId/stream", getAudioAccess);
router.delete("/:_id", authenticate, authorize("admin"), deleteUser);
router.get(
  "/auth/:platform/connection/:_id",
  authenticate,
  authorize("admin"),
  authConnection,
);

export default router;
