/**
 * Population Script: Populate user_data table from userDataDatabase
 *
 * This script populates the user_data table with all users from userDataDatabase.
 */

import databaseService from '../src/services/database.service';
import { userDataDatabase } from '../src/data/userData.data';
import logger from '../src/config/logger';

async function populateUserData() {
  logger.info('Starting user_data population from userDataDatabase');

  let inserted = 0;
  let skipped = 0;

  for (const userData of userDataDatabase) {
    try {
      // Check if user already exists
      if (databaseService.userDataExists(userData.phoneNumber)) {
        logger.debug(
          { userId: userData.userId, phoneNumber: userData.phoneNumber },
          'User data already exists, skipping'
        );
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
          isComplete: userData.missingFields.length === 0,
          missingFieldsCount: userData.missingFields.length,
        },
        'Inserted user data'
      );

      inserted++;
    } catch (error: any) {
      logger.error({ error: error.message, userId: userData.userId }, 'Failed to insert user data');
    }
  }

  logger.info(
    {
      totalUsers: userDataDatabase.length,
      inserted,
      skipped,
    },
    `Population complete: ${inserted} inserted, ${skipped} skipped`
  );

  // Summary statistics
  const totalUsersInDb = databaseService.getAllUserData().length;
  logger.info({ totalUsers: totalUsersInDb }, 'Total users in database after population');
}

// Run population
populateUserData()
  .then(() => {
    logger.info('Population script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    logger.error({ error: error.message }, 'Population script failed');
    process.exit(1);
  });
