/**
 * Migration Script: Populate user_data from leads
 *
 * This script migrates lead data into the user_data table by matching
 * phone numbers between leadsDatabase and userDataDatabase.
 */

import databaseService from '../src/services/database.service';
import { leadsDatabase } from '../src/data/leads.data';
import { userDataDatabase } from '../src/data/userData.data';
import logger from '../src/config/logger';

async function migrateLeadsToUserData() {
  logger.info('Starting leads to user_data migration');

  let migrated = 0;
  let skipped = 0;
  let matched = 0;

  for (const lead of leadsDatabase) {
    try {
      // Find matching user data by phone number (primary or alternate)
      const userData = userDataDatabase.find((user) => {
        // Check primary phone
        if (user.phoneNumber === lead.phoneNumber) return true;

        // Check alternate phones
        if (lead.alternatePhones && lead.alternatePhones.includes(user.phoneNumber)) return true;
        if (user.alternatePhones && user.alternatePhones.includes(lead.phoneNumber)) return true;

        return false;
      });

      // If no matching userData, create basic entry from lead information
      if (!userData) {
        logger.info({ leadId: lead.leadId, phoneNumber: lead.phoneNumber }, 'No matching user data - creating basic entry from lead');

        // Create minimal user data record from lead
        const basicUserData = {
          user_id: lead.leadId,
          phone_number: lead.phoneNumber,
          name: lead.name,
          medicare_data: JSON.stringify({
            city: lead.city
          }),
          eligibility_data: JSON.stringify({
            planEligibilityStatus: 'PENDING'
          }),
          last_updated: lead.createdAt || new Date().toISOString(),
        };

        databaseService.insertUserData(basicUserData);
        migrated++;
        continue;
      }

      matched++;

      // Check if user_data already exists in database
      if (databaseService.userDataExists(userData.phoneNumber)) {
        logger.debug({ userId: userData.userId, phoneNumber: userData.phoneNumber }, 'User data already exists, skipping');
        skipped++;
        continue;
      }

      // Insert user data into database
      const userDataRecord = {
        user_id: userData.userId,
        phone_number: userData.phoneNumber,
        name: userData.name,
        medicare_data: JSON.stringify(userData.medicareData),
        eligibility_data: userData.eligibilityData ? JSON.stringify(userData.eligibilityData) : undefined,
        last_updated: userData.lastUpdated,
      };

      databaseService.insertUserData(userDataRecord);

      logger.info(
        {
          userId: userData.userId,
          phoneNumber: userData.phoneNumber,
          leadId: lead.leadId,
          isComplete: userData.missingFields.length === 0
        },
        'Migrated user data from lead'
      );

      migrated++;
    } catch (error: any) {
      logger.error({ error: error.message, leadId: lead.leadId }, 'Failed to migrate lead');
    }
  }

  logger.info(
    {
      totalLeads: leadsDatabase.length,
      matched,
      migrated,
      skipped
    },
    `Migration complete: ${matched} matched, ${migrated} migrated, ${skipped} skipped`
  );

  // Summary statistics
  const totalUsers = databaseService.getAllUserData().length;
  logger.info({ totalUsers }, 'Total users in database after migration');
}

// Run migration
migrateLeadsToUserData()
  .then(() => {
    logger.info('Migration script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    logger.error({ error: error.message }, 'Migration script failed');
    process.exit(1);
  });
