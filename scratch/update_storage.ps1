$path = "server/storage.ts"
$content = Get-Content -Path $path -Raw
$newMethods = @"

    // Push Notification operations
    async getPushSubscriptionsByUserId(userId: number): Promise<PushSubscription[]> {
      return await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
    }

    async getPushSubscriptionByEndpoint(endpoint: string): Promise<PushSubscription | undefined> {
      const result = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
      return result[0];
    }

    async createPushSubscription(data: InsertPushSubscription): Promise<PushSubscription> {
      const result = await db.insert(pushSubscriptions).values(data).returning();
      return result[0];
    }

    async deletePushSubscription(endpoint: string): Promise<boolean> {
      const result = await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint)).returning();
      return result.length > 0;
    }
"@
# Find the last closing brace of the DatabaseStorage class. 
# It's before "export const storage = new DatabaseStorage();"
$content = $content -replace '(?ms)(\s+)(async deleteCatalogCategory\(id: number\): Promise<boolean> \{.*?\}\s+)(\})', "`$1`$2$newMethods`$1`$3"
$content | Set-Content -Path $path
