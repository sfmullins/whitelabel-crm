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
  it('does not duplicate bulk-import source rows into audit snapshots',()=>{
    const personal='Aisling,Byrne,aisling@example.test';
    const redacted=redactAuditValue({csvData:`First,Last,Email\n${personal}`,previewRows:[{Email:'aisling@example.test'}],rowCount:1});
    expect(JSON.stringify(redacted)).not.toContain('aisling@example.test');
    expect(redacted).toEqual({csvData:'[redacted]',previewRows:'[redacted]',rowCount:1});
  });
});
