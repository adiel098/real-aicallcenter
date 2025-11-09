import Database from 'better-sqlite3';
import { join } from 'path';
import { readFileSync } from 'fs';
import logger from '../config/logger';

// Database types
export interface LeadRecord {
  id?: number;
  lead_id: string;
  phone_number: string;
  alternate_phones?: string; // JSON string of phone array
  name: string;
  email: string;
  city?: string;
  source?: string;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

export interface UserDataRecord {
  id?: number;
  user_id: string;
  phone_number: string;
  name?: string;
  medicare_data?: string; // JSON string of Medicare data object
  eligibility_data?: string; // JSON string of eligibility data object
  last_updated?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ClassificationRecord {
  id?: number;
  classification_id: string;
  user_id: string;
  phone_number: string;
  result: string; // 'QUALIFIED' or 'NOT_QUALIFIED'
  score: number;
  reason?: string;
  factors?: string; // JSON string of factors object
  created_at?: string;
}

export interface CallRecord {
  id?: number;
  call_id: string;
  phone_number: string;
  call_type: 'inbound' | 'outbound';
  start_time: string;
  end_time?: string;
  duration_seconds?: number;
  status?: string;
  end_reason?: string;
  agent_extension?: string;
  is_business_hours?: boolean;
  transcript?: string;
  summary?: string;
  recording_url?: string;
  total_cost?: number;
  message_count?: number;
}

export interface CallEvent {
  id?: number;
  call_id: string;
  event_type: string;
  event_data?: string; // JSON string
  timestamp: string;
}

export interface ToolExecution {
  id?: number;
  call_id: string;
  tool_name: string;
  arguments?: string; // JSON string
  result?: string; // JSON string
  duration_ms?: number;
  success?: boolean;
  error_message?: string;
  timestamp: string;
}

export interface VICIDisposition {
  id?: number;
  disposition_id: string;
  call_id?: string;
  lead_id?: string;
  phone_number: string;
  disposition_code: string;
  campaign_id?: string;
  agent_id?: string;
  duration_seconds?: number;
  eligibility_score?: number;
  classification_result?: string;
  mbi_validated?: boolean;
  notes?: string;
  timestamp: string;
}

export interface VICICallback {
  id?: number;
  callback_id: string;
  call_id?: string;
  lead_id?: string;
  phone_number: string;
  callback_datetime: string;
  agent_id?: string;
  reason?: string;
  notes?: string;
  status?: 'PENDING' | 'COMPLETED' | 'CANCELLED';
}

export interface PerformanceMetric {
  id?: number;
  call_id?: string;
  metric_type: 'api_call' | 'tool_execution' | 'database_query';
  endpoint?: string;
  method?: string;
  duration_ms: number;
  status_code?: number;
  success?: boolean;
  timestamp: string;
}

export interface ErrorLog {
  id?: number;
  call_id?: string;
  error_type: 'network' | 'validation' | 'business_logic' | 'external_api';
  error_category: 'vapi' | 'vici' | 'crm' | 'database' | 'sms';
  error_message: string;
  error_stack?: string;
  context?: string; // JSON string
  retry_attempt?: number;
  max_retries?: number;
  retry_successful?: boolean;
  severity?: 'warning' | 'error' | 'critical';
  timestamp: string;
}

class DatabaseService {
  private db: Database.Database;
  private dbPath: string;
  private log = logger.child({ service: 'database' });

  constructor() {
    // Database file in project root
    this.dbPath = join(process.cwd(), 'monitoring.db');
    this.log.info({ dbPath: this.dbPath }, 'Initializing database');

    // Initialize database
    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL'); // Write-Ahead Logging for better concurrency
    this.db.pragma('foreign_keys = ON'); // Enable foreign key constraints

    // Run schema
    this.initializeSchema();

    this.log.info('Database initialized successfully');
  }

  private initializeSchema(): void {
    try {
      const schemaPath = join(__dirname, '..', 'database', 'schema.sql');
      const schema = readFileSync(schemaPath, 'utf-8');

      // Execute schema (multiple statements)
      this.db.exec(schema);

      this.log.info('Database schema initialized');
    } catch (error) {
      this.log.error({ error }, 'Failed to initialize database schema');
      throw error;
    }
  }

