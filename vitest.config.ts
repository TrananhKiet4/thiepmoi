import { defineConfig } from 'vitest/config';
import {config} from 'dotenv';
config({path:'.env.test',override:true,quiet:true});
export default defineConfig({test:{include:['apps/api/tests/**/*.test.ts','packages/**/*.test.ts'],fileParallelism:false,testTimeout:30000,hookTimeout:30000}});
