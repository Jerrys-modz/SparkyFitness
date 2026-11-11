-- Migration: Create coaches, a person's own Sparky coaches (issue #2013)
-- Date: 2026-11-11

-- A coach is Sparky with a focus: its own instructions (system_prompt) and the
-- only chat tool categories a conversation with it may use (tool_categories,
-- slugs from the shared CHAT_TOOL_CATEGORY_SLUGS, validated by the API). The
-- built-in coaches are constants in the shared package and are not stored.
CREATE TABLE IF NOT EXISTS public.coaches (
    id UUID DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
    name VARCHAR(60) NOT NULL,
    description VARCHAR(200),
    system_prompt TEXT NOT NULL,
    tool_categories TEXT[] NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT coaches_name_check CHECK (char_length(btrim(name)) >= 1),
    CONSTRAINT coaches_system_prompt_check CHECK (
        char_length(system_prompt) BETWEEN 1 AND 4000
    ),
    CONSTRAINT coaches_tool_categories_check CHECK (
        cardinality(tool_categories) >= 1
    )
);

CREATE INDEX IF NOT EXISTS idx_coaches_user_id ON public.coaches (user_id);