  // ============= LEADS =============

  insertLead(lead: LeadRecord): number {
    const stmt = this.db.prepare(`
      INSERT INTO leads (
        lead_id, phone_number, alternate_phones, name, email, city, source, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      lead.lead_id,
      lead.phone_number,
      lead.alternate_phones || null,
      lead.name,
      lead.email,
      lead.city,
      lead.source || 'inbound_call',
      lead.notes || null
    );

    return result.lastInsertRowid as number;
  }

  getLeadByPhone(phoneNumber: string): LeadRecord | null {
    // Search by primary phone
    let stmt = this.db.prepare('SELECT * FROM leads WHERE phone_number = ?');
    let lead = stmt.get(phoneNumber) as LeadRecord | null;

    if (lead) return lead;

    // Search by alternate phones (JSON array contains the phone number)
    // Only search if alternate_phones column has actual data
    stmt = this.db.prepare(`
      SELECT * FROM leads
      WHERE alternate_phones IS NOT NULL
      AND alternate_phones != ''
      AND alternate_phones != 'null'
      AND (
        alternate_phones LIKE ?
        OR alternate_phones LIKE ?
      )
    `);
    lead = stmt.get(`%"${phoneNumber}"%`, `%'${phoneNumber}'%`) as LeadRecord | null;

    return lead;
  }

  getLeadById(leadId: string): LeadRecord | null {
    const stmt = this.db.prepare('SELECT * FROM leads WHERE lead_id = ?');
    return stmt.get(leadId) as LeadRecord | null;
  }

  getLeadByEmail(email: string): LeadRecord | null {
    const stmt = this.db.prepare('SELECT * FROM leads WHERE email = ?');
    return stmt.get(email) as LeadRecord | null;
  }

  getAllLeads(limit = 100, offset = 0): LeadRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM leads ORDER BY created_at DESC LIMIT ? OFFSET ?
    `);
    return stmt.all(limit, offset) as LeadRecord[];
  }

  updateLead(leadId: string, updates: Partial<LeadRecord>): void {
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.name !== undefined) {
      fields.push('name = ?');
      values.push(updates.name);
    }
    if (updates.email !== undefined) {
      fields.push('email = ?');
      values.push(updates.email);
    }
    if (updates.city !== undefined) {
      fields.push('city = ?');
      values.push(updates.city);
    }
    if (updates.alternate_phones !== undefined) {
      fields.push('alternate_phones = ?');
      values.push(updates.alternate_phones);
    }
    if (updates.source !== undefined) {
      fields.push('source = ?');
      values.push(updates.source);
    }
    if (updates.notes !== undefined) {
      fields.push('notes = ?');
      values.push(updates.notes);
    }

    if (fields.length === 0) return;

    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(leadId);

    const stmt = this.db.prepare(`
      UPDATE leads SET ${fields.join(', ')} WHERE lead_id = ?
    `);

    stmt.run(...values);
  }

  deleteLead(leadId: string): void {
    const stmt = this.db.prepare('DELETE FROM leads WHERE lead_id = ?');
    stmt.run(leadId);
  }

  leadExists(phoneNumber: string): boolean {
    const lead = this.getLeadByPhone(phoneNumber);
    return lead !== null && lead !== undefined;
  }

  // ============= USER DATA =============

