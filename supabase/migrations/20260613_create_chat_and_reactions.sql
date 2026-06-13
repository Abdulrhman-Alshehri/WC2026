BEGIN;

-- 1. Create Chat Messages Table with Trim and Length Validations
CREATE TABLE IF NOT EXISTS public.chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    participant_id UUID NOT NULL REFERENCES public.participants(id) ON DELETE CASCADE,
    message TEXT NOT NULL CHECK (char_length(trim(message)) > 0 AND char_length(message) <= 4000),
    is_edited BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 2. Create Chat Reactions Table with Composite Unique Constraints
CREATE TABLE IF NOT EXISTS public.chat_reactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
    participant_id UUID NOT NULL REFERENCES public.participants(id) ON DELETE CASCADE,
    emoji TEXT NOT NULL CHECK (char_length(trim(emoji)) > 0 AND char_length(emoji) <= 8),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT unique_message_participant_emoji UNIQUE (message_id, participant_id, emoji)
);

-- Ensure replica identity is set to FULL so that DELETE payloads contain old values for real-time aggregation
ALTER TABLE public.chat_reactions REPLICA IDENTITY FULL;

-- 3. High Performance Indexes for Queries and Real-time Sorting
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON public.chat_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_reactions_message_id ON public.chat_reactions(message_id);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_reactions ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies for chat_messages (Permissive to allow custom participant sessions via anon role)
CREATE POLICY "Allow public read access to chat messages" 
    ON public.chat_messages FOR SELECT USING (true);

CREATE POLICY "Allow public insert to chat messages" 
    ON public.chat_messages FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public update to chat messages" 
    ON public.chat_messages FOR UPDATE USING (true);

CREATE POLICY "Allow public delete to chat messages" 
    ON public.chat_messages FOR DELETE USING (true);

-- 6. RLS Policies for chat_reactions (Permissive to allow custom participant sessions via anon role)
CREATE POLICY "Allow public read access to chat reactions" 
    ON public.chat_reactions FOR SELECT USING (true);

CREATE POLICY "Allow public insert to chat reactions" 
    ON public.chat_reactions FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public delete to chat reactions" 
    ON public.chat_reactions FOR DELETE USING (true);

-- 7. Automate updated_at column management
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trigger_update_chat_messages_timestamp
    BEFORE UPDATE ON public.chat_messages
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

COMMIT;
