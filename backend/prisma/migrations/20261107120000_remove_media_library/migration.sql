BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15s';

DROP TABLE "MediaAsset";

COMMIT;
