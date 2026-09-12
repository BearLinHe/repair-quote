CREATE TYPE "AppUserRole" AS ENUM ('USER', 'ADMIN');

CREATE TABLE "AppUser" (
  "id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "login" TEXT NOT NULL,
  "email" TEXT,
  "name" TEXT NOT NULL,
  "password_hash" TEXT NOT NULL,
  "role" "AppUserRole" NOT NULL DEFAULT 'USER',
  "data_owner_id" TEXT,
  "failed_login_count" INTEGER NOT NULL DEFAULT 0,
  "locked_until" TIMESTAMP(3),
  CONSTRAINT "AppUser_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AppSession" (
  "id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "token_hash" TEXT NOT NULL,
  "app_user_id" TEXT NOT NULL,
  CONSTRAINT "AppSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AppUser_login_key" ON "AppUser"("login");
CREATE UNIQUE INDEX "AppUser_data_owner_id_key" ON "AppUser"("data_owner_id");
CREATE UNIQUE INDEX "AppSession_token_hash_key" ON "AppSession"("token_hash");
CREATE INDEX "AppSession_app_user_id_idx" ON "AppSession"("app_user_id");
CREATE INDEX "AppSession_expires_at_idx" ON "AppSession"("expires_at");

ALTER TABLE "AppSession" ADD CONSTRAINT "AppSession_app_user_id_fkey"
  FOREIGN KEY ("app_user_id") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "AppUser" ("id", "updated_at", "login", "email", "name", "password_hash", "role", "data_owner_id") VALUES
  ('7837c0be-2473-43e7-b934-28da69f635ae', CURRENT_TIMESTAMP, 'benz18871887@gmail.com', 'benz18871887@gmail.com', '峰 刘', 'scrypt$156760dd31887621fe30ef9e93b18e52$71061a87f8b88c0b9c66413a79f7de04830eb440eeabc2062716369439048f7f887e36d2c9a29733660b898e3213bdfb961a4285901cbd9d75b1cfa1d282ce70', 'USER', 'user_3AjKrgTnquVldOzjVtgrDjwXFsF'),
  ('45b19a33-1304-431d-8234-1895106b2400', CURRENT_TIMESTAMP, 'bearlinhe@gmail.com', 'bearlinhe@gmail.com', 'Lin He', 'scrypt$4e93ebb68f13237c22be50cc388be865$e232afc62e63ae6e03404c371db15f9a2d76681733279bc49e328b8806929a02dcb652e5bf2803571d1747afa2f5b5b80433edf454e73fc442f3692eefa539c2', 'USER', 'user_3AVAzLh7mYN2WocTWCeJumCpsrB'),
  ('dcbd1bef-3875-4ac5-aa6d-3d8edc8ffdbb', CURRENT_TIMESTAMP, 'craigl8423@gmail.com', 'craigl8423@gmail.com', 'Craig L', 'scrypt$52e1d6a1c3dea3b6855ad048733909e0$8b987321626c14a582d553277f448bee3ee88a714caa71828c9ff6f3d80e592c4436f55282f0a258ad75366e9f40f3a544adddae8109cfd683de11f357800a41', 'USER', 'user_3Isk3vhXg4Xgvco71ROoa2KInsw'),
  ('9a7ca80b-3d95-4716-acf2-3593df4278fc', CURRENT_TIMESTAMP, 'admin', NULL, 'Administrator', 'scrypt$dcb3610bbe1ebeb0efa5ce58300fa409$fc2c75d38dc24479478102d0f5ac46bf84577d917e13aca6a5c722fe7e0e0217fd30e8ba45fbc8963496fd4b324afedec4b9e429ffc4a491defee6563781000f', 'ADMIN', NULL);
