import {defineConfig,devices} from '@playwright/test';
import {config} from 'dotenv';
config({path:'.env.e2e',override:true,quiet:true});
export default defineConfig({
 testDir:'./tests',fullyParallel:false,workers:1,timeout:60000,
 use:{baseURL:'http://localhost:5173',trace:'retain-on-failure',screenshot:'only-on-failure'},
 projects:[{name:'desktop',use:{...devices['Desktop Chrome']}},{name:'mobile',use:{...devices['Pixel 7']}}],
 webServer:[
  {command:'npm run dev -w @invite/api',url:'http://localhost:4000/health/ready',reuseExistingServer:true,timeout:60000},
  {command:'npm run dev -w @invite/web',url:'http://localhost:5173',reuseExistingServer:true,timeout:60000}
 ]
});
