-- Cleanup: remove phone_verification_codes table (replaced by Supabase email verification)
DROP TABLE IF EXISTS public.phone_verification_codes;
