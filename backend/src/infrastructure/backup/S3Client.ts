import crypto from 'crypto';
import http from 'http';
import https from 'https';

export interface S3BackupConfiguration {
  endpoint: string; // e.g. https://s3.us-west-2.amazonaws.com
  region: string;
  bucket: string;
  prefix?: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle?: boolean;
}

export async function uploadToS3(
  config: S3BackupConfiguration,
  key: string,
  fileContent: Buffer
): Promise<void> {
  const { endpoint, region, bucket, accessKeyId, secretAccessKey } = config;
  
  // Parse host and target URL path
  const url = new URL(endpoint.startsWith('http') ? endpoint : `https://${endpoint}`);
  const host = config.forcePathStyle 
    ? url.host 
    : `${bucket}.${url.host}`;
  
  const pathKey = config.prefix ? `${config.prefix}/${key}`.replace(/\/+/g, '/') : key;
  const path = config.forcePathStyle
    ? `/${bucket}/${pathKey}`
    : `/${pathKey}`;
  
  const requestUrl = `${url.protocol}//${host}${path}`;
  const method = 'PUT';
  const service = 's3';
  
  const amzDate = new Date().toISOString().replace(/[:.-]/g, '').substring(0, 15) + 'Z';
  const dateStamp = amzDate.substring(0, 8);
  
  const hashedPayload = crypto.createHash('sha256').update(fileContent).digest('hex');
  
  // Prepare headers
  const headers: Record<string, string> = {
    'host': host,
    'x-amz-date': amzDate,
    'x-amz-content-sha256': hashedPayload,
    'content-length': String(fileContent.length)
  };
  
  // Task 1: Create Canonical Request
  const canonicalHeaders = Object.keys(headers)
    .sort()
    .map(k => `${k}:${headers[k]}`)
    .join('\n') + '\n';
    
  const signedHeaders = Object.keys(headers).sort().join(';');
  
  const canonicalRequest = [
    method,
    path,
    '', // Empty query string
    canonicalHeaders,
    signedHeaders,
    hashedPayload
  ].join('\n');
  
  // Task 2: Create String to Sign
  const algorithm = 'AWS4-HMAC-SHA256';
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const hashedCanonicalRequest = crypto.createHash('sha256').update(canonicalRequest).digest('hex');
  
  const stringToSign = [
    algorithm,
    amzDate,
    credentialScope,
    hashedCanonicalRequest
  ].join('\n');
  
  // Task 3: Calculate Signature
  function getSignatureKey(keyStr: string, dateStr: string, regionName: string, serviceName: string) {
    const kDate = crypto.createHmac('sha256', 'AWS4' + keyStr).update(dateStr).digest();
    const kRegion = crypto.createHmac('sha256', kDate).update(regionName).digest();
    const kService = crypto.createHmac('sha256', kRegion).update(serviceName).digest();
    const kSigning = crypto.createHmac('sha256', kService).update('aws4_request').digest();
    return kSigning;
  }
  
  const signingKey = getSignatureKey(secretAccessKey, dateStamp, region, service);
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');
  
  // Task 4: Add Authorization Header
  headers['Authorization'] = `${algorithm} Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  
  // Execute HTTPS/HTTP Request
  return new Promise<void>((resolve, reject) => {
    const reqOpts = {
      method,
      headers,
      timeout: 30000 // 30s timeout limit
    };
    
    const client = requestUrl.startsWith('https') ? https : http;
    const req = client.request(requestUrl, reqOpts, (res) => {
      let responseBody = '';
      res.on('data', (chunk) => { responseBody += chunk; });
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve();
        } else {
          reject(new Error(`S3 upload failed with status code ${res.statusCode}: ${responseBody}`));
        }
      });
    });
    
    req.on('error', (err) => {
      reject(err);
    });
    
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('S3 upload timed out'));
    });
    
    req.write(fileContent);
    req.end();
  });
}
