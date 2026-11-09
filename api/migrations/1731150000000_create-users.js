/** Users and roles. */
export const up = (pgm) => {
  pgm.sql(`
    CREATE TYPE user_role AS ENUM ('member', 'librarian', 'admin');

    CREATE TABLE users (
      id            SERIAL PRIMARY KEY,
      name          VARCHAR(100) NOT NULL,
      email         VARCHAR(254) NOT NULL,
      password_hash TEXT         NOT NULL,
      role          user_role    NOT NULL DEFAULT 'member',
      created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX users_email_key ON users (lower(email));
  `);
};

export const down = (pgm) => {
  pgm.sql('DROP TABLE users; DROP TYPE user_role;');
};
