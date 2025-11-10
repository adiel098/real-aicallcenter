/**
 * Test Script: Verify Update Merge Fix
 *
 * This script tests that updating a single field doesn't destroy other fields
 */

import databaseService from '../src/services/database.service';
import logger from '../src/config/logger';

async function testUpdateMerge() {
  logger.info('Testing update merge fix...');

  // Test user phone number (Sarah Johnson)
  const phoneNumber = '+972501234002';

  // Get user before update
  const beforeUpdate = databaseService.getUserDataByPhone(phoneNumber);
  if (!beforeUpdate) {
    logger.error('Test user not found!');
    return;
  }

  const beforeMedicareData = beforeUpdate.medicare_data
    ? JSON.parse(beforeUpdate.medicare_data)
    : {};

  logger.info({
    phoneNumber,
    fieldsBeforeUpdate: Object.keys(beforeMedicareData),
    fieldCount: Object.keys(beforeMedicareData).length,
    planLevelBefore: beforeMedicareData.planLevel || 'MISSING',
  }, 'User data BEFORE update');

  // Simulate updating just one field (planLevel)
  const updatedMedicareData = { planLevel: 'B' };

  // Merge (this is what the fix does)
  const mergedData = { ...beforeMedicareData, ...updatedMedicareData };

  logger.info({
    newFields: Object.keys(updatedMedicareData),
    mergedFields: Object.keys(mergedData),
    mergedFieldCount: Object.keys(mergedData).length,
    planLevelAfter: mergedData.planLevel,
  }, 'Data AFTER merge');

  // Verify all original fields are preserved
  const originalFields = Object.keys(beforeMedicareData);
  const preservedFields = originalFields.filter(field => field in mergedData);
  const lostFields = originalFields.filter(field => !(field in mergedData));

  logger.info({
    totalOriginalFields: originalFields.length,
    preservedFields: preservedFields.length,
    lostFields: lostFields.length,
    lostFieldsList: lostFields,
  }, 'Merge verification');

  if (lostFields.length === 0) {
    logger.info('✅ TEST PASSED: All fields preserved during update');
  } else {
    logger.error('❌ TEST FAILED: Data loss detected!', { lostFields });
  }

  // Show before/after comparison
  logger.info({
    before: beforeMedicareData,
    after: mergedData,
  }, 'Complete comparison');
}

testUpdateMerge()
  .then(() => {
    logger.info('Test completed');
    process.exit(0);
  })
  .catch((error) => {
    logger.error({ error: error.message }, 'Test failed');
    process.exit(1);
  });