  insertUserData(userData: UserDataRecord): number {
    const stmt = this.db.prepare(`
      INSERT INTO user_data (
        user_id, phone_number, name, medicare_data, eligibility_data, last_updated
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      userData.user_id,
      userData.phone_number,
      userData.name || null,
      userData.medicare_data || null,
      userData.eligibility_data || null,
      userData.last_updated || new Date().toISOString()
    );

    return result.lastInsertRowid as number;
  }

  getUserDataByPhone(phoneNumber: string): UserDataRecord | null {
    const stmt = this.db.prepare('SELECT * FROM user_data WHERE phone_number = ? ORDER BY last_updated DESC LIMIT 1');
    return stmt.get(phoneNumber) as UserDataRecord | null;
  }

  getUserDataById(userId: string): UserDataRecord | null {
    const stmt = this.db.prepare('SELECT * FROM user_data WHERE user_id = ?');
    return stmt.get(userId) as UserDataRecord | null;
  }

  getUserDataByMedicareNumber(medicareNumber: string): UserDataRecord | null {
    // Search in JSON medicare_data field
    const stmt = this.db.prepare(`
      SELECT * FROM user_data
      WHERE medicare_data IS NOT NULL
      AND medicare_data LIKE ?
    `);
    return stmt.get(`%"medicareNumber":"${medicareNumber}"%`) as UserDataRecord | null;
  }

  getUserDataByNameAndDOB(name: string, dob: string): UserDataRecord | null {
    // Search in name field and JSON medicare_data for dateOfBirth
    const stmt = this.db.prepare(`
      SELECT * FROM user_data
      WHERE name = ?
      AND medicare_data IS NOT NULL
      AND medicare_data LIKE ?
      ORDER BY last_updated DESC
      LIMIT 1
    `);
    return stmt.get(name, `%"dateOfBirth":"${dob}"%`) as UserDataRecord | null;
  }

  getAllUserData(limit = 100, offset = 0): UserDataRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM user_data ORDER BY last_updated DESC LIMIT ? OFFSET ?
    `);
    return stmt.all(limit, offset) as UserDataRecord[];
  }

  updateUserData(userId: string, updates: Partial<UserDataRecord>): void {
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.name !== undefined) {
      fields.push('name = ?');
      values.push(updates.name);
    }
    if (updates.medicare_data !== undefined) {
      fields.push('medicare_data = ?');
      values.push(updates.medicare_data);
    }
    if (updates.eligibility_data !== undefined) {
      fields.push('eligibility_data = ?');
      values.push(updates.eligibility_data);
    }
    if (updates.last_updated !== undefined) {
      fields.push('last_updated = ?');
      values.push(updates.last_updated);
    }

    if (fields.length === 0) return;

    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(userId);

    const stmt = this.db.prepare(`
      UPDATE user_data SET ${fields.join(', ')} WHERE user_id = ?
    `);

    stmt.run(...values);
  }

  deleteUserData(userId: string): void {
    const stmt = this.db.prepare('DELETE FROM user_data WHERE user_id = ?');
    stmt.run(userId);
  }

  userDataExists(phoneNumber: string): boolean {
    return this.getUserDataByPhone(phoneNumber) !== null;
  }

  // ============= CLASSIFICATIONS =============

  insertClassification(classification: ClassificationRecord): number {
    const stmt = this.db.prepare(`
      INSERT INTO classifications (
        classification_id, user_id, phone_number, result, score, reason, factors
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      classification.classification_id,
      classification.user_id,
      classification.phone_number,
      classification.result,
      classification.score,
      classification.reason || null,
      classification.factors || null
    );

    return result.lastInsertRowid as number;
  }

  getClassificationByUserId(userId: string): ClassificationRecord | null {
    const stmt = this.db.prepare('SELECT * FROM classifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 1');
    return stmt.get(userId) as ClassificationRecord | null;
  }

  getAllClassifications(limit = 100, offset = 0): ClassificationRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM classifications ORDER BY created_at DESC LIMIT ? OFFSET ?
    `);
    return stmt.all(limit, offset) as ClassificationRecord[];
  }

  getClassificationsByResult(result: string, limit = 100, offset = 0): ClassificationRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM classifications WHERE result = ? ORDER BY created_at DESC LIMIT ? OFFSET ?
    `);
    return stmt.all(result, limit, offset) as ClassificationRecord[];
  }

  deleteClassification(classificationId: string): void {
    const stmt = this.db.prepare('DELETE FROM classifications WHERE classification_id = ?');
    stmt.run(classificationId);
  }

  // ============= CALL RECORDS =============

  insertCall(call: CallRecord): number {
    const stmt = this.db.prepare(`
      INSERT INTO calls (
        call_id, phone_number, call_type, start_time, end_time, duration_seconds,
        status, end_reason, agent_extension, is_business_hours, transcript, summary,
        recording_url, total_cost, message_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      call.call_id,
      call.phone_number,
      call.call_type,
      call.start_time,
      call.end_time || null,
      call.duration_seconds || null,
      call.status || null,
      call.end_reason || null,
      call.agent_extension || null,
      call.is_business_hours !== undefined ? (call.is_business_hours ? 1 : 0) : 1,
      call.transcript || null,
      call.summary || null,
      call.recording_url || null,
      call.total_cost || null,
      call.message_count || null
    );

