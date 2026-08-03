import { Router } from "express";
import { dropboxAuth, dropboxExchangeToken } from "../config/auth/dropbox";
import { connectGoogle } from "../config/auth/google";
import {
  getAllAudio,
  getAudioAccess,
  getAudioFromPlatforms,
  getFailedUploadsController,
  getUploadFilesController,
  multipleFileUpload,
  retryUploadController,
  uploadFileController,
} from "../controller/fileUploader";
import { authenticate, authorize } from "../middleware/authMiddleware";
import { upload, uploadMultipleFiles } from "../middleware/multer";
const router = Router();

router.post("/api/dropbox/auth-url", dropboxAuth);
router.post("/api/dropbox/exchange-token", dropboxExchangeToken);
router.post("/api/google/callback", connectGoogle);
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

export default router;
