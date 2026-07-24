import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { BrandAssetReference,BrandAssetUpload } from 'shared/onboarding';
import { ValidationError,NotFoundError } from '../../application/errors';
import { getRuntimePaths } from '../../config/runtimePaths';

const MAX_BYTES=1_048_576;
const MAX_DIMENSION=4096;
const MAX_PIXELS=16_777_216;
const MIME_EXTENSIONS:Record<BrandAssetUpload['mimeType'],string>={
  'image/png':'png',
  'image/jpeg':'jpg',
  'image/webp':'webp',
};

interface Dimensions {width:number;height:number;}
interface StoredBrandAsset extends BrandAssetReference {absolutePath:string;}

function decodeBase64(value:string):Buffer{
  const normalized=value.replace(/\s/g,'');
  if(!normalized||!/^[A-Za-z0-9+/]*={0,2}$/.test(normalized))throw new ValidationError('Brand asset content is not valid base64');
  const content=Buffer.from(normalized,'base64');
  if(!content.length)throw new ValidationError('Brand asset content is empty');
  if(content.length>MAX_BYTES)throw new ValidationError('Brand assets are limited to 1 MB');
  return content;
}

function pngDimensions(content:Buffer):Dimensions|null{
  if(content.length<24||content.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')return null;
  if(content.subarray(12,16).toString('ascii')!=='IHDR')return null;
  return {width:content.readUInt32BE(16),height:content.readUInt32BE(20)};
}

function jpegDimensions(content:Buffer):Dimensions|null{
  if(content.length<4||content[0]!==0xff||content[1]!==0xd8)return null;
  let offset=2;
  while(offset+4<=content.length){
    if(content[offset]!==0xff){offset+=1;continue;}
    let marker=content[offset+1];
    while(marker===0xff&&offset+2<content.length){offset+=1;marker=content[offset+1];}
    offset+=2;
    if(marker===0xd9||marker===0xda)break;
    if(offset+2>content.length)break;
    const length=content.readUInt16BE(offset);
    if(length<2||offset+length>content.length)break;
    if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)){
      if(length<7)return null;
      return {height:content.readUInt16BE(offset+3),width:content.readUInt16BE(offset+5)};
    }
    offset+=length;
  }
  return null;
}

function readUInt24LE(content:Buffer,offset:number):number{return content[offset]|(content[offset+1]<<8)|(content[offset+2]<<16);}
function webpDimensions(content:Buffer):Dimensions|null{
  if(content.length<30||content.subarray(0,4).toString('ascii')!=='RIFF'||content.subarray(8,12).toString('ascii')!=='WEBP')return null;
  const chunk=content.subarray(12,16).toString('ascii');
  if(chunk==='VP8X'&&content.length>=30)return {width:1+readUInt24LE(content,24),height:1+readUInt24LE(content,27)};
  if(chunk==='VP8 '&&content.length>=30&&content[23]===0x9d&&content[24]===0x01&&content[25]===0x2a)return {width:content.readUInt16LE(26)&0x3fff,height:content.readUInt16LE(28)&0x3fff};
  if(chunk==='VP8L'&&content.length>=25&&content[20]===0x2f){
    const b0=content[21],b1=content[22],b2=content[23],b3=content[24];
    return {width:1+(b0|((b1&0x3f)<<8)),height:1+(((b1&0xc0)>>6)|(b2<<2)|((b3&0x0f)<<10))};
  }
  return null;
}

function dimensions(content:Buffer,mimeType:BrandAssetUpload['mimeType']):Dimensions{
  const detected=mimeType==='image/png'?pngDimensions(content):mimeType==='image/jpeg'?jpegDimensions(content):webpDimensions(content);
  if(!detected)throw new ValidationError(`Brand asset content does not match ${mimeType}`);
  if(detected.width<1||detected.height<1||detected.width>MAX_DIMENSION||detected.height>MAX_DIMENSION||detected.width*detected.height>MAX_PIXELS)throw new ValidationError(`Brand asset dimensions must not exceed ${MAX_DIMENSION}×${MAX_DIMENSION} or ${MAX_PIXELS.toLocaleString()} pixels`);
  return detected;
}

export class BrandAssetStore{
  private readonly root:string;
  constructor(root=path.join(getRuntimePaths().dataDirectory,'branding-assets')){this.root=path.resolve(root);fs.mkdirSync(this.root,{recursive:true});}

  store(input:BrandAssetUpload):BrandAssetReference{
    const content=decodeBase64(input.contentBase64);const size=dimensions(content,input.mimeType);const checksum=crypto.createHash('sha256').update(content).digest('hex');const extension=MIME_EXTENSIONS[input.mimeType];const absolutePath=path.join(this.root,`${checksum}.${extension}`);
    if(!fs.existsSync(absolutePath)){
      const temporary=`${absolutePath}.tmp-${process.pid}-${crypto.randomUUID()}`;fs.writeFileSync(temporary,content,{flag:'wx'});fs.renameSync(temporary,absolutePath);
    }else{
      const existing=fs.readFileSync(absolutePath);if(existing.length!==content.length||crypto.createHash('sha256').update(existing).digest('hex')!==checksum)throw new Error('Stored brand asset failed content-address verification');
    }
    return {id:checksum,url:`/branding-assets/${checksum}`,checksum,mimeType:input.mimeType,byteSize:content.length,width:size.width,height:size.height};
  }

  read(id:string):StoredBrandAsset{
    if(!/^[a-f0-9]{64}$/.test(id))throw new NotFoundError('Brand asset was not found');
    for(const [mimeType,extension] of Object.entries(MIME_EXTENSIONS) as Array<[BrandAssetUpload['mimeType'],string]>){
      const absolutePath=path.join(this.root,`${id}.${extension}`);if(!fs.existsSync(absolutePath))continue;
      const content=fs.readFileSync(absolutePath);const checksum=crypto.createHash('sha256').update(content).digest('hex');if(checksum!==id)throw new Error('Brand asset checksum verification failed');const size=dimensions(content,mimeType);
      return {id,url:`/branding-assets/${id}`,checksum,mimeType,byteSize:content.length,width:size.width,height:size.height,absolutePath};
    }
    throw new NotFoundError('Brand asset was not found');
  }

  reset():void{fs.rmSync(this.root,{recursive:true,force:true});fs.mkdirSync(this.root,{recursive:true});}
}
