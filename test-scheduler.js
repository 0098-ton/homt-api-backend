import cron from 'node-cron';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from './models/User.js';
import Server from './models/Server.js';
import Subscription from './models/Subscription.js';
import XrayClient from './services/xrayClient.js';
import syncService from './services/syncService.js';
import { logger } from './middleware/logger.js';
import axios from "axios"

dotenv.config();

// Connect to MongoDB
mongoose
  .connect(process.env.MONGODB_URI || 'mongodb://root:chikano9743@homt.space:27017/')
  .then(() => logger.info('Scheduler connected to MongoDB'))
  .catch((err) => logger.error('MongoDB connection error:', err));

// cron.schedule('0 */2 * * *', async () => {
//   logger.info('Running user synchronization...');
  
//   try {
//     const result = await syncService.syncAllUsers();
//     logger.info(`User sync complete: ${result.synced} synced, ${result.failed} failed`);
//   } catch (error) {
//     logger.error('Error during user synchronization:', error);
//   }
// });

// cron.schedule('0 * * * *', async () => {
//   logger.info('Running expired users check...');
  
//   try {
//     const expiredUsers = await User.find({
//       status: 'active',
//       expiresAt: { $lte: new Date() }
//     }).populate('currentServer');

//     for (const user of expiredUsers) {
//       if (user.currentServer) {
//         try {
//           const xrayClient = new XrayClient(user.currentServer.host, user.currentServer.grpcPort);
//           await xrayClient.removeInboundUser(user.currentServer.inboundTag, user.email);

//           user.currentServer.currentUsers = Math.max(0, user.currentServer.currentUsers - 1);
//           await user.currentServer.save();
//         } catch (error) {
//           logger.error(`Failed to remove expired user ${user.email} from ${user.currentServer.name}`);
//         }
//       }

//       user.status = 'expired';
//       user.currentServer = null;
//       await user.save();
      
//       logger.info(`Suspended expired user: ${user.email}`);
//     }

//     logger.info(`Processed ${expiredUsers.length} expired users`);
//   } catch (error) {
//     logger.error('Error checking expired users:', error);
//   }
// });

// cron.schedule('*/30 * * * *', async () => {
//   logger.info('Running traffic limits check...');
  
//   try {
//     const users = await User.find({ status: 'active' }).populate('currentServer');
//     let suspendedCount = 0;

//     for (const user of users) {
//       if (!user.currentServer) continue;

//       try {
//         const xrayClient = new XrayClient(user.currentServer.host, user.currentServer.grpcPort);
//         const stats = await xrayClient.queryUserStats(user.email);
        
//         user.trafficUsed = stats.total;

//         if (stats.total >= user.trafficLimit) {
//           await xrayClient.removeInboundUser(user.currentServer.inboundTag, user.email);

//           user.currentServer.currentUsers = Math.max(0, user.currentServer.currentUsers - 1);
//           await user.currentServer.save();

//           user.status = 'suspended';
//           user.currentServer = null;
//           suspendedCount++;
          
//           logger.info(`Suspended user ${user.email} for exceeding traffic limit`);
//         }

//         await user.save();
//       } catch (error) {
//         logger.error(`Failed to check traffic for ${user.email}:`, error.message);
//       }
//     }

//     logger.info(`Suspended ${suspendedCount} users for exceeding traffic limits`);
//   } catch (error) {
//     logger.error('Error checking traffic limits:', error);
//   }
// });

// cron.schedule('*/5 * * * *', async () => {
//   logger.info('Running servers health check...');
  
//   try {
//     const servers = await Server.find();
//     let healthyCount = 0;
//     let unhealthyCount = 0;

//     for (const server of servers) {
//       try {
//         const xrayClient = new XrayClient(server.host, server.grpcPort);
//         await xrayClient.getInboundUsers(server.inboundTag || 'vless-in');
        
//         if (server.status !== 'active') {
//           server.status = 'active';
//           logger.info(`Server ${server.name} is back online`);
//         }
        
//         server.lastChecked = new Date();
//         await server.save();
//         healthyCount++;
//       } catch (error) {
//         if (server.status !== 'offline') {
//           server.status = 'offline';
//           logger.warn(`Server ${server.name} is offline: ${error.message}`);
//         }
        
//         server.lastChecked = new Date();
//         await server.save();
//         unhealthyCount++;
//       }
//     }

