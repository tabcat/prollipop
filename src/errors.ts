import { CodeError } from "code-err";
import {
  ERR_NOT_FOUND,
  INSUFFICIENT_HASH_LENGTH,
  UNEXPECTED_BUCKET_FORMAT,
  UNEXPECTED_BUCKET_HASH,
  UNEXPECTED_BUCKET_LEVEL,
  UNEXPECTED_NODE_FORMAT,
  UNEXPECTED_PREFIX_FORMAT,
} from "./error-codes.js";

export const errNotFound = () =>
  new CodeError("Not Found.", { code: ERR_NOT_FOUND });

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
