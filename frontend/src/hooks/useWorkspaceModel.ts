import { useQuery } from '@tanstack/react-query';
import type { WorkspaceModel } from 'shared';
import { api } from '../lib/api';

export function useWorkspaceModel(){
  return useQuery<WorkspaceModel>({
    queryKey:['workspace-model'],
    queryFn:()=>api.get('/api/workspace/model'),
    staleTime:30_000,
  });
}