    return result.lastInsertRowid as number;
  }

  updateCall(callId: string, updates: Partial<CallRecord>): void {
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.end_time !== undefined) {
      fields.push('end_time = ?');
      values.push(updates.end_time);
    }
    if (updates.duration_seconds !== undefined) {
      fields.push('duration_seconds = ?');
      values.push(updates.duration_seconds);
    }
    if (updates.status !== undefined) {
      fields.push('status = ?');
      values.push(updates.status);
    }
    if (updates.end_reason !== undefined) {
      fields.push('end_reason = ?');
      values.push(updates.end_reason);
    }
    if (updates.transcript !== undefined) {
      fields.push('transcript = ?');
      values.push(updates.transcript);
    }
    if (updates.summary !== undefined) {
      fields.push('summary = ?');
      values.push(updates.summary);
    }
    if (updates.recording_url !== undefined) {
      fields.push('recording_url = ?');
      values.push(updates.recording_url);
    }
    if (updates.total_cost !== undefined) {
      fields.push('total_cost = ?');
      values.push(updates.total_cost);
    }
    if (updates.message_count !== undefined) {
      fields.push('message_count = ?');
      values.push(updates.message_count);
    }

    if (fields.length === 0) return;

    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(callId);

    const stmt = this.db.prepare(`
      UPDATE calls SET ${fields.join(', ')} WHERE call_id = ?
    `);

    stmt.run(...values);
  }

  getCall(callId: string): CallRecord | null {
    const stmt = this.db.prepare('SELECT * FROM calls WHERE call_id = ?');
    return stmt.get(callId) as CallRecord | null;
  }

  getAllCalls(limit = 100, offset = 0): CallRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM calls ORDER BY start_time DESC LIMIT ? OFFSET ?
    `);
    return stmt.all(limit, offset) as CallRecord[];
  }

  getActiveCalls(): CallRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM calls WHERE end_time IS NULL ORDER BY start_time DESC
    `);
    return stmt.all() as CallRecord[];
  }

  // ============= CALL EVENTS =============

  insertCallEvent(event: CallEvent): number {
    const stmt = this.db.prepare(`
      INSERT INTO call_events (call_id, event_type, event_data, timestamp)
      VALUES (?, ?, ?, ?)
    `);

    const result = stmt.run(
      event.call_id,
      event.event_type,
      event.event_data || null,
      event.timestamp
    );

    return result.lastInsertRowid as number;
  }

  getCallEvents(callId: string): CallEvent[] {
    const stmt = this.db.prepare(`
      SELECT * FROM call_events WHERE call_id = ? ORDER BY timestamp ASC
    `);
    return stmt.all(callId) as CallEvent[];
  }

  // ============= TOOL EXECUTIONS =============

  insertToolExecution(execution: ToolExecution): number {
    const stmt = this.db.prepare(`
      INSERT INTO tool_executions (
        call_id, tool_name, arguments, result, duration_ms, success, error_message, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      execution.call_id,
      execution.tool_name,
      execution.arguments || null,
      execution.result || null,
      execution.duration_ms || null,
      execution.success !== undefined ? (execution.success ? 1 : 0) : 1,
      execution.error_message || null,
      execution.timestamp
    );

    return result.lastInsertRowid as number;
  }

  getToolExecutions(callId: string): ToolExecution[] {
    const stmt = this.db.prepare(`
      SELECT * FROM tool_executions WHERE call_id = ? ORDER BY timestamp ASC
    `);
    return stmt.all(callId) as ToolExecution[];
  }

  // ============= VICI DISPOSITIONS =============

  insertDisposition(disposition: VICIDisposition): number {
    const stmt = this.db.prepare(`
      INSERT INTO vici_dispositions (
        disposition_id, call_id, lead_id, phone_number, disposition_code,
        campaign_id, agent_id, duration_seconds, eligibility_score,
        classification_result, mbi_validated, notes, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      disposition.disposition_id,
      disposition.call_id || null,
      disposition.lead_id || null,
      disposition.phone_number,
      disposition.disposition_code,
      disposition.campaign_id || null,
      disposition.agent_id || null,
      disposition.duration_seconds || null,
      disposition.eligibility_score || null,
      disposition.classification_result || null,
      disposition.mbi_validated !== undefined ? (disposition.mbi_validated ? 1 : 0) : null,
      disposition.notes || null,
      disposition.timestamp
    );

    return result.lastInsertRowid as number;
  }

  getDispositions(limit = 100, offset = 0): VICIDisposition[] {
    const stmt = this.db.prepare(`
      SELECT * FROM vici_dispositions ORDER BY timestamp DESC LIMIT ? OFFSET ?
    `);
    return stmt.all(limit, offset) as VICIDisposition[];
  }

  getDispositionsByPhone(phoneNumber: string): VICIDisposition[] {
    const stmt = this.db.prepare(`
      SELECT * FROM vici_dispositions WHERE phone_number = ? ORDER BY timestamp DESC
    `);
    return stmt.all(phoneNumber) as VICIDisposition[];
  }

  // ============= VICI CALLBACKS =============

  insertCallback(callback: VICICallback): number {
    const stmt = this.db.prepare(`
      INSERT INTO vici_callbacks (
        callback_id, call_id, lead_id, phone_number, callback_datetime,
        agent_id, reason, notes, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      callback.callback_id,
      callback.call_id || null,
      callback.lead_id || null,
      callback.phone_number,
      callback.callback_datetime,
      callback.agent_id || null,
      callback.reason || null,
      callback.notes || null,
      callback.status || 'PENDING'
    );

    return result.lastInsertRowid as number;
  }

  updateCallbackStatus(callbackId: string, status: 'PENDING' | 'COMPLETED' | 'CANCELLED'): void {
    const stmt = this.db.prepare(`
      UPDATE vici_callbacks SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE callback_id = ?
    `);
    stmt.run(status, callbackId);
  }

  getPendingCallbacks(): VICICallback[] {
    const stmt = this.db.prepare(`
      SELECT * FROM vici_callbacks WHERE status = 'PENDING' ORDER BY callback_datetime ASC
    `);
    return stmt.all() as VICICallback[];
  }

  // ============= PERFORMANCE METRICS =============

  insertPerformanceMetric(metric: PerformanceMetric): number {
    const stmt = this.db.prepare(`
      INSERT INTO performance_metrics (
        call_id, metric_type, endpoint, method, duration_ms, status_code, success, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      metric.call_id || null,
      metric.metric_type,
      metric.endpoint || null,
      metric.method || null,
      metric.duration_ms,
      metric.status_code || null,
      metric.success !== undefined ? (metric.success ? 1 : 0) : 1,
      metric.timestamp
    );

    return result.lastInsertRowid as number;
  }

  getPerformanceMetrics(metricType?: string, limit = 1000): PerformanceMetric[] {
    let query = 'SELECT * FROM performance_metrics';
    const params: any[] = [];

    if (metricType) {
      query += ' WHERE metric_type = ?';
      params.push(metricType);
    }

    query += ' ORDER BY timestamp DESC LIMIT ?';
    params.push(limit);

    const stmt = this.db.prepare(query);
    return stmt.all(...params) as PerformanceMetric[];
  }

  // ============= ERROR LOGS =============

  insertErrorLog(error: ErrorLog): number {
    const stmt = this.db.prepare(`
      INSERT INTO error_logs (
        call_id, error_type, error_category, error_message, error_stack,
        context, retry_attempt, max_retries, retry_successful, severity, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      error.call_id || null,
      error.error_type,
      error.error_category,
      error.error_message,
      error.error_stack || null,
      error.context || null,
      error.retry_attempt || 0,
      error.max_retries || 0,
      error.retry_successful !== undefined ? (error.retry_successful ? 1 : 0) : null,
      error.severity || 'error',
      error.timestamp
    );

    return result.lastInsertRowid as number;
  }

  getErrorLogs(category?: string, limit = 100): ErrorLog[] {
    let query = 'SELECT * FROM error_logs';
    const params: any[] = [];

    if (category) {
      query += ' WHERE error_category = ?';
      params.push(category);
    }

    query += ' ORDER BY timestamp DESC LIMIT ?';
    params.push(limit);

    const stmt = this.db.prepare(query);
    return stmt.all(...params) as ErrorLog[];
  }

  // ============= ANALYTICS QUERIES =============

  getCallStats(hours = 24): any {
    const stmt = this.db.prepare(`
      SELECT
        COUNT(*) as total_calls,
        COUNT(CASE WHEN end_time IS NOT NULL THEN 1 END) as completed_calls,
        COUNT(CASE WHEN end_time IS NULL THEN 1 END) as active_calls,
        AVG(duration_seconds) as avg_duration,
        SUM(total_cost) as total_cost,
        COUNT(CASE WHEN status = 'LIVE_PERSON' THEN 1 END) as live_person_count,
        COUNT(CASE WHEN status = 'VOICEMAIL' THEN 1 END) as voicemail_count,
        COUNT(CASE WHEN status = 'DEAD_AIR' THEN 1 END) as dead_air_count
      FROM calls
      WHERE start_time >= datetime('now', '-${hours} hours')
    `);
    return stmt.get();
  }

  getDispositionStats(hours = 24): any[] {
    const stmt = this.db.prepare(`
      SELECT
        disposition_code,
        COUNT(*) as count,
        AVG(duration_seconds) as avg_duration,
        AVG(eligibility_score) as avg_score
      FROM vici_dispositions
      WHERE timestamp >= datetime('now', '-${hours} hours')
      GROUP BY disposition_code
      ORDER BY count DESC
    `);
    return stmt.all();
  }

  getToolStats(hours = 24): any[] {
    const stmt = this.db.prepare(`
      SELECT
        tool_name,
        COUNT(*) as total_executions,
        COUNT(CASE WHEN success = 1 THEN 1 END) as successful,
        COUNT(CASE WHEN success = 0 THEN 1 END) as failed,
        AVG(duration_ms) as avg_duration_ms,
        MAX(duration_ms) as max_duration_ms
      FROM tool_executions
      WHERE timestamp >= datetime('now', '-${hours} hours')
      GROUP BY tool_name
      ORDER BY total_executions DESC
    `);
    return stmt.all();
  }

  getPerformanceStats(hours = 24): any {
    const stmt = this.db.prepare(`
      SELECT
        metric_type,
        COUNT(*) as total_requests,
        AVG(duration_ms) as avg_latency,
        MIN(duration_ms) as min_latency,
        MAX(duration_ms) as max_latency,
        COUNT(CASE WHEN success = 1 THEN 1 END) as successful,
        COUNT(CASE WHEN success = 0 THEN 1 END) as failed
      FROM performance_metrics
      WHERE timestamp >= datetime('now', '-${hours} hours')
      GROUP BY metric_type
    `);
    return stmt.all();
  }

  getErrorStats(hours = 24): any[] {
    const stmt = this.db.prepare(`
      SELECT
        error_category,
        error_type,
        COUNT(*) as count,
        COUNT(CASE WHEN retry_successful = 1 THEN 1 END) as retry_successful,
        COUNT(CASE WHEN severity = 'critical' THEN 1 END) as critical_count
      FROM error_logs
      WHERE timestamp >= datetime('now', '-${hours} hours')
      GROUP BY error_category, error_type
      ORDER BY count DESC
    `);
    return stmt.all();
  }

  // ============= CLEANUP =============

  cleanupOldData(daysToKeep = 90): void {
    const tables = ['calls', 'call_events', 'tool_executions', 'vici_dispositions',
                   'vici_callbacks', 'performance_metrics', 'error_logs'];

    for (const table of tables) {
      const stmt = this.db.prepare(`
        DELETE FROM ${table} WHERE created_at < datetime('now', '-${daysToKeep} days')
      `);
      const result = stmt.run();
      this.log.info({ table, deleted: result.changes }, 'Cleaned up old data');
    }
  }

  // ============= UTILITY =============

  close(): void {
    this.db.close();
    this.log.info('Database connection closed');
  }
}

// Singleton instance
const databaseService = new DatabaseService();

export default databaseService;
