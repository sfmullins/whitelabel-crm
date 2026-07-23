import {describe,expect,it} from 'vitest';
import {redactAuditValue} from '../presentation/middleware/security';

describe('audit metadata redaction',()=>{
  it('redacts backup encryption and S3 credentials at any nested level',()=>{
    const secret='sensitive-value-that-must-not-be-audited';
    const redacted=redactAuditValue({
      encryptionKeyHex:secret,
      encryptionPassword:secret,
      s3Config:{accessKeyId:secret,secretAccessKey:secret},
      nested:[{privateKey:secret,publicKey:secret,password:secret}],
      safe:'retained',
    });
    const serialized=JSON.stringify(redacted);
    expect(serialized).not.toContain(secret);
    expect(redacted).toEqual({
      encryptionKeyHex:'[redacted]',
      encryptionPassword:'[redacted]',
      s3Config:{accessKeyId:'[redacted]',secretAccessKey:'[redacted]'},
      nested:[{privateKey:'[redacted]',publicKey:'[redacted]',password:'[redacted]'}],
      safe:'retained',
    });
  });
});
