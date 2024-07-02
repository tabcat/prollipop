import { CodeError } from "code-err"

export const codes = {
  ERR_NOT_FOUND: 'ERR_NOT_FOUND',
  UNEXPECTED_BUCKET_LEVEL: 'UNEXPECTED_BUCKET_LEVEL',
  UNEXPECTED_BUCKET_HASH: 'UNEXPECTED_BUCKET_HASH',

}

export const errNotFound = () => new CodeError('Not Found', { code: 'ERR_NOT_FOUND' })

export const unexpectedBucketLevel = () => new CodeError('Unexpected bucket level.', { code: codes.UNEXPECTED_BUCKET_LEVEL })

export const unexpectedBucketHash = () => new CodeError('Unexpected bucket hash.', { code: codes.UNEXPECTED_BUCKET_HASH })
