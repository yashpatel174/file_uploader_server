import { Request, Response, NextFunction } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";
import { errorHandler } from "../utils/responseHandler";
import { publicKey } from "../config/keys/auth_config";

export interface AuthRequest extends Request {
  user?: {
    id: string;
    role: string;
  };
}

export const authenticate = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return errorHandler(res, "Authorization required");
    }

    const token = authHeader.replace("Bearer ", "");

    const decoded = jwt.verify(token, publicKey, {
      algorithms: ["RS256"],
    }) as JwtPayload;

    if (decoded.type !== "access") {
      return errorHandler(res, "Invalid token type");
    }

    req.user = {
      id: decoded.sub as string,
      role: decoded.role as string,
    };

    next();
  } catch {
    return errorHandler(res, "Unauthorized", 401);
  }
};

export const authorize =
  (...roles: string[]) =>
  (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) return errorHandler(res, "Unauthorized");

    if (!roles.includes(req.user.role)) {
      return errorHandler(res, "Forbidden", 403);
    }

    next();
  };
