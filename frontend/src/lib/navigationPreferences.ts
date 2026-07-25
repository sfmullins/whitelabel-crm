export function mergeNavigationOrder(saved:string[],available:string[]):string[]{
  const allowed=new Set(available);
  return [...saved.filter((key)=>allowed.has(key)),...available.filter((key)=>!saved.includes(key))];
}

export function orderNavigationItems<T extends {to:string}>(items:T[],orderedKeys:string[]):T[]{
  const rank=new Map(orderedKeys.map((key,index)=>[key,index]));
  return [...items].sort((left,right)=>{
    const leftRank=rank.get(left.to);const rightRank=rank.get(right.to);
    if(leftRank===undefined&&rightRank===undefined)return 0;
    if(leftRank===undefined)return 1;
    if(rightRank===undefined)return -1;
    return leftRank-rightRank;
  });
}
