import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { GoogleGenAI, FunctionCallingConfigMode } from '@google/genai';
const config = parseEnv(readFileSync('.env.local', 'utf8'));
try {
  const ai = new GoogleGenAI({apiKey: config.GEMINI_API_KEY, httpOptions:{timeout:18000}});
  const result = await ai.models.generateContent({model:process.argv[2] || config.GEMINI_MODEL || 'gemini-3.8-flash', contents:'Call report_status with status ready.', config:{maxOutputTokens:1000, tools:[{functionDeclarations:[{name:'report_status',description:'Report readiness',parametersJsonSchema:{type:'object',properties:{status:{type:'string'}},required:['status'],additionalProperties:false}}]}],toolConfig:{functionCallingConfig:{mode:FunctionCallingConfigMode.ANY}}}});
  console.log(JSON.stringify({ok:true,functionCalls:result.functionCalls},null,2));
} catch (error) {
  const message = String(error.message).split(config.GEMINI_API_KEY).join('[REDACTED]').replace(/AIza[\w-]+/g,'[REDACTED]');
  console.log(JSON.stringify({ok:false,name:error.name,status:error.status,message},null,2));
  process.exitCode=1;
}
