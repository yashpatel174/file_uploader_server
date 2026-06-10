import { Response } from "express";

export const isValidStorageSize = (
  value: number | null | undefined,
): boolean => {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
};

export const errorHandler = (res: Response, message: string) => {
  res.status(400).send({
    success: false,
    message,
  });
};

export const successHandler = (
  res: Response,
  message: string,
  result?: any,
) => {
  res.status(200).send({
    success: true,
    message,
    result,
  });
};
