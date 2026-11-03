import {defineConfig} from 'vitest/config';
import {config} from 'dotenv';
config({path:'.env.test',override:true,quiet:true});
export default defineConfig({test:{include:['backend/tests/**/*.test.ts','packages/**/*.test.ts'],fileParallelism:false,testTimeout:30000,hookTimeout:30000}});
