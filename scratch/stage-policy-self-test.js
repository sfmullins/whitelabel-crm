const assert=require('node:assert/strict');
const {findUnexpectedPackages}=require('../desktop/stage-policy');
const lock={packages:{'node_modules/alpha':{version:'1.2.3'},'node_modules/alpha/node_modules/beta':{version:'4.5.6'}}};
const matching={dependencies:{alpha:{version:'1.2.3',dependencies:{beta:{version:'4.5.6'}}}}};
const drifted={dependencies:{alpha:{version:'1.2.4',dependencies:{beta:{version:'4.5.6'},gamma:{version:'9.0.0'}}}}};
assert.deepEqual(findUnexpectedPackages(lock,matching),[]);
assert.deepEqual(findUnexpectedPackages(lock,drifted),['alpha@1.2.4','gamma@9.0.0']);
console.log('Desktop staged dependency policy self-test passed.');
