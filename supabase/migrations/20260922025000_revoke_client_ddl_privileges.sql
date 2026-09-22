-- Least-privilege hardening.
-- Browser/mobile clients never need TRUNCATE, REFERENCES or TRIGGER privileges.

revoke truncate, references, trigger
on all tables in schema public
from anon, authenticated;

alter default privileges in schema public
revoke truncate, references, trigger
on tables
from anon, authenticated;
