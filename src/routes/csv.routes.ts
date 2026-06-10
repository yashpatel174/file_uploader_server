import { Router } from "express";
import { dropboxAuth, dropboxExchangeToken } from "../config/auth/dropbox";
import { connectGoogle } from "../config/auth/google";
import {
  createAdmin,
  createUser,
  deleteUser,
  getAllAudio,
  getAllUsers,
  getAudioAccess,
  updateUserAccess,
  uploadFileController,
} from "../controller/fileUploader";
import { upload } from "../middleware/multer";
const router = Router();

router.post("/api/dropbox/auth-url", dropboxAuth);
router.post("/api/dropbox/exchange-token", dropboxExchangeToken);
router.post("/api/google/callback", connectGoogle);
router.post("/admin/create", createAdmin);
router.post("/user/create", createUser);
router.get("/users", getAllUsers);
router.patch("/users/:_id", updateUserAccess);
router.post("/upload", upload.single("file"), uploadFileController);
router.get("/audio/:_id", getAllAudio);
router.get("/api/files/:fileId/stream", getAudioAccess);
router.delete("/:_id", deleteUser);

export default router;
