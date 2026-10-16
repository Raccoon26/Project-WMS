CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"target_id" uuid,
	"result_code" text NOT NULL,
	"request_id" text NOT NULL,
	"before_digest" text,
	"after_digest" text,
	"policy_version" integer DEFAULT 1 NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"previous_digest" text NOT NULL,
	"event_digest" text NOT NULL,
	"sequence" bigint GENERATED ALWAYS AS IDENTITY (sequence name "audit_events_sequence_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	CONSTRAINT "audit_events_event_digest_unique" UNIQUE("event_digest"),
	CONSTRAINT "audit_events_sequence_unique" UNIQUE("sequence")
);
--> statement-breakpoint
CREATE TABLE "auth_attempts" (
	"bucket" text PRIMARY KEY NOT NULL,
	"window_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" integer NOT NULL,
	CONSTRAINT "auth_attempts_positive" CHECK ("auth_attempts"."attempts" > 0)
);
--> statement-breakpoint
CREATE TABLE "auth_bootstrap" (
	"singleton" boolean PRIMARY KEY DEFAULT true NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "auth_bootstrap_singleton" CHECK ("auth_bootstrap"."singleton")
);
--> statement-breakpoint
CREATE TABLE "mfa_codes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"consumed_at" timestamp with time zone,
	CONSTRAINT "mfa_codes_code_hash_unique" UNIQUE("code_hash")
);
--> statement-breakpoint
CREATE TABLE "mfa_credentials" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"method" text DEFAULT 'totp' NOT NULL,
	"encrypted_secret" text NOT NULL,
	"activated_at" timestamp with time zone,
	"last_step" bigint DEFAULT -1 NOT NULL,
	"pending_secret" text,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "mfa_method_check" CHECK ("mfa_credentials"."method" = 'totp')
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"code" text PRIMARY KEY NOT NULL,
	"description" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"role_id" uuid NOT NULL,
	"permission_code" text NOT NULL,
	CONSTRAINT "role_permissions_role_id_permission_code_pk" PRIMARY KEY("role_id","permission_code")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"policy_version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "roles_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"token_hash" text NOT NULL,
	"csrf_hash" text NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"idle_expires_at" timestamp with time zone DEFAULT now()+interval '30 minutes' NOT NULL,
	"absolute_expires_at" timestamp with time zone DEFAULT now()+interval '12 hours' NOT NULL,
	"reauthenticated_at" timestamp with time zone,
	"mfa_verified" boolean DEFAULT false NOT NULL,
	"session_epoch" integer DEFAULT 0 NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "sessions_verified_user_check" CHECK (NOT "sessions"."mfa_verified" OR "sessions"."user_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"scope" text DEFAULT 'global' NOT NULL,
	"granted_by" uuid,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"policy_version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "user_roles_scope_check" CHECK ("user_roles"."scope" = 'global')
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"login" text NOT NULL,
	"identity_subject" text NOT NULL,
	"display_name" text NOT NULL,
	"locale" text DEFAULT 'ja' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"password_hash" text NOT NULL,
	"password_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"mfa_enabled" boolean DEFAULT false NOT NULL,
	"session_epoch" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone,
	CONSTRAINT "users_login_unique" UNIQUE("login"),
	CONSTRAINT "users_identity_subject_unique" UNIQUE("identity_subject"),
	CONSTRAINT "users_login_check" CHECK ("users"."login" ~ '^[a-z0-9][a-z0-9._@+-]{2,63}$'),
	CONSTRAINT "users_display_name_check" CHECK (length("users"."display_name") BETWEEN 1 AND 100),
	CONSTRAINT "users_locale_check" CHECK ("users"."locale" IN ('ja','ko','en')),
	CONSTRAINT "users_status_check" CHECK ("users"."status" IN ('active','inactive','locked')),
	CONSTRAINT "users_epoch_check" CHECK ("users"."session_epoch" >= 0)
);
--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_bootstrap" ADD CONSTRAINT "auth_bootstrap_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mfa_codes" ADD CONSTRAINT "mfa_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mfa_credentials" ADD CONSTRAINT "mfa_credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_code_permissions_code_fk" FOREIGN KEY ("permission_code") REFERENCES "permissions"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_events_time" ON "audit_events" USING btree ("sequence" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_events_actor" ON "audit_events" USING btree ("actor_id","sequence" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "mfa_codes_user" ON "mfa_codes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_user" ON "sessions" USING btree ("user_id") WHERE "sessions"."revoked_at" IS NULL;--> statement-breakpoint
CREATE INDEX "sessions_expiry" ON "sessions" USING btree ("absolute_expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "user_roles_active" ON "user_roles" USING btree ("user_id","role_id","scope") WHERE "user_roles"."revoked_at" IS NULL;
--> statement-breakpoint
CREATE FUNCTION protect_audit_events() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'AUDIT_APPEND_ONLY'; END $$;
--> statement-breakpoint
CREATE TRIGGER audit_append_only BEFORE UPDATE OR DELETE ON audit_events FOR EACH ROW EXECUTE FUNCTION protect_audit_events();
