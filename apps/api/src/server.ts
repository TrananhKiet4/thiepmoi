import {createApp} from './app.js';
import {config} from './config.js';
import {prisma} from './db.js';
const server=createApp().listen(config.port,'127.0.0.1',()=>console.log(`API ready at http://localhost:${config.port}`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>{void prisma.$disconnect().finally(()=>process.exit(0));}));
