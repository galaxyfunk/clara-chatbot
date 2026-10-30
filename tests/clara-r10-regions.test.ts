import {test} from 'node:test';
import assert from 'node:assert/strict';
import {reconcileRegionHistory} from '../src/lib/chat/region-history';
import type {LLMMessage} from '../src/lib/llm/provider';
for(const region of ['US','UK','Australia','Germany'])test(`${region}: user location survives replay but obsolete assistant geography cannot anchor the pitch`,()=>{
 const messages:LLMMessage[]=[{role:'system',content:'Current geographic mapping'},{role:'user',content:`Our company is based in ${region}. We need 3 senior React/Node developers.`},{role:'assistant',content:'Our engineers are based in the Philippines. For US teams we only recommend Philippines developers. What is your timeline?'},{role:'user',content:'Within two months.'}];
 const before=JSON.stringify(messages),result=reconcileRegionHistory(messages);
 assert.equal(JSON.stringify(messages),before,'never mutate stored/UI history');assert.equal(result[0],messages[0]);assert.equal(result[1],messages[1]);assert.equal(result[3],messages[3]);
 assert.doesNotMatch(result[2].content,/Philippines|US teams/);assert.match(result[2].content,/What is your timeline\?/);
});
