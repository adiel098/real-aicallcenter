-- VAPI and VICI Monitoring Database Schema
-- SQLite Database for persistent call tracking, metrics, and analytics

-- Call Records Table
-- Stores complete VAPI call information
CREATE TABLE IF NOT EXISTS calls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    call_id TEXT UNIQUE NOT NULL,
    phone_number TEXT NOT NULL,
    call_type TEXT NOT NULL, -- 'inbound' or 'outbound'
    start_time DATETIME NOT NULL,
    end_time DATETIME,
    duration_seconds INTEGER,
    status TEXT, -- 'LIVE_PERSON', 'VOICEMAIL', 'DEAD_AIR', etc.
    end_reason TEXT, -- 'customer-hangup', 'assistant-hangup', etc.
    agent_extension TEXT,
    is_business_hours BOOLEAN DEFAULT 1,
    transcript TEXT,
    summary TEXT,
    recording_url TEXT,
    total_cost REAL,
    message_count INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Call Events Table
-- Stores all VAPI events for detailed call timeline
CREATE TABLE IF NOT EXISTS call_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    call_id TEXT NOT NULL,
    event_type TEXT NOT NULL, -- 'status-update', 'transcript', 'tool-calls', etc.
    event_data TEXT, -- JSON string of event payload
    timestamp DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (call_id) REFERENCES calls(call_id) ON DELETE CASCADE
);

-- Tool Executions Table
-- Tracks all tool/function calls during conversations
CREATE TABLE IF NOT EXISTS tool_executions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    call_id TEXT NOT NULL,
    tool_name TEXT NOT NULL,
    arguments TEXT, -- JSON string of tool arguments
    result TEXT, -- JSON string of tool result
    duration_ms INTEGER,
    success BOOLEAN DEFAULT 1,
    error_message TEXT,
    timestamp DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (call_id) REFERENCES calls(call_id) ON DELETE CASCADE
);

-- VICI Dispositions Table
-- Stores all VICI dialer dispositions
CREATE TABLE IF NOT EXISTS vici_dispositions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    disposition_id TEXT UNIQUE NOT NULL,
    call_id TEXT,
    lead_id TEXT,
    phone_number TEXT NOT NULL,
    disposition_code TEXT NOT NULL, -- 'SALE', 'NQI', 'NA', 'NI', etc.
    campaign_id TEXT,
    agent_id TEXT,
    duration_seconds INTEGER,
    eligibility_score INTEGER,
    classification_result TEXT, -- 'QUALIFIED', 'NOT_QUALIFIED'
    mbi_validated BOOLEAN,
    notes TEXT,
    timestamp DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (call_id) REFERENCES calls(call_id) ON DELETE SET NULL
);

-- VICI Callbacks Table
-- Stores callback scheduling information
CREATE TABLE IF NOT EXISTS vici_callbacks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    callback_id TEXT UNIQUE NOT NULL,
    call_id TEXT,
    lead_id TEXT,
    phone_number TEXT NOT NULL,
    callback_datetime DATETIME NOT NULL,
    agent_id TEXT,
    reason TEXT,
    notes TEXT,
    status TEXT DEFAULT 'PENDING', -- 'PENDING', 'COMPLETED', 'CANCELLED'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (call_id) REFERENCES calls(call_id) ON DELETE SET NULL
);

-- Performance Metrics Table
-- Tracks API performance and latency
CREATE TABLE IF NOT EXISTS performance_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    call_id TEXT,
    metric_type TEXT NOT NULL, -- 'api_call', 'tool_execution', 'database_query'
    endpoint TEXT, -- API endpoint or tool name
    method TEXT, -- HTTP method or operation
    duration_ms INTEGER NOT NULL,
    status_code INTEGER,
    success BOOLEAN DEFAULT 1,
    timestamp DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (call_id) REFERENCES calls(call_id) ON DELETE SET NULL
);

-- Error Logs Table
-- Comprehensive error tracking with retry information
CREATE TABLE IF NOT EXISTS error_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    call_id TEXT,
    error_type TEXT NOT NULL, -- 'network', 'validation', 'business_logic', 'external_api'
    error_category TEXT NOT NULL, -- 'vapi', 'vici', 'crm', 'database', 'sms'
    error_message TEXT NOT NULL,
    error_stack TEXT,
    context TEXT, -- JSON string with additional context
    retry_attempt INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 0,
    retry_successful BOOLEAN,
    severity TEXT DEFAULT 'error', -- 'warning', 'error', 'critical'
    timestamp DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (call_id) REFERENCES calls(call_id) ON DELETE SET NULL
);

-- Indexes for Performance
CREATE INDEX IF NOT EXISTS idx_calls_phone ON calls(phone_number);
CREATE INDEX IF NOT EXISTS idx_calls_start_time ON calls(start_time);
CREATE INDEX IF NOT EXISTS idx_calls_status ON calls(status);
CREATE INDEX IF NOT EXISTS idx_call_events_call_id ON call_events(call_id);
CREATE INDEX IF NOT EXISTS idx_call_events_type ON call_events(event_type);
CREATE INDEX IF NOT EXISTS idx_call_events_timestamp ON call_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_tool_executions_call_id ON tool_executions(call_id);
CREATE INDEX IF NOT EXISTS idx_tool_executions_tool_name ON tool_executions(tool_name);
CREATE INDEX IF NOT EXISTS idx_tool_executions_timestamp ON tool_executions(timestamp);
CREATE INDEX IF NOT EXISTS idx_vici_dispositions_phone ON vici_dispositions(phone_number);
CREATE INDEX IF NOT EXISTS idx_vici_dispositions_code ON vici_dispositions(disposition_code);
CREATE INDEX IF NOT EXISTS idx_vici_dispositions_timestamp ON vici_dispositions(timestamp);
CREATE INDEX IF NOT EXISTS idx_vici_callbacks_phone ON vici_callbacks(phone_number);
CREATE INDEX IF NOT EXISTS idx_vici_callbacks_status ON vici_callbacks(status);
CREATE INDEX IF NOT EXISTS idx_vici_callbacks_datetime ON vici_callbacks(callback_datetime);
CREATE INDEX IF NOT EXISTS idx_performance_type ON performance_metrics(metric_type);
CREATE INDEX IF NOT EXISTS idx_performance_timestamp ON performance_metrics(timestamp);
CREATE INDEX IF NOT EXISTS idx_error_logs_type ON error_logs(error_type);
CREATE INDEX IF NOT EXISTS idx_error_logs_category ON error_logs(error_category);
CREATE INDEX IF NOT EXISTS idx_error_logs_timestamp ON error_logs(timestamp);
