"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const csv_routes_1 = __importDefault(require("./routes/csv.routes"));
const dotenv_1 = __importDefault(require("dotenv"));
const db_1 = require("./config/db");
const app = (0, express_1.default)();
dotenv_1.default.config({ quiet: true });
app.use(express_1.default.json());
app.use((0, cors_1.default)({ origin: "http://localhost:5173", credentials: true }));
app.use("/", csv_routes_1.default);
(0, db_1.connectDB)();
const port = process.env.PORT;
app.listen(port, () => {
    console.log(`Server running on port: ${port}`);
});
