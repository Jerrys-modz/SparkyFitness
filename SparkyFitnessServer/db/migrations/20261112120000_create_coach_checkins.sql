-- Migration: Coach check-ins, coaches that speak up on their own (issue #2013)
-- Date: 2026-11-12

-- One row per person who has opened the check-in settings. Off by default:
-- nothing is evaluated and no AI request is made until `enabled` is true.
-- `coach_ids` holds built-in coach ids (`builtin:<key>`), validated by the API.
-- `last_evaluated_day` is the person's calendar day the scheduled check last
-- ran for them, so a day is evaluated once even if the server was down at
-- their chosen hour.
CREATE TABLE IF NOT EXISTS public.coach_checkin_settings (
    user_id UUID NOT NULL PRIMARY KEY REFERENCES public."user"(id) ON DELETE CASCADE,
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    coach_ids TEXT[] NOT NULL DEFAULT '{}',
    checkin_hour SMALLINT NOT NULL DEFAULT 9,
    ai_wording BOOLEAN NOT NULL DEFAULT FALSE,
    last_evaluated_day DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT coach_checkin_settings_hour_check CHECK (
        checkin_hour BETWEEN 0 AND 23
    )
);

-- What a check-in produced. `facts` are the numbers behind the message, so the
-- apps can show their own translated sentence; `ai_text` is set only when the
-- person asked for AI wording. The unique constraint makes a repeated check
-- for the same day write nothing new.
CREATE TABLE IF NOT EXISTS public.coach_messages (
    id UUID DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
    coach_id TEXT NOT NULL,
    trigger_type TEXT NOT NULL,
    entry_date DATE NOT NULL,
    facts JSONB NOT NULL DEFAULT '{}'::jsonb,
    ai_text TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    read_at TIMESTAMPTZ,
    dismissed_at TIMESTAMPTZ,
    CONSTRAINT coach_messages_once_per_day UNIQUE (
        user_id, coach_id, trigger_type, entry_date
    ),
    CONSTRAINT coach_messages_facts_check CHECK (jsonb_typeof(facts) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_coach_messages_user_created
    ON public.coach_messages (user_id, created_at DESC);
