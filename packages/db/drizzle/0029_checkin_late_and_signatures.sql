ALTER TABLE "check_ins" ADD COLUMN "is_late" boolean DEFAULT false NOT NULL;
ALTER TABLE "check_ins" ADD COLUMN "check_in_signature" text;
ALTER TABLE "check_ins" ADD COLUMN "check_out_signature" text;
