import { CodeError } from "code-err";
import {
  ERR_NOT_FOUND,
  INSUFFICIENT_HASH_LENGTH,
  INVALID_AVERAGE,
  INVALID_LEVEL,
  UNEXPECTED_BUCKET_FORMAT,
  UNEXPECTED_BUCKET_HASH,
  UNEXPECTED_BUCKET_LEVEL,
  UNEXPECTED_NODE_FORMAT,
  UNEXPECTED_PREFIX_FORMAT,
} from "./error-codes.js";

export const errNotFound = () =>
  new CodeError("Not Found.", { code: ERR_NOT_FOUND });

export const averageLessThanOne = (average: number) =>
  new CodeError(`Average must not be less than one. Received: ${average}`, {
    code: INVALID_AVERAGE,
  });

export const averageNotWhole = (average: number) =>
  new CodeError(`Average must be a whole number. Received ${average}`, { code: INVALID_AVERAGE });

export const averageExceedsMax = (average: number) =>
  new CodeError(`Average exceeds max uint32. Received ${average}`, { code: INVALID_AVERAGE });

export const unexpectedBucketHash = () =>
  new CodeError("Bucket hash did not match requested bucket hash.", {
    code: UNEXPECTED_BUCKET_HASH,
  });

export const unexpectedBucketLevel = (level: number, expected: number) =>
  new CodeError(
    `Bucket level, ${level}, did not match expected bucket level, ${expected}.`,
    {
      code: UNEXPECTED_BUCKET_LEVEL,
    },
  );

export const unexpectedNodeFormat = (reason: string) =>
  new CodeError(reason, { code: UNEXPECTED_NODE_FORMAT });

export const unexpectedBucketFormat = (reason: string) =>
  new CodeError(reason, { code: UNEXPECTED_BUCKET_FORMAT });

export const unexpectedPrefixFormat = (reason: string) =>
  new CodeError(reason, { code: UNEXPECTED_PREFIX_FORMAT });

export const unexpectedCodec = (code: number, expected: number) =>
  new CodeError(
    `Prefix multicodec code, ${code}, did not match expected code, ${expected}.`,
  );

export const unexpectedHasher = (code: number, expected: number) =>
  new CodeError(
    `Prefix multihasher code, ${code}, did not match expected code, ${expected}.`,
  );

export const insufficientHashLength = (length: number) =>
  new CodeError(
    `Hash must be at least 4 bytes in length. Recieved hash with length ${length}`,
    { code: INSUFFICIENT_HASH_LENGTH },
  );

export const levelIsNegative = () =>
  new CodeError("Levels cannot be negative.", { code: INVALID_LEVEL });

export const levelExceedsRoot = (level: number, root: number) =>
  new CodeError(`Level, ${level}, exceeds the root level, ${root}.`, {
    code: INVALID_LEVEL,
  });

export const levelMustChange = (level: number) =>
  new CodeError(`Cursor is already at level ${level}.`, {
    code: INVALID_LEVEL,
  });
