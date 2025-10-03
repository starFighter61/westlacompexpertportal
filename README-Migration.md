# MongoDB Atlas Cluster Migration Guide

This guide walks you through migrating your data from a dedicated MongoDB Atlas cluster (M10+) to a free tier (M0) or Flex tier cluster, as described in the MongoDB Atlas support response.

## Important Limitations of Free/Flex Clusters

**Free Tier (M0):**
- 100 operations per second limit
- 0.5 GB storage limit
- No Continuous Backup or snapshots
- No Performance Advisor or Real-Time Panel
- Limited metrics and alerts
- No JavaScript server-side execution ($where, stored procedures)
- Limited aggregation pipeline features

**Flex Tier (F2):**
- 500 operations per second limit
- 5 GB storage limit
- Similar limitations to M0 but higher capacity

**Common Limitations:**
- No private endpoints, VPC peering, or custom KMS
- No sharding or multi-region deployments
- Fixed MongoDB version (8.0)
- Limited deployment regions
- Monitoring tools unavailable

## Migration Steps

### 1. Create a New Free/Flex Cluster
1. Log into your MongoDB Atlas account
2. Click "Create Cluster"
3. Choose the free tier (M0) or Flex tier
4. Select a region and cloud provider
5. Name your cluster (e.g., "my-project-free")
6. Create the cluster and wait for it to be ready

### 2. Prepare Your Environment
- Ensure mongodump and mongorestore are installed
  - Download from: https://www.mongodb.com/docs/tools/
- Have both connection strings ready from Atlas console

### 3. Run the Migration Script

#### Using the Provided Script:
```bash
node migration-script.js "mongodb+srv://username:password@source-cluster.mongodb.net" "mongodb+srv://username:password@target-cluster.mongodb.net"
```

#### Manual Alternative:
```bash
# Create dump from source cluster
mongodump --uri="mongodb+srv://username:password@source-cluster.mongodb.net" --out=./mongodb-dump

# Restore to target cluster
mongorestore --uri="mongodb+srv://username:password@target-cluster.mongodb.net" --dir=./mongodb-dump
```

### 4. Verify the Migration
- Check your data in the new cluster using MongoDB Compass or Atlas UI
- Run some queries to ensure data integrity
- Compare document counts between clusters

### 5. Update Application Connection Strings
- Update your application's configuration to use the new cluster connection string
- Test your application thoroughly
- Monitor performance and operations to ensure they stay within limits

### 6. Terminate the Dedicated Cluster
- Once everything is working, terminate your M10+ cluster
- **Warning:** Terminating will permanently delete any backup snapshots
- This will stop billing for the dedicated cluster

## Troubleshooting

- **Connection Issues:** Ensure your IP is whitelisted for both clusters
- **Authentication Errors:** Verify usernames and passwords are correct
- **Storage Limits:** If you exceed free tier limits, consider upgrading to Flex or staying on dedicated
- **Performance Issues:** Free/Flex tiers may be slower for large datasets

## Resources
- [Atlas Free/Flex Limitations](https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/)
- [Mongorestore Documentation](https://www.mongodb.com/docs/database-tools/mongorestore/)
- [Atlas Migration Guide](https://www.mongodb.com/docs/guides/migration/atlas/)

If you encounter issues, ensure your data size and usage patterns are compatible with the free/Flex tier limitations.