//     logger.info(`Health check complete: ${healthyCount} healthy, ${unhealthyCount} unhealthy`);
//   } catch (error) {
//     logger.error('Error during health check:', error);
//   }
// });

// cron.schedule('0 0 * * *', async () => {
//   logger.info('Running subscription status update...');
  
//   try {
//     const expiredSubscriptions = await Subscription.find({
//       status: 'active',
//       expiresAt: { $lte: new Date() }
//     });

//     for (const subscription of expiredSubscriptions) {
//       subscription.status = 'expired';
//       await subscription.save();
      
//       logger.info(`Expired subscription: ${subscription._id}`);
//     }

//     logger.info(`Updated ${expiredSubscriptions.length} expired subscriptions`);
//   } catch (error) {
//     logger.error('Error updating subscriptions:', error);
//   }
// });

// cron.schedule('0 */6 * * *', async () => {
//   logger.info('Syncing user statistics...');
  
//   try {
//     const users = await User.find({ status: 'active' }).populate('currentServer');

//     for (const user of users) {
//       if (!user.currentServer) continue;

//       try {
//         const xrayClient = new XrayClient(user.currentServer.host, user.currentServer.grpcPort);
//         const stats = await xrayClient.queryUserStats(user.email);
        
//         user.trafficUsed = stats.total;
//         user.lastConnection = new Date();
//         await user.save();
//       } catch (error) {
//         logger.error(`Failed to sync stats for ${user.email}`);
//       }
//     }

//     logger.info(`Synced statistics for ${users.length} users`);
//   } catch (error) {
//     logger.error('Error syncing user stats:', error);
//   }
// });

// logger.info('Scheduler started successfully');
// logger.info('Scheduled tasks:');
// logger.info('- User synchronization: Every 2 hours');
// logger.info('- Expired users check: Every hour');
// logger.info('- Traffic limits check: Every 30 minutes');
// logger.info('- Server health check: Every 5 minutes');
// logger.info('- Subscription status update: Daily at midnight');
// logger.info('- User stats sync: Every 6 hours');

// async function testTraffic(){
//   try {
//     const users = await User.find({ status: 'active' }).populate('currentServer').select('+password');
//     let suspendedCount = 0;

//     for (const user of users) {
//       if (!user.currentServer) continue;

//       try {
//         const xrayClient = new XrayClient(user.currentServer.host, user.currentServer.grpcPort);
//         const stats = await xrayClient.queryUserStats(user.email);

//         user.trafficUsed = stats.total;

//         if (stats.total >= user.trafficLimit) {
//           await xrayClient.removeInboundUser(user.currentServer.inboundTag, user.email);

//           user.currentServer.currentUsers = Math.max(0, user.currentServer.currentUsers - 1);
//           await user.currentServer.save();

//           user.status = 'suspended';
//           user.currentServer = null;
//           suspendedCount++;
          
//           logger.info(`Suspended user ${user.email} for exceeding traffic limit`);
//         }

//         await user.save({ validateBeforeSave: false });
//       } catch (error) {
//         logger.error(`Failed to check traffic for ${user.email}:`, error);
//       }
//     }

//     logger.info(`Suspended ${suspendedCount} users for exceeding traffic limits`);
//   } catch (error) {
//     logger.error('Error checking traffic limits:', error);
//   }
// }

// testTraffic()

async function testusers(tag, server){
  const xrayClient = new XrayClient(server, "8080")

  const existingUsers = (await xrayClient.getInboundUsers(tag))
  console.log(existingUsers.users)

}

// async function testwallet(){
//   try {
//     const user = {
//       email: 'm2222@robzizo.ir',
//       password: '$2a$10$1VoUoLVsnDt.6HTWBAWpC.LwRTtHx4wiE5uACULmMl1cz4U8g1nDu',
//       name: 'okokokok',
//       role: 'user',
//       uuid: '6b1d256f-a8d2-403e-8728-7297629bcccc',
//       alterId: 0,
//       ethWalletAddress: null,
//       status: 'suspended',
//       _id: new Object('6926ea70f7cfbe77722989e5'),    
//     }
//     const walletResponse = await axios.post(`http://45.59.114.194:3002/api/wallets/create`, {
//       userId: user._id.toString(),
//     })

//     console.log("111111111",walletResponse.data)

//   } catch (walletError) {
//     console.error("[v0] Error creating wallet for user:", walletError)
//     // Don't fail registration if wallet creation fails
//   }

// }

await testusers("vless-in","185.53.143.148")

await testusers("vless-in","45.59.114.194")