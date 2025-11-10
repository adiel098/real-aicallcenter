/**
 * Seed Script: Populate database with all mock data
 *
 * This script populates the database with:
 * - Leads from leadsDatabase
 * - User data from userDataDatabase
 */

import databaseService from '../src/services/database.service';
import { leadsDatabase } from '../src/data/leads.data';
import { userDataDatabase } from '../src/data/userData.data';
import logger from '../src/config/logger';

async function seedAllData() {
  logger.info('Starting database seeding');

  // Seed leads
  let leadsInserted = 0;
  logger.info(`Seeding ${leadsDatabase.length} leads`);

  for (const lead of leadsDatabase) {
    try {
      const leadRecord = {
        lead_id: lead.leadId,
        phone_number: lead.phoneNumber,
        alternate_phones: lead.alternatePhones ? JSON.stringify(lead.alternatePhones) : undefined,
        name: lead.name,
        email: lead.email,
        city: lead.city,
        source: lead.source,
        notes: lead.notes,
        created_at: lead.createdAt,
      };

      databaseService.insertLead(leadRecord);
      leadsInserted++;
    } catch (error: any) {
      if (error.message.includes('UNIQUE constraint failed')) {
        logger.debug({ leadId: lead.leadId }, 'Lead already exists, skipping');
      } else {
        logger.error({ error: error.message, leadId: lead.leadId }, 'Failed to insert lead');
      }
    }
  }

  logger.info({ inserted: leadsInserted, total: leadsDatabase.length }, 'Leads seeded');

  // Seed user data
  let userDataInserted = 0;
  logger.info(`Seeding ${userDataDatabase.length} user data records`);

  for (const userData of userDataDatabase) {
    try {
      const userDataRecord = {
        user_id: userData.userId,
        phone_number: userData.phoneNumber,
        name: userData.name,
        medicare_data: JSON.stringify(userData.medicareData),
        eligibility_data: userData.eligibilityData ? JSON.stringify(userData.eligibilityData) : undefined,
        last_updated: userData.lastUpdated,
      };

      databaseService.insertUserData(userDataRecord);
      userDataInserted++;

      logger.info(
        {
          userId: userData.userId,
          phoneNumber: userData.phoneNumber,
          hasAllFields: userData.missingFields.length === 0,
          missingCount: userData.missingFields.length,
        },
        'User data inserted'
      );
    } catch (error: any) {
      if (error.message.includes('UNIQUE constraint failed')) {
        logger.debug({ userId: userData.userId }, 'User data already exists, skipping');
      } else {
        logger.error({ error: error.message, userId: userData.userId }, 'Failed to insert user data');
      }
    }
  }

  logger.info({ inserted: userDataInserted, total: userDataDatabase.length }, 'User data seeded');

  // Summary
  const totalLeads = databaseService.getAllLeads().length;
  const totalUserData = databaseService.getAllUserData().length;

  logger.info(
    {
      leads: { inserted: leadsInserted, total: totalLeads },
      userData: { inserted: userDataInserted, total: totalUserData },
    },
    'Database seeding complete'
  );
}

// Run seeding
seedAllData()
  .then(() => {
    logger.info('Seed script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    logger.error({ error: error.message }, 'Seed script failed');
    process.exit(1);
  });
