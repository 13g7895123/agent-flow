CREATE TYPE model_provider AS ENUM ('claude', 'gemini');
CREATE TYPE task_status AS ENUM ('pending', 'running', 'verifying', 'fixing', 'done', 'failed', 'cancelled');
CREATE TYPE run_phase AS ENUM ('step', 'verification', 'fix');
CREATE TYPE log_type AS ENUM ('stdout', 'stderr', 'system');
