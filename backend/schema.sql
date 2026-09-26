CREATE TABLE IF NOT EXISTS health_diary.users (
  telegram_id bigint PRIMARY KEY,
  state jsonb,
  revision bigint NOT NULL DEFAULT 0,
  chat_id bigint,
  can_message boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS health_diary.deliveries (
  telegram_id bigint NOT NULL REFERENCES health_diary.users(telegram_id),
  delivery_key text NOT NULL,
  status text NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  message_id bigint,
  PRIMARY KEY (telegram_id, delivery_key)
);
CREATE TABLE IF NOT EXISTS health_diary.bot_state (id integer PRIMARY KEY CHECK(id=1), update_offset bigint NOT NULL DEFAULT 0);
INSERT INTO health_diary.bot_state(id) VALUES (1) ON CONFLICT DO NOTHING;
