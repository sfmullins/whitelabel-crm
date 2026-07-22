import type { NextFunction,Request,Response } from 'express';

const ALLOWED:Array<{method:string;pattern:RegExp}>=[
  {method:'GET',pattern:/^\/openapi\.json$/},
  {method:'GET',pattern:/^\/me$/},
  {method:'GET',pattern:/^\/organisations$/},
  {method:'POST',pattern:/^\/organisations$/},
  {method:'GET',pattern:/^\/organisations\/[0-9a-f-]+$/i},
  {method:'PATCH',pattern:/^\/organisations\/[0-9a-f-]+$/i},
  {method:'POST',pattern:/^\/organisations\/[0-9a-f-]+\/archive$/i},
  {method:'GET',pattern:/^\/organisations\/[0-9a-f-]+\/contacts$/i},
  {method:'POST',pattern:/^\/organisations\/[0-9a-f-]+\/contacts$/i},
  {method:'GET',pattern:/^\/contacts\/[0-9a-f-]+$/i},
  {method:'PATCH',pattern:/^\/contacts\/[0-9a-f-]+$/i},
  {method:'POST',pattern:/^\/contacts\/[0-9a-f-]+\/archive$/i},
  {method:'GET',pattern:/^\/organisations\/[0-9a-f-]+\/engagements$/i},
  {method:'POST',pattern:/^\/organisations\/[0-9a-f-]+\/engagements$/i},
  {method:'GET',pattern:/^\/engagements\/[0-9a-f-]+$/i},
  {method:'PATCH',pattern:/^\/engagements\/[0-9a-f-]+$/i},
  {method:'POST',pattern:/^\/engagements\/[0-9a-f-]+\/archive$/i},
  {method:'GET',pattern:/^\/organisations\/[0-9a-f-]+\/activities$/i},
  {method:'POST',pattern:/^\/organisations\/[0-9a-f-]+\/activities$/i},
  {method:'GET',pattern:/^\/activities\/[0-9a-f-]+$/i},
  {method:'PATCH',pattern:/^\/activities\/[0-9a-f-]+$/i},
  {method:'POST',pattern:/^\/activities\/[0-9a-f-]+\/archive$/i},
  {method:'GET',pattern:/^\/reporting\/catalog$/},
  {method:'GET',pattern:/^\/reporting\/(executive|revenue|pipeline|activity|workload|concentration|operations)$/},
  {method:'GET',pattern:/^\/reporting\/(executive|revenue|pipeline|activity|workload|concentration|operations)\/export\.csv$/},
];

export function enforcePublicApiContract(req:Request,res:Response,next:NextFunction):void {
  const method=req.method.toUpperCase();const path=req.path.replace(/\/$/,'')||'/';
  if(ALLOWED.some((route)=>route.method===method&&route.pattern.test(path)))return next();
  res.status(404).json({error:'PUBLIC_API_ROUTE_NOT_FOUND',message:'This route is not part of the WhiteLabelCRM v1 public API'});
}
