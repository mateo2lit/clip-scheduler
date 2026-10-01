-- The Meta user a Facebook/Instagram connection belongs to, so Meta's data-deletion
-- callback (POST /api/account/delete) can find that person's connections. Facebook rows
-- store a Page ID in platform_user_id, which a deletion request never contains.
alter table platform_accounts add column if not exists meta_user_id text;
create index if not exists platform_accounts_meta_user_id_idx on platform_accounts (meta_user_id) where meta_user_id is not null;
