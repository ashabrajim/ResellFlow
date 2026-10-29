import type { ImportErrorCode } from "../../lib/china/types.ts";

export class ImportError extends Error {
  code: ImportErrorCode;
  constructor(code: ImportErrorCode, message: string) {
    super(message);
    this.name = "ImportError";
    this.code = code;
  }
}

export class RatesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RatesError";
  }
}
