import { generateText, Output } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';
import fs from 'fs';
for (const l of fs.readFileSync('.env.local','utf8').split('\n')) { const m=l.match(/^([A-Z_]+)=(.*)$/); if(m) process.env[m[1]]=m[2].replace(/^"|"$/g,'').trim(); }
for (const id of process.argv.slice(2)) {
  const t0=Date.now();
  try { const s = await generateText({ model: google(id), maxRetries: 1, output: Output.object({ schema: z.object({ category: z.enum(['groceries','alcohol']), risk: z.number() }) }), prompt: 'Classify: a bottle of Lagavulin 16 whisky labelled as groceries. Return category and risk 0-100.' }); console.log(id, 'OK', JSON.stringify(s.output), (Date.now()-t0)+'ms'); } catch (e) { console.log(id, 'ERR', String(e.message).slice(0,120)); }
}
