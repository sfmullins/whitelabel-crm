import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Settings } from 'shared';
import { api } from '../lib/api';

function getContrastYiq(hexColor:string):string {
  const clean=hexColor.replace('#','');
  if(clean.length!==6)return '#ffffff';
  const red=parseInt(clean.slice(0,2),16);
  const green=parseInt(clean.slice(2,4),16);
  const blue=parseInt(clean.slice(4,6),16);
  const yiq=(red*299+green*587+blue*114)/1000;
  return yiq>=128?'#0f172a':'#ffffff';
}

export function useBranding(){
  const query=useQuery<Settings>({
    queryKey:['settings'],
    queryFn:()=>api.get('/api/settings'),
    retry:false,
    staleTime:30_000,
  });

  useEffect(()=>{
    if(!query.data)return;
    const root=document.documentElement;
    root.style.setProperty('--primary',query.data.primaryColor);
    root.style.setProperty('--primary-foreground',getContrastYiq(query.data.primaryColor));
    root.style.setProperty('--secondary',query.data.secondaryColor);
    root.style.setProperty('--secondary-foreground',getContrastYiq(query.data.secondaryColor));
    root.style.setProperty('--accent',query.data.accentColor);
    root.style.setProperty('--accent-foreground',getContrastYiq(query.data.accentColor));
    root.style.setProperty('--ring',query.data.primaryColor);
    document.title=`${query.data.businessName} Workspace`;
  },[query.data]);

  return {settings:query.data,isLoading:query.isLoading,error:query.error,refetch:query.refetch};
}
