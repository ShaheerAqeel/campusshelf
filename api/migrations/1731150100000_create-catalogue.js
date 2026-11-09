/** Categories and books. */
export const up = (pgm) => {
  pgm.sql(`
    CREATE TABLE categories (
      id   SERIAL PRIMARY KEY,
      name VARCHAR(60) NOT NULL
    );
    CREATE UNIQUE INDEX categories_name_key ON categories (lower(name));

    CREATE TABLE books (
      id               SERIAL PRIMARY KEY,
      isbn             VARCHAR(17)  NOT NULL UNIQUE,
      title            VARCHAR(200) NOT NULL,
      author           VARCHAR(150) NOT NULL,
      category_id      INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      published_year   SMALLINT,
      description      TEXT,
      cover_url        VARCHAR(500),
      copies_total     INTEGER NOT NULL DEFAULT 1 CHECK (copies_total >= 0),
      copies_available INTEGER NOT NULL DEFAULT 1 CHECK (copies_available >= 0),
      archived         BOOLEAN NOT NULL DEFAULT false,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT copies_available_le_total CHECK (copies_available <= copies_total)
    );
    CREATE INDEX books_title_idx    ON books (lower(title));
    CREATE INDEX books_author_idx   ON books (lower(author));
    CREATE INDEX books_category_idx ON books (category_id);
  `);
};

export const down = (pgm) => {
  pgm.sql('DROP TABLE books; DROP TABLE categories;');
};
