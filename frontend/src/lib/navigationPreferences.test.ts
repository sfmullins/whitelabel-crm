import { describe,expect,it } from 'vitest';
import { mergeNavigationOrder,orderNavigationItems } from './navigationPreferences';

describe('navigation preferences',()=>{
  it('keeps configured routes, removes stale routes and appends newly available template objects',()=>{
    expect(mergeNavigationOrder(['/contacts','/removed','/'],['/','/contacts','/records/child']))
      .toEqual(['/contacts','/','/records/child']);
  });

  it('orders known items and leaves unconfigured items at the end',()=>{
    const items=[{to:'/',label:'Dashboard'},{to:'/contacts',label:'Contacts'},{to:'/records/child',label:'Children'}];
    expect(orderNavigationItems(items,['/contacts','/']).map((item)=>item.to))
      .toEqual(['/contacts','/','/records/child']);
  });
});
