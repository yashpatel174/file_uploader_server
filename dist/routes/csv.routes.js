"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const multer_1 = require("../middleware/multer");
const fileUploader_1 = require("../controller/fileUploader");
const router = express_1.default.Router();
router.post("/admin/create", fileUploader_1.createAdmin);
router.post("/user/create", fileUploader_1.createUser);
router.get("/users", fileUploader_1.getAllUsers);
router.patch("/users/:_id", fileUploader_1.updateUserAccess);
router.post("/upload", multer_1.upload.single("file"), fileUploader_1.uploadFileController);
exports.default = router;
