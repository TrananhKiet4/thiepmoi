import {createApp} from './app.js';
import {config} from './config/env.js';
import {prisma} from './config/database.js';

const server=createApp().listen(config.port,config.host,()=>console.log(`API ready on port ${config.port}`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>{void prisma.$disconnect().finally(()=>process.exit(0));}));
